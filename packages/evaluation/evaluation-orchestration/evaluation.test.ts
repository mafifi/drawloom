import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type {
  EvaluationAssessmentProvider,
  EvaluationScorer,
  EvaluationTarget,
} from "@drawloom/evaluation";
import type {
  Orchestrator,
  RegisteredTaskHandler,
  RunSnapshot,
  Task,
  Workflow,
  WorkflowContext,
} from "@drawloom/orchestration";
import { matchTaskHandlers, StepFailure } from "@drawloom/orchestration";
import { createSqliteEvaluationStore } from "@drawloom/sqlite-evaluation";
import {
  MAX_EVALUATION_PLAN_DISPATCH_BYTES,
  MAX_EVALUATION_WORKFLOW_STEPS,
  createEvaluationComposer,
  evaluationRegistry,
} from "./src/index.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

function localOrchestrator() {
  let handlers: readonly RegisteredTaskHandler[] = [];
  const runs = new Map<
    string,
    { snapshot: RunSnapshot; promise: Promise<unknown>; abort: AbortController }
  >();
  const steps: Array<{ id: string; input: unknown; attempt: number }> = [];
  const engine: Orchestrator = {
    async start(identity, workflow, input) {
      const runId = `orchestration/${identity}`;
      const prior = runs.get(runId);
      if (prior) return runId;
      const abort = new AbortController();
      const snapshot: RunSnapshot = {
        runId,
        identity,
        workflow: workflow.id,
        version: workflow.version,
        status: "running",
        cancellationRequested: false,
        childRunIds: [],
        unresolvedEffects: [],
        stepsTruncated: false,
        pendingInputs: [],
        steps: [],
      };
      const matched = matchTaskHandlers(evaluationRegistry, handlers);
      const context: WorkflowContext = {
        runId,
        async task<I, O>(step: string, task: Task<I, O>, taskInput: I): Promise<O> {
          const selected = matched.find(
            (item) => item.task.id === task.id && item.task.version === task.version,
          );
          if (!selected) throw Error("missing handler");
          const attempt = 1;
          steps.push({ id: step, input: structuredClone(taskInput), attempt });
          return task.output.parse(
            await selected.run(taskInput, {
              taskVersion: task.version,
              runId,
              stepId: step,
              attemptId: `${runId}/${step}/1`,
              attempt,
              signal: abort.signal,
            }),
          );
        },
        async child<I, O>(_step: string, child: Workflow<I, O>, childInput: I) {
          return child.run(context, childInput);
        },
        async input() {
          throw Error("unsupported");
        },
        async sleep() {},
      };
      const promise = workflow.run(context, input).then(
        (output) => {
          snapshot.status = "completed";
          snapshot.output = output as never;
          return output;
        },
        (error) => {
          snapshot.status = abort.signal.aborted ? "cancelled" : "failed";
          snapshot.failure = error instanceof Error ? error.message : String(error);
          throw error;
        },
      );
      runs.set(runId, { snapshot, promise, abort });
      return runId;
    },
    async get(runId) {
      const run = runs.get(runId);
      if (!run) throw Error("missing run");
      return structuredClone(run.snapshot);
    },
    async getSteps() {
      return { steps: [] };
    },
    async list() {
      return { runs: [...runs.values()].map((run) => structuredClone(run.snapshot)) };
    },
    async result(runId) {
      return (await runs.get(runId)!.promise) as never;
    },
    async respond() {
      throw Error("unsupported");
    },
    async cancel(runId) {
      const run = runs.get(runId)!;
      run.snapshot.cancellationRequested = true;
      run.abort.abort();
    },
  };
  return {
    engine,
    steps,
    attach(value: readonly RegisteredTaskHandler[]) {
      handlers = value;
    },
  };
}

async function fixture(
  bindings: { targets?: readonly EvaluationTarget[]; scorers: readonly EvaluationScorer[] },
  provider?: EvaluationAssessmentProvider,
) {
  const directory = await mkdtemp(join(tmpdir(), "drawloom-evaluation-orchestration-"));
  directories.push(directory);
  const store = createSqliteEvaluationStore({
    dataDirectory: directory,
    scope: { installationId: "installation", projectId: "project" },
  });
  const orchestration = localOrchestrator();
  let identity = 0;
  const identities = new Map<string, string>();
  const assessment: EvaluationAssessmentProvider = provider ?? {
    async assess(scorer, args, context) {
      return scorer.score(args, context);
    },
  };
  const composer = createEvaluationComposer({
    store,
    orchestrator: orchestration.engine,
    assessment,
    readiness: () => ({ status: "ready" }),
    clock: { now: () => ++identity },
    identity: async (parts) => {
      const key = JSON.stringify(parts);
      const prior = identities.get(key);
      if (prior) return prior;
      const value = `identity-${identities.size + 1}`;
      identities.set(key, value);
      return value;
    },
  });
  const composition = composer.compose(bindings);
  orchestration.attach(composition.taskHandlers);
  return { ...composition, store, orchestration };
}

const existingDefinition = {
  schemaVersion: 1 as const,
  id: "existing-definition",
  revision: "r1",
  name: "Existing output",
  mode: "assess_existing" as const,
  scorers: [{ id: "exact", revision: "r1", configuration: { threshold: 1 } }],
  cases: [
    {
      id: "case-one",
      revision: "r1",
      input: "input-secret",
      expected: "expected-secret",
      suppliedOutput: "expected-secret",
      references: [],
    },
  ],
};

test("target-free assessment gives expected material only to its selected scorer", async () => {
  let targetCalls = 0;
  let received: unknown;
  const target: EvaluationTarget = {
    id: "unused",
    revision: "r1",
    input: z.json(),
    output: z.json(),
    async invoke() {
      targetCalls++;
      return { outcome: "succeeded", output: null, references: [] };
    },
  };
  const exact: EvaluationScorer = {
    id: "exact",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    expected: z.string(),
    async score(args) {
      received = args;
      return {
        outcome: "succeeded",
        findings: [
          {
            id: "exact",
            name: "Exact",
            outcome: "scored",
            score: args.output === args.expected ? 1 : 0,
            references: [],
          },
        ],
      };
    },
  };
  const { service, orchestration, store } = await fixture({ targets: [target], scorers: [exact] });
  const started = await service.assess({
    requestId: "request-one",
    definition: existingDefinition,
  });
  expect(started.kind).toBe("started");
  if (started.kind !== "started") throw Error("not started");
  await orchestration.engine.result(started.orchestrationRunId);
  const page = await store.listResults({ runId: started.evaluationRunId });
  const result = await store.getResult(page.items[0]!.id);
  expect(targetCalls).toBe(0);
  expect(received).toMatchObject({
    input: "input-secret",
    output: "expected-secret",
    expected: "expected-secret",
    configuration: { threshold: 1 },
  });
  expect(result?.result.status).toBe("completed");
});

test("service readiness delegates the authoritative composer readiness without starting work", async () => {
  let readinessReads = 0;
  let starts = 0;
  const directory = await mkdtemp(join(tmpdir(), "drawloom-evaluation-readiness-"));
  directories.push(directory);
  const store = createSqliteEvaluationStore({
    dataDirectory: directory,
    scope: { installationId: "installation", projectId: "project" },
  });
  const orchestration = localOrchestrator();
  const engine: Orchestrator = {
    ...orchestration.engine,
    async start(...args) {
      starts++;
      return orchestration.engine.start(...args);
    },
  };
  const composition = createEvaluationComposer({
    store,
    orchestrator: engine,
    assessment: {
      async assess(selected, args, context) {
        return selected.score(args, context);
      },
    },
    readiness: () => {
      readinessReads++;
      return { status: "unavailable", reason: "Configure orchestration." };
    },
    identity: async () => "id",
    clock: { now: () => 1 },
  }).compose({ scorers: [] });

  expect(await composition.service.readiness()).toEqual({
    status: "unavailable",
    reason: "Configure orchestration.",
  });
  expect(readinessReads).toBe(1);
  expect(starts).toBe(0);
  expect((await store.listRuns()).items).toEqual([]);
});

test("unrelated text-tool target receives orchestration authority identity and never expected material", async () => {
  let targetArguments: unknown;
  const operationIds: string[] = [];
  const textToolCalls: Array<{ operationId: string; text: string }> = [];
  const approvedTextTool = (operationId: string, text: string) => {
    if (!operationId.startsWith("orchestration/"))
      throw new StepFailure("denied", "Text tool has no active orchestration owner");
    textToolCalls.push({ operationId, text });
    return text.toUpperCase();
  };
  const target: EvaluationTarget<string, string> = {
    id: "target",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async invoke(args, context) {
      targetArguments = args;
      operationIds.push(context.operationId);
      return {
        outcome: "succeeded",
        output: approvedTextTool(context.operationId, args.input),
        references: [],
      };
    },
  };
  const passing: EvaluationScorer = {
    id: "passing",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    expected: z.string(),
    async score(_args, context) {
      operationIds.push(context.operationId);
      return {
        outcome: "succeeded",
        findings: [{ id: "passing", name: "Passing", outcome: "scored", score: 1, references: [] }],
      };
    },
  };
  const failing: EvaluationScorer = {
    id: "failing",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      throw Error("private provider detail");
    },
  };
  const { service, orchestration, store } = await fixture({
    targets: [target],
    scorers: [passing, failing],
  });
  const definition = {
    schemaVersion: 1 as const,
    id: "experiment",
    revision: "r1",
    name: "Experiment",
    mode: "experiment" as const,
    target: { id: "target", revision: "r1", configuration: { mode: "upper" } },
    scorers: [
      { id: "passing", revision: "r1" },
      { id: "failing", revision: "r1" },
    ],
    cases: [{ id: "case", revision: "r1", input: "hello", expected: "HELLO", references: [] }],
  };
  const started = await service.run({ requestId: "request-two", definition });
  if (started.kind !== "started") throw Error("not started");
  await orchestration.engine.result(started.orchestrationRunId);
  const page = await store.listResults({ runId: started.evaluationRunId });
  const result = await store.getResult(page.items[0]!.id);
  expect(targetArguments).toEqual({
    input: "hello",
    configuration: { mode: "upper" },
    references: [],
  });
  expect(result?.findings).toEqual([
    { id: "passing", name: "Passing", outcome: "scored", score: 1, references: [] },
    {
      id: "failing",
      name: "failing",
      outcome: "error",
      error: { code: "scorer_failed", message: "Scorer assessment failed" },
      references: [],
    },
  ]);
  expect(result?.result.status).toBe("completed");
  expect(operationIds).toEqual([started.orchestrationRunId, started.orchestrationRunId]);
  expect(textToolCalls).toEqual([{ operationId: started.orchestrationRunId, text: "hello" }]);
  expect(orchestration.steps.map((step) => step.id)).toEqual([
    "plan",
    "case-0-trial-0-target",
    "case-0-trial-0-scorer-0",
    "case-0-trial-0-scorer-1",
    "case-0-trial-0-finalize",
  ]);
});

test("malformed scorer results become a durable generic failure finding", async () => {
  const malformed: EvaluationScorer = {
    id: "malformed",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return { outcome: "succeeded" } as never;
    },
  };
  const { service, orchestration, store } = await fixture({ scorers: [malformed] });
  const definition = {
    ...existingDefinition,
    id: "malformed-definition",
    scorers: [{ id: "malformed", revision: "r1" }],
  };
  const started = await service.assess({ requestId: "malformed-request", definition });
  if (started.kind !== "started") throw Error("not started");
  await orchestration.engine.result(started.orchestrationRunId);
  const page = await store.listResults({ runId: started.evaluationRunId });
  const result = await store.getResult(page.items[0]!.id);
  expect(result?.findings).toEqual([
    {
      id: "malformed",
      name: "malformed",
      outcome: "error",
      error: { code: "scorer_failed", message: "Scorer assessment failed" },
      references: [],
    },
  ]);
});

test("duplicate and oversized scorer responses become bounded durable failure findings", async () => {
  const duplicate: EvaluationScorer<string, string> = {
    id: "duplicate",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return {
        outcome: "succeeded",
        findings: [
          { id: "same", name: "Same", outcome: "scored", score: 1, references: [] },
          { id: "same", name: "Same again", outcome: "scored", score: 1, references: [] },
        ],
      };
    },
  };
  const largeReferences = Array.from({ length: 6 }, (_, index) => ({
    id: `reference-${index}`,
    source: "fixture",
    uri: `asset://${"x".repeat(4000)}`,
  }));
  const oversized: EvaluationScorer<string, string> = {
    id: "oversized",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return {
        outcome: "succeeded",
        findings: Array.from({ length: 100 }, (_, index) => ({
          id: `large-${index}`,
          name: "Large",
          outcome: "scored" as const,
          score: 1,
          explanation: "x".repeat(8192),
          references: largeReferences,
        })),
      };
    },
  };
  const { service, orchestration, store } = await fixture({ scorers: [duplicate, oversized] });
  const definition = {
    ...existingDefinition,
    id: "invalid-persistence-shapes",
    scorers: [
      { id: "duplicate", revision: "r1" },
      { id: "oversized", revision: "r1" },
    ],
  };
  const started = await service.assess({ requestId: "invalid-persistence-shapes", definition });
  if (started.kind !== "started") throw Error("not started");
  await orchestration.engine.result(started.orchestrationRunId);
  const page = await store.listResults({ runId: started.evaluationRunId });
  const result = await store.getResult(page.items[0]!.id);
  expect(result?.findings).toEqual([
    {
      id: "duplicate",
      name: "duplicate",
      outcome: "error",
      error: { code: "scorer_failed", message: "Scorer assessment failed" },
      references: [],
    },
    {
      id: "oversized",
      name: "oversized",
      outcome: "error",
      error: { code: "scorer_failed", message: "Scorer assessment failed" },
      references: [],
    },
  ]);
});

test("frozen startup bindings reject duplicates and later caller mutation", async () => {
  const scorer: EvaluationScorer = {
    id: "exact",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return { outcome: "succeeded", findings: [] };
    },
  };
  const provider: EvaluationAssessmentProvider = {
    scorers: [scorer],
    async assess(selected, args, context) {
      return selected.score(args, context);
    },
  };
  const directory = await mkdtemp(join(tmpdir(), "drawloom-evaluation-bindings-"));
  directories.push(directory);
  const store = createSqliteEvaluationStore({
    dataDirectory: directory,
    scope: { installationId: "installation", projectId: "project" },
  });
  const composer = createEvaluationComposer({
    store,
    assessment: provider,
    identity: async () => "id",
    clock: { now: () => 1 },
  });
  expect(() => composer.compose({ scorers: [scorer] })).toThrow(
    "Duplicate scorer binding exact@r1",
  );

  const mutable: EvaluationScorer = { ...scorer, id: "mutable" };
  const isolated = createEvaluationComposer({
    store,
    assessment: {
      async assess(selected, args, context) {
        return selected.score(args, context);
      },
    },
    identity: async () => "id",
    clock: { now: () => 1 },
  }).compose({ scorers: [mutable] });
  (mutable as { id: string }).id = "changed";
  expect(isolated.taskHandlers).toHaveLength(evaluationRegistry.tasks.length);
});

test("stable starts reconcile and duplicate scorer delivery reads its durable checkpoint", async () => {
  let calls = 0;
  const scorer: EvaluationScorer = {
    id: "exact",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    expected: z.string(),
    async score() {
      calls++;
      return {
        outcome: "succeeded",
        findings: [{ id: "exact", name: "Exact", outcome: "scored", score: 1, references: [] }],
      };
    },
  };
  const { service, orchestration, taskHandlers } = await fixture({ scorers: [scorer] });
  const first = await service.assess({
    requestId: "stable-request",
    definition: existingDefinition,
  });
  if (first.kind !== "started") throw Error("not started");
  await orchestration.engine.result(first.orchestrationRunId);
  const repeated = await service.assess({
    requestId: "stable-request",
    definition: existingDefinition,
  });
  expect(repeated).toEqual({
    kind: "reconciled",
    evaluationRunId: first.evaluationRunId,
    orchestrationRunId: first.orchestrationRunId,
  });
  expect(calls).toBe(1);
  const scorerStep = orchestration.steps.find((step) => step.id.endsWith("scorer-0"))!;
  const handler = taskHandlers.find((item) => item.id === "evaluation.scorer")!;
  const context = {
    taskVersion: "1",
    runId: first.orchestrationRunId,
    stepId: scorerStep.id,
    attemptId: "duplicate",
    attempt: 2,
    signal: new AbortController().signal,
  };
  await handler.run(scorerStep.input, context);
  expect(calls).toBe(1);
  expect(await handler.recover?.(scorerStep.input, context)).toMatchObject({ status: "completed" });
  expect(
    await handler.recover?.({ ...(scorerStep.input as object), invocationId: "missing" }, context),
  ).toEqual({ status: "unknown" });
  await expect(
    service.assess({
      requestId: "stable-request",
      definition: existingDefinition,
      settings: { repetitions: 2, concurrency: 2 },
    }),
  ).rejects.toMatchObject({ code: "conflict" });
});

test("concurrent identical starts reconcile the first durable attempt timestamp", async () => {
  const scorer: EvaluationScorer = {
    id: "exact",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return { outcome: "succeeded", findings: [] };
    },
  };
  const { service, store } = await fixture({ scorers: [scorer] });
  await store.saveDefinition(existingDefinition);
  await store.saveRun({
    schemaVersion: 1,
    id: "identity-1",
    requestId: "concurrent-start",
    definition: { id: existingDefinition.id, revision: existingDefinition.revision },
    settings: { repetitions: 1, concurrency: 2 },
    createdAtMs: 100,
  });

  const results = await Promise.all([
    service.assess({ requestId: "concurrent-start", definition: existingDefinition }),
    service.assess({ requestId: "concurrent-start", definition: existingDefinition }),
  ]);

  expect(results).toEqual([
    {
      kind: "reconciled",
      evaluationRunId: "identity-1",
      orchestrationRunId: "orchestration/identity-2",
    },
    {
      kind: "reconciled",
      evaluationRunId: "identity-1",
      orchestrationRunId: "orchestration/identity-2",
    },
  ]);
  expect(await store.getStartAttempt("identity-1")).toMatchObject({
    evaluationRunId: "identity-1",
  });
});

test("status preserves unresolved-effect uncertainty within its bounded view", async () => {
  const scorer: EvaluationScorer = {
    id: "exact",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return { outcome: "succeeded", findings: [] };
    },
  };
  const { service, orchestration } = await fixture({ scorers: [scorer] });
  const started = await service.assess({
    requestId: "effect-summary",
    definition: existingDefinition,
  });
  if (started.kind !== "started") throw Error("not started");
  await orchestration.engine.result(started.orchestrationRunId);
  const read = orchestration.engine.get.bind(orchestration.engine);
  orchestration.engine.get = async (runId) => ({
    ...(await read(runId)),
    status: "running",
    unresolvedEffects: [
      ...Array.from({ length: 100 }, (_, index) => `effect-${index}`),
      "x".repeat(600),
    ],
  });
  const status = await service.status(started.evaluationRunId);
  expect(status.kind).toBe("uncertain");
  if (status.kind !== "uncertain") throw Error("expected uncertainty");
  expect(status.unresolvedEffects).toHaveLength(100);
  expect(status.unresolvedEffects.at(-1)).toContain("2 additional unresolved effects");
});

test("a lost start remains uncertain through status and cancellation until binding exists", async () => {
  const scorer: EvaluationScorer = {
    id: "exact",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return { outcome: "succeeded", findings: [] };
    },
  };
  const { service, orchestration, store } = await fixture({ scorers: [scorer] });
  orchestration.engine.start = async () => {
    throw new Error("response lost");
  };
  const started = await service.assess({ requestId: "lost-start", definition: existingDefinition });
  expect(started.kind).toBe("uncertain");
  if (started.kind !== "uncertain") throw Error("expected uncertain start");
  expect(await store.getStartAttempt(started.evaluationRunId)).toBeDefined();
  expect(await service.status(started.evaluationRunId)).toEqual({
    kind: "start_uncertain",
    evaluationRunId: started.evaluationRunId,
  });
  expect(await service.cancel(started.evaluationRunId)).toEqual({
    kind: "uncertain",
    evaluationRunId: started.evaluationRunId,
  });
});

test("explicit unknown after abort and mixed scorer ordering remain uncertain", async () => {
  let scorerCalls = 0;
  const target: EvaluationTarget<string, string> = {
    id: "unknown-target",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async invoke(_args, context) {
      if (!context.signal.aborted)
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      throw new StepFailure("unknown", "submission outcome unknown");
    },
  };
  const afterTarget: EvaluationScorer<string, string> = {
    id: "after-target",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      scorerCalls++;
      return { outcome: "succeeded", findings: [] };
    },
  };
  const denied: EvaluationScorer<string, string> = {
    id: "denied",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return { outcome: "denied", findings: [] };
    },
  };
  const uncertain: EvaluationScorer<string, string> = {
    id: "uncertain",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return { outcome: "uncertain", findings: [] };
    },
  };
  const { service, orchestration, store } = await fixture({
    targets: [target],
    scorers: [afterTarget, denied, uncertain],
  });
  const experiment = {
    schemaVersion: 1 as const,
    id: "unknown-after-abort",
    revision: "r1",
    name: "Unknown",
    mode: "experiment" as const,
    target: { id: "unknown-target", revision: "r1" },
    scorers: [{ id: "after-target", revision: "r1" }],
    cases: [{ id: "case", revision: "r1", input: "work", references: [] }],
  };
  const active = await service.run({ requestId: "unknown-after-abort", definition: experiment });
  if (active.kind !== "started") throw Error("not started");
  await service.cancel(active.evaluationRunId);
  await orchestration.engine.result(active.orchestrationRunId);
  const activePage = await store.listResults({ runId: active.evaluationRunId });
  expect((await store.getResult(activePage.items[0]!.id))?.result.status).toBe("uncertain");
  expect(scorerCalls).toBe(0);

  for (const order of [
    [denied, uncertain],
    [uncertain, denied],
  ]) {
    const suffix = order[0]!.id;
    const definition = {
      ...existingDefinition,
      id: `mixed-${suffix}`,
      scorers: order.map(({ id, revision }) => ({ id, revision })),
    };
    const started = await service.assess({ requestId: `mixed-${suffix}`, definition });
    if (started.kind !== "started") throw Error("not started");
    await orchestration.engine.result(started.orchestrationRunId);
    const page = await store.listResults({ runId: started.evaluationRunId });
    expect((await store.getResult(page.items[0]!.id))?.result.status).toBe("uncertain");
  }
});

test("oversized aggregate keeps a discoverable summary while detail fails visibly", async () => {
  const scorers = Array.from(
    { length: 6 },
    (_, scorerIndex): EvaluationScorer<null, null> => ({
      id: `large-scorer-${scorerIndex}`,
      revision: "r1",
      input: z.null(),
      output: z.null(),
      async score() {
        return {
          outcome: "succeeded",
          findings: Array.from({ length: 100 }, (_, findingIndex) => ({
            id: `finding-${findingIndex}`,
            name: "Large",
            outcome: "scored" as const,
            score: 1,
            explanation: "x".repeat(8192),
            references: [],
          })),
        };
      },
    }),
  );
  const { service, orchestration, store } = await fixture({ scorers });
  const definition = {
    schemaVersion: 1 as const,
    id: "oversized-aggregate",
    revision: "r1",
    name: "Oversized aggregate",
    mode: "assess_existing" as const,
    scorers: scorers.map(({ id, revision }) => ({ id, revision })),
    cases: [{ id: "case", revision: "r1", input: null, suppliedOutput: null, references: [] }],
  };
  const started = await service.assess({ requestId: "oversized-aggregate", definition });
  if (started.kind !== "started") throw Error("not started");
  await orchestration.engine.result(started.orchestrationRunId);
  const page = await store.listResults({ runId: started.evaluationRunId });
  expect(page.items[0]).toMatchObject({ status: "completed", findingCount: 600 });
  await expect(store.getResult(page.items[0]!.id)).rejects.toMatchObject({ code: "unavailable" });
});

test("one workflow keeps distinct durable scorer steps for the 122-case knowledge consumer", async () => {
  let scorerCalls = 0;
  const scorers = Array.from(
    { length: 3 },
    (_, index): EvaluationScorer<string, string> => ({
      id: `criterion-${index}`,
      revision: "r1",
      input: z.string(),
      output: z.string(),
      async score() {
        scorerCalls++;
        return {
          outcome: "succeeded",
          findings: [
            {
              id: `criterion-${index}`,
              name: `Criterion ${index}`,
              outcome: "scored",
              score: 1,
              references: [],
            },
          ],
        };
      },
    }),
  );
  const { service, orchestration, store } = await fixture({ scorers });
  const definition = {
    schemaVersion: 1 as const,
    id: "knowledge-consumer",
    revision: "r1",
    name: "Knowledge consumer",
    mode: "assess_existing" as const,
    scorers: scorers.map(({ id, revision }) => ({ id, revision })),
    cases: Array.from({ length: 122 }, (_, index) => ({
      id: `case-${index}`,
      revision: "r1",
      input: `input-${index}`,
      suppliedOutput: `output-${index}`,
      references: [],
    })),
  };
  const started = await service.assess({ requestId: "knowledge-122", definition });
  if (started.kind !== "started") throw Error("not started");
  await orchestration.engine.result(started.orchestrationRunId);
  expect(orchestration.steps).toHaveLength(1 + 122 * 4);
  expect(scorerCalls).toBe(122 * 3);
  expect(
    (await store.listResults({ runId: started.evaluationRunId, limit: 200 })).items,
  ).toHaveLength(122);
});

test("workflow step and serialized plan bounds reject oversized work before effects", async () => {
  let calls = 0;
  const largeRevision = "\u0001".repeat(160);
  const scorer: EvaluationScorer<string, string> = {
    id: "criterion",
    revision: largeRevision,
    input: z.string(),
    output: z.string(),
    async score() {
      calls++;
      return { outcome: "succeeded", findings: [] };
    },
  };
  const { service, orchestration } = await fixture({ scorers: [scorer] });
  const cases = (length: number, revision = "r1") =>
    Array.from({ length }, (_, index) => ({
      id: `case-${index}`,
      revision,
      input: `input-${index}`,
      suppliedOutput: `output-${index}`,
      references: [],
    }));
  const base = {
    schemaVersion: 1 as const,
    revision: largeRevision,
    name: "Bounded plan",
    mode: "assess_existing" as const,
    scorers: [{ id: "criterion", revision: largeRevision }],
  };
  await expect(
    service.assess({
      requestId: "too-many-steps",
      definition: { ...base, id: "too-many-steps", cases: cases(500) },
    }),
  ).rejects.toThrow(`${MAX_EVALUATION_WORKFLOW_STEPS}-step workflow bound`);

  const started = await service.assess({
    requestId: "too-many-plan-bytes",
    definition: { ...base, id: "too-many-plan-bytes", cases: cases(499, largeRevision) },
  });
  if (started.kind !== "started") throw Error("not started");
  await expect(orchestration.engine.result(started.orchestrationRunId)).rejects.toThrow(
    `Evaluation plan exceeds ${MAX_EVALUATION_PLAN_DISPATCH_BYTES} bytes`,
  );
  expect(calls).toBe(0);
});

test("cancellation reaches an active target and never starts a scorer after a cancelled target", async () => {
  let scorerCalls = 0;
  const target: EvaluationTarget = {
    id: "target",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async invoke(_args, context) {
      if (!context.signal.aborted)
        await new Promise<void>((resolve) =>
          context.signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      return { outcome: "cancelled", references: [] };
    },
  };
  const scorer: EvaluationScorer = {
    id: "scorer",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      scorerCalls++;
      return { outcome: "succeeded", findings: [] };
    },
  };
  const { service, orchestration, store } = await fixture({ targets: [target], scorers: [scorer] });
  const definition = {
    schemaVersion: 1 as const,
    id: "cancel",
    revision: "r1",
    name: "Cancel",
    mode: "experiment" as const,
    target: { id: "target", revision: "r1" },
    scorers: [{ id: "scorer", revision: "r1" }],
    cases: [{ id: "case", revision: "r1", input: "work", references: [] }],
  };
  const started = await service.run({ requestId: "cancel-request", definition });
  if (started.kind !== "started") throw Error("not started");
  expect(await service.cancel(started.evaluationRunId)).toMatchObject({ kind: "requested" });
  await orchestration.engine.result(started.orchestrationRunId);
  const results = await store.listResults({ runId: started.evaluationRunId });
  expect((await store.getResult(results.items[0]!.id))?.result.status).toBe("cancelled");
  expect(scorerCalls).toBe(0);
});
