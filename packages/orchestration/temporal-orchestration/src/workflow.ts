import { z } from "zod";
import {
  CancellationScope,
  defineQuery,
  defineUpdate,
  setHandler,
  condition,
  sleep,
  proxyActivities,
  startChild,
  workflowInfo,
  isCancellation,
  ApplicationFailure,
  ActivityFailure,
  TimeoutFailure,
  ActivityCancellationType,
  type ChildWorkflowHandle,
} from "@temporalio/workflow";
import {
  canonical,
  parse,
  MAX_TASK_ATTEMPTS,
  type Json,
  type RunSnapshot,
  type WorkflowContext,
} from "@drawloom/orchestration";
import { taskExecutionLimits, type Registry } from "@drawloom/orchestration";

export interface Start {
  identity: string;
  workflow: string;
  version: string;
  input: Json;
  fingerprint: string;
}
export interface ActivityRequest {
  task: string;
  version: string;
  input: Json;
  runId: string;
  stepId: string;
  maxAttempts: number;
}
export interface Activities {
  dispatch(request: ActivityRequest): Promise<{ value: Json; attempt: number }>;
  cleanup(runId: string): Promise<readonly string[]>;
}
export const stateQuery = defineQuery<RunSnapshot>("state");
export const startQuery = defineQuery<string>("startIdentity");
export const stepsQuery = defineQuery<RunSnapshot["steps"], [number, number]>(
  "steps",
);
export const answerUpdate = defineUpdate<void, [string, Json]>("answer");
export const answerQuery = defineQuery<boolean, [string, Json]>("answered");

export async function executeWorkflow(registry: Registry, start: Start): Promise<Json> {
  const runId = workflowInfo().workflowId;
  const state: RunSnapshot = {
    runId,
    identity: start.identity,
    workflow: start.workflow,
    version: start.version,
    status: "running",
    cancellationRequested: false,
    childRunIds: [],
    unresolvedEffects: [],
    stepsTruncated: false,
    pendingInputs: [],
    steps: [],
  };
  const responses = new Map<
    string,
    { schema: z.ZodType; value?: Json; fingerprint?: string }
  >();
  const memo = new Map<
    string,
    { fingerprint: string; result: Promise<unknown> }
  >();
  const children: ChildWorkflowHandle<(start: Start) => Promise<Json>>[] = [];
  // A successful submit receipt is not native operation completion. Preserve that
  // distinction when cancellation/failure happens between submit and result.
  const nativeOperations = new Map<string, string>();
  const inputSchemas = new Map<string, { schema: z.ZodType; fingerprint: string | undefined }>();
  setHandler(startQuery, () => start.fingerprint);
  setHandler(stateQuery, () => ({
    ...state,
    steps: state.steps.slice(0, 100),
    stepsTruncated: state.steps.length > 100,
  }));
  setHandler(stepsQuery, (offset, limit) =>
    state.steps.slice(offset, offset + limit),
  );
  const validateAnswer = (id: string, value: Json) => {
    const pending = responses.get(id);
    if (!pending)
      throw ApplicationFailure.nonRetryable("Stale or cross-run input");
    parse(pending.schema, value);
    if (
      pending.fingerprint !== undefined &&
      pending.fingerprint !== canonical(value)
    )
      throw ApplicationFailure.nonRetryable("Conflicting input");
    return pending;
  };
  setHandler(
    answerQuery,
    (id, value) => validateAnswer(id, value).fingerprint === canonical(value),
  );
  setHandler(
    answerUpdate,
    (id, value) => {
      const pending = validateAnswer(id, value);
      pending.value = parse(pending.schema, value) as Json;
      pending.fingerprint = canonical(value);
      state.pendingInputs = state.pendingInputs.filter((x) => x !== id);
    },
    {
      validator: (id, value) => {
        validateAnswer(id, value);
      },
    },
  );
  function stable<T>(
    step: string,
    fingerprint: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!step) throw new Error("Empty step");
    const previous = memo.get(step);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new Error("Conflicting step");
      return previous.result as Promise<T>;
    }
    const result = Promise.resolve().then(work);
    memo.set(step, { fingerprint, result });
    return result;
  }
  const scope = new CancellationScope();
  const context: WorkflowContext = {
    runId,
    task(step, task, input, retry) {
      const registered = registry.tasks.find(
        (t) => t.id === task.id && t.version === task.version,
      );
      if (!registered) throw new Error("Unregistered task version");
      const parsed = parse(registered.input, input) as Json;
      const maximumAttempts = retry?.maxAttempts ?? 1;
      if (
        !Number.isInteger(maximumAttempts) ||
        maximumAttempts < 1 ||
        maximumAttempts > MAX_TASK_ATTEMPTS
      )
        throw new Error("Invalid retry bound");
      return stable(
        step,
        canonical(["task", task.id, task.version, parsed, maximumAttempts]),
        async () => {
          const record: RunSnapshot["steps"][number] = {
            stepId: `${runId}/${step}`,
            attempts: 0,
            status: "running",
          };
          state.steps.push(record);
          try {
            const result = await proxyActivities<Activities>({
              startToCloseTimeout: taskExecutionLimits(registered).startToCloseTimeoutMs,
              heartbeatTimeout: "3 seconds",
              cancellationType:
                ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
              retry: {
                maximumAttempts,
                initialInterval: "20 milliseconds",
                maximumInterval: "20 milliseconds",
                nonRetryableErrorTypes: ["denied", "invalid", "unknown"],
              },
            }).dispatch({
              task: task.id,
              version: task.version,
              input: parsed,
              runId,
              stepId: record.stepId,
              maxAttempts: maximumAttempts,
            });
            record.attempts = result.attempt;
            record.result = parse(registered.output, result.value) as Json;
            record.status = "completed";
            if (["agent.submit", "agent.inspect", "agent.result"].includes(task.id)) {
              const receipt = record.result;
              if (receipt && typeof receipt === "object" && !Array.isArray(receipt)
                && typeof receipt.sessionId === "string" && typeof receipt.operationId === "string") {
                const key = canonical([receipt.sessionId, receipt.operationId]);
                if (["completed", "failed", "interrupted", "denied"].includes(String(receipt.status))) nativeOperations.delete(key);
                else nativeOperations.set(key, record.stepId);
              }
            }
            return record.result as never;
          } catch (error) {
            record.status = "failed";
            const cause =
              error instanceof ActivityFailure ? error.cause : error;
            if (
              cause instanceof ApplicationFailure &&
              typeof cause.details?.[0] === "number"
            )
              record.attempts = cause.details[0];
            if (
              isCancellation(error) || cause instanceof TimeoutFailure ||
              (cause instanceof ApplicationFailure && cause.type === "unknown")
            )
              state.unresolvedEffects.push(record.stepId);
            throw error;
          }
        },
      );
    },
    child(step, workflow, input) {
      const registered = registry.workflows.find(
        (w) => w.id === workflow.id && w.version === workflow.version,
      );
      if (!registered) throw new Error("Unregistered workflow version");
      const parsed = parse(registered.input, input) as Json;
      return stable(
        step,
        canonical(["child", workflow.id, workflow.version, parsed]),
        async () => {
          if (state.childRunIds.length >= 100) throw new Error("Child limit");
          const id = `${runId}/child/${encodeURIComponent(step)}`;
          state.childRunIds.push(id);
          const handle = await startChild<(start: Start) => Promise<Json>>("drawloomWorkflow", {
            workflowId: id,
            args: [
              {
                identity: step,
                workflow: workflow.id,
                version: workflow.version,
                input: parsed,
                fingerprint: canonical([workflow.id, workflow.version, parsed]),
              },
            ],
          });
          children.push(handle);
          return (await handle.result()) as never;
        },
      );
    },
    input(step, schema) {
      let fingerprint: string | undefined;
      try { fingerprint = canonical(z.toJSONSchema(schema)); }
      catch {
        // Valid JSON-preserving transforms need not have a JSON Schema. The
        // pinned workflow registers their schema object for this named wait.
      }
      const previous = inputSchemas.get(step);
      if (previous && previous.schema !== schema &&
        (fingerprint === undefined || previous.fingerprint === undefined || fingerprint !== previous.fingerprint))
        throw new Error("Conflicting input schema");
      inputSchemas.set(step, { schema, fingerprint });
      return stable(
        step,
        canonical(["input", fingerprint ?? "registered-schema"]),
        async () => {
          if (state.pendingInputs.length >= 100) throw new Error("Input limit");
          const id = `${runId}/input/${encodeURIComponent(step)}`;
          const pending: {
            schema: z.ZodType;
            value?: Json;
            fingerprint?: string;
          } = { schema };
          responses.set(id, pending);
          state.pendingInputs.push(id);
          await condition(() => pending.fingerprint !== undefined);
          return pending.value as never;
        },
      );
    },
    sleep(step, milliseconds) {
      return stable(step, canonical(["sleep", milliseconds]), () =>
        sleep(milliseconds),
      );
    },
  };
  try {
    const registered = registry.workflows.find(
      (w) => w.id === start.workflow && w.version === start.version,
    );
    if (!registered) throw new Error("Unregistered workflow");
    state.output = await scope.run(
      async () =>
        parse(
          registered.output,
          await registered.run(context, start.input),
        ) as Json,
    );
    state.status = "completed";
    return state.output;
  } catch (error) {
    state.cancellationRequested = isCancellation(error);
    state.unresolvedEffects.push(...nativeOperations.values());
    scope.cancel();
    await CancellationScope.nonCancellable(async () => {
      await Promise.allSettled(children.map((child) => child.result()));
      try {
        state.unresolvedEffects.push(
          ...(await proxyActivities<Activities>({
            startToCloseTimeout: "10 seconds",
            retry: { maximumAttempts: 1 },
          }).cleanup(runId)),
        );
      } catch {
        state.unresolvedEffects.push(`${runId}/cleanup-unknown`);
      }
    });
    state.status = state.cancellationRequested ? "cancelled" : "failed";
    state.failure = String(error);
    state.pendingInputs = [];
    if (state.cancellationRequested) throw error;
    throw ApplicationFailure.nonRetryable(state.failure);
  }
}
