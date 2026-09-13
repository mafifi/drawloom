import { z } from "zod";
import {
  EVALUATION_SCHEMA_VERSION,
  EvaluationCancelResultSchema,
  EvaluationDefinitionHeaderSchema,
  EvaluationExecutionStatusSchema,
  EvaluationIdSchema,
  EvaluationJsonSchema,
  EvaluationReadinessSchema,
  EvaluationResultRecordSchema,
  EvaluationStoreError,
  EvaluationStartRequestSchema,
  EvaluationStartResultSchema,
  ScorerInvocationResultSchema,
  ScorerCheckpointSchema,
  TargetInvocationResultSchema,
  TargetCheckpointSchema,
  VersionedReferenceSchema,
  type EvaluationAssessmentProvider,
  type EvaluationCancelResult,
  type EvaluationComposer,
  type EvaluationCompositionBindings,
  type EvaluationDefinitionHeader,
  type EvaluationExecutionStatus,
  type EvaluationJson,
  type EvaluationReadiness,
  type EvaluationResultRecord,
  type EvaluationScorer,
  type EvaluationService,
  type EvaluationStartResult,
  type EvaluationStore,
  type EvaluationTarget,
  type Finding,
  type InvocationOutcome,
  type ScorerCheckpoint,
  type TargetCheckpoint,
  type VersionedReference,
} from "@drawloom/evaluation";
export type { EvaluationReadiness } from "@drawloom/evaluation";
import {
  StepFailure,
  defineWorkflowModule,
  registerTaskHandler,
  registerWorkflow,
  type Orchestrator,
  type RegisteredTaskHandler,
  type Task,
  type TaskContext,
  type Workflow,
} from "@drawloom/orchestration";

export const MAX_EVALUATION_WORKFLOW_STEPS = 1_000;
/** Leaves bridge-envelope headroom beneath orchestration's 1 MiB dispatch limit. */
export const MAX_EVALUATION_PLAN_DISPATCH_BYTES = 900 * 1024;
const encoder = new TextEncoder();
const reference = VersionedReferenceSchema;
const commonStep = z.strictObject({
  evaluationRunId: EvaluationIdSchema,
  definition: reference,
  caseId: EvaluationIdSchema,
  caseRevision: z.string().min(1).max(160),
  trial: z.number().int().nonnegative(),
});
const compactStepResult = z.strictObject({ invocationId: EvaluationIdSchema, outcome: z.enum(["succeeded", "failed", "denied", "cancelled", "timed_out", "uncertain"]) });
const scorerPlan = z.strictObject({ scorer: reference, invocationId: EvaluationIdSchema });
const jobPlan = commonStep.extend({
  caseIndex: z.number().int().nonnegative(),
  target: reference.optional(),
  targetInvocationId: EvaluationIdSchema.optional(),
  scorers: z.array(scorerPlan).min(1).max(32),
  resultId: EvaluationIdSchema,
});
const planOutput = z.strictObject({
  evaluationRunId: EvaluationIdSchema,
  concurrency: z.number().int().min(1).max(100),
  jobs: z.array(jobPlan).min(1).max(MAX_EVALUATION_WORKFLOW_STEPS),
}).refine((value) => encoder.encode(JSON.stringify(value)).byteLength <= MAX_EVALUATION_PLAN_DISPATCH_BYTES, { message: `Evaluation plan exceeds ${MAX_EVALUATION_PLAN_DISPATCH_BYTES} bytes` });
const workflowOutput = z.strictObject({ evaluationRunId: EvaluationIdSchema, resultIds: z.array(EvaluationIdSchema).min(1).max(MAX_EVALUATION_WORKFLOW_STEPS) });

export const evaluationPlanTask: Task<{ evaluationRunId: string }, z.infer<typeof planOutput>> = {
  id: "evaluation.plan", version: "1", input: z.strictObject({ evaluationRunId: EvaluationIdSchema }), output: planOutput,
  limits: { startToCloseTimeoutMs: 30_000 },
};
export const evaluationTargetTask: Task<z.infer<typeof jobPlan>, z.infer<typeof compactStepResult>> = {
  id: "evaluation.target", version: "1", input: jobPlan, output: compactStepResult,
  limits: { startToCloseTimeoutMs: 3_600_000 },
};
const scorerInput = commonStep.extend({ scorer: reference, invocationId: EvaluationIdSchema, targetInvocationId: EvaluationIdSchema.optional() });
export const evaluationScorerTask: Task<z.infer<typeof scorerInput>, z.infer<typeof compactStepResult>> = {
  id: "evaluation.scorer", version: "1",
  input: scorerInput, output: compactStepResult,
  limits: { startToCloseTimeoutMs: 3_600_000 },
};
const finalizeInput = commonStep.extend({ resultId: EvaluationIdSchema, targetInvocationId: EvaluationIdSchema.optional(), scorerInvocationIds: z.array(EvaluationIdSchema).min(1).max(32) });
const finalizeOutput = z.strictObject({ resultId: EvaluationIdSchema, status: EvaluationResultRecordSchema.shape.status });
export const evaluationFinalizeTask: Task<z.infer<typeof finalizeInput>, z.infer<typeof finalizeOutput>> = {
  id: "evaluation.finalize", version: "1", input: finalizeInput, output: finalizeOutput,
  limits: { startToCloseTimeoutMs: 30_000 },
};

export const evaluationWorkflow: Workflow<{ evaluationRunId: string }, z.infer<typeof workflowOutput>> = {
  id: "evaluation.run", version: "1", input: z.strictObject({ evaluationRunId: EvaluationIdSchema }), output: workflowOutput,
  async run(context, input) {
    const plan = await context.task("plan", evaluationPlanTask, input, { maxAttempts: 2 });
    const resultIds: string[] = [];
    const execute = async (job: z.infer<typeof jobPlan>) => {
      let targetInvocationId: string | undefined;
      if (job.target && job.targetInvocationId) {
        const target = await context.task(`case-${job.caseIndex}-trial-${job.trial}-target`, evaluationTargetTask, job);
        targetInvocationId = target.invocationId;
      }
      const scorerResults = await Promise.all(job.scorers.map((entry, scorerIndex) => context.task(
        `case-${job.caseIndex}-trial-${job.trial}-scorer-${scorerIndex}`,
        evaluationScorerTask,
        { evaluationRunId: job.evaluationRunId, definition: job.definition, caseId: job.caseId, caseRevision: job.caseRevision, trial: job.trial, scorer: entry.scorer, invocationId: entry.invocationId, ...(targetInvocationId ? { targetInvocationId } : {}) },
      )));
      const final = await context.task(
        `case-${job.caseIndex}-trial-${job.trial}-finalize`, evaluationFinalizeTask,
        { evaluationRunId: job.evaluationRunId, definition: job.definition, caseId: job.caseId, caseRevision: job.caseRevision, trial: job.trial, resultId: job.resultId, ...(targetInvocationId ? { targetInvocationId } : {}), scorerInvocationIds: scorerResults.map((item) => item.invocationId) },
        { maxAttempts: 3 },
      );
      return final.resultId;
    };
    for (let offset = 0; offset < plan.jobs.length; offset += plan.concurrency) {
      resultIds.push(...await Promise.all(plan.jobs.slice(offset, offset + plan.concurrency).map(execute)));
    }
    return workflowOutput.parse({ evaluationRunId: input.evaluationRunId, resultIds });
  },
};

export const evaluationRegistry = defineWorkflowModule({
  workflows: [registerWorkflow(evaluationWorkflow)],
  tasks: [evaluationPlanTask, evaluationTargetTask, evaluationScorerTask, evaluationFinalizeTask],
});

export type EvaluationIdentitySource = (value: EvaluationJson) => string | Promise<string>;
export interface EvaluationComposerOptions {
  readonly store: EvaluationStore;
  readonly orchestrator?: Orchestrator;
  readonly assessment: EvaluationAssessmentProvider;
  readonly readiness?: () => EvaluationReadiness | Promise<EvaluationReadiness>;
  readonly clock: { now(): number };
  readonly identity: EvaluationIdentitySource;
}

const key = (value: VersionedReference) => `${value.id}\u0000${value.revision}`;
const publicKey = (value: VersionedReference) => `${value.id}@${value.revision}`;
const toReference = (value: VersionedReference): VersionedReference => ({ id: value.id, revision: value.revision });
const selected = <T extends { id: string; revision: string }>(items: ReadonlyMap<string, T>, value: VersionedReference, kind: string): T => {
  const found = items.get(key(value));
  if (!found) throw new StepFailure("invalid", `${kind} binding ${publicKey(value)} is unavailable`);
  return found;
};
const selector = (input: z.infer<typeof commonStep>, invocationId: string) => ({
  invocationId, runId: input.evaluationRunId, caseId: input.caseId, caseRevision: input.caseRevision, trial: input.trial,
});
const errorFinding = (scorer: VersionedReference): Finding => ({
  id: scorer.id, name: scorer.id, outcome: "error", error: { code: "scorer_failed", message: "Scorer assessment failed" }, references: [],
});
function outcome(error: unknown, signal: AbortSignal): InvocationOutcome {
  if (error instanceof StepFailure) {
    if (error.code === "denied") return "denied";
    if (error.code === "unknown") return "uncertain";
  }
  if (signal.aborted) return "cancelled";
  return "failed";
}
function status(target: TargetCheckpoint | undefined, scorers: readonly ScorerCheckpoint[]): EvaluationResultRecord["status"] {
  if (target?.outcome === "uncertain" || scorers.some((item) => item.outcome === "uncertain")) return "uncertain";
  if (target && target.outcome !== "succeeded") return target.outcome === "failed" ? "failed" : target.outcome;
  for (const exceptional of ["timed_out", "denied", "cancelled"] as const) {
    if (scorers.some((item) => item.outcome === exceptional)) return exceptional;
  }
  return scorers.some((item) => item.findings.some((finding) => finding.outcome === "scored")) ? "completed" : "unscored";
}

function boundedUnresolvedEffects(values: readonly string[]): readonly string[] {
  if (values.length <= 100 && values.every((value) => value.length >= 1 && value.length <= 512)) return values;
  const retained: string[] = [];
  let omitted = 0;
  for (const value of values) {
    if (retained.length < 99 && value.length >= 1 && value.length <= 512) retained.push(value);
    else omitted++;
  }
  return [...retained, `${omitted} additional unresolved effect${omitted === 1 ? "" : "s"} omitted from this bounded status view`];
}

function snapshotTarget(value: EvaluationTarget): EvaluationTarget {
  const id = EvaluationIdSchema.parse(value.id), revision = z.string().min(1).max(160).parse(value.revision);
  const invoke = value.invoke.bind(value);
  return Object.freeze({ id, revision, input: value.input, output: value.output, invoke });
}
function snapshotScorer(value: EvaluationScorer): EvaluationScorer {
  const id = EvaluationIdSchema.parse(value.id), revision = z.string().min(1).max(160).parse(value.revision);
  const score = value.score.bind(value);
  return Object.freeze({ id, revision, input: value.input, output: value.output, ...(value.expected ? { expected: value.expected } : {}), score });
}

export function createEvaluationComposer(options: EvaluationComposerOptions): EvaluationComposer {
  let composed = false;
  return Object.freeze({
    compose(bindings: EvaluationCompositionBindings) {
      if (composed) throw new Error("Evaluation capability is already composed for this activation");
      composed = true;
      const targets = new Map<string, EvaluationTarget>();
      for (const candidate of bindings.targets ?? []) {
        const value = snapshotTarget(candidate), identity = key(value);
        if (targets.has(identity)) throw new Error(`Duplicate target binding ${publicKey(value)}`);
        targets.set(identity, value);
      }
      const scorers = new Map<string, EvaluationScorer>();
      for (const candidate of [...(options.assessment.scorers ?? []), ...bindings.scorers]) {
        const value = snapshotScorer(candidate), identity = key(value);
        if (scorers.has(identity)) throw new Error(`Duplicate scorer binding ${publicKey(value)}`);
        scorers.set(identity, value);
      }
      const assess = options.assessment.assess.bind(options.assessment) as EvaluationAssessmentProvider["assess"];
      const identity = async (value: EvaluationJson) => EvaluationIdSchema.parse(await options.identity(EvaluationJsonSchema.parse(value)));
      const header = async (ref: VersionedReference) => {
        const value = await options.store.getDefinitionHeader(ref);
        if (!value) throw new StepFailure("invalid", "Evaluation definition is unavailable");
        return EvaluationDefinitionHeaderSchema.parse(value);
      };
      const caseFor = async (input: z.infer<typeof commonStep>) => {
        const value = await options.store.getCase(input.definition, input.caseId);
        if (!value || value.revision !== input.caseRevision) throw new StepFailure("invalid", "Evaluation case is unavailable");
        return value;
      };
      const buildPlan = async (evaluationRunId: string) => {
        const run = await options.store.getRun(evaluationRunId);
        if (!run) throw new StepFailure("invalid", "Evaluation run is unavailable");
        const definition = await options.store.getDefinition(run.definition);
        if (!definition) throw new StepFailure("invalid", "Evaluation definition is unavailable");
        const jobs: z.infer<typeof jobPlan>[] = [];
        for (const [caseIndex, item] of definition.cases.entries()) for (let trial = 0; trial < run.settings.repetitions; trial++) {
          const base = [evaluationRunId, caseIndex, trial] as const;
          const targetInvocationId = definition.target ? await identity(["target", ...base]) : undefined;
          const scorerEntries = await Promise.all(definition.scorers.map(async (scorer, scorerIndex) => ({ scorer: toReference(scorer), invocationId: await identity(["scorer", ...base, scorerIndex]) })));
          jobs.push(jobPlan.parse({ evaluationRunId, definition: run.definition, caseId: item.id, caseRevision: item.revision, caseIndex, trial, ...(definition.target ? { target: toReference(definition.target), targetInvocationId } : {}), scorers: scorerEntries, resultId: await identity(["result", ...base]) }));
        }
        return planOutput.parse({ evaluationRunId, concurrency: run.settings.concurrency, jobs });
      };

      const planHandler = registerTaskHandler(evaluationPlanTask, {
        async run(input, context) {
          await options.store.saveOrchestrationBinding({ schemaVersion: EVALUATION_SCHEMA_VERSION, evaluationRunId: input.evaluationRunId, orchestrationRunId: context.runId });
          return buildPlan(input.evaluationRunId);
        },
        async recover(input, context) {
          const binding = await options.store.getOrchestrationBinding(input.evaluationRunId);
          if (!binding || binding.orchestrationRunId !== context.runId) return { status: "unknown" };
          return { status: "completed", output: await buildPlan(input.evaluationRunId) };
        },
      });
      const targetHandler = registerTaskHandler(evaluationTargetTask, {
        async run(input, context) {
          if (!input.target || !input.targetInvocationId) throw new StepFailure("invalid", "Target step is incomplete");
          const checkpointSelector = selector(input, input.targetInvocationId);
          const existing = await options.store.getTargetCheckpoint(checkpointSelector);
          if (existing) return compactStepResult.parse({ invocationId: existing.invocationId, outcome: existing.outcome });
          const definition = await header(input.definition);
          if (!definition.target || key(definition.target) !== key(input.target)) throw new StepFailure("invalid", "Target selection changed");
          const implementation = selected(targets, input.target, "Target");
          const item = await caseFor(input);
          const startedAtMs = options.clock.now();
          let result;
          try {
            const parsedInput = implementation.input.parse(item.input);
            result = TargetInvocationResultSchema.parse(await implementation.invoke({ input: parsedInput, ...(definition.target.configuration === undefined ? {} : { configuration: definition.target.configuration }), references: item.references }, { signal: context.signal, invocationId: input.targetInvocationId, operationId: context.runId, runId: input.evaluationRunId }));
            if (result.outcome === "succeeded") implementation.output.parse(result.output);
          } catch (error) {
            result = { outcome: outcome(error, context.signal), error: { code: "target_failed", message: "Target invocation failed" }, references: [] } as const;
          }
          const checkpoint = TargetCheckpointSchema.parse({ schemaVersion: EVALUATION_SCHEMA_VERSION, invocationId: input.targetInvocationId, runId: input.evaluationRunId, caseId: input.caseId, caseRevision: input.caseRevision, trial: input.trial, target: input.target, ...result, startedAtMs, completedAtMs: options.clock.now() });
          await options.store.saveTargetCheckpoint(checkpoint);
          return compactStepResult.parse({ invocationId: checkpoint.invocationId, outcome: checkpoint.outcome });
        },
        async recover(input) {
          if (!input.targetInvocationId) return { status: "unknown" };
          const checkpoint = await options.store.getTargetCheckpoint(selector(input, input.targetInvocationId));
          return checkpoint ? { status: "completed", output: { invocationId: checkpoint.invocationId, outcome: checkpoint.outcome } } : { status: "unknown" };
        },
      });
      const scorerHandler = registerTaskHandler(evaluationScorerTask, {
        async run(input, context) {
          const checkpointSelector = selector(input, input.invocationId);
          const existing = await options.store.getScorerCheckpoint(checkpointSelector);
          if (existing) return compactStepResult.parse({ invocationId: existing.invocationId, outcome: existing.outcome });
          const definition = await header(input.definition);
          const selectedDefinition = definition.scorers.find((value) => key(value) === key(input.scorer));
          if (!selectedDefinition) throw new StepFailure("invalid", "Scorer selection changed");
          const implementation = selected(scorers, input.scorer, "Scorer");
          const item = await caseFor(input);
          const startedAtMs = options.clock.now();
          let checkpoint: ScorerCheckpoint;
          try {
            let result;
            let outputValue: EvaluationJson;
            if (input.targetInvocationId) {
              const target = await options.store.getTargetCheckpoint(selector(input, input.targetInvocationId));
              if (!target) throw new StepFailure("unknown", "Target checkpoint is unavailable");
              if (target.outcome !== "succeeded") {
                result = { outcome: target.outcome, findings: [] };
                outputValue = null;
              } else outputValue = EvaluationJsonSchema.parse(target.output);
            } else outputValue = EvaluationJsonSchema.parse(item.suppliedOutput);
            if (!result) {
              const parsedInput = implementation.input.parse(item.input);
              const parsedOutput = implementation.output.parse(outputValue);
              const parsedExpected = item.expected === undefined || !implementation.expected ? undefined : implementation.expected.parse(item.expected);
              result = ScorerInvocationResultSchema.parse(await assess(implementation, { input: parsedInput, output: parsedOutput, ...(parsedExpected === undefined ? {} : { expected: parsedExpected }), ...(selectedDefinition.configuration === undefined ? {} : { configuration: selectedDefinition.configuration }), references: item.references }, { signal: context.signal, invocationId: input.invocationId, operationId: context.runId, runId: input.evaluationRunId }));
            }
            checkpoint = ScorerCheckpointSchema.parse({ schemaVersion: EVALUATION_SCHEMA_VERSION, invocationId: input.invocationId, runId: input.evaluationRunId, caseId: input.caseId, caseRevision: input.caseRevision, trial: input.trial, scorer: input.scorer, ...result, startedAtMs, completedAtMs: options.clock.now() });
          } catch (error) {
            const mapped = outcome(error, context.signal);
            checkpoint = ScorerCheckpointSchema.parse({ schemaVersion: EVALUATION_SCHEMA_VERSION, invocationId: input.invocationId, runId: input.evaluationRunId, caseId: input.caseId, caseRevision: input.caseRevision, trial: input.trial, scorer: input.scorer, outcome: mapped, findings: mapped === "failed" ? [errorFinding(input.scorer)] : [], startedAtMs, completedAtMs: options.clock.now() });
          }
          await options.store.saveScorerCheckpoint(checkpoint);
          return compactStepResult.parse({ invocationId: checkpoint.invocationId, outcome: checkpoint.outcome });
        },
        async recover(input) {
          const checkpoint = await options.store.getScorerCheckpoint(selector(input, input.invocationId));
          return checkpoint ? { status: "completed", output: { invocationId: checkpoint.invocationId, outcome: checkpoint.outcome } } : { status: "unknown" };
        },
      });
      const finalizeHandler = registerTaskHandler(evaluationFinalizeTask, {
        async run(input) {
          const existing = await options.store.getResultSummary(input.resultId);
          if (existing) return { resultId: existing.id, status: existing.status };
          const target = input.targetInvocationId ? await options.store.getTargetCheckpoint(selector(input, input.targetInvocationId)) : undefined;
          if (input.targetInvocationId && !target) throw new StepFailure("unknown", "Target checkpoint is unavailable");
          const scorerCheckpoints = await Promise.all(input.scorerInvocationIds.map((invocationId) => options.store.getScorerCheckpoint(selector(input, invocationId))));
          if (scorerCheckpoints.some((value) => !value)) throw new StepFailure("unknown", "Scorer checkpoint is unavailable");
          const scorers = scorerCheckpoints as ScorerCheckpoint[];
          const times = [...(target ? [target] : []), ...scorers];
          const result = EvaluationResultRecordSchema.parse({ schemaVersion: EVALUATION_SCHEMA_VERSION, id: input.resultId, runId: input.evaluationRunId, caseId: input.caseId, caseRevision: input.caseRevision, trial: input.trial, status: status(target, scorers), ...(target ? { targetInvocationId: target.invocationId } : {}), scorerInvocationIds: scorers.map((value) => value.invocationId), startedAtMs: Math.min(...times.map((value) => value.startedAtMs)), completedAtMs: Math.max(...times.map((value) => value.completedAtMs)) });
          await options.store.saveResult(result);
          return finalizeOutput.parse({ resultId: result.id, status: result.status });
        },
        async recover(input) {
          const result = await options.store.getResultSummary(input.resultId);
          return result ? { status: "completed", output: { resultId: result.id, status: result.status } } : { status: "retryable" };
        },
      });
      const taskHandlers = Object.freeze([planHandler, targetHandler, scorerHandler, finalizeHandler]) satisfies readonly RegisteredTaskHandler[];

      const available = async () => EvaluationReadinessSchema.parse(await options.readiness?.() ?? (options.orchestrator ? { status: "ready" as const } : { status: "unavailable" as const, reason: "Orchestration is not configured" }));
      const unavailableReason = (readiness: EvaluationReadiness) => readiness.status === "unavailable" ? readiness.reason : undefined;
      const start = async (raw: Parameters<EvaluationService["assess"]>[0], expectedMode: EvaluationDefinitionHeader["mode"]): Promise<EvaluationStartResult> => {
        const request = EvaluationStartRequestSchema.parse(raw);
        if (request.definition.mode !== expectedMode) throw new StepFailure("invalid", `Expected ${expectedMode} definition`);
        if (request.definition.target) selected(targets, request.definition.target, "Target");
        for (const scorer of request.definition.scorers) selected(scorers, scorer, "Scorer");
        const taskCount = 1 + request.definition.cases.length * request.settings.repetitions * (request.definition.scorers.length + (request.definition.target ? 1 : 0) + 1);
        if (taskCount > MAX_EVALUATION_WORKFLOW_STEPS) throw new StepFailure("invalid", `Evaluation exceeds the ${MAX_EVALUATION_WORKFLOW_STEPS}-step workflow bound`);
        const readiness = await available();
        if (readiness.status !== "ready" || !options.orchestrator) return EvaluationStartResultSchema.parse({ kind: "unavailable", reason: unavailableReason(readiness) ?? "Orchestration is unavailable" });
        const evaluationRunId = await identity(["evaluation-run", request.requestId]);
        const orchestrationIdentity = await identity(["evaluation-orchestration", request.requestId]);
        const definitionRef = { id: request.definition.id, revision: request.definition.revision };
        await options.store.saveDefinition(request.definition);
        const existingRun = await options.store.getRun(evaluationRunId);
        const disposition = await options.store.saveRun({ schemaVersion: EVALUATION_SCHEMA_VERSION, id: evaluationRunId, requestId: request.requestId, definition: definitionRef, settings: request.settings, createdAtMs: existingRun?.createdAtMs ?? options.clock.now() });
        const prior = await options.store.getOrchestrationBinding(evaluationRunId);
        if (prior) return EvaluationStartResultSchema.parse({ kind: "reconciled", evaluationRunId, orchestrationRunId: prior.orchestrationRunId });
        const existingAttempt = await options.store.getStartAttempt(evaluationRunId);
        if (!existingAttempt) {
          try {
            await options.store.saveStartAttempt({ schemaVersion: EVALUATION_SCHEMA_VERSION, evaluationRunId, requestedAtMs: options.clock.now() });
          } catch (error) {
            if (!(error instanceof EvaluationStoreError) || error.code !== "conflict" || !await options.store.getStartAttempt(evaluationRunId)) throw error;
          }
        }
        let orchestrationRunId: string;
        try {
          orchestrationRunId = await options.orchestrator.start(orchestrationIdentity, evaluationWorkflow, { evaluationRunId });
        } catch {
          const binding = await options.store.getOrchestrationBinding(evaluationRunId);
          return binding
            ? EvaluationStartResultSchema.parse({ kind: "reconciled", evaluationRunId, orchestrationRunId: binding.orchestrationRunId })
            : EvaluationStartResultSchema.parse({ kind: "uncertain", evaluationRunId });
        }
        await options.store.saveOrchestrationBinding({ schemaVersion: EVALUATION_SCHEMA_VERSION, evaluationRunId, orchestrationRunId });
        return EvaluationStartResultSchema.parse({ kind: disposition.kind === "accepted" ? "started" : "reconciled", evaluationRunId, orchestrationRunId });
      };
      const service: EvaluationService = {
        readiness: available,
        assess: (request) => start(request, "assess_existing"),
        run: (request) => start(request, "experiment"),
        getDefinition: (ref) => options.store.getDefinition(ref),
        getDefinitionHeader: (ref) => options.store.getDefinitionHeader(ref),
        getCase: (ref, caseId) => options.store.getCase(ref, caseId),
        listDefinitions: (input) => options.store.listDefinitions(input),
        getRun: (runId) => options.store.getRun(runId),
        getStartAttempt: (runId) => options.store.getStartAttempt(runId),
        getOrchestrationBinding: (runId) => options.store.getOrchestrationBinding(runId),
        listRuns: (input) => options.store.listRuns(input),
        getTargetCheckpoint: (input) => options.store.getTargetCheckpoint(input),
        getScorerCheckpoint: (input) => options.store.getScorerCheckpoint(input),
        getResultSummary: (resultId) => options.store.getResultSummary(resultId),
        getResult: (resultId) => options.store.getResult(resultId),
        listResults: (input) => options.store.listResults(input),
        listFeedback: (input) => options.store.listFeedback(input),
        saveFeedback: (feedback) => options.store.saveFeedback(feedback),
        async status(evaluationRunId): Promise<EvaluationExecutionStatus> {
          const runId = EvaluationIdSchema.parse(evaluationRunId);
          if (!await options.store.getRun(runId)) throw new StepFailure("invalid", "Evaluation run is unavailable");
          const binding = await options.store.getOrchestrationBinding(runId);
          if (!binding) return EvaluationExecutionStatusSchema.parse(await options.store.getStartAttempt(runId)
            ? { kind: "start_uncertain", evaluationRunId: runId }
            : { kind: "saved", evaluationRunId: runId });
          const readiness = await available();
          if (readiness.status !== "ready" || !options.orchestrator) return EvaluationExecutionStatusSchema.parse({ kind: "unavailable", evaluationRunId: runId, reason: unavailableReason(readiness) ?? "Orchestration is unavailable" });
          try {
            const snapshot = await options.orchestrator.get(binding.orchestrationRunId);
            if (snapshot.unresolvedEffects.length) return EvaluationExecutionStatusSchema.parse({ kind: "uncertain", evaluationRunId: runId, orchestrationRunId: binding.orchestrationRunId, unresolvedEffects: boundedUnresolvedEffects(snapshot.unresolvedEffects) });
            if (snapshot.status === "running") return EvaluationExecutionStatusSchema.parse({ kind: "running", evaluationRunId: runId, orchestrationRunId: binding.orchestrationRunId, cancellationRequested: snapshot.cancellationRequested });
            return EvaluationExecutionStatusSchema.parse({ kind: snapshot.status, evaluationRunId: runId, orchestrationRunId: binding.orchestrationRunId });
          } catch { return EvaluationExecutionStatusSchema.parse({ kind: "unavailable", evaluationRunId: runId, reason: "Orchestration status is unavailable" }); }
        },
        async cancel(evaluationRunId): Promise<EvaluationCancelResult> {
          const runId = EvaluationIdSchema.parse(evaluationRunId);
          if (!await options.store.getRun(runId)) throw new StepFailure("invalid", "Evaluation run is unavailable");
          const binding = await options.store.getOrchestrationBinding(runId);
          if (!binding) return EvaluationCancelResultSchema.parse(await options.store.getStartAttempt(runId)
            ? { kind: "uncertain", evaluationRunId: runId }
            : { kind: "not_started", evaluationRunId: runId });
          const readiness = await available();
          if (readiness.status !== "ready" || !options.orchestrator) return EvaluationCancelResultSchema.parse({ kind: "unavailable", evaluationRunId: runId, reason: unavailableReason(readiness) ?? "Orchestration is unavailable" });
          try {
            const current = await options.orchestrator.get(binding.orchestrationRunId);
            if (current.status !== "running") return EvaluationCancelResultSchema.parse({ kind: "terminal", evaluationRunId: runId, orchestrationRunId: binding.orchestrationRunId });
            await options.orchestrator.cancel(binding.orchestrationRunId);
            return EvaluationCancelResultSchema.parse({ kind: "requested", evaluationRunId: runId, orchestrationRunId: binding.orchestrationRunId });
          } catch { return EvaluationCancelResultSchema.parse({ kind: "unavailable", evaluationRunId: runId, reason: "Orchestration cancellation is unavailable" }); }
        },
      };
      Object.freeze(service);
      return Object.freeze({ service, taskHandlers });
    },
  });
}
