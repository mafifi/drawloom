import { expect, test } from "bun:test";
import {
  EvaluationCancelResultSchema,
  EvaluationExecutionStatusSchema,
  EvaluationDefinitionSchema,
  EvaluationDefinitionHeaderSchema,
  EvaluationJsonSchema,
  EvaluationReadinessSchema,
  EvaluationResultRecordSchema,
  EvaluationStartRequestSchema,
  EvaluationStartResultSchema,
  EvaluationStartAttemptSchema,
  EvidenceReferenceSchema,
  NormalizedUsageSchema,
  ScorerCheckpointSchema,
} from "./src/index.js";

test("definition modes, case identities, JSON size, and media references are bounded", () => {
  const base = { schemaVersion: 1, id: "definition", revision: "r1", name: "Boundaries", scorers: [{ id: "scorer", revision: "r1" }] } as const;
  expect(EvaluationDefinitionSchema.safeParse({ ...base, mode: "assess_existing", cases: [{ id: "case", revision: "r1", input: null }] }).success).toBeFalse();
  expect(EvaluationDefinitionSchema.safeParse({ ...base, mode: "experiment", cases: [{ id: "case", revision: "r1", input: null }] }).success).toBeFalse();
  expect(EvaluationDefinitionSchema.safeParse({ ...base, mode: "experiment", target: { id: "target", revision: "r1" }, cases: [{ id: "case", revision: "r1", input: null }, { id: "case", revision: "r2", input: null }] }).success).toBeFalse();
  expect(EvaluationDefinitionHeaderSchema.safeParse({ ...base, mode: "assess_existing", target: { id: "target", revision: "r1" } }).success).toBeFalse();
  expect(EvaluationJsonSchema.safeParse("x".repeat(256 * 1024 + 1)).success).toBeFalse();
  expect(EvidenceReferenceSchema.safeParse({ id: "embedded", source: "fixture", uri: "data:text/plain;base64,SGVsbG8=" }).success).toBeFalse();
});

test("usage remains optional but observed cached input is a subset of input", () => {
  expect(NormalizedUsageSchema.safeParse({}).success).toBeFalse();
  expect(NormalizedUsageSchema.safeParse({ inputTokens: 4, cachedInputTokens: 5 }).success).toBeFalse();
  expect(NormalizedUsageSchema.safeParse({ outputTokens: 0 }).success).toBeTrue();
});

test("whole scorer checkpoints and result checkpoint identities are bounded", () => {
  const references = Array.from({ length: 64 }, (_, index) => ({ id: `ref-${index}`, source: "fixture", uri: `asset://${"x".repeat(4000)}-${index}` }));
  const findings = Array.from({ length: 10 }, (_, index) => ({ id: `finding-${index}`, name: "large", outcome: "unscored" as const, explanation: "x".repeat(8192), references }));
  expect(ScorerCheckpointSchema.safeParse({ schemaVersion: 1, invocationId: "invoke", runId: "run", caseId: "case", caseRevision: "r1", trial: 0, scorer: { id: "scorer", revision: "r1" }, outcome: "succeeded", findings, startedAtMs: 1, completedAtMs: 2 }).success).toBeFalse();
  expect(EvaluationResultRecordSchema.safeParse({ schemaVersion: 1, id: "result", runId: "run", caseId: "case", caseRevision: "r1", trial: 0, status: "completed", scorerInvocationIds: ["same", "same"], startedAtMs: 1, completedAtMs: 2 }).success).toBeFalse();
});

test("evaluation starts materialize bounded defaults and expose uncertainty without inventing a provider run", () => {
  const definition = {
    schemaVersion: 1,
    id: "definition",
    revision: "r1",
    name: "Existing output",
    mode: "assess_existing",
    scorers: [{ id: "exact", revision: "r1" }],
    cases: [{ id: "case", revision: "r1", input: "hello", expected: "hello", suppliedOutput: "hello" }],
  } as const;
  const parsed = EvaluationStartRequestSchema.parse({ requestId: "request", definition });
  expect(parsed.definition).toEqual(EvaluationDefinitionSchema.parse(definition));
  expect(parsed.settings).toEqual({ repetitions: 1, concurrency: 2 });
  expect(EvaluationStartRequestSchema.safeParse({ requestId: "request", definition, settings: { repetitions: 1, concurrency: 101 } }).success).toBeFalse();
  expect(EvaluationStartResultSchema.safeParse({ kind: "uncertain", evaluationRunId: "request" }).success).toBeTrue();
  expect(EvaluationStartResultSchema.safeParse({ kind: "started", evaluationRunId: "request" }).success).toBeFalse();
});

test("execution and cancellation outcomes keep saved work distinct from scheduler availability", () => {
  expect(EvaluationExecutionStatusSchema.parse({ kind: "saved", evaluationRunId: "run" })).toEqual({ kind: "saved", evaluationRunId: "run" });
  expect(EvaluationExecutionStatusSchema.parse({ kind: "start_uncertain", evaluationRunId: "run" })).toEqual({ kind: "start_uncertain", evaluationRunId: "run" });
  expect(EvaluationExecutionStatusSchema.safeParse({ kind: "uncertain", evaluationRunId: "run", unresolvedEffects: [] }).success).toBeFalse();
  expect(EvaluationCancelResultSchema.parse({ kind: "not_started", evaluationRunId: "run" })).toEqual({ kind: "not_started", evaluationRunId: "run" });
  expect(EvaluationCancelResultSchema.parse({ kind: "uncertain", evaluationRunId: "run" })).toEqual({ kind: "uncertain", evaluationRunId: "run" });
  expect(EvaluationStartAttemptSchema.parse({ schemaVersion: 1, evaluationRunId: "run", requestedAtMs: 10 })).toEqual({ schemaVersion: 1, evaluationRunId: "run", requestedAtMs: 10 });
});

test("evaluation readiness is a bounded portable service fact", () => {
  expect(EvaluationReadinessSchema.parse({ status: "ready" })).toEqual({ status: "ready" });
  expect(EvaluationReadinessSchema.parse({ status: "unavailable", reason: "Configure a local orchestration engine." })).toEqual({
    status: "unavailable",
    reason: "Configure a local orchestration engine.",
  });
  expect(EvaluationReadinessSchema.safeParse({ status: "unavailable", reason: "x".repeat(513) }).success).toBeFalse();
  expect(EvaluationReadinessSchema.safeParse({ status: "running" }).success).toBeFalse();
});
