import {
  EvaluationDefinitionSchema,
  EvaluationStartAttemptSchema,
  EvaluationStoreError,
  ScorerCheckpointSchema,
  type EvaluationCase,
  type EvaluationDefinition,
  type EvaluationFeedback,
  type EvaluationResultRecord,
  type EvaluationScope,
  type EvaluationStore,
  type ScorerCheckpoint,
  type TargetCheckpoint,
} from "./index.js";

export type EvaluationConformanceFactory = (scope: EvaluationScope) => Promise<EvaluationStore> | EvaluationStore;

const alphaScope = { installationId: "installation-alpha", projectId: "project-alpha" } as const;
const betaScope = { installationId: "installation-alpha", projectId: "project-beta" } as const;

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function errorCode(promise: Promise<unknown>, expected: EvaluationStoreError["code"], label: string) {
  try { await promise; }
  catch (error) {
    check(error instanceof EvaluationStoreError && error.code === expected, label);
    return;
  }
  throw new Error(label);
}

function caseRecord(index: number): EvaluationCase {
  return { id: `case-${index}`, revision: "case-r1", input: { prompt: `input-${index}` }, references: [] };
}

function definition(): EvaluationDefinition {
  return EvaluationDefinitionSchema.parse({
    schemaVersion: 1,
    id: "evaluation-main",
    revision: "definition-r1",
    name: "Portable conformance",
    mode: "experiment",
    cases: [1, 2, 3, 4].map(caseRecord),
    target: { id: "target-main", revision: "target-r1", configuration: { model: "synthetic" } },
    scorers: [
      { id: "scorer-exact", revision: "scorer-r1" },
      { id: "scorer-advisory", revision: "scorer-r1" },
    ],
  });
}

function result(index: number, overrides: Partial<EvaluationResultRecord> = {}): EvaluationResultRecord {
  return {
    schemaVersion: 1,
    id: `result-${index}`,
    runId: "run-main",
    caseId: `case-${index}`,
    caseRevision: "case-r1",
    trial: 0,
    status: "failed",
    scorerInvocationIds: [],
    startedAtMs: 100 + index,
    completedAtMs: 200 + index,
    ...overrides,
  };
}

/** Shared durable-record behavior. A factory must reopen the same backend for the same scope. */
export async function evaluationStoreConformance(factory: EvaluationConformanceFactory): Promise<void> {
  let store = await factory(alphaScope);
  const other = await factory(betaScope);
  try {
    const source = definition();
    check((await store.saveDefinition(source)).kind === "accepted", "definition accepted");
    check((await store.saveDefinition(source)).kind === "duplicate", "duplicate definition is harmless");
    await errorCode(store.saveDefinition({ ...source, name: "conflicting identity" }), "conflict", "definition identity conflict");
    check((await store.getDefinition({ id: source.id, revision: source.revision }))?.name === source.name, "conflict preserves source definition");
    const header = await store.getDefinitionHeader({ id: source.id, revision: source.revision });
    check(header?.name === source.name && !("cases" in header), "definition header is readable without case hydration");
    check(JSON.stringify((await store.getCase({ id: source.id, revision: source.revision }, "case-2"))?.input) === '{"prompt":"input-2"}', "selected case is readable without slicing all results");
    check(await other.getDefinition({ id: source.id, revision: source.revision }) === undefined, "project scope is isolated");

    const existing = EvaluationDefinitionSchema.parse({
      schemaVersion: 1,
      id: "evaluation-existing",
      revision: "definition-r1",
      name: "Existing output",
      mode: "assess_existing",
      cases: [{ ...caseRecord(20), suppliedOutput: { saved: true } }],
      scorers: [{ id: "scorer-exact", revision: "scorer-r1" }],
    });
    await store.saveDefinition(existing);
    check(JSON.stringify((await store.getCase({ id: existing.id, revision: existing.revision }, "case-20"))?.suppliedOutput) === '{"saved":true}', "selected existing output persists with its case");
    for (let index = 0; index < 50; index++) await store.saveDefinition({ ...existing, id: `evaluation-page-${index}`, name: `Page ${index}` });
    const defaultDefinitions = await store.listDefinitions();
    check(defaultDefinitions.items.length === 50 && defaultDefinitions.hasMore && defaultDefinitions.cursor, "default keyset page is bounded to fifty records");

    const run = { schemaVersion: 1, id: "run-main", requestId: "request-main", definition: { id: source.id, revision: source.revision }, settings: { repetitions: 1, concurrency: 2 }, createdAtMs: 90 } as const;
    check((await store.saveRun(run)).kind === "accepted", "run binding accepted");
    check((await store.saveRun(run)).kind === "duplicate", "duplicate run delivery is harmless");
    await errorCode(store.saveRun({ ...run, requestId: "request-conflict" }), "conflict", "run identity conflict");
    const attempt = EvaluationStartAttemptSchema.parse({ schemaVersion: 1, evaluationRunId: run.id, requestedAtMs: 91 });
    check(await store.getStartAttempt(run.id) === undefined, "run intent exists before a start attempt");
    check((await store.saveStartAttempt(attempt)).kind === "accepted", "start attempt is durable before orchestration submission");
    check((await store.saveStartAttempt(attempt)).kind === "duplicate", "duplicate start attempt is harmless");
    await errorCode(store.saveStartAttempt({ ...attempt, requestedAtMs: 92 }), "conflict", "start attempt identity conflict");
    const binding = { schemaVersion: 1, evaluationRunId: run.id, orchestrationRunId: "owner/request%3Aone" } as const;
    check(await store.getOrchestrationBinding(run.id) === undefined, "run intent exists before orchestration binding");
    check((await store.saveOrchestrationBinding(binding)).kind === "accepted", "provider-owned orchestration run is bound after start");
    check((await store.saveOrchestrationBinding(binding)).kind === "duplicate", "duplicate orchestration binding is harmless");
    await errorCode(store.saveOrchestrationBinding({ ...binding, orchestrationRunId: "different-orchestration-run" }), "conflict", "orchestration binding identity conflict");

    const target: TargetCheckpoint = {
      schemaVersion: 1,
      invocationId: "target-invocation-1",
      runId: run.id,
      caseId: "case-1",
      caseRevision: "case-r1",
      trial: 0,
      target: { id: "target-main", revision: "target-r1" },
      outcome: "succeeded",
      output: { answer: "selected output" },
      references: [{ id: "output-reference", source: "fixture", uri: "asset://output-1", mediaType: "text/plain" }],
      usage: { inputTokens: 10, cachedInputTokens: 3, outputTokens: 2, totalTokens: 12 },
      model: { requested: "synthetic-requested", actual: "synthetic-actual" },
      startedAtMs: 100,
      completedAtMs: 110,
    };
    check((await store.saveTargetCheckpoint(target)).kind === "accepted", "target checkpoint accepted");
    check((await store.saveTargetCheckpoint(target)).kind === "duplicate", "duplicate target checkpoint is harmless");
    await errorCode(store.saveTargetCheckpoint({ ...target, outcome: "uncertain" }), "conflict", "target checkpoint identity conflict");
    await errorCode(store.saveTargetCheckpoint({ ...target, invocationId: "target-out-of-range", trial: 1 }), "conflict", "one-repetition run rejects target trial one");

    const exact: ScorerCheckpoint = {
      schemaVersion: 1,
      invocationId: "scorer-invocation-exact",
      runId: run.id,
      caseId: "case-1",
      caseRevision: "case-r1",
      trial: 0,
      scorer: { id: "scorer-exact", revision: "scorer-r1" },
      outcome: "succeeded",
      findings: [{ id: "finding-exact", name: "Exact match", outcome: "scored", score: 1, explanation: "matched", references: [] }],
      startedAtMs: 111,
      completedAtMs: 112,
    };
    const advisory: ScorerCheckpoint = {
      schemaVersion: 1,
      invocationId: "scorer-invocation-advisory",
      runId: run.id,
      caseId: "case-1",
      caseRevision: "case-r1",
      trial: 0,
      scorer: { id: "scorer-advisory", revision: "scorer-r1" },
      outcome: "failed",
      findings: [
        { id: "finding-preserved", name: "Completed before failure", outcome: "scored", score: 0.5, references: [] },
        { id: "finding-error", name: "Judge failure", outcome: "error", error: { code: "judge_failed", message: "scripted" }, references: [] },
      ],
      usage: { outputTokens: 4 },
      startedAtMs: 113,
      completedAtMs: 115,
    };
    check((await store.saveScorerCheckpoint(exact)).kind === "accepted", "scorer checkpoint accepted without invented usage");
    check((await store.saveScorerCheckpoint(advisory)).kind === "accepted", "failed scorer checkpoint preserves partial findings");
    const exactSelector = { invocationId: exact.invocationId, runId: exact.runId, caseId: exact.caseId, caseRevision: exact.caseRevision, trial: exact.trial };
    check((await store.getScorerCheckpoint(exactSelector))?.usage === undefined, "unknown invocation usage stays unknown");
    check(await store.getScorerCheckpoint({ ...exactSelector, caseRevision: "case-r2" }) === undefined, "checkpoint lookup includes case revision");
    await errorCode(store.saveScorerCheckpoint({ ...exact, outcome: "denied" }), "conflict", "scorer checkpoint identity conflict");
    await errorCode(store.saveScorerCheckpoint({ ...exact, invocationId: "scorer-out-of-range", trial: 1 }), "conflict", "one-repetition run rejects scorer trial one");

    const first = result(1, {
      status: "unscored",
      targetInvocationId: target.invocationId,
      scorerInvocationIds: [exact.invocationId, advisory.invocationId],
    });
    check((await store.saveResult(first)).kind === "accepted", "terminal result accepted after checkpoints");
    check((await store.saveResult(first)).kind === "duplicate", "duplicate result delivery is harmless");
    await errorCode(store.saveResult({ ...result(1), id: "result-out-of-range", trial: 1 }), "conflict", "one-repetition run rejects result trial one");
    const view = await store.getResult(first.id);
    check(JSON.stringify(view?.target?.output) === '{"answer":"selected output"}', "result reads selected target output");
    check(view?.findings.map((item) => item.id).join(",") === "finding-exact,finding-preserved,finding-error", "result reads individual findings including partial failure");
    check(view?.scorers[0]?.usage === undefined && view?.scorers[1]?.usage?.outputTokens === 4, "usage remains per invocation and optional");

    const feedback: EvaluationFeedback = { schemaVersion: 1, id: "feedback-1", resultId: first.id, attribution: "operator", rating: "incorrect", correction: "Advisory correction", createdAtMs: 300 };
    check((await store.saveFeedback(feedback)).kind === "accepted", "advisory feedback accepted");
    check((await store.saveFeedback(feedback)).kind === "duplicate", "duplicate feedback is harmless");
    await errorCode(store.saveFeedback({ ...feedback, rating: "correct" }), "conflict", "feedback identity conflict");
    check((await store.getResult(first.id))?.result.status === "unscored", "feedback never changes or accepts the source result");

    await store.saveResult(result(2));
    await store.saveResult(result(3));
    const page = await store.listResults({ runId: run.id, limit: 2 });
    check(page.items.map((item) => item.id).join(",") === "result-3,result-2" && page.hasMore && page.cursor, "result page uses newest-first keyset ordering");
    await store.saveResult(result(4));
    const stable = await store.listResults({ runId: run.id, limit: 2, after: page.cursor });
    check(stable.items.map((item) => item.id).join(",") === "result-1" && !stable.hasMore, "concurrent arrival does not shift an existing result page");
    const unfiltered = await store.listResults({ limit: 2 });
    check(unfiltered.items.map((item) => item.id).join(",") === "result-4,result-3" && unfiltered.cursor, "unfiltered result page spans its scope");
    const otherRun = { ...run, id: "run-other", requestId: "request-other" };
    await store.saveRun(otherRun);
    await store.saveResult({ ...result(1), id: "result-other", runId: otherRun.id });
    const unfilteredStable = await store.listResults({ limit: 2, after: unfiltered.cursor });
    check(unfilteredStable.items.map((item) => item.id).join(",") === "result-2,result-1", "multi-run arrival does not shift an unfiltered continuation");
    await errorCode(other.listResults({ runId: run.id, after: page.cursor }), "invalid_cursor", "cursor is bound to scope and query");
    await errorCode(store.listResults({ limit: 201 } as never), "invalid_input", "page limit is bounded");
    await errorCode(store.saveFeedback({ ...feedback, id: "feedback-missing", resultId: "missing" }), "not_found", "feedback requires an exact stored result");

    const repeatRun = { ...run, id: "run-repeat", requestId: "request-repeat", settings: { repetitions: 3, concurrency: 2 } };
    await store.saveRun(repeatRun);
    const repeatTarget = { ...target, invocationId: "target-repeat-2", runId: repeatRun.id, trial: 2 };
    const repeatScorer = { ...exact, invocationId: "scorer-repeat-2", runId: repeatRun.id, trial: 2 };
    const repeatResult = { ...result(1), id: "result-repeat-2", runId: repeatRun.id, trial: 2, status: "completed" as const, targetInvocationId: repeatTarget.invocationId, scorerInvocationIds: [repeatScorer.invocationId] };
    check((await store.saveTargetCheckpoint(repeatTarget)).kind === "accepted", "final configured target trial is accepted");
    check((await store.saveScorerCheckpoint(repeatScorer)).kind === "accepted", "final configured scorer trial is accepted");
    check((await store.saveResult(repeatResult)).kind === "accepted", "final configured result trial is accepted");
    const preserved = JSON.stringify(await store.getResult(repeatResult.id));
    await errorCode(store.saveTargetCheckpoint({ ...repeatTarget, invocationId: "target-repeat-3", trial: 3 }), "conflict", "target rejects first trial beyond configured repetitions");
    await errorCode(store.saveScorerCheckpoint({ ...repeatScorer, invocationId: "scorer-repeat-3", trial: 3 }), "conflict", "scorer rejects first trial beyond configured repetitions");
    await errorCode(store.saveResult({ ...repeatResult, id: "result-repeat-3", trial: 3, targetInvocationId: undefined, scorerInvocationIds: [] }), "conflict", "result rejects first trial beyond configured repetitions");
    check(await store.getTargetCheckpoint({ invocationId: "target-repeat-3", runId: repeatRun.id, caseId: "case-1", caseRevision: "case-r1", trial: 3 }) === undefined, "refused target trial leaves no checkpoint");
    check(await store.getScorerCheckpoint({ invocationId: "scorer-repeat-3", runId: repeatRun.id, caseId: "case-1", caseRevision: "case-r1", trial: 3 }) === undefined, "refused scorer trial leaves no findings checkpoint");
    check(await store.getResult("result-repeat-3") === undefined, "refused result trial leaves no result");
    check(JSON.stringify(await store.getResult(repeatResult.id)) === preserved, "out-of-range trials preserve prior result checkpoints and references");

    const oversizedDefinition = EvaluationDefinitionSchema.parse({
      schemaVersion: 1, id: "evaluation-oversized-view", revision: "definition-r1", name: "Oversized detail", mode: "assess_existing",
      cases: [{ id: "oversized-case", revision: "case-r1", input: null, suppliedOutput: null, references: [] }],
      scorers: Array.from({ length: 6 }, (_, index) => ({ id: `oversized-scorer-${index}`, revision: "scorer-r1" })),
    });
    await store.saveDefinition(oversizedDefinition);
    const oversizedRun = { ...run, id: "run-oversized-view", requestId: "request-oversized-view", definition: { id: oversizedDefinition.id, revision: oversizedDefinition.revision } };
    await store.saveRun(oversizedRun);
    const oversizedScorers: ScorerCheckpoint[] = [];
    for (let scorerIndex = 0; scorerIndex < 6; scorerIndex++) {
      const checkpoint = ScorerCheckpointSchema.parse({
        schemaVersion: 1, invocationId: `oversized-invocation-${scorerIndex}`, runId: oversizedRun.id,
        caseId: "oversized-case", caseRevision: "case-r1", trial: 0,
        scorer: oversizedDefinition.scorers[scorerIndex], outcome: "succeeded",
        findings: Array.from({ length: 100 }, (_, findingIndex) => ({ id: `finding-${findingIndex}`, name: "Large finding", outcome: "scored", score: 1, explanation: "x".repeat(8192), references: [] })),
        startedAtMs: 400 + scorerIndex, completedAtMs: 410 + scorerIndex,
      });
      oversizedScorers.push(checkpoint);
      check((await store.saveScorerCheckpoint(checkpoint)).kind === "accepted", "individually valid large scorer checkpoint is retained");
    }
    const oversizedResult = result(20, { id: "result-oversized-view", runId: oversizedRun.id, caseId: "oversized-case", caseRevision: "case-r1", status: "completed", scorerInvocationIds: oversizedScorers.map((item) => item.invocationId), startedAtMs: 400, completedAtMs: 420 });
    check((await store.saveResult(oversizedResult)).kind === "accepted", "oversized aggregate still saves its discoverable result summary");
    check((await store.getResultSummary(oversizedResult.id))?.findingCount === 600, "oversized aggregate has an exact bounded summary read");
    check((await store.listResults({ runId: oversizedRun.id })).items[0]?.findingCount === 600, "oversized aggregate summary retains finding count");
    await errorCode(store.getResult(oversizedResult.id), "unavailable", "oversized aggregate detail fails visibly without deleting its summary");
  } finally {
    await store.close();
    await other.close();
  }

  store = await factory(alphaScope);
  try {
    check((await store.getRun("run-main"))?.requestId === "request-main", "run binding survives restart");
    check((await store.getStartAttempt("run-main"))?.requestedAtMs === 91, "start attempt uncertainty survives restart");
    check((await store.getOrchestrationBinding("run-main"))?.orchestrationRunId === "owner/request%3Aone", "opaque provider-owned orchestration binding survives restart");
    check((await store.getResultSummary("result-oversized-view"))?.findingCount === 600, "oversized aggregate summary survives restart");
    await errorCode(store.getResult("result-oversized-view"), "unavailable", "oversized aggregate detail stays fail-visible after restart");
    const targetSelector = { invocationId: "target-invocation-1", runId: "run-main", caseId: "case-1", caseRevision: "case-r1", trial: 0 };
    const scorerSelector = { invocationId: "scorer-invocation-advisory", runId: "run-main", caseId: "case-1", caseRevision: "case-r1", trial: 0 };
    check((await store.getTargetCheckpoint(targetSelector))?.outcome === "succeeded", "target checkpoint survives restart");
    check((await store.getScorerCheckpoint(scorerSelector))?.findings.length === 2, "individual findings survive restart");
    check((await store.listFeedback({ resultId: "result-1" })).items[0]?.correction === "Advisory correction", "feedback survives restart separately");
  } finally { await store.close(); }
}
