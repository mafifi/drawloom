import { z } from "zod";
import type { RegisteredTaskHandler } from "@drawloom/orchestration";

export const EVALUATION_SCHEMA_VERSION = 1 as const;

const MAX_JSON_BYTES = 256 * 1024;
const MAX_DEFINITION_BYTES = 4 * 1024 * 1024;
const MAX_CHECKPOINT_BYTES = 2 * 1024 * 1024;
const MAX_RESULT_VIEW_BYTES = 8 * 1024 * 1024;
const encoder = new TextEncoder();
export const EvaluationIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);
const identifier = EvaluationIdSchema;
const revision = z.string().min(1).max(160);
const timestamp = z.number().int().safe().nonnegative();
const count = z.number().int().safe().nonnegative();
/** Zero-based trial index; a store validates it against the owning run's repetitions. */
export const TrialIndexSchema = z.number().int().safe().nonnegative();
export type TrialIndex = z.infer<typeof TrialIndexSchema>;

function jsonBytes(value: unknown): number {
  try {
    return encoder.encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function boundedJson(maxBytes: number) {
  return z.json().refine((value) => jsonBytes(value) <= maxBytes, {
    message: `JSON value exceeds ${maxBytes} bytes`,
  });
}

/** Portable JSON value capped at 256 KiB after UTF-8 serialization. */
export const EvaluationJsonSchema = boundedJson(MAX_JSON_BYTES);
export type EvaluationJson = z.infer<typeof EvaluationJsonSchema>;

export const EvaluationScopeSchema = z.strictObject({
  installationId: identifier,
  projectId: identifier,
});
export type EvaluationScope = z.infer<typeof EvaluationScopeSchema>;

export const VersionedReferenceSchema = z.strictObject({ id: identifier, revision });
export type VersionedReference = z.infer<typeof VersionedReferenceSchema>;

export const EvidenceReferenceSchema = z.strictObject({
  id: identifier,
  source: z.string().min(1).max(256),
  uri: z
    .string()
    .min(1)
    .max(4096)
    .refine((value) => !/^data:/i.test(value), {
      message: "Embedded data is not an evidence reference",
    }),
  revision: z.string().min(1).max(256).optional(),
  mediaType: z.string().min(1).max(160).optional(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;

export const NormalizedUsageSchema = z
  .strictObject({
    inputTokens: count.optional(),
    cachedInputTokens: count.optional(),
    outputTokens: count.optional(),
    reasoningTokens: count.optional(),
    totalTokens: count.optional(),
    cost: z
      .strictObject({
        amount: z.number().finite().nonnegative(),
        currency: z.string().regex(/^[A-Z]{3}$/),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    if (Object.values(value).every((item) => item === undefined))
      context.addIssue({ code: "custom", message: "Usage must contain an observed value" });
    if (
      value.cachedInputTokens !== undefined &&
      value.inputTokens !== undefined &&
      value.cachedInputTokens > value.inputTokens
    ) {
      context.addIssue({
        code: "custom",
        message: "Cached input tokens cannot exceed input tokens",
      });
    }
  });
export type NormalizedUsage = z.infer<typeof NormalizedUsageSchema>;

export const EvaluationCaseSchema = z.strictObject({
  id: identifier,
  revision,
  input: EvaluationJsonSchema,
  expected: EvaluationJsonSchema.optional(),
  suppliedOutput: EvaluationJsonSchema.optional(),
  references: z.array(EvidenceReferenceSchema).max(64).default([]),
  metadata: boundedJson(64 * 1024).optional(),
});
export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>;

export const TargetDefinitionSchema = VersionedReferenceSchema.extend({
  configuration: boundedJson(64 * 1024).optional(),
});
export type TargetDefinition = z.infer<typeof TargetDefinitionSchema>;

export const ScorerDefinitionSchema = VersionedReferenceSchema.extend({
  configuration: boundedJson(64 * 1024).optional(),
});
export type ScorerDefinition = z.infer<typeof ScorerDefinitionSchema>;

const EvaluationDefinitionHeaderBaseSchema = z.strictObject({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  id: identifier,
  revision,
  name: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  mode: z.enum(["assess_existing", "experiment"]),
  target: TargetDefinitionSchema.optional(),
  scorers: z.array(ScorerDefinitionSchema).min(1).max(32),
});
function definitionHeaderIssues(
  value: z.infer<typeof EvaluationDefinitionHeaderBaseSchema>,
): Array<{ path: Array<string | number>; message: string }> {
  const issues: Array<{ path: Array<string | number>; message: string }> = [];
  const scorerKeys = new Set<string>();
  for (const [index, item] of value.scorers.entries()) {
    const key = `${item.id}\u0000${item.revision}`;
    if (scorerKeys.has(key))
      issues.push({ path: ["scorers", index], message: "Scorer identity is duplicated" });
    scorerKeys.add(key);
  }
  if (value.mode === "assess_existing" && value.target !== undefined)
    issues.push({ path: ["target"], message: "Existing-work assessment cannot select a target" });
  if (value.mode === "experiment" && value.target === undefined)
    issues.push({ path: ["target"], message: "Experiment requires a target" });
  return issues;
}
export const EvaluationDefinitionHeaderSchema = EvaluationDefinitionHeaderBaseSchema.superRefine(
  (value, context) => {
    for (const issue of definitionHeaderIssues(value))
      context.addIssue({ code: "custom", ...issue });
  },
);
export type EvaluationDefinitionHeader = z.infer<typeof EvaluationDefinitionHeaderSchema>;

export const EvaluationDefinitionSchema = EvaluationDefinitionHeaderBaseSchema.extend({
  cases: z.array(EvaluationCaseSchema).min(1).max(1000),
}).superRefine((value, context) => {
  for (const issue of definitionHeaderIssues(value)) context.addIssue({ code: "custom", ...issue });
  const caseKeys = new Set<string>();
  for (const [index, item] of value.cases.entries()) {
    const key = item.id;
    if (caseKeys.has(key))
      context.addIssue({
        code: "custom",
        path: ["cases", index],
        message: "Case identity is duplicated",
      });
    caseKeys.add(key);
    if (value.mode === "assess_existing" && item.suppliedOutput === undefined)
      context.addIssue({
        code: "custom",
        path: ["cases", index, "suppliedOutput"],
        message: "Existing-work assessment requires supplied output",
      });
  }
  if (jsonBytes(value) > MAX_DEFINITION_BYTES)
    context.addIssue({ code: "custom", message: "Definition exceeds 4 MiB" });
});
export type EvaluationDefinition = z.infer<typeof EvaluationDefinitionSchema>;

export const EvaluationRunSchema = z.strictObject({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  id: identifier,
  requestId: identifier,
  definition: VersionedReferenceSchema,
  settings: z.strictObject({
    repetitions: z.number().int().min(1).max(100),
    concurrency: z.number().int().min(1).max(100),
  }),
  createdAtMs: timestamp,
});
export type EvaluationRun = z.infer<typeof EvaluationRunSchema>;

export const EvaluationRunSettingsSchema = EvaluationRunSchema.shape.settings;
export type EvaluationRunSettings = z.infer<typeof EvaluationRunSettingsSchema>;

export const EvaluationStartRequestSchema = z.strictObject({
  requestId: identifier,
  definition: EvaluationDefinitionSchema,
  settings: EvaluationRunSettingsSchema.default({ repetitions: 1, concurrency: 2 }),
});
export type EvaluationStartRequest = z.input<typeof EvaluationStartRequestSchema>;
export type MaterializedEvaluationStartRequest = z.output<typeof EvaluationStartRequestSchema>;

export const EvaluationStartResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("started"),
    evaluationRunId: identifier,
    orchestrationRunId: z.string().min(1).max(512),
  }),
  z.strictObject({
    kind: z.literal("reconciled"),
    evaluationRunId: identifier,
    orchestrationRunId: z.string().min(1).max(512),
  }),
  z.strictObject({ kind: z.literal("uncertain"), evaluationRunId: identifier }),
  z.strictObject({ kind: z.literal("unavailable"), reason: z.string().min(1).max(512) }),
]);
export type EvaluationStartResult = z.infer<typeof EvaluationStartResultSchema>;

/** Host-reported ability to start new evaluation work; saved reads remain independent. */
export const EvaluationReadinessSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready") }),
  z.strictObject({
    status: z.literal("unavailable"),
    reason: z.string().min(1).max(512).optional(),
  }),
]);
export type EvaluationReadiness = z.infer<typeof EvaluationReadinessSchema>;

export const EvaluationExecutionStatusSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("saved"), evaluationRunId: identifier }),
  z.strictObject({ kind: z.literal("start_uncertain"), evaluationRunId: identifier }),
  z.strictObject({
    kind: z.literal("running"),
    evaluationRunId: identifier,
    orchestrationRunId: z.string().min(1).max(512),
    cancellationRequested: z.boolean(),
  }),
  z.strictObject({
    kind: z.enum(["completed", "failed", "cancelled"]),
    evaluationRunId: identifier,
    orchestrationRunId: z.string().min(1).max(512),
  }),
  z.strictObject({
    kind: z.literal("uncertain"),
    evaluationRunId: identifier,
    orchestrationRunId: z.string().min(1).max(512),
    unresolvedEffects: z.array(z.string().min(1).max(512)).min(1).max(100),
  }),
  z.strictObject({
    kind: z.literal("unavailable"),
    evaluationRunId: identifier,
    reason: z.string().min(1).max(512),
  }),
]);
export type EvaluationExecutionStatus = z.infer<typeof EvaluationExecutionStatusSchema>;

export const EvaluationCancelResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("requested"),
    evaluationRunId: identifier,
    orchestrationRunId: z.string().min(1).max(512),
  }),
  z.strictObject({
    kind: z.literal("terminal"),
    evaluationRunId: identifier,
    orchestrationRunId: z.string().min(1).max(512),
  }),
  z.strictObject({ kind: z.literal("not_started"), evaluationRunId: identifier }),
  z.strictObject({ kind: z.literal("uncertain"), evaluationRunId: identifier }),
  z.strictObject({
    kind: z.literal("unavailable"),
    evaluationRunId: identifier,
    reason: z.string().min(1).max(512),
  }),
]);
export type EvaluationCancelResult = z.infer<typeof EvaluationCancelResultSchema>;

export const EvaluationOrchestrationBindingSchema = z.strictObject({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  evaluationRunId: identifier,
  /** Provider-owned opaque identity; deliberately not constrained by evaluation ID grammar. */
  orchestrationRunId: z.string().min(1).max(512),
});
export type EvaluationOrchestrationBinding = z.infer<typeof EvaluationOrchestrationBindingSchema>;

/** Durable intent written immediately before invoking the orchestration start boundary. */
export const EvaluationStartAttemptSchema = z.strictObject({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  evaluationRunId: identifier,
  requestedAtMs: timestamp,
});
export type EvaluationStartAttempt = z.infer<typeof EvaluationStartAttemptSchema>;

export const EvaluationErrorDetailSchema = z.strictObject({
  code: z.string().min(1).max(160),
  message: z.string().min(1).max(4096),
});
export type EvaluationErrorDetail = z.infer<typeof EvaluationErrorDetailSchema>;

export const InvocationOutcomeSchema = z.enum([
  "succeeded",
  "failed",
  "denied",
  "cancelled",
  "timed_out",
  "uncertain",
]);
export type InvocationOutcome = z.infer<typeof InvocationOutcomeSchema>;
export const InvocationModelSchema = z
  .strictObject({
    requested: z.string().min(1).max(256).optional(),
    actual: z.string().min(1).max(256).optional(),
  })
  .refine((value) => value.requested !== undefined || value.actual !== undefined, {
    message: "Model observation cannot be empty",
  });
export type InvocationModel = z.infer<typeof InvocationModelSchema>;

const invocationIdentity = {
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  invocationId: identifier,
  runId: identifier,
  caseId: identifier,
  caseRevision: revision,
  trial: TrialIndexSchema,
};

export const TargetInvocationResultSchema = z.strictObject({
  outcome: InvocationOutcomeSchema,
  output: EvaluationJsonSchema.optional(),
  error: EvaluationErrorDetailSchema.optional(),
  references: z.array(EvidenceReferenceSchema).max(64).default([]),
  usage: NormalizedUsageSchema.optional(),
  model: InvocationModelSchema.optional(),
});
export type TargetInvocationResult = z.infer<typeof TargetInvocationResultSchema>;

export const ScorerInvocationResultSchema = z.strictObject({
  outcome: InvocationOutcomeSchema,
  findings: z.array(z.lazy(() => FindingSchema)).max(100),
  usage: NormalizedUsageSchema.optional(),
  model: InvocationModelSchema.optional(),
});
export type ScorerInvocationResult = z.infer<typeof ScorerInvocationResultSchema>;

export interface EvaluationInvocationContext {
  readonly signal: AbortSignal;
  readonly invocationId: string;
  /** Host execution identity for tool provenance; it is not a permission grant. */
  readonly operationId: string;
  readonly runId: string;
}

/** Expected material is deliberately absent from target arguments. */
export interface EvaluationTarget<
  I extends EvaluationJson = EvaluationJson,
  O extends EvaluationJson = EvaluationJson,
> {
  readonly id: string;
  readonly revision: string;
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
  invoke(
    args: {
      readonly input: I;
      readonly configuration?: EvaluationJson;
      readonly references: readonly EvidenceReference[];
    },
    context: EvaluationInvocationContext,
  ): Promise<TargetInvocationResult>;
}

export interface EvaluationScorer<
  I extends EvaluationJson = EvaluationJson,
  O extends EvaluationJson = EvaluationJson,
  E extends EvaluationJson = EvaluationJson,
> {
  readonly id: string;
  readonly revision: string;
  readonly input: z.ZodType<I>;
  readonly output: z.ZodType<O>;
  readonly expected?: z.ZodType<E>;
  score(
    args: {
      readonly input: I;
      readonly output: O;
      readonly expected?: E;
      readonly configuration?: EvaluationJson;
      readonly references: readonly EvidenceReference[];
    },
    context: EvaluationInvocationContext,
  ): Promise<ScorerInvocationResult>;
}

export interface EvaluationAssessmentProvider {
  /** Host-owned built-ins, snapshotted with caller bindings at activation. */
  readonly scorers?: readonly EvaluationScorer[];
  assess<I extends EvaluationJson, O extends EvaluationJson, E extends EvaluationJson>(
    scorer: EvaluationScorer<I, O, E>,
    args: Parameters<EvaluationScorer<I, O, E>["score"]>[0],
    context: EvaluationInvocationContext,
  ): Promise<ScorerInvocationResult>;
}

export const TargetCheckpointSchema = z
  .strictObject({
    ...invocationIdentity,
    target: VersionedReferenceSchema,
    outcome: InvocationOutcomeSchema,
    output: EvaluationJsonSchema.optional(),
    error: EvaluationErrorDetailSchema.optional(),
    references: z.array(EvidenceReferenceSchema).max(64).default([]),
    usage: NormalizedUsageSchema.optional(),
    model: InvocationModelSchema.optional(),
    startedAtMs: timestamp,
    completedAtMs: timestamp,
  })
  .superRefine((value, context) => {
    if (value.completedAtMs < value.startedAtMs)
      context.addIssue({
        code: "custom",
        path: ["completedAtMs"],
        message: "Target completion cannot precede start",
      });
    if (jsonBytes(value) > MAX_CHECKPOINT_BYTES)
      context.addIssue({ code: "custom", message: "Target checkpoint exceeds 2 MiB" });
  });
export type TargetCheckpoint = z.infer<typeof TargetCheckpointSchema>;

export const FindingSchema = z
  .strictObject({
    id: identifier,
    name: z.string().min(1).max(256),
    outcome: z.enum(["scored", "unscored", "error"]),
    score: z.number().finite().optional(),
    explanation: z.string().max(8192).optional(),
    error: EvaluationErrorDetailSchema.optional(),
    references: z.array(EvidenceReferenceSchema).max(64).default([]),
  })
  .superRefine((value, context) => {
    if (value.outcome === "scored" && value.score === undefined)
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "Scored finding requires a score",
      });
    if (value.outcome === "error" && value.error === undefined)
      context.addIssue({
        code: "custom",
        path: ["error"],
        message: "Error finding requires error detail",
      });
    if (value.outcome !== "scored" && value.score !== undefined)
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "Only scored findings carry a score",
      });
  });
export type Finding = z.infer<typeof FindingSchema>;

export const ScorerCheckpointSchema = z
  .strictObject({
    ...invocationIdentity,
    scorer: VersionedReferenceSchema,
    outcome: InvocationOutcomeSchema,
    findings: z.array(FindingSchema).max(100),
    usage: NormalizedUsageSchema.optional(),
    model: InvocationModelSchema.optional(),
    startedAtMs: timestamp,
    completedAtMs: timestamp,
  })
  .superRefine((value, context) => {
    if (value.completedAtMs < value.startedAtMs)
      context.addIssue({
        code: "custom",
        path: ["completedAtMs"],
        message: "Scorer completion cannot precede start",
      });
    const ids = new Set<string>();
    for (const [index, finding] of value.findings.entries()) {
      if (ids.has(finding.id))
        context.addIssue({
          code: "custom",
          path: ["findings", index, "id"],
          message: "Finding identity is duplicated",
        });
      ids.add(finding.id);
    }
    if (jsonBytes(value) > MAX_CHECKPOINT_BYTES)
      context.addIssue({ code: "custom", message: "Scorer checkpoint exceeds 2 MiB" });
  });
export type ScorerCheckpoint = z.infer<typeof ScorerCheckpointSchema>;

export const EvaluationResultRecordSchema = z
  .strictObject({
    schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
    id: identifier,
    runId: identifier,
    caseId: identifier,
    caseRevision: revision,
    trial: TrialIndexSchema,
    status: z.enum([
      "completed",
      "unscored",
      "failed",
      "denied",
      "cancelled",
      "timed_out",
      "uncertain",
    ]),
    targetInvocationId: identifier.optional(),
    scorerInvocationIds: z.array(identifier).max(32),
    startedAtMs: timestamp,
    completedAtMs: timestamp,
  })
  .superRefine((value, context) => {
    if (value.completedAtMs < value.startedAtMs)
      context.addIssue({
        code: "custom",
        path: ["completedAtMs"],
        message: "Result completion cannot precede start",
      });
    const ids = new Set(value.scorerInvocationIds);
    if (ids.size !== value.scorerInvocationIds.length)
      context.addIssue({
        code: "custom",
        path: ["scorerInvocationIds"],
        message: "Scorer checkpoint identity is duplicated",
      });
  });
export type EvaluationResultRecord = z.infer<typeof EvaluationResultRecordSchema>;

export const EvaluationResultViewSchema = z
  .strictObject({
    result: EvaluationResultRecordSchema,
    target: TargetCheckpointSchema.optional(),
    scorers: z.array(ScorerCheckpointSchema).max(32),
    findings: z.array(FindingSchema).max(3200),
  })
  .refine((value) => jsonBytes(value) <= MAX_RESULT_VIEW_BYTES, {
    message: "Result view exceeds 8 MiB",
  });
export type EvaluationResultView = z.infer<typeof EvaluationResultViewSchema>;

export const EvaluationFeedbackSchema = z.strictObject({
  schemaVersion: z.literal(EVALUATION_SCHEMA_VERSION),
  id: identifier,
  resultId: identifier,
  attribution: z.string().min(1).max(256),
  rating: z.enum(["correct", "incorrect", "uncertain"]),
  correction: z.string().max(8192).optional(),
  createdAtMs: timestamp,
});
export type EvaluationFeedback = z.infer<typeof EvaluationFeedbackSchema>;

export const CheckpointSelectorSchema = z.strictObject({
  invocationId: identifier,
  runId: identifier,
  caseId: identifier,
  caseRevision: revision,
  trial: TrialIndexSchema,
});
export type CheckpointSelector = z.infer<typeof CheckpointSelectorSchema>;

export const EvaluationPageOptionsSchema = z.strictObject({
  after: z.string().min(1).max(8192).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type EvaluationPageOptions = z.infer<typeof EvaluationPageOptionsSchema>;

export const ResultPageOptionsSchema = EvaluationPageOptionsSchema.extend({
  runId: identifier.optional(),
});
export type ResultPageOptions = z.infer<typeof ResultPageOptionsSchema>;
export const FeedbackPageOptionsSchema = EvaluationPageOptionsSchema.extend({
  resultId: identifier.optional(),
});
export type FeedbackPageOptions = z.infer<typeof FeedbackPageOptionsSchema>;

export const DefinitionSummarySchema = z.strictObject({
  ref: VersionedReferenceSchema,
  name: z.string().min(1).max(256),
  mode: z.enum(["assess_existing", "experiment"]),
  caseCount: count,
  scorerCount: count,
});
export type DefinitionSummary = z.infer<typeof DefinitionSummarySchema>;
export const ResultSummarySchema = EvaluationResultRecordSchema.extend({ findingCount: count });
export type ResultSummary = z.infer<typeof ResultSummarySchema>;

function pageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item).max(200),
    cursor: z.string().min(1).max(8192).optional(),
    hasMore: z.boolean(),
  });
}
export const DefinitionPageSchema = pageSchema(DefinitionSummarySchema);
export type DefinitionPage = z.infer<typeof DefinitionPageSchema>;
export const RunPageSchema = pageSchema(EvaluationRunSchema);
export type RunPage = z.infer<typeof RunPageSchema>;
export const ResultPageSchema = pageSchema(ResultSummarySchema);
export type ResultPage = z.infer<typeof ResultPageSchema>;
export const FeedbackPageSchema = pageSchema(EvaluationFeedbackSchema);
export type FeedbackPage = z.infer<typeof FeedbackPageSchema>;

export const EvaluationWriteDispositionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("accepted") }),
  z.strictObject({ kind: z.literal("duplicate") }),
]);
export type EvaluationWriteDisposition = z.infer<typeof EvaluationWriteDispositionSchema>;

export const EvaluationStoreErrorCodeSchema = z.enum([
  "invalid_input",
  "invalid_cursor",
  "conflict",
  "not_found",
  "unavailable",
  "unsupported_version",
  "closed",
]);
export type EvaluationStoreErrorCode = z.infer<typeof EvaluationStoreErrorCodeSchema>;
export class EvaluationStoreError extends Error {
  readonly code: EvaluationStoreErrorCode;
  constructor(code: EvaluationStoreErrorCode, message: string) {
    super(message.slice(0, 512));
    this.name = "EvaluationStoreError";
    this.code = EvaluationStoreErrorCodeSchema.parse(code);
  }
}

export interface EvaluationResultsReader {
  getDefinition(ref: VersionedReference): Promise<EvaluationDefinition | undefined>;
  getDefinitionHeader(ref: VersionedReference): Promise<EvaluationDefinitionHeader | undefined>;
  getCase(ref: VersionedReference, caseId: string): Promise<EvaluationCase | undefined>;
  listDefinitions(options?: EvaluationPageOptions): Promise<DefinitionPage>;
  getRun(runId: string): Promise<EvaluationRun | undefined>;
  getStartAttempt(evaluationRunId: string): Promise<EvaluationStartAttempt | undefined>;
  getOrchestrationBinding(
    evaluationRunId: string,
  ): Promise<EvaluationOrchestrationBinding | undefined>;
  listRuns(options?: EvaluationPageOptions): Promise<RunPage>;
  getTargetCheckpoint(selector: CheckpointSelector): Promise<TargetCheckpoint | undefined>;
  getScorerCheckpoint(selector: CheckpointSelector): Promise<ScorerCheckpoint | undefined>;
  getResultSummary(resultId: string): Promise<ResultSummary | undefined>;
  getResult(resultId: string): Promise<EvaluationResultView | undefined>;
  listResults(options?: ResultPageOptions): Promise<ResultPage>;
  listFeedback(options?: FeedbackPageOptions): Promise<FeedbackPage>;
}

/** Scope-bound durable records only. Orchestration owns scheduling and acknowledgements. */
export interface EvaluationStore extends EvaluationResultsReader {
  saveDefinition(definition: EvaluationDefinition): Promise<EvaluationWriteDisposition>;
  saveRun(run: EvaluationRun): Promise<EvaluationWriteDisposition>;
  saveStartAttempt(attempt: EvaluationStartAttempt): Promise<EvaluationWriteDisposition>;
  saveOrchestrationBinding(
    binding: EvaluationOrchestrationBinding,
  ): Promise<EvaluationWriteDisposition>;
  saveTargetCheckpoint(checkpoint: TargetCheckpoint): Promise<EvaluationWriteDisposition>;
  saveScorerCheckpoint(checkpoint: ScorerCheckpoint): Promise<EvaluationWriteDisposition>;
  saveResult(result: EvaluationResultRecord): Promise<EvaluationWriteDisposition>;
  saveFeedback(feedback: EvaluationFeedback): Promise<EvaluationWriteDisposition>;
  close(): Promise<void>;
}

export interface EvaluationService extends EvaluationResultsReader {
  /** Reads authoritative host readiness without starting or scheduling work. */
  readiness(): Promise<EvaluationReadiness>;
  /** Starts only an immutable target-free assessment definition. */
  assess(request: EvaluationStartRequest): Promise<EvaluationStartResult>;
  /** Starts only an immutable experiment definition with its selected target. */
  run(request: EvaluationStartRequest): Promise<EvaluationStartResult>;
  status(evaluationRunId: string): Promise<EvaluationExecutionStatus>;
  cancel(evaluationRunId: string): Promise<EvaluationCancelResult>;
  saveFeedback(feedback: EvaluationFeedback): Promise<EvaluationWriteDisposition>;
}

export interface EvaluationCompositionBindings {
  readonly targets?: readonly EvaluationTarget[];
  readonly scorers: readonly EvaluationScorer[];
}

export interface EvaluationComposition {
  readonly service: EvaluationService;
  readonly taskHandlers: readonly RegisteredTaskHandler[];
}

/** Trusted startup-only capability. Implementations snapshot bindings per activation. */
export interface EvaluationComposer {
  compose(bindings: EvaluationCompositionBindings): EvaluationComposition;
}
