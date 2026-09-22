import { expect, test } from "vitest";
import { z } from "zod";
import { evaluationStoreConformance, scorerConformance } from "./src/conformance.js";
import {
  CheckpointSelectorSchema,
  EvaluationDefinitionSchema,
  EvaluationFeedbackSchema,
  EvaluationIdSchema,
  EvaluationOrchestrationBindingSchema,
  EvaluationPageOptionsSchema,
  EvaluationResultRecordSchema,
  EvaluationResultViewSchema,
  EvaluationRunSchema,
  EvaluationScopeSchema,
  EvaluationStartAttemptSchema,
  EvaluationStoreError,
  FeedbackPageOptionsSchema,
  ResultPageOptionsSchema,
  ScorerCheckpointSchema,
  TargetCheckpointSchema,
  type EvaluationScorer,
  VersionedReferenceSchema,
  type EvaluationDefinition,
  type EvaluationFeedback,
  type EvaluationOrchestrationBinding,
  type EvaluationResultRecord,
  type EvaluationRun,
  type EvaluationScope,
  type EvaluationStartAttempt,
  type EvaluationStore,
  type ScorerCheckpoint,
  type TargetCheckpoint,
} from "./src/index.js";

type Sequenced<T> = { sequence: number; value: T };
type State = {
  next: number;
  definitions: Map<string, Sequenced<EvaluationDefinition>>;
  runs: Map<string, Sequenced<EvaluationRun>>;
  requests: Map<string, string>;
  startAttempts: Map<string, EvaluationStartAttempt>;
  orchestration: Map<string, EvaluationOrchestrationBinding>;
  orchestrationRuns: Map<string, string>;
  targets: Map<string, TargetCheckpoint>;
  targetLogical: Map<string, string>;
  scorers: Map<string, ScorerCheckpoint>;
  scorerLogical: Map<string, string>;
  results: Map<string, Sequenced<EvaluationResultRecord>>;
  resultLogical: Map<string, string>;
  feedback: Map<string, Sequenced<EvaluationFeedback>>;
};

const states = new Map<string, State>();
const state = (): State => ({
  next: 1,
  definitions: new Map(),
  runs: new Map(),
  requests: new Map(),
  startAttempts: new Map(),
  orchestration: new Map(),
  orchestrationRuns: new Map(),
  targets: new Map(),
  targetLogical: new Map(),
  scorers: new Map(),
  scorerLogical: new Map(),
  results: new Map(),
  resultLogical: new Map(),
  feedback: new Map(),
});
const key = (...values: unknown[]) => JSON.stringify(values);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const invalid = (message: string) => new EvaluationStoreError("invalid_input", message);
function parse<T>(schema: { parse(value: unknown): T }, value: unknown, message: string): T {
  try {
    return schema.parse(value);
  } catch {
    throw invalid(message);
  }
}
function duplicate<T>(existing: T, value: T) {
  if (same(existing, value)) return { kind: "duplicate" as const };
  throw new EvaluationStoreError("conflict", "Identity conflict");
}

function deterministicStore(scopeInput: EvaluationScope): EvaluationStore {
  const scope = EvaluationScopeSchema.parse(scopeInput);
  const scopeKey = key(scope.installationId, scope.projectId);
  const data = states.get(scopeKey) ?? state();
  states.set(scopeKey, data);
  let closed = false;
  const available = () => {
    if (closed) throw new EvaluationStoreError("closed", "Store closed");
  };
  const definitionKey = (id: string, revision: string) => key(id, revision);
  const definition = (id: string, revision: string) =>
    data.definitions.get(definitionKey(id, revision))?.value;
  const runContext = (runId: string) => {
    const run = data.runs.get(runId)?.value;
    if (!run) throw new EvaluationStoreError("not_found", "Run missing");
    const source = definition(run.definition.id, run.definition.revision);
    if (!source) throw new EvaluationStoreError("unavailable", "Definition missing");
    return { run, source };
  };
  const ensureCase = (source: EvaluationDefinition, id: string, revision: string) => {
    if (!source.cases.some((item) => item.id === id && item.revision === revision))
      throw new EvaluationStoreError("conflict", "Case mismatch");
  };
  const runCase = (runId: string, caseId: string, caseRevision: string, trial: number) => {
    const context = runContext(runId);
    if (trial >= context.run.settings.repetitions)
      throw new EvaluationStoreError("conflict", "Trial out of range");
    ensureCase(context.source, caseId, caseRevision);
    return context;
  };
  const selectorMatches = (
    value: TargetCheckpoint | ScorerCheckpoint,
    selector: ReturnType<typeof CheckpointSelectorSchema.parse>,
  ) =>
    value.invocationId === selector.invocationId &&
    value.runId === selector.runId &&
    value.caseId === selector.caseId &&
    value.caseRevision === selector.caseRevision &&
    value.trial === selector.trial;
  type Kind = "definitions" | "runs" | "results" | "feedback";
  const cursor = (kind: Kind, filter: string | null, sequence: number) =>
    JSON.stringify({ scopeKey, kind, filter, sequence });
  const before = (encoded: string | undefined, kind: Kind, filter: string | null) => {
    if (!encoded) return Number.POSITIVE_INFINITY;
    try {
      const value = JSON.parse(encoded) as Record<string, unknown>;
      if (
        value.scopeKey !== scopeKey ||
        value.kind !== kind ||
        value.filter !== filter ||
        !Number.isSafeInteger(value.sequence)
      )
        throw Error("bad");
      return Number(value.sequence);
    } catch {
      throw new EvaluationStoreError("invalid_cursor", "Invalid cursor");
    }
  };
  const page = <T>(
    records: readonly Sequenced<T>[],
    limit: number,
    boundary: number,
    kind: Kind,
    filter: string | null,
  ) => {
    const rows = records
      .filter((entry) => entry.sequence < boundary)
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, limit + 1);
    const selected = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      selected,
      hasMore,
      ...(hasMore ? { cursor: cursor(kind, filter, selected.at(-1)!.sequence) } : {}),
    };
  };
  const view = (resultId: string) => {
    const result = data.results.get(resultId)?.value;
    if (!result) return undefined;
    const target = result.targetInvocationId
      ? data.targets.get(result.targetInvocationId)
      : undefined;
    const scorers = result.scorerInvocationIds.map((id) => data.scorers.get(id));
    if ((result.targetInvocationId && !target) || scorers.some((item) => item === undefined))
      throw new EvaluationStoreError("unavailable", "Checkpoint missing");
    const present = scorers as ScorerCheckpoint[];
    try {
      return EvaluationResultViewSchema.parse({
        result,
        ...(target ? { target } : {}),
        scorers: present,
        findings: present.flatMap((item) => item.findings),
      });
    } catch {
      throw new EvaluationStoreError("unavailable", "Result detail exceeds its bound");
    }
  };
  return {
    async saveDefinition(input) {
      available();
      const value = parse(EvaluationDefinitionSchema, input, "Invalid definition");
      const id = definitionKey(value.id, value.revision);
      const current = data.definitions.get(id);
      if (current) return duplicate(current.value, value);
      data.definitions.set(id, { sequence: data.next++, value });
      return { kind: "accepted" };
    },
    async getDefinition(input) {
      available();
      const ref = parse(VersionedReferenceSchema, input, "Invalid reference");
      return definition(ref.id, ref.revision);
    },
    async getDefinitionHeader(input) {
      available();
      const ref = parse(VersionedReferenceSchema, input, "Invalid reference");
      const value = definition(ref.id, ref.revision);
      if (!value) return undefined;
      const { cases: _cases, ...header } = value;
      return header;
    },
    async getCase(input, caseIdInput) {
      available();
      const ref = parse(VersionedReferenceSchema, input, "Invalid reference");
      const caseId = parse(EvaluationIdSchema, caseIdInput, "Invalid case");
      return definition(ref.id, ref.revision)?.cases.find((item) => item.id === caseId);
    },
    async listDefinitions(input = {}) {
      available();
      const options = parse(EvaluationPageOptionsSchema, input, "Invalid page");
      const limit = options.limit ?? 50;
      const selected = page(
        [...data.definitions.values()],
        limit,
        before(options.after, "definitions", null),
        "definitions",
        null,
      );
      return {
        items: selected.selected.map(({ value }) => ({
          ref: { id: value.id, revision: value.revision },
          name: value.name,
          mode: value.mode,
          caseCount: value.cases.length,
          scorerCount: value.scorers.length,
        })),
        hasMore: selected.hasMore,
        ...(selected.cursor ? { cursor: selected.cursor } : {}),
      };
    },
    async saveRun(input) {
      available();
      const value = parse(EvaluationRunSchema, input, "Invalid run");
      const current = data.runs.get(value.id);
      if (current) return duplicate(current.value, value);
      if (data.requests.has(value.requestId))
        throw new EvaluationStoreError("conflict", "Request conflict");
      if (!definition(value.definition.id, value.definition.revision))
        throw new EvaluationStoreError("not_found", "Definition missing");
      data.runs.set(value.id, { sequence: data.next++, value });
      data.requests.set(value.requestId, value.id);
      return { kind: "accepted" };
    },
    async getRun(idInput) {
      available();
      const id = parse(EvaluationIdSchema, idInput, "Invalid run");
      return data.runs.get(id)?.value;
    },
    async saveStartAttempt(input) {
      available();
      const value = parse(EvaluationStartAttemptSchema, input, "Invalid start attempt");
      const current = data.startAttempts.get(value.evaluationRunId);
      if (current) return duplicate(current, value);
      if (!data.runs.has(value.evaluationRunId))
        throw new EvaluationStoreError("not_found", "Run missing");
      data.startAttempts.set(value.evaluationRunId, value);
      return { kind: "accepted" };
    },
    async getStartAttempt(idInput) {
      available();
      const id = parse(EvaluationIdSchema, idInput, "Invalid run");
      return data.startAttempts.get(id);
    },
    async saveOrchestrationBinding(input) {
      available();
      const value = parse(EvaluationOrchestrationBindingSchema, input, "Invalid binding");
      const current = data.orchestration.get(value.evaluationRunId);
      if (current) return duplicate(current, value);
      if (!data.runs.has(value.evaluationRunId))
        throw new EvaluationStoreError("not_found", "Run missing");
      if (data.orchestrationRuns.has(value.orchestrationRunId))
        throw new EvaluationStoreError("conflict", "Provider run conflict");
      data.orchestration.set(value.evaluationRunId, value);
      data.orchestrationRuns.set(value.orchestrationRunId, value.evaluationRunId);
      return { kind: "accepted" };
    },
    async getOrchestrationBinding(idInput) {
      available();
      const id = parse(EvaluationIdSchema, idInput, "Invalid run");
      return data.orchestration.get(id);
    },
    async listRuns(input = {}) {
      available();
      const options = parse(EvaluationPageOptionsSchema, input, "Invalid page");
      const limit = options.limit ?? 50;
      const selected = page(
        [...data.runs.values()],
        limit,
        before(options.after, "runs", null),
        "runs",
        null,
      );
      return {
        items: selected.selected.map((item) => item.value),
        hasMore: selected.hasMore,
        ...(selected.cursor ? { cursor: selected.cursor } : {}),
      };
    },
    async saveTargetCheckpoint(input) {
      available();
      const value = parse(TargetCheckpointSchema, input, "Invalid target");
      const current = data.targets.get(value.invocationId);
      if (current) return duplicate(current, value);
      const logical = key(value.runId, value.caseId, value.caseRevision, value.trial);
      if (data.targetLogical.has(logical))
        throw new EvaluationStoreError("conflict", "Target conflict");
      const { source } = runCase(value.runId, value.caseId, value.caseRevision, value.trial);
      if (
        !source.target ||
        source.target.id !== value.target.id ||
        source.target.revision !== value.target.revision
      )
        throw new EvaluationStoreError("conflict", "Target mismatch");
      data.targets.set(value.invocationId, value);
      data.targetLogical.set(logical, value.invocationId);
      return { kind: "accepted" };
    },
    async getTargetCheckpoint(input) {
      available();
      const selector = parse(CheckpointSelectorSchema, input, "Invalid selector");
      const value = data.targets.get(selector.invocationId);
      return value && selectorMatches(value, selector) ? value : undefined;
    },
    async saveScorerCheckpoint(input) {
      available();
      const value = parse(ScorerCheckpointSchema, input, "Invalid scorer");
      const current = data.scorers.get(value.invocationId);
      if (current) return duplicate(current, value);
      const logical = key(
        value.runId,
        value.caseId,
        value.caseRevision,
        value.trial,
        value.scorer.id,
        value.scorer.revision,
      );
      if (data.scorerLogical.has(logical))
        throw new EvaluationStoreError("conflict", "Scorer conflict");
      const { source } = runCase(value.runId, value.caseId, value.caseRevision, value.trial);
      if (
        !source.scorers.some(
          (item) => item.id === value.scorer.id && item.revision === value.scorer.revision,
        )
      )
        throw new EvaluationStoreError("conflict", "Scorer mismatch");
      data.scorers.set(value.invocationId, value);
      data.scorerLogical.set(logical, value.invocationId);
      return { kind: "accepted" };
    },
    async getScorerCheckpoint(input) {
      available();
      const selector = parse(CheckpointSelectorSchema, input, "Invalid selector");
      const value = data.scorers.get(selector.invocationId);
      return value && selectorMatches(value, selector) ? value : undefined;
    },
    async getResultSummary(idInput) {
      available();
      const id = parse(EvaluationIdSchema, idInput, "Invalid result");
      const value = data.results.get(id)?.value;
      return value
        ? {
            ...value,
            findingCount: value.scorerInvocationIds.reduce(
              (total, invocationId) =>
                total + (data.scorers.get(invocationId)?.findings.length ?? 0),
              0,
            ),
          }
        : undefined;
    },
    async saveResult(input) {
      available();
      const value = parse(EvaluationResultRecordSchema, input, "Invalid result");
      const current = data.results.get(value.id);
      if (current) return duplicate(current.value, value);
      const logical = key(value.runId, value.caseId, value.caseRevision, value.trial);
      if (data.resultLogical.has(logical))
        throw new EvaluationStoreError("conflict", "Result conflict");
      runCase(value.runId, value.caseId, value.caseRevision, value.trial);
      if (value.targetInvocationId && !data.targets.has(value.targetInvocationId))
        throw new EvaluationStoreError("not_found", "Target missing");
      if (value.scorerInvocationIds.some((id) => !data.scorers.has(id)))
        throw new EvaluationStoreError("not_found", "Scorer missing");
      data.results.set(value.id, { sequence: data.next++, value });
      data.resultLogical.set(logical, value.id);
      return { kind: "accepted" };
    },
    async getResult(idInput) {
      available();
      const id = parse(EvaluationIdSchema, idInput, "Invalid result");
      return view(id);
    },
    async listResults(input = {}) {
      available();
      const options = parse(ResultPageOptionsSchema, input, "Invalid page");
      const filter = options.runId ?? null;
      const limit = options.limit ?? 50;
      const records = [...data.results.values()].filter(
        ({ value }) => filter === null || value.runId === filter,
      );
      const selected = page(
        records,
        limit,
        before(options.after, "results", filter),
        "results",
        filter,
      );
      return {
        items: selected.selected.map(({ value }) => ({
          ...value,
          findingCount: value.scorerInvocationIds.reduce(
            (total, id) => total + (data.scorers.get(id)?.findings.length ?? 0),
            0,
          ),
        })),
        hasMore: selected.hasMore,
        ...(selected.cursor ? { cursor: selected.cursor } : {}),
      };
    },
    async saveFeedback(input) {
      available();
      const value = parse(EvaluationFeedbackSchema, input, "Invalid feedback");
      const current = data.feedback.get(value.id);
      if (current) return duplicate(current.value, value);
      if (!data.results.has(value.resultId))
        throw new EvaluationStoreError("not_found", "Result missing");
      data.feedback.set(value.id, { sequence: data.next++, value });
      return { kind: "accepted" };
    },
    async listFeedback(input = {}) {
      available();
      const options = parse(FeedbackPageOptionsSchema, input, "Invalid page");
      const filter = options.resultId ?? null;
      const limit = options.limit ?? 50;
      const records = [...data.feedback.values()].filter(
        ({ value }) => filter === null || value.resultId === filter,
      );
      const selected = page(
        records,
        limit,
        before(options.after, "feedback", filter),
        "feedback",
        filter,
      );
      return {
        items: selected.selected.map((item) => item.value),
        hasMore: selected.hasMore,
        ...(selected.cursor ? { cursor: selected.cursor } : {}),
      };
    },
    async close() {
      closed = true;
    },
  };
}

test("a deterministic test-only implementation satisfies evaluation storage conformance", async () => {
  states.clear();
  await evaluationStoreConformance(deterministicStore);
});

test("scorerConformance rejects scorers that break the contract", async () => {
  const base = {
    id: "probe",
    revision: "r1",
    input: z.string(),
    output: z.string(),
    async score() {
      return { outcome: "succeeded" as const, findings: [] };
    },
  };
  const valid = { input: "i", output: "o" } as const;
  const broken: Record<string, EvaluationScorer> = {
    "missing id": { ...base, id: "" },
    "missing revision": { ...base, revision: "" },
    "malformed result": { ...base, score: async () => ({ outcome: "succeeded" }) as never },
    "scored finding without a score": {
      ...base,
      score: async () =>
        ({
          outcome: "succeeded",
          findings: [{ id: "f", name: "F", outcome: "scored", references: [] }],
        }) as never,
    },
    "throws when a case carries no expected material": {
      ...base,
      expected: z.string(),
      async score(args) {
        if (args.expected === undefined) throw Error("expected material is required");
        return { outcome: "succeeded" as const, findings: [] };
      },
    },
  };
  for (const [label, scorer] of Object.entries(broken))
    await expect(
      scorerConformance({
        scorer,
        valid: scorer.expected ? { ...valid, expected: "e" } : valid,
      }),
      label,
    ).rejects.toThrow();
});
