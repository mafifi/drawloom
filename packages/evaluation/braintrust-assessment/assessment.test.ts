import { expect, test } from "vitest";
import { z } from "zod";
import type { AgentDriver, AgentSessionSignal } from "@drawloom/agent";
import { createCodexDriver } from "@drawloom/codex-agent";
import type { JsonValue, RpcMessage, RpcTransport } from "@drawloom/host";
import type { EvaluationScorer } from "@drawloom/evaluation";
import { scorerConformance } from "@drawloom/evaluation/conformance";
import {
  AGENT_RUBRIC_SCORER,
  AUTOEVALS_EXACT_MATCH_SCORER,
  AUTOEVALS_LEVENSHTEIN_SCORER,
  createAgentRubricScorer,
  createBraintrustAssessmentProvider,
} from "./src/index.js";

const context = {
  signal: new AbortController().signal,
  invocationId: "invocation",
  runId: "run",
  operationId: "orchestration-run",
};

test("Braintrust runs exactly one local assessment without network or a case scheduler", async () => {
  let calls = 0;
  let fetches = 0;
  const original = globalThis.fetch;
  // Bun's `fetch` type carried `preconnect`, so the mock had to copy it.
  // Node's does not, and nothing under test calls it.
  globalThis.fetch = async () => {
    fetches++;
    throw Error("network forbidden");
  };
  try {
    let receivedContext: unknown;
    const scorer: EvaluationScorer = {
      id: "scripted",
      revision: "r1",
      input: z.string(),
      output: z.string(),
      expected: z.string(),
      async score(args, scorerContext) {
        calls++;
        receivedContext = scorerContext;
        return {
          outcome: "succeeded",
          findings: [
            {
              id: "scripted",
              name: "Scripted",
              outcome: "scored",
              score: args.output === args.expected ? 1 : 0,
              references: [],
            },
          ],
        };
      },
    };
    const provider = createBraintrustAssessmentProvider({ scorers: [scorer] });
    const result = await provider.assess(
      scorer,
      { input: "input", output: "same", expected: "same", references: [] },
      context,
    );
    expect(result.findings[0]?.score).toBe(1);
    expect({ calls, fetches }).toEqual({ calls: 1, fetches: 0 });
    expect(receivedContext).toMatchObject({
      invocationId: "invocation",
      runId: "run",
      operationId: "orchestration-run",
    });
    expect((receivedContext as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
    expect((receivedContext as { signal: AbortSignal }).signal).not.toBe(context.signal);
  } finally {
    globalThis.fetch = original;
  }
});

test("Autoevals exact match remains an identified deterministic scorer", async () => {
  const provider = createBraintrustAssessmentProvider();
  const scorer = provider.scorers?.find((item) => item.id === AUTOEVALS_EXACT_MATCH_SCORER.id);
  if (!scorer) throw Error("missing exact scorer");
  expect(
    await provider.assess(
      scorer,
      { input: null, output: { value: 1 }, expected: { value: 1 }, references: [] },
      context,
    ),
  ).toMatchObject({
    outcome: "succeeded",
    findings: [{ id: "exact-match", outcome: "scored", score: 1 }],
  });
});

function scriptedDriver(signals: readonly AgentSessionSignal[]): AgentDriver {
  return {
    driverId: "scripted",
    async openSession(input) {
      return {
        status: "ok",
        value: {
          sessionId: input.sessionId,
          reviewerModes: ["human"],
          async execute(operation) {
            return { status: "ok", value: { operationId: operation.operationId } };
          },
          async interrupt() {
            return { status: "ok", value: undefined };
          },
          async resolveApproval() {
            return {
              status: "rejected",
              failure: { code: "invalid_interaction", message: "none" },
            };
          },
          async respondToInput() {
            return {
              status: "rejected",
              failure: { code: "invalid_interaction", message: "none" },
            };
          },
          async close() {
            return { status: "ok", value: undefined };
          },
          async *signals() {
            for (const signal of signals) yield signal;
          },
        },
      };
    },
  };
}

test("managed agent rubric scorer maps typed terminal usage without fabricating actual model", async () => {
  const driver = scriptedDriver([
    { kind: "operation.started", operationId: "invocation" },
    {
      kind: "message.completed",
      operationId: "invocation",
      messageId: "answer",
      role: "assistant",
      phase: "final",
      text: '{"score":0.75,"explanation":"Mostly grounded"}',
    },
    {
      kind: "operation.completed",
      operationId: "invocation",
      usage: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, totalTokens: 120 },
    },
  ]);
  const scorer = createAgentRubricScorer({ driver, configuredModel: "configured-efficient-model" });
  const result = await scorer.score(
    {
      input: "question",
      output: "answer",
      expected: "reference",
      configuration: { rubric: "Judge grounding." },
      references: [],
    },
    context,
  );
  expect(scorer).toMatchObject(AGENT_RUBRIC_SCORER);
  expect(result).toMatchObject({
    outcome: "succeeded",
    usage: { inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, totalTokens: 120 },
    model: { requested: "configured-efficient-model" },
    findings: [
      { id: "agent-rubric", outcome: "scored", score: 0.75, explanation: "Mostly grounded" },
    ],
  });
  expect(result.model).not.toHaveProperty("actual");
});

test("managed agent rubric closes a rejected fresh session and does not open for a pre-aborted request", async () => {
  let opens = 0;
  let submissions = 0;
  let closes = 0;
  const driver: AgentDriver = {
    driverId: "rejecting",
    async openSession(input) {
      opens++;
      return {
        status: "ok",
        value: {
          sessionId: input.sessionId,
          reviewerModes: ["human"],
          async execute() {
            submissions++;
            return {
              status: "rejected",
              failure: { code: "provider_unavailable", message: "offline" },
            } as const;
          },
          async resolveApproval() {
            return {
              status: "rejected",
              failure: { code: "invalid_interaction", message: "none" },
            } as const;
          },
          async respondToInput() {
            return {
              status: "rejected",
              failure: { code: "invalid_interaction", message: "none" },
            } as const;
          },
          async close() {
            closes++;
            return { status: "ok", value: undefined } as const;
          },
          async *signals() {},
        },
      };
    },
  };
  const scorer = createAgentRubricScorer({ driver, configuredModel: "configured-test-model" });
  const args = {
    input: "question",
    output: "answer",
    configuration: { rubric: "Judge grounding." },
    references: [],
  };

  expect(await scorer.score(args, context)).toMatchObject({
    outcome: "uncertain",
    findings: [{ error: { code: "judge_rejected" } }],
  });
  const aborted = new AbortController();
  aborted.abort();
  expect(
    await scorer.score(args, {
      signal: aborted.signal,
      invocationId: "aborted",
      runId: "run",
      operationId: "orchestration-run",
    }),
  ).toMatchObject({ outcome: "cancelled" });
  expect({ opens, submissions, closes }).toEqual({ opens: 1, submissions: 1, closes: 1 });
});

test("agent rubric is unavailable without both an explicit model and driver", async () => {
  let opens = 0;
  const driver: AgentDriver = {
    driverId: "unused",
    async openSession() {
      opens++;
      return { status: "rejected", failure: { code: "provider_unavailable", message: "unused" } };
    },
  };
  const args = {
    input: "question",
    output: "answer",
    configuration: { rubric: "Judge grounding." },
    references: [],
  };
  expect(await createAgentRubricScorer({ driver }).score(args, context)).toMatchObject({
    outcome: "uncertain",
    findings: [{ error: { code: "judge_unavailable" } }],
  });
  expect(
    await createAgentRubricScorer({ configuredModel: "configured-test-model" }).score(
      args,
      context,
    ),
  ).toMatchObject({ outcome: "uncertain", findings: [{ error: { code: "judge_unavailable" } }] });
  expect(opens).toBe(0);
});

test("agent rubric preserves the existing approval path as unexpected judge activity", async () => {
  const driver = scriptedDriver([
    {
      kind: "approval.requested",
      request: {
        approvalId: "approval",
        operationId: "invocation",
        summary: "Allow action",
        options: [{ optionId: "deny", label: "Deny" }],
      },
    },
    { kind: "operation.completed", operationId: "invocation" },
  ]);
  const scorer = createAgentRubricScorer({ driver, configuredModel: "configured-test-model" });
  expect(
    await scorer.score(
      {
        input: "question",
        output: "answer",
        configuration: { rubric: "Judge grounding." },
        references: [],
      },
      context,
    ),
  ).toMatchObject({
    outcome: "failed",
    findings: [{ error: { code: "unexpected_activity" } }],
  });
});

test("agent rubric retains its original failure when cleanup remains unresolved", async () => {
  let closes = 0;
  const driver: AgentDriver = {
    driverId: "throwing-signals",
    async openSession(input) {
      return {
        status: "ok",
        value: {
          sessionId: input.sessionId,
          reviewerModes: ["human"],
          async execute(operation) {
            return { status: "ok", value: { operationId: operation.operationId } } as const;
          },
          async resolveApproval() {
            return {
              status: "rejected",
              failure: { code: "invalid_interaction", message: "none" },
            } as const;
          },
          async respondToInput() {
            return {
              status: "rejected",
              failure: { code: "invalid_interaction", message: "none" },
            } as const;
          },
          async close() {
            closes++;
            return {
              status: "rejected",
              failure: { code: "provider_unavailable", message: "offline" },
            } as const;
          },
          async *signals() {
            throw new Error("lost signal stream");
          },
        },
      };
    },
  };
  const scorer = createAgentRubricScorer({ driver, configuredModel: "configured-test-model" });
  const result = await scorer.score(
    {
      input: "question",
      output: "answer",
      configuration: { rubric: "Judge grounding." },
      references: [],
    },
    context,
  );
  expect(result).toMatchObject({
    outcome: "uncertain",
    findings: [{ error: { code: "judge_unavailable" } }, { error: { code: "cleanup_failed" } }],
  });
  expect(closes).toBe(2);
});

function actualCodexDriver(
  outcome: "completed" | "disconnect" | "malformed" | "unexpected-malformed",
) {
  let receive: (message: RpcMessage) => void = () => {};
  let fail: () => void = () => {};
  const requests: string[] = [];
  const transport: RpcTransport = {
    async request(method) {
      requests.push(method);
      if (method === "initialize") return { userAgent: "codex/0.153.4" };
      if (method === "thread/start")
        return { thread: { id: "judge-thread" }, approvalsReviewer: "user" };
      if (method === "turn/start") {
        setTimeout(() => {
          if (outcome === "disconnect") {
            fail();
            return;
          }
          if (outcome === "unexpected-malformed") {
            receive({
              method: "item/completed",
              params: {
                threadId: "judge-thread",
                turnId: "judge-turn",
                item: { id: "delegation", type: "collabAgentToolCall" },
              },
            });
          }
          if (outcome === "malformed" || outcome === "unexpected-malformed") {
            receive({
              method: "turn/completed",
              params: {
                threadId: "judge-thread",
                turn: { id: "judge-turn", status: "not-a-native-terminal" },
              },
            });
            return;
          }
          receive({
            method: "item/completed",
            params: {
              threadId: "judge-thread",
              turnId: "judge-turn",
              item: {
                id: "answer",
                type: "agentMessage",
                phase: "final",
                text: '{"score":1,"explanation":"Grounded"}',
              },
            },
          });
          receive({
            method: "turn/completed",
            params: { threadId: "judge-thread", turn: { id: "judge-turn", status: "completed" } },
          });
        }, 0);
        return { turn: { id: "judge-turn" } };
      }
      return {};
    },
    notify() {},
    respond() {},
    subscribe(next, failed) {
      receive = next;
      fail = failed;
      return () => {
        receive = () => {};
      };
    },
    async close() {},
  };
  const values = new Map<string, JsonValue>();
  return {
    requests,
    driver: createCodexDriver({
      connect: async () => transport,
      store: {
        async get(key) {
          return values.get(key);
        },
        async set(key, value) {
          values.set(key, value);
        },
      },
    }),
  };
}

test("agent rubric attaches the actual Codex signal stream before submitting", async () => {
  const actual = actualCodexDriver("completed");
  const scorer = createAgentRubricScorer({
    driver: actual.driver,
    configuredModel: "configured-test-model",
  });
  const result = await scorer.score(
    {
      input: "question",
      output: "answer",
      configuration: { rubric: "Judge grounding." },
      references: [],
    },
    context,
  );
  expect(result).toMatchObject({ outcome: "succeeded", findings: [{ score: 1 }] });
  expect(actual.requests).toContain("turn/start");
});

test("agent rubric maps an actual Codex post-submit disconnect to uncertainty", async () => {
  const actual = actualCodexDriver("disconnect");
  const scorer = createAgentRubricScorer({
    driver: actual.driver,
    configuredModel: "configured-test-model",
  });
  expect(
    await scorer.score(
      {
        input: "question",
        output: "answer",
        configuration: { rubric: "Judge grounding." },
        references: [],
      },
      context,
    ),
  ).toMatchObject({
    outcome: "uncertain",
    findings: [{ error: { code: "judge_unavailable" } }],
  });
  expect(actual.requests).toContain("turn/start");
});

test("agent rubric keeps actual Codex malformed native settlement uncertain in both result branches", async () => {
  for (const [nativeOutcome, failureCode] of [
    ["malformed", "judge_unavailable"],
    ["unexpected-malformed", "unexpected_activity"],
  ] as const) {
    const actual = actualCodexDriver(nativeOutcome);
    const scorer = createAgentRubricScorer({
      driver: actual.driver,
      configuredModel: "configured-test-model",
    });
    expect(
      await scorer.score(
        {
          input: "question",
          output: "answer",
          configuration: { rubric: "Judge grounding." },
          references: [],
        },
        context,
      ),
    ).toMatchObject({
      outcome: "uncertain",
      findings: [{ error: { code: failureCode } }],
    });
    expect(actual.requests).toContain("turn/start");
  }
});

test("Braintrust waits for an active selected scorer to settle after scheduling cancellation", async () => {
  let release!: (value: Awaited<ReturnType<EvaluationScorer["score"]>>) => void;
  let started!: () => void;
  const active = new Promise<void>((resolve) => {
    started = resolve;
  });
  const scorer: EvaluationScorer = {
    id: "delayed",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      started();
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  };
  const provider = createBraintrustAssessmentProvider({ scorers: [scorer] });
  const abort = new AbortController();
  let returned = false;
  const assessment = provider
    .assess(
      scorer,
      { input: "input", output: "output", references: [] },
      {
        signal: abort.signal,
        invocationId: "delayed",
        runId: "run",
        operationId: "orchestration-run",
      },
    )
    .then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    .finally(() => {
      returned = true;
    });
  await active;
  abort.abort();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(returned).toBe(false);
  release({
    outcome: "uncertain",
    findings: [
      {
        id: "delayed",
        name: "Delayed",
        outcome: "error",
        error: { code: "cleanup_unknown", message: "Cleanup was uncertain" },
        references: [],
      },
    ],
  });
  expect(await assessment).toMatchObject({
    value: { outcome: "uncertain", findings: [{ error: { code: "cleanup_unknown" } }] },
  });
});

test("agent rubric interrupts pending approvals and input without resolving them", async () => {
  for (const kind of ["approval", "input"] as const) {
    let interrupted = false;
    let closes = 0;
    const driver: AgentDriver = {
      driverId: `pending-${kind}`,
      async openSession(input) {
        return {
          status: "ok",
          value: {
            sessionId: input.sessionId,
            reviewerModes: ["human"],
            async execute(operation) {
              return { status: "ok", value: { operationId: operation.operationId } } as const;
            },
            async interrupt() {
              interrupted = true;
              return { status: "ok", value: undefined } as const;
            },
            async resolveApproval() {
              throw new Error("judge must not resolve approval");
            },
            async respondToInput() {
              throw new Error("judge must not respond to input");
            },
            async close() {
              closes++;
              return { status: "ok", value: undefined } as const;
            },
            async *signals() {
              if (kind === "approval")
                yield {
                  kind: "approval.requested",
                  request: {
                    approvalId: "approval",
                    operationId: "invocation",
                    summary: "Pending",
                    options: [{ optionId: "deny", label: "Deny" }],
                  },
                } as const;
              else
                yield {
                  kind: "input.requested",
                  request: { requestId: "input", operationId: "invocation", prompt: "Pending" },
                } as const;
              await new Promise((resolve) => setTimeout(resolve, 10));
              if (interrupted)
                yield { kind: "operation.interrupted", operationId: "invocation" } as const;
            },
          },
        };
      },
    };
    const scorer = createAgentRubricScorer({ driver, configuredModel: "configured-test-model" });
    expect(
      await scorer.score(
        {
          input: "question",
          output: "answer",
          configuration: { rubric: "Judge grounding." },
          references: [],
        },
        context,
      ),
    ).toMatchObject({
      outcome: "failed",
      findings: [{ error: { code: "unexpected_activity" } }],
    });
    expect({ interrupted, closes }).toEqual({ interrupted: true, closes: 1 });
  }
});

test("supported scorers conform to the EvaluationScorer contract", async () => {
  const provider = createBraintrustAssessmentProvider();
  const scorers = provider.scorers ?? [];
  expect(scorers.length).toBeGreaterThan(0);

  const byId = new Map(scorers.map((value) => [value.id, value]));
  const exact = byId.get(AUTOEVALS_EXACT_MATCH_SCORER.id);
  const levenshtein = byId.get(AUTOEVALS_LEVENSHTEIN_SCORER.id);
  expect(exact, "exact-match scorer is published").toBeDefined();
  expect(levenshtein, "levenshtein scorer is published").toBeDefined();

  // Exact match declares EvaluationJsonSchema throughout, so it accepts any
  // JSON; stating that with an empty rejection list is more honest than
  // pretending it validates a shape it does not.
  await scorerConformance({
    scorer: exact!,
    valid: { input: "question", output: "answer", expected: "answer" },
  });

  // Levenshtein is typed to strings, so its declared schemas must actually
  // refuse non-strings — this is the case that would catch a scorer widening
  // its schemas without meaning to.
  await scorerConformance({
    scorer: levenshtein!,
    valid: { input: "question", output: "answer", expected: "answe" },
    rejects: { input: [42, null, {}], output: [42, null, {}], expected: [42, null, {}] },
  });
});
