import { toolAuthorizationFixture } from "@drawloom/tools/conformance";
import { test, expect } from "bun:test";
import { agentConformance } from "../agent/src/conformance.js";
import { agentGoalsConformance } from "@drawloom/agent/goals-conformance";
import { createCodexDriver, createCodexToolBridge } from "./src/index.js";
import type { RpcTransport, RpcMessage, JsonValue } from "@drawloom/host";
import { defineTool } from "@drawloom/tools";
import { createLocalToolGateway } from "../../tools/local-tools/src/index.js";
import { z } from "zod";
import { codexAgentFixture } from "../../../scripts/agent-conformance-fixtures.mjs";
test("explicit model selection applies to the same native thread and rejects unsupported effort", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "models",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const s = opened.value;
  s.signals();
  expect(
    (
      await s.execute({
        operationId: "bad",
        text: "No call",
        modelSelection: { model: "small-model", effort: "high" },
      })
    ).status,
  ).toBe("rejected");
  expect(f.requests.filter((r) => r.method === "turn/start")).toHaveLength(0);
  expect(
    (
      await s.execute({
        operationId: "good",
        text: "One call",
        modelSelection: { model: "small-model", effort: "low" },
      })
    ).status,
  ).toBe("ok");
  expect(f.requests.find((r) => r.method === "turn/start")?.params).toMatchObject({
    threadId: "private-thread",
    model: "small-model",
    effort: "low",
  });
  expect(f.requests.filter((r) => r.method === "thread/start")).toHaveLength(1);
  await s.close();
});
test("Codex goals read fresh snapshots and reject a stale mutation without writing", async () => {
  const f = recorded({
    goal: {
      objective: "Finish the map",
      status: "active",
      createdAt: 1,
      updatedAt: 2,
      timeUsedSeconds: 3,
      tokensUsed: 4,
      tokenBudget: 5,
    },
  });
  const opened = await f.driver.openSession({
    sessionId: "goals",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok" || !opened.value.goals) throw Error("goals unavailable");
  const first = await opened.value.goals.read();
  if (first.status !== "ok" || !first.value) throw Error("goal unreadable");
  f.goal!.tokensUsed = 9;
  const accounting = await opened.value.goals.read();
  expect(accounting).toMatchObject({
    status: "ok",
    value: { revision: first.value.revision },
  });
  f.goal!.objective = "Changed goal";
  expect(await opened.value.goals.pause({ revision: first.value.revision })).toMatchObject({
    status: "rejected",
    failure: { code: "invalid_state" },
  });
  expect(f.requests.filter((request) => request.method === "thread/goal/set")).toHaveLength(0);
  await opened.value.close();
});
test("ambiguous goal mutation responses never repeat the write and remain readable", async () => {
  for (const mode of ["lost-response", "malformed-response"] as const) {
    const f = recorded();
    const request = f.transport.request.bind(f.transport);
    f.transport.request = async (method, params) => {
      const result = await request(method, params);
      if (method === "thread/goal/set") {
        if (mode === "lost-response") throw Error("Response lost after native mutation");
        return { malformed: true };
      }
      return result;
    };
    const opened = await f.driver.openSession({
      sessionId: mode,
      context: { text: "" },
      tools: { id: "none", tools: [] },
    });
    if (opened.status !== "ok" || !opened.value.goals) throw Error("goals unavailable");
    expect((await opened.value.goals.create("A single native mutation")).status).toBe("rejected");
    expect(await opened.value.goals.read()).toMatchObject({
      status: "ok",
      value: { objective: "A single native mutation", status: "active" },
    });
    expect(f.requests.filter((r) => r.method === "thread/goal/set")).toHaveLength(1);
    await opened.value.close();
  }
});
test("Codex exposes goal and exact active-turn plan snapshots as session signals", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "goal-signals",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error("open");
  const iterator = opened.value.signals()[Symbol.asyncIterator]();
  f.emit({
    method: "thread/goal/updated",
    params: {
      threadId: "private-thread",
      goal: {
        threadId: "private-thread",
        objective: "Finish the map",
        status: "active",
        createdAt: 1,
        updatedAt: 2,
        timeUsedSeconds: 3,
        tokensUsed: 4,
      },
    },
  });
  expect(await iterator.next()).toMatchObject({
    value: {
      kind: "goal.updated",
      goal: { objective: "Finish the map", status: "active" },
    },
  });
  await opened.value.execute({ operationId: "op", text: "work" });
  await iterator.next();
  f.emit({
    method: "turn/plan/updated",
    params: {
      threadId: "private-thread",
      turnId: "private-turn",
      explanation: "First inspect.",
      plan: [{ step: "Inspect", status: "inProgress" }],
    },
  });
  expect(await iterator.next()).toMatchObject({
    value: {
      kind: "plan.updated",
      operationId: "op",
      plan: {
        explanation: "First inspect.",
        steps: [{ text: "Inspect", status: "in_progress" }],
      },
    },
  });
  await opened.value.close();
});
test("Codex adopts a discovered native turn only after host continuation admission", async () => {
  const f = recorded();
  const opened = await f.driver.openSession(
    {
      sessionId: "native-turn",
      context: { text: "" },
      tools: { id: "none", tools: [] },
    },
    {
      admitContinuation: async () => ({
        status: "ok",
        value: { operationId: "adopted" },
      }),
    },
  );
  if (opened.status !== "ok") throw Error("open");
  const iterator = opened.value.signals()[Symbol.asyncIterator]();
  f.emit({
    method: "turn/started",
    params: {
      threadId: "private-thread",
      turn: { id: "native-turn", status: "inProgress", items: [] },
    },
  });
  expect(await iterator.next()).toMatchObject({
    value: { kind: "operation.started", operationId: "adopted" },
  });
  await opened.value.close();
});
test("closing during pending native-turn admission does not publish a stale operation", async () => {
  const f = recorded();
  let resolve!: (value: { status: "ok"; value: { operationId: string } }) => void;
  const pending = new Promise<{ status: "ok"; value: { operationId: string } }>((done) => {
    resolve = done;
  });
  let accepted = 0;
  const driver = createCodexDriver({
    connect: async () => f.transport,
    store: {
      async get() {
        return undefined;
      },
      async set() {},
    },
    onTurnAccepted() {
      accepted++;
    },
  });
  const opened = await driver.openSession(
    {
      sessionId: "close-race",
      context: { text: "" },
      tools: { id: "none", tools: [] },
    },
    { admitContinuation: async () => pending },
  );
  if (opened.status !== "ok") throw Error("open");
  f.emit({
    method: "turn/started",
    params: {
      threadId: "private-thread",
      turn: { id: "native-turn", status: "inProgress", items: [] },
    },
  });
  await Promise.resolve();
  await opened.value.close();
  resolve({ status: "ok", value: { operationId: "late" } });
  await Promise.resolve();
  expect(accepted).toBe(0);
});
test("a terminal queued during continuation admission retains exact operation association", async () => {
  const f = recorded();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const opened = await f.driver.openSession(
    {
      sessionId: "queued-terminal",
      context: { text: "" },
      tools: { id: "none", tools: [] },
    },
    {
      admitContinuation: async () => {
        await gate;
        return { status: "ok", value: { operationId: "continued" } };
      },
    },
  );
  if (opened.status !== "ok") throw Error("open");
  const iterator = opened.value.signals()[Symbol.asyncIterator]();
  f.emit({
    method: "turn/started",
    params: { threadId: "private-thread", turn: { id: "continuation" } },
  });
  f.emit({
    method: "turn/completed",
    params: {
      threadId: "private-thread",
      turn: { id: "continuation", status: "completed" },
    },
  });
  release();
  expect((await iterator.next()).value).toEqual({
    kind: "operation.started",
    operationId: "continued",
  });
  expect((await iterator.next()).value).toEqual({
    kind: "operation.completed",
    operationId: "continued",
  });
  await opened.value.close();
  const reopened = await f.driver.openSession({
    sessionId: "queued-terminal",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  expect(f.requests.some((request) => request.method === "thread/resume")).toBe(true);
  if (reopened.status === "ok") await reopened.value.close();
});
for (const lostResponse of [false, true]) {
  test(`goal before first turn survives reopen (lost response: ${lostResponse})`, async () => {
    const f = recorded();
    const request = f.transport.request.bind(f.transport);
    let starts = 0;
    f.transport.request = async (method, params) => {
      // A newly started thread has no goal; resuming retains the old one.
      if (method === "thread/start" && ++starts > 1) await request("thread/goal/clear", {});
      const result = await request(method, params);
      if (lostResponse && method === "thread/goal/set") throw Error("Response lost");
      return result;
    };
    const input = {
      sessionId: "early-goal",
      context: { text: "" },
      tools: { id: "none", tools: [] },
    };
    const opened = await f.driver.openSession(input);
    if (opened.status !== "ok" || !opened.value.goals) throw Error("open");
    expect((await opened.value.goals.create("Retain this goal")).status).toBe(
      lostResponse ? "rejected" : "ok",
    );
    const current = await opened.value.goals.read();
    if (current.status !== "ok" || !current.value) throw Error("read");
    await opened.value.goals.pause({ revision: current.value.revision });
    await opened.value.close();
    const reopened = await f.driver.openSession(input);
    if (reopened.status !== "ok" || !reopened.value.goals) throw Error("reopen");
    try {
      expect(await reopened.value.goals.read()).toMatchObject({
        status: "ok",
        value: { objective: "Retain this goal", status: "paused" },
      });
      expect(f.requests.filter((r) => r.method === "thread/start")).toHaveLength(1);
      expect(f.requests.filter((r) => r.method === "thread/goal/set")).toHaveLength(2);
      expect(f.requests.filter((r) => r.method === "turn/start")).toHaveLength(0);
    } finally {
      await reopened.value.close();
    }
  });
}
test("restart fences unresolved execution and explicit read reconciles without resume mutation", async () => {
  for (const status of ["active", "paused", "blocked", "complete"]) {
    const f = recorded({
      goal: {
        objective: "Retained",
        status,
        createdAt: 1,
        updatedAt: 1,
        timeUsedSeconds: 0,
        tokensUsed: 0,
      },
    });
    let terminal = false;
    const driver = createCodexDriver({
      connect: async () => ({
        ...f.transport,
        async request(method, params) {
          if (method === "thread/read")
            return {
              thread: {
                id: "private-thread",
                turns: [{ status: terminal ? "completed" : "inProgress" }],
              },
            };
          return f.transport.request(method, params);
        },
      }),
      store: {
        async get(key) {
          return key === "codex:restored"
            ? { threadId: "private-thread", materialized: true }
            : undefined;
        },
        async set() {},
      },
    });
    const opened = await driver.openSession({
      sessionId: "restored",
      context: { text: "" },
      tools: { id: "none", tools: [] },
    });
    if (opened.status !== "ok" || !opened.value.goals) throw Error("open");
    opened.value.signals();
    expect((await opened.value.goals.read()).status).toBe("rejected");
    expect(
      (
        await opened.value.execute({
          operationId: "new",
          text: "Must not execute",
        })
      ).status,
    ).toBe("rejected");
    terminal = true;
    expect(await opened.value.goals.read()).toMatchObject({
      status: "ok",
      value: { status },
    });
    expect(
      f.requests.filter(
        (request) => request.method === "thread/goal/set" || request.method === "turn/start",
      ),
    ).toHaveLength(0);
    await opened.value.close();
  }
});
test("Codex bridge preserves standard returned media beside canonical typed output", async () => {
  const content = [
    {
      type: "resource_link" as const,
      uri: "reference://sample",
      name: "Sample",
    },
    { type: "image" as const, data: "AA==", mimeType: "image/png" },
  ];
  const gateway = createLocalToolGateway({
    tools: [
      defineTool({
        name: "rich",
        description: "Rich output",
        input: z.string(),
        output: z.string(),
        execute: (value) => value,
        renderContent: () => content,
      }),
    ],
    authorization: toolAuthorizationFixture(),
    evidence: { record: async () => {} },
    nextInvocationId: () => "one",
  });
  const bridge = createCodexToolBridge(gateway);
  bridge.publish("t", "a", gateway.bind("a"));
  const result = await bridge.call(
    { callId: "c", "x-codex-turn-metadata": { thread_id: "t", turn_id: "a" } },
    "rich",
    "canonical",
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    content,
    structuredContent: { value: "canonical" },
  });
});
test("native Other input accepts custom text and presents option descriptions", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "other",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const s = opened.value;
  const iterator = s.signals()[Symbol.asyncIterator]();
  await s.execute({ operationId: "a", text: "work" });
  await iterator.next();
  f.emit({
    id: 90,
    method: "item/tool/requestUserInput",
    params: {
      threadId: "private-thread",
      turnId: "private-turn",
      questions: [
        {
          id: "choice",
          question: "Choose route",
          isOther: true,
          options: [
            { label: "A", description: "First route" },
            { label: "B", description: "Second route" },
          ],
        },
      ],
    },
  });
  const event = (await iterator.next()).value;
  expect(event).toMatchObject({ kind: "input.requested" });
  if (event?.kind !== "input.requested") throw Error();
  expect(event.request.prompt).toContain("First route");
  expect(
    await s.respondToInput({
      requestId: event.request.requestId,
      action: "submit",
      value: { choice: { answers: ["My custom path"] } },
    }),
  ).toMatchObject({ status: "ok" });
  expect(f.replies.at(-1)).toEqual({
    id: 90,
    result: { answers: { choice: { answers: ["My custom path"] } } },
  });
  await s.close();
});
test("steering targets the active turn and concurrent interrupt waits for provider outcome", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "controls",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const session = opened.value;
  const events: unknown[] = [];
  const drain = (async () => {
    for await (const event of session.signals()) events.push(event);
  })();
  await session.execute({ operationId: "active", text: "work" });
  expect(await session.steer?.({ operationId: "stale", text: "wrong" })).toMatchObject({
    status: "rejected",
  });
  expect(
    await session.steer?.({
      operationId: "active",
      text: "update",
      additionalContext: { text: "fresh" },
    }),
  ).toMatchObject({ status: "ok" });
  expect(f.requests.find((r) => r.method === "turn/steer")?.params).toMatchObject({
    expectedTurnId: "private-turn",
    additionalContext: { drawloom: { kind: "application", value: "fresh" } },
  });
  const first = session.interrupt?.("active");
  const second = session.interrupt?.("active");
  expect(first).toBe(second);
  await first;
  expect(f.requests.filter((r) => r.method === "turn/interrupt")).toHaveLength(1);
  expect(events).toHaveLength(1);
  f.emit({
    method: "turn/completed",
    params: {
      threadId: "private-thread",
      turn: { id: "private-turn", status: "interrupted" },
    },
  });
  await session.interrupt?.("active");
  expect(f.requests.filter((r) => r.method === "turn/interrupt")).toHaveLength(1);
  await session.close();
  await drain;
  expect(events.at(-1)).toEqual({
    kind: "operation.interrupted",
    operationId: "active",
  });
});

test("fresh exclusive operation reports the latest cumulative turn usage once", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "fresh-usage",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error("open");
  const session = opened.value;
  const events: unknown[] = [];
  const drain = (async () => {
    for await (const event of session.signals()) events.push(event);
  })();
  await session.execute({ operationId: "usage-operation", text: "work" });
  const usage = (
    inputTokens: number,
    cachedInputTokens: number,
    outputTokens: number,
    reasoningOutputTokens: number,
    totalTokens: number,
  ) => ({
    threadId: "private-thread",
    turnId: "private-turn",
    tokenUsage: {
      total: {
        inputTokens,
        cachedInputTokens,
        cacheWriteInputTokens: 0,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
      },
      last: {
        inputTokens,
        cachedInputTokens,
        cacheWriteInputTokens: 0,
        outputTokens,
        reasoningOutputTokens,
        totalTokens,
      },
      modelContextWindow: 200000,
    },
  });
  f.emit({
    method: "thread/tokenUsage/updated",
    params: usage(100, 40, 20, 5, 120),
  });
  f.emit({
    method: "thread/tokenUsage/updated",
    params: usage(250, 100, 50, 10, 300),
  });
  f.emit({
    method: "thread/tokenUsage/updated",
    params: usage(250, 100, 50, 10, 300),
  });
  await f.complete();
  await session.close();
  await drain;
  expect(
    events.find((event) => (event as { kind?: string }).kind === "operation.completed"),
  ).toEqual({
    kind: "operation.completed",
    operationId: "usage-operation",
    usage: {
      inputTokens: 250,
      cachedInputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 10,
      totalTokens: 300,
    },
  });
});

test("opt-in dedicated fresh session archives only after terminal settlement", async () => {
  const f = recorded({ archiveOnClose: true });
  const opened = await f.driver.openSession({
    sessionId: "managed-judge",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error("open");
  const session = opened.value;
  session.signals();
  await session.execute({ operationId: "judge", text: "Do not use tools" });
  await f.complete();
  expect(await session.close()).toMatchObject({ status: "ok" });
  expect(f.requests.filter((request) => request.method === "thread/archive")).toEqual([
    { method: "thread/archive", params: { threadId: "private-thread" } },
  ]);

  const uncertain = recorded({ archiveOnClose: true });
  const second = await uncertain.driver.openSession({
    sessionId: "managed-judge-uncertain",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (second.status !== "ok") throw Error("open");
  second.value.signals();
  await second.value.execute({ operationId: "judge", text: "work" });
  await second.value.close();
  expect(uncertain.requests.some((request) => request.method === "thread/archive")).toBeFalse();
});
test("opt-in dedicated fresh session archives after exact native failure or interruption settlement", async () => {
  for (const status of ["failed", "interrupted"] as const) {
    const fixture = recorded({ archiveOnClose: true });
    const opened = await fixture.driver.openSession({
      sessionId: `managed-judge-${status}`,
      context: { text: "" },
      tools: { id: "none", tools: [] },
    });
    if (opened.status !== "ok") throw Error("open");
    opened.value.signals();
    await opened.value.execute({
      operationId: "judge",
      text: "Do not use tools",
    });
    await fixture.complete(status);
    expect(await opened.value.close()).toMatchObject({ status: "ok" });
    expect(fixture.requests.filter((request) => request.method === "thread/archive")).toEqual([
      { method: "thread/archive", params: { threadId: "private-thread" } },
    ]);
  }
});
test("provider message ordering and terminal cleanup reject stale interactions", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "messages",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const s = opened.value;
  const events: unknown[] = [];
  const drain = (async () => {
    for await (const e of s.signals()) events.push(e);
  })();
  await s.execute({ operationId: "a", text: "work" });
  const params = { threadId: "private-thread", turnId: "private-turn" };
  f.emit({
    method: "item/agentMessage/delta",
    params: { ...params, itemId: "private-item", delta: "hi" },
  });
  f.emit({
    method: "item/completed",
    params: {
      ...params,
      item: {
        id: "private-item",
        type: "agentMessage",
        text: "hi",
        phase: "final_answer",
      },
    },
  });
  f.emit({
    method: "item/agentMessage/delta",
    params: { ...params, itemId: "private-item", delta: "late" },
  });
  f.emit({
    id: 1,
    method: "item/commandExecution/requestApproval",
    params: { ...params, availableDecisions: ["decline"] },
  });
  f.emit({
    id: 2,
    method: "mcpServer/elicitation/request",
    params: {
      ...params,
      message: "Input",
      requestedSchema: { type: "string" },
    },
  });
  await f.complete();
  expect(await s.resolveApproval({ approvalId: "approval-2", optionId: "option-0" })).toMatchObject(
    { status: "rejected" },
  );
  expect(await s.respondToInput({ requestId: "input-3", action: "cancel" })).toMatchObject({
    status: "rejected",
  });
  await s.close();
  await drain;
  expect(JSON.stringify(events)).not.toContain("private-item");
  expect(JSON.stringify(events)).not.toContain("late");
  expect(events[1]).toMatchObject({ kind: "message.delta", delta: "hi" });
  expect(events[2]).toMatchObject({
    kind: "message.completed",
    text: "hi",
    phase: "final",
  });
});
test("native user completion uses the stable history identity", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "user-history",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error();
  const iterator = opened.value.signals()[Symbol.asyncIterator]();
  await opened.value.execute({
    operationId: "operation-a",
    text: "question",
    attachments: [{ key: "imported", mediaType: "image/png", size: 7 }],
  });
  await iterator.next();
  f.emit({
    method: "item/completed",
    params: {
      threadId: "private-thread",
      turnId: "private-turn",
      item: {
        id: "native-user",
        type: "userMessage",
        content: [{ type: "text", text: "question" }],
      },
    },
  });
  expect((await iterator.next()).value).toEqual({
    kind: "message.completed",
    operationId: "operation-a",
    messageId: "message-68e26fb5bcec8902c508c9ee278907db6b7547ad22dbd85ae36f8ab97fe8c24f",
    role: "user",
    text: "question",
    assets: [{ key: "imported", mediaType: "image/png", size: 7 }],
  });
  await opened.value.close();
});
test("Codex rejects malformed negotiation before starting a thread", async () => {
  const f = recorded();
  let started = false;
  const original = f.transport.request;
  f.transport.request = async (method, params) => {
    if (method === "initialize") return {};
    started = true;
    return original(method, params);
  };
  const driver = createCodexDriver({
    connect: async () => f.transport,
    store: {
      async get() {
        return undefined;
      },
      async set() {},
    },
  });
  expect(
    await driver.openSession({
      sessionId: "bad",
      context: { text: "" },
      tools: { id: "none", tools: [] },
    }),
  ).toMatchObject({ status: "rejected" });
  expect(started).toBe(false);
});
test("MCP failure projection retains unknown execution", async () => {
  const gateway = createLocalToolGateway({
    tools: [
      defineTool({
        name: "effect",
        description: "Effect",
        input: z.strictObject({}),
        output: z.string(),
        execute() {
          throw Error("private error");
        },
      }),
    ],
    authorization: toolAuthorizationFixture(),
    evidence: { record: async () => {} },
    nextInvocationId: () => "id",
  });
  const bridge = createCodexToolBridge(gateway);
  bridge.publish("thread", "turn", gateway.bind("operation"));
  expect(
    await bridge.call(
      {
        callId: "call",
        "x-codex-turn-metadata": { thread_id: "thread", turn_id: "turn" },
      },
      "effect",
      {},
      new AbortController().signal,
    ),
  ).toMatchObject({ isError: true, _meta: { execution: "unknown" } });
});
export function recorded(
  options: {
    archiveOnClose?: boolean;
    goal?: {
      objective: string;
      status: string;
      createdAt: number;
      updatedAt: number;
      timeUsedSeconds: number;
      tokensUsed: number;
      tokenBudget?: number | null;
    };
  } = {},
) {
  let receive: (m: RpcMessage) => void = () => {};
  let failure: () => void = () => {};
  const requests: { method: string; params: unknown }[] = [];
  const replies: unknown[] = [];
  let goal = options.goal;
  let goalVersion = 0;
  const transport: RpcTransport = {
    async request(method, params) {
      requests.push({ method, params });
      if (method === "initialize") return { userAgent: "codex/0.153.4" };
      if (method === "model/list")
        return {
          data: [
            {
              model: "small-model",
              displayName: "Small model",
              supportedReasoningEfforts: [{ reasoningEffort: "low" }],
            },
          ],
          nextCursor: null,
        };
      if (method === "thread/start" || method === "thread/resume")
        return { thread: { id: "private-thread" }, approvalsReviewer: "user" };
      if (method === "thread/read") return { thread: { id: "private-thread", turns: [] } };
      if (method === "turn/start") return { turn: { id: "private-turn" } };
      if (method === "thread/goal/get")
        return {
          goal: goal ? { threadId: "private-thread", ...goal } : null,
        };
      if (method === "thread/goal/set") {
        const change = params as { objective?: string; status?: string };
        goal = {
          objective: change.objective ?? goal?.objective ?? "",
          status: change.status ?? goal?.status ?? "active",
          createdAt: goal?.createdAt ?? ++goalVersion,
          updatedAt: ++goalVersion,
          timeUsedSeconds: goal?.timeUsedSeconds ?? 0,
          tokensUsed: goal?.tokensUsed ?? 0,
        };
        return { goal: { threadId: "private-thread", ...goal } };
      }
      if (method === "thread/goal/clear") {
        goal = undefined;
        return { cleared: true };
      }
      return {};
    },
    notify() {},
    respond(id, result) {
      replies.push({ id, result });
    },
    subscribe(next, fail) {
      receive = next;
      failure = fail;
      return () => {
        receive = () => {};
      };
    },
    async close() {},
  };
  const values = new Map<string, JsonValue>();
  const driver = createCodexDriver({
    connect: async () => transport,
    imageInput: async (asset) => `/confined/${asset.key}`,
    store: {
      async get(k) {
        return values.get(k);
      },
      async set(k, v) {
        values.set(k, v);
      },
    },
    ...options,
  });
  return {
    driver,
    transport,
    requests,
    replies,
    goal: options.goal,
    emit: (m: RpcMessage) => receive(m),
    fail: () => failure(),
    complete: async (status: "completed" | "interrupted" | "failed" = "completed") => {
      receive({
        method: "turn/completed",
        params: {
          threadId: "private-thread",
          turn: { id: "private-turn", status },
        },
      });
    },
  };
}
test("scripted Codex goal implementation runs the shared conformance suite", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "goal-conformance",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok" || !opened.value.goals) throw Error("No goals");
  try {
    await agentGoalsConformance(() => opened.value.goals!);
  } finally {
    await opened.value.close();
  }
});
test("concurrent goal creation serializes and does not replace the first goal", async () => {
  const f = recorded();
  const opened = await f.driver.openSession({
    sessionId: "goal-race",
    context: { text: "" },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok" || !opened.value.goals) throw Error("No goals");
  try {
    const results = await Promise.all([
      opened.value.goals.create("One"),
      opened.value.goals.create("Two"),
    ]);
    expect(results.map((result) => result.status)).toEqual(["ok", "rejected"]);
    expect(f.requests.filter((request) => request.method === "thread/goal/set")).toHaveLength(1);
  } finally {
    await opened.value.close();
  }
});
test("recorded Codex transport shared agent conformance", () =>
  agentConformance(codexAgentFixture));
test("Codex preserves private continuity, fresh context, approval choices and input validation", async () => {
  const f = recorded();
  const o = await f.driver.openSession({
    sessionId: "s",
    context: { text: "system context" },
    tools: { id: "none", tools: [] },
  });
  if (o.status !== "ok") throw Error("open");
  const s = o.value;
  const events: unknown[] = [];
  let receivedInput!: () => void;
  const inputReady = new Promise<void>((resolve) => {
    receivedInput = resolve;
  });
  const drain = (async () => {
    for await (const e of s.signals()) {
      events.push(e);
      if (e.kind === "input.requested") receivedInput();
    }
  })();
  await s.execute({
    operationId: "a",
    text: "hello",
    additionalContext: { text: "fresh context" },
  });
  f.emit({
    id: 10,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: "private-thread",
      turnId: "private-turn",
      reason: "Run the requested check",
      availableDecisions: [
        "decline",
        {
          acceptWithExecpolicyAmendment: { execpolicy_amendment: ["example"] },
        },
      ],
    },
  });
  f.emit({
    id: 11,
    method: "mcpServer/elicitation/request",
    params: {
      threadId: "private-thread",
      turnId: "private-turn",
      message: "Pick text",
      requestedSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  });
  await inputReady;
  const parsedEvents = events as import("@drawloom/agent").AgentSessionSignal[];
  const approval = parsedEvents.find((event) => event.kind === "approval.requested");
  const elicitation = parsedEvents.find((event) => event.kind === "input.requested");
  if (approval?.kind !== "approval.requested" || elicitation?.kind !== "input.requested")
    throw Error("Missing interactions");
  expect(
    await s.resolveApproval({
      approvalId: approval.request.approvalId,
      optionId: "option-1",
    }),
  ).toMatchObject({ status: "ok" });
  expect(f.replies[0]).toEqual({
    id: 10,
    result: {
      decision: {
        acceptWithExecpolicyAmendment: { execpolicy_amendment: ["example"] },
      },
    },
  });
  expect(
    await s.respondToInput({
      requestId: elicitation.request.requestId,
      action: "submit",
      value: { text: 3 },
    }),
  ).toMatchObject({ status: "rejected" });
  expect(
    await s.respondToInput({
      requestId: elicitation.request.requestId,
      action: "submit",
      value: { text: "yes" },
    }),
  ).toMatchObject({ status: "ok" });
  expect(f.replies[1]).toEqual({
    id: 11,
    result: { action: "accept", content: { text: "yes" } },
  });
  await f.complete();
  await s.close();
  await drain;
  expect(JSON.stringify(events)).not.toContain("private-thread");
  expect(JSON.stringify(events)).not.toContain("execpolicy_amendment");
  await f.driver.openSession({
    sessionId: "s",
    context: { text: "new" },
    tools: { id: "none", tools: [] },
  });
  expect(f.requests.some((x) => x.method === "thread/resume")).toBe(true);
  expect(f.requests.find((x) => x.method === "thread/resume")?.params).toMatchObject({
    excludeTurns: true,
  });
  expect(f.requests.find((x) => x.method === "turn/start")?.params).toMatchObject({
    additionalContext: {
      drawloom: { kind: "application", value: "fresh context" },
    },
  });
});
test("unrecoverable disconnect terminal is bounded and no late event leaks", async () => {
  const f = recorded();
  const o = await f.driver.openSession({
    sessionId: "s",
    context: { text: "" },
    tools: { id: "n", tools: [] },
  });
  if (o.status !== "ok") throw Error();
  const events: unknown[] = [];
  const drain = (async () => {
    for await (const e of o.value.signals()) events.push(e);
  })();
  await o.value.execute({ operationId: "a", text: "x" });
  f.fail();
  await f.complete();
  await drain;
  expect(events).toEqual([
    { kind: "operation.started", operationId: "a" },
    {
      kind: "operation.failed",
      operationId: "a",
      failure: {
        code: "provider_unavailable",
        summary: "Provider connection unavailable",
      },
    },
  ]);
});
test("Codex origin bridge cannot borrow a later operation binding", async () => {
  let count = 0;
  let id = 0;
  const tool = defineTool({
    name: "count",
    description: "count",
    input: z.string(),
    output: z.number(),
    execute: () => ++count,
  });
  const gateway = createLocalToolGateway({
    tools: [tool],
    authorization: toolAuthorizationFixture(),
    evidence: { record: async () => {} },
    nextInvocationId: () => String(++id),
  });
  const bridge = createCodexToolBridge(gateway);
  bridge.publish("t", "a", gateway.bind("a"));
  bridge.retire("t", "a");
  bridge.publish("t", "b", gateway.bind("b"));
  const meta = (turn: string) => ({
    callId: "call",
    "x-codex-turn-metadata": { thread_id: "t", turn_id: turn },
  });
  expect(await bridge.call(meta("a"), "count", "x", new AbortController().signal)).toMatchObject({
    isError: true,
  });
  expect(count).toBe(0);
  expect(await bridge.call(meta("b"), "count", "x", new AbortController().signal)).toMatchObject({
    isError: false,
    _meta: { operationId: "b" },
  });
  expect(count).toBe(1);
});
