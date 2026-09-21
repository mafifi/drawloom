import { expect, test } from "vitest";
import type {
  EvaluationDefinition,
  EvaluationFeedback,
  EvaluationResultView,
  EvaluationService,
  ResultSummary,
  ScorerCheckpoint,
  TargetCheckpoint,
} from "@drawloom/evaluation";
import { createEvaluationViewModel } from "./src/index.js";
import { setTimeout as sleep } from "node:timers/promises";

const definition: EvaluationDefinition = {
  schemaVersion: 1,
  id: "saved-check",
  revision: "r1",
  name: "Saved check",
  mode: "assess_existing",
  scorers: [{ id: "criterion", revision: "r1" }],
  cases: [
    { id: "case-a", revision: "r1", input: "question", suppliedOutput: "answer", references: [] },
  ],
};
const run = {
  schemaVersion: 1 as const,
  id: "run-a",
  requestId: "request-a",
  definition: { id: definition.id, revision: definition.revision },
  settings: { repetitions: 1, concurrency: 1 },
  createdAtMs: 1,
};
const baseCase = definition.cases[0]!;
const summary: ResultSummary = {
  schemaVersion: 1,
  id: "result-a",
  runId: run.id,
  caseId: "case-a",
  caseRevision: "r1",
  trial: 0,
  status: "completed",
  scorerInvocationIds: ["score-a"],
  startedAtMs: 2,
  completedAtMs: 3,
  findingCount: 1,
};
const scorer = (revision = "r1", score = 1): ScorerCheckpoint => ({
  schemaVersion: 1,
  invocationId: revision === "r1" ? "score-a" : "score-b",
  runId: run.id,
  caseId: "case-a",
  caseRevision: "r1",
  trial: 0,
  scorer: { id: "criterion", revision },
  outcome: "succeeded",
  findings: [{ id: "finding", name: "Criterion", outcome: "scored", score, references: [] }],
  startedAtMs: 2,
  completedAtMs: 3,
});
const detail = (result = summary, checkpoint = scorer()): EvaluationResultView => ({
  result,
  scorers: [checkpoint],
  findings: checkpoint.findings,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function client(overrides: Partial<EvaluationService> = {}) {
  let starts = 0;
  const feedback: EvaluationFeedback[] = [];
  const service: EvaluationService = {
    readiness: async () => ({ status: "ready" }),
    assess: async () => ({
      kind: "started",
      evaluationRunId: run.id,
      orchestrationRunId: "workflow-a",
    }),
    run: async () => ({
      kind: "started",
      evaluationRunId: run.id,
      orchestrationRunId: "workflow-a",
    }),
    status: async () => ({
      kind: "running",
      evaluationRunId: run.id,
      orchestrationRunId: "workflow-a",
      cancellationRequested: false,
    }),
    cancel: async () => ({
      kind: "requested",
      evaluationRunId: run.id,
      orchestrationRunId: "workflow-a",
    }),
    getDefinition: async () => definition,
    getDefinitionHeader: async () => definition,
    getCase: async () => baseCase,
    listDefinitions: async () => ({
      items: [
        {
          ref: { id: definition.id, revision: definition.revision },
          name: definition.name,
          mode: definition.mode,
          caseCount: 1,
          scorerCount: 1,
        },
      ],
      hasMore: false,
    }),
    getRun: async () => run,
    getStartAttempt: async () => undefined,
    getOrchestrationBinding: async () => undefined,
    listRuns: async () => ({ items: [run], hasMore: false }),
    getTargetCheckpoint: async () => undefined,
    getScorerCheckpoint: async () => scorer(),
    getResultSummary: async () => summary,
    getResult: async () => detail(),
    listResults: async () => ({ items: [summary], hasMore: false }),
    listFeedback: async () => ({ items: feedback, hasMore: false }),
    saveFeedback: async (value) => {
      feedback.unshift(value);
      return { kind: "accepted" };
    },
    ...overrides,
  };
  return {
    service,
    starts: () => starts,
    countStart() {
      starts++;
    },
  };
}

test("opening and browsing saved pages never starts an evaluation", async () => {
  let starts = 0;
  const f = client({
    assess: async () => {
      starts++;
      throw Error("must not start");
    },
    run: async () => {
      starts++;
      throw Error("must not start");
    },
  });
  const vm = createEvaluationViewModel({
    client: f.service,
    nextId: () => "request-one",
    clock: () => 10,
  });
  await vm.open();
  expect(vm.presentation.definitions.map((item) => item.name)).toEqual(["Saved check"]);
  expect(vm.presentation.runs.map((item) => item.id)).toEqual(["run-a"]);
  expect(starts).toBe(0);
});

test("late result reads cannot replace a newer selection or a closed view", async () => {
  const responses = new Map<string, (value: EvaluationResultView) => void>();
  const second = { ...summary, id: "result-b", scorerInvocationIds: ["score-b"] };
  const f = client({
    listResults: async () => ({ items: [summary, second], hasMore: false }),
    getResult: (id) => new Promise((resolve) => responses.set(id, resolve)),
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  const firstRead = vm.actions.selectResult(summary.id);
  const secondRead = vm.actions.selectResult(second.id);
  await sleep(0);
  responses.get(second.id)!(detail(second, scorer("r2")));
  await secondRead;
  responses.get(summary.id)!(detail());
  await firstRead;
  expect(vm.presentation.selectedResult?.id).toBe(second.id);
  expect(vm.presentation.detail?.result.id).toBe(second.id);
  const closedRead = vm.actions.selectResult(summary.id);
  await sleep(0);
  vm.close();
  responses.get(summary.id)!(detail());
  await closedRead;
  expect(vm.presentation.detail).toBeUndefined();
});

test("rapid start uses one identity and an unavailable response becomes authoritative setup state", async () => {
  const requests: string[] = [];
  let release!: (value: Awaited<ReturnType<EvaluationService["assess"]>>) => void;
  const f = client({
    assess: async (request) => {
      requests.push(request.requestId);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const ids = ["request-one", "request-two"];
  const vm = createEvaluationViewModel({
    client: f.service,
    nextId: () => ids.shift()!,
    clock: () => 10,
  });
  await vm.open();
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  const first = vm.actions.start();
  const duplicate = vm.actions.start();
  await sleep(0);
  release({ kind: "unavailable", reason: "Orchestration is not configured" });
  await Promise.all([first, duplicate]);
  expect(requests).toEqual(["request-one"]);
  await vm.actions.start();
  expect(requests).toEqual(["request-one"]);
  expect(vm.presentation.startReadiness).toEqual({
    status: "unavailable",
    reason: "Orchestration is not configured",
  });
});

test("cancellation requested stays distinct from cancelled", async () => {
  const f = client();
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.cancel();
  expect(vm.presentation.execution).toEqual({
    kind: "running",
    evaluationRunId: run.id,
    orchestrationRunId: "workflow-a",
    cancellationRequested: true,
  });
  expect(vm.presentation.copy.executionLabels.cancelled).not.toBe(
    vm.presentation.copy.executionLabels.cancellationRequested,
  );
});

test("feedback validates, preserves drafts on failure, and reload cannot hide a saved record", async () => {
  let saves = 0;
  let reload!: (value: { items: EvaluationFeedback[]; hasMore: false }) => void;
  const f = client({
    saveFeedback: async (value) => {
      saves++;
      if (saves === 1) throw Error("storage unavailable");
      return { kind: "accepted" };
    },
    listFeedback: async () =>
      new Promise((resolve) => {
        reload = resolve;
      }),
  });
  const vm = createEvaluationViewModel({
    client: f.service,
    nextId: () => "feedback-one",
    clock: () => 10,
  });
  await vm.open();
  await vm.actions.selectRun(run.id);
  const selected = vm.actions.selectResult(summary.id);
  await sleep(0);
  reload({ items: [], hasMore: false });
  await selected;
  vm.actions.setFeedback({
    attribution: "",
    rating: "correct",
    correction: "Keep this correction",
  });
  await vm.actions.saveFeedback();
  expect(vm.presentation.feedbackError).toContain("attribution");
  vm.actions.setFeedback({ attribution: "Reviewer" });
  await vm.actions.saveFeedback();
  expect(vm.presentation.feedbackDraft.correction).toBe("Keep this correction");
  expect(vm.presentation.feedbackError).toContain("storage unavailable");
  const retry = vm.actions.saveFeedback();
  await sleep(0);
  reload({
    items: [
      {
        schemaVersion: 1,
        id: "feedback-one",
        resultId: summary.id,
        attribution: "Reviewer",
        rating: "correct",
        correction: "Keep this correction",
        createdAtMs: 10,
      },
    ],
    hasMore: false,
  });
  await retry;
  expect(vm.presentation.feedback.map((item) => item.id)).toEqual(["feedback-one"]);
  expect(vm.presentation.feedbackDraft.correction).toBe("");
});

test("baseline comparison requires exact criterion configuration", async () => {
  const baseline = { ...summary, id: "baseline", scorerInvocationIds: ["score-b"] };
  const baselineRun = {
    ...run,
    id: "run-b",
    definition: { id: "baseline-definition", revision: "r1" },
  };
  baseline.runId = baselineRun.id;
  const f = client({
    getResultSummary: async (id) => (id === baseline.id ? baseline : summary),
    getResult: async (id) =>
      id === baseline.id
        ? detail(baseline, { ...scorer("r1", 0), invocationId: "score-b", runId: baselineRun.id })
        : detail(),
    getRun: async (id) => (id === baselineRun.id ? baselineRun : run),
    getDefinitionHeader: async (ref) =>
      ref.id === baselineRun.definition.id
        ? {
            ...definition,
            id: baselineRun.definition.id,
            scorers: [{ id: "criterion", revision: "r1", configuration: { rubric: "different" } }],
          }
        : definition,
    getCase: async () => baseCase,
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  await vm.actions.selectBaseline(baseline.id);
  expect(vm.presentation.comparison).toEqual({
    kind: "incomparable",
    reason: "Criterion revisions or configurations do not match.",
  });
});

test("different saved outputs and targets compare when bounded case and criterion facts match", async () => {
  const baseline = {
    ...summary,
    id: "baseline-compatible",
    runId: "run-compatible",
    scorerInvocationIds: ["score-compatible"],
  };
  const baselineRun = {
    ...run,
    id: baseline.runId,
    definition: { id: "other-output-set", revision: "r3" },
  };
  const currentHeader = {
    ...definition,
    scorers: [{ id: "criterion", revision: "r1", configuration: { rubric: "exact" } }],
  };
  const baselineHeader = {
    ...currentHeader,
    id: baselineRun.definition.id,
    revision: baselineRun.definition.revision,
    mode: "experiment" as const,
    target: { id: "other-target", revision: "r2", configuration: { temperature: 1 } },
  };
  const currentCase = { ...baseCase, suppliedOutput: "current output" };
  const baselineCase = { ...currentCase, suppliedOutput: "different output" };
  let headerReads = 0,
    caseReads = 0;
  const f = client({
    getResultSummary: async (id) => (id === baseline.id ? baseline : summary),
    getResult: async (id) =>
      id === baseline.id
        ? detail(baseline, {
            ...scorer("r1", 0),
            invocationId: "score-compatible",
            runId: baselineRun.id,
          })
        : detail(),
    getRun: async (id) => (id === baselineRun.id ? baselineRun : run),
    getDefinitionHeader: async (ref) => {
      headerReads++;
      return ref.id === baselineRun.definition.id ? baselineHeader : currentHeader;
    },
    getCase: async (ref) => {
      caseReads++;
      return ref.id === baselineRun.definition.id ? baselineCase : currentCase;
    },
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  await vm.actions.selectBaseline(baseline.id);
  expect(vm.presentation.comparison?.kind).toBe("comparable");
  expect(vm.presentation.comparison).toMatchObject({
    findings: [{ current: { score: 1 }, baseline: { score: 0 } }],
  });
  expect([headerReads, caseReads]).toEqual([2, 2]);
  await vm.actions.refreshRun();
  expect([headerReads, caseReads]).toEqual([2, 2]);
});

test("oversized combined detail keeps its summary and permits one scorer checkpoint read", async () => {
  const f = client({
    getResult: async () => {
      throw Error("Result detail exceeds its bound");
    },
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  expect(vm.presentation.selectedResult?.findingCount).toBe(1);
  expect(vm.presentation.detail).toBeUndefined();
  expect(vm.presentation.detailError).toContain("one retained checkpoint");
  await vm.actions.selectScorer("score-a");
  expect(vm.presentation.selectedScorer?.scorer).toEqual({ id: "criterion", revision: "r1" });
});

test("same-definition navigation cannot replace the identity of an in-flight or uncertain start", async () => {
  const definitionRead = deferred<EvaluationDefinition | undefined>();
  const firstStart = deferred<Awaited<ReturnType<EvaluationService["assess"]>>>();
  const secondStart = deferred<Awaited<ReturnType<EvaluationService["assess"]>>>();
  const requests: Array<string | undefined> = [];
  const ids = ["request-one", "request-two"];
  const f = client({
    getDefinition: async () => definitionRead.promise,
    assess: async (request) => {
      requests.push(request.requestId);
      return requests.length === 1 ? firstStart.promise : secondStart.promise;
    },
  });
  const vm = createEvaluationViewModel({
    client: f.service,
    nextId: () => ids.shift()!,
    clock: () => 10,
  });
  await vm.open();
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  const first = vm.actions.start();
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  definitionRead.resolve(definition);
  await sleep(0);
  expect(requests).toEqual(["request-one"]);
  firstStart.resolve({ kind: "uncertain", evaluationRunId: "run-uncertain" });
  await first;

  const retry = vm.actions.start();
  await sleep(0);
  expect(requests).toEqual(["request-one", "request-one"]);
  secondStart.resolve({
    kind: "started",
    evaluationRunId: run.id,
    orchestrationRunId: "workflow-a",
  });
  await retry;
});

test("scorer loading belongs to its result selection and settles after navigation", async () => {
  const second = { ...summary, id: "result-b", scorerInvocationIds: ["score-b"] };
  const pending = deferred<ScorerCheckpoint | undefined>();
  const f = client({
    listResults: async () => ({ items: [summary, second], hasMore: false }),
    getResult: async (id) =>
      detail(id === second.id ? second : summary, id === second.id ? scorer("r2") : scorer()),
    getScorerCheckpoint: async (selector) =>
      selector.invocationId === "score-a" ? pending.promise : scorer("r2"),
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  const oldRead = vm.actions.selectScorer("score-a");
  await sleep(0);
  expect(vm.presentation.scorerLoading).toBe(true);
  await vm.actions.selectResult(second.id);
  expect(vm.presentation.scorerLoading).toBe(false);
  pending.resolve(scorer());
  await oldRead;
  expect(vm.presentation.selectedResult?.id).toBe(second.id);
  expect(vm.presentation.selectedScorer).toBeUndefined();
});

test("feedback saves reconcile with their original result after navigation", async () => {
  const second = { ...summary, id: "result-b", scorerInvocationIds: ["score-b"] };
  const firstSave = deferred<{ kind: "accepted" }>();
  const saved: EvaluationFeedback[] = [];
  const f = client({
    listResults: async () => ({ items: [summary, second], hasMore: false }),
    getResult: async (id) =>
      detail(id === second.id ? second : summary, id === second.id ? scorer("r2") : scorer()),
    saveFeedback: async (value) => {
      if (value.resultId === summary.id) {
        await firstSave.promise;
        saved.push(value);
        return { kind: "accepted" };
      }
      saved.push(value);
      return { kind: "accepted" };
    },
    listFeedback: async ({ resultId } = {}) => ({
      items: saved.filter((item) => !resultId || item.resultId === resultId),
      hasMore: false,
    }),
  });
  const ids = ["feedback-a", "feedback-b"];
  const vm = createEvaluationViewModel({
    client: f.service,
    nextId: () => ids.shift()!,
    clock: () => 10,
  });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  vm.actions.setFeedback({ attribution: "Reviewer A", rating: "correct" });
  const savingA = vm.actions.saveFeedback();
  await sleep(0);
  await vm.actions.selectResult(second.id);
  expect(vm.presentation.feedbackPending).toBe(false);
  vm.actions.setFeedback({ attribution: "Reviewer B", rating: "incorrect" });
  await vm.actions.saveFeedback();
  expect(saved.map((item) => item.resultId)).toEqual([second.id]);
  firstSave.resolve({ kind: "accepted" });
  await savingA;
  await vm.actions.selectResult(summary.id);
  expect(vm.presentation.feedbackDraft).toEqual({ attribution: "", correction: "" });
  expect(vm.presentation.feedback.map((item) => item.id)).toEqual(["feedback-a"]);
});

test("late run lookup cannot reselect a run left before lookup completion", async () => {
  const secondRun = { ...run, id: "run-b" };
  const oldRun = deferred<typeof run | undefined>();
  const f = client({
    listRuns: async () => ({ items: [secondRun], hasMore: false }),
    getRun: async (id) => (id === run.id ? oldRun.promise : secondRun),
    listResults: async () => ({ items: [], hasMore: false }),
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  const selectOld = vm.actions.selectRun(run.id);
  await vm.actions.selectRun(secondRun.id);
  oldRun.resolve(run);
  await selectOld;
  expect(vm.presentation.selectedRun?.id).toBe(secondRun.id);
});

test("late terminal status and old result errors cannot overwrite a newer selection", async () => {
  const secondRun = { ...run, id: "run-b" };
  const secondResult = {
    ...summary,
    id: "result-b",
    runId: secondRun.id,
    scorerInvocationIds: ["score-b"],
  };
  const terminalStatus = deferred<Awaited<ReturnType<EvaluationService["status"]>>>();
  const oldDetail = deferred<EvaluationResultView | undefined>();
  let statusReadsA = 0;
  const f = client({
    listRuns: async () => ({ items: [run, secondRun], hasMore: false }),
    listResults: async ({ runId } = {}) => ({
      items: runId === secondRun.id ? [secondResult] : [summary],
      hasMore: false,
    }),
    status: async (id) => {
      if (id === run.id && ++statusReadsA > 1) return terminalStatus.promise;
      return {
        kind: "running",
        evaluationRunId: id,
        orchestrationRunId: `workflow-${id}`,
        cancellationRequested: false,
      };
    },
    cancel: async () => ({
      kind: "terminal",
      evaluationRunId: run.id,
      orchestrationRunId: "workflow-run-a",
    }),
    getResult: async (id) =>
      id === summary.id ? oldDetail.promise : detail(secondResult, scorer("r2")),
    getRun: async (id) => (id === secondRun.id ? secondRun : run),
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  const cancelling = vm.actions.cancel();
  await sleep(0);
  await vm.actions.selectRun(secondRun.id);
  terminalStatus.resolve({
    kind: "completed",
    evaluationRunId: run.id,
    orchestrationRunId: "workflow-run-a",
  });
  await cancelling;
  expect(vm.presentation.execution?.evaluationRunId).toBe(secondRun.id);

  await vm.actions.selectRun(run.id);
  const selectingOld = vm.actions.selectResult(summary.id);
  await sleep(0);
  await vm.actions.selectRun(secondRun.id);
  await vm.actions.selectResult(secondResult.id);
  oldDetail.reject(Error("old detail failed"));
  await selectingOld;
  expect(vm.presentation.selectedResult?.id).toBe(secondResult.id);
  expect(vm.presentation.detailError).not.toContain("old detail failed");
});

test("editing the baseline identity invalidates an older comparison read", async () => {
  const oldBaseline = { ...summary, id: "baseline-old" };
  const lookup = deferred<ResultSummary | undefined>();
  const f = client({
    getResultSummary: async (id) => (id === oldBaseline.id ? lookup.promise : summary),
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  vm.actions.setBaselineResultId(oldBaseline.id);
  const comparing = vm.actions.selectBaseline(oldBaseline.id);
  await sleep(0);
  vm.actions.setBaselineResultId("baseline-new");
  lookup.resolve(oldBaseline);
  await comparing;
  expect(vm.presentation.baselineResultId).toBe("baseline-new");
  expect(vm.presentation.baseline).toBeUndefined();
  expect(vm.presentation.comparison).toBeUndefined();
});

test("target checkpoint fallback uses the retained selector when combined detail is unavailable", async () => {
  const targetSummary = { ...summary, targetInvocationId: "target-a" };
  const target: TargetCheckpoint = {
    schemaVersion: 1,
    invocationId: "target-a",
    runId: run.id,
    caseId: "case-a",
    caseRevision: "r1",
    trial: 0,
    target: { id: "model", revision: "r1" },
    outcome: "failed",
    error: { code: "target_failed", message: "Target failed safely" },
    references: [{ id: "trace", source: "fixture", uri: "asset://target" }],
    usage: { totalTokens: 12 },
    startedAtMs: 2,
    completedAtMs: 3,
  };
  let selector: unknown;
  const f = client({
    listResults: async () => ({ items: [targetSummary], hasMore: false }),
    getResult: async () => {
      throw Error("Result detail exceeds its bound");
    },
    getTargetCheckpoint: async (value) => {
      selector = value;
      return target;
    },
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(targetSummary.id);
  await vm.actions.selectTarget();
  expect(selector).toEqual({
    invocationId: "target-a",
    runId: run.id,
    caseId: "case-a",
    caseRevision: "r1",
    trial: 0,
  });
  expect(vm.presentation.selectedTarget).toEqual(target);
});

test("authoritative readiness is loaded without starting and blocks unavailable starts", async () => {
  let starts = 0;
  const f = client({
    readiness: async () => ({ status: "unavailable", reason: "Configure orchestration." }),
    assess: async () => {
      starts++;
      return { kind: "started", evaluationRunId: run.id, orchestrationRunId: "workflow" };
    },
  });
  const vm = createEvaluationViewModel({ client: f.service, nextId: () => "id", clock: () => 10 });
  await vm.open();
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  expect(vm.presentation.startReadiness).toEqual({
    status: "unavailable",
    reason: "Configure orchestration.",
  });
  await vm.actions.start();
  expect(starts).toBe(0);
  expect(vm.presentation.error).toContain("Configure orchestration");
});

test("refreshing saved checks rereads readiness and keeps start blocked until ready", async () => {
  const refresh = deferred<Awaited<ReturnType<EvaluationService["readiness"]>>>();
  let readinessReads = 0,
    starts = 0;
  const f = client({
    readiness: async () =>
      ++readinessReads === 1
        ? { status: "unavailable", reason: "Setup is offline." }
        : refresh.promise,
    assess: async () => {
      starts++;
      return { kind: "started", evaluationRunId: run.id, orchestrationRunId: "workflow" };
    },
  });
  const vm = createEvaluationViewModel({
    client: f.service,
    nextId: () => "request",
    clock: () => 10,
  });
  await vm.open();
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  const refreshing = vm.actions.latestDefinitions();
  await sleep(0);
  expect(vm.presentation.startReadiness.status).toBe("unavailable");
  await vm.actions.start();
  expect(starts).toBe(0);
  refresh.resolve({ status: "ready" });
  await refreshing;
  await vm.actions.start();
  expect(readinessReads).toBe(2);
  expect(starts).toBe(1);
});

test("same-VM close and reopen preserve drafts and unresolved start identity", async () => {
  const requests: string[] = [];
  let uncertain = true;
  const f = client({
    assess: async (request) => {
      requests.push(request.requestId);
      return uncertain
        ? { kind: "uncertain", evaluationRunId: "uncertain-run" }
        : { kind: "started", evaluationRunId: run.id, orchestrationRunId: "workflow" };
    },
  });
  const ids = ["request-one", "request-two"];
  const vm = createEvaluationViewModel({
    client: f.service,
    nextId: () => ids.shift()!,
    clock: () => 10,
  });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  vm.actions.setFeedback({
    attribution: "Reviewer",
    rating: "uncertain",
    correction: "KEEP THIS DRAFT",
  });
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  await vm.actions.start();
  vm.close();
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  expect(vm.presentation.feedbackDraft.correction).toBe("KEEP THIS DRAFT");
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  uncertain = false;
  await vm.actions.start();
  expect(requests).toEqual(["request-one", "request-one"]);
});

test("reopen does not duplicate in-flight saves or starts and reconciles their completion", async () => {
  const startResult = deferred<Awaited<ReturnType<EvaluationService["assess"]>>>();
  const saveResult = deferred<{ kind: "accepted" }>();
  let starts = 0,
    saves = 0;
  let submittedFeedback: EvaluationFeedback | undefined;
  const f = client({
    assess: async () => {
      starts++;
      return startResult.promise;
    },
    saveFeedback: async (value) => {
      saves++;
      submittedFeedback = value;
      return saveResult.promise;
    },
    listFeedback: async () => ({
      items: submittedFeedback ? [submittedFeedback] : [],
      hasMore: false,
    }),
  });
  const ids = ["feedback-one", "request-one", "request-two"];
  const vm = createEvaluationViewModel({
    client: f.service,
    nextId: () => ids.shift()!,
    clock: () => 10,
  });
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  vm.actions.setFeedback({
    attribution: "Reviewer",
    rating: "correct",
    correction: "Retain until acknowledged",
  });
  const saving = vm.actions.saveFeedback();
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  const starting = vm.actions.start();
  await sleep(0);
  vm.close();
  await vm.open();
  await vm.actions.selectRun(run.id);
  await vm.actions.selectResult(summary.id);
  await vm.actions.saveFeedback();
  vm.actions.selectDefinition({ id: definition.id, revision: definition.revision });
  const duplicateStart = vm.actions.start();
  await sleep(0);
  expect([starts, saves]).toEqual([1, 1]);
  saveResult.resolve({ kind: "accepted" });
  startResult.resolve({ kind: "uncertain", evaluationRunId: "uncertain-run" });
  await Promise.all([saving, starting, duplicateStart]);
  expect(vm.presentation.feedbackDraft).toEqual({ attribution: "", correction: "" });
  expect(vm.presentation.feedback.map((item) => item.id)).toEqual(["feedback-one"]);
});
