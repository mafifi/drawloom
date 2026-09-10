import { z } from "zod";
export type Json = z.infer<ReturnType<typeof z.json>>;
/** Shared proof ceiling; retry remains opt-in and does not permit uncertain writes. */
export const MAX_TASK_ATTEMPTS = 10;
export interface Definition<I, O> {
  id: string;
  version: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
}
export interface Task<I, O> extends Definition<I, O> {}
export interface Workflow<I, O> extends Definition<I, O> {
  run(context: WorkflowContext, input: I): Promise<O>;
}
/** Trusted composition wraps heterogeneous definitions without accepting caller code. */
export interface RegisteredWorkflow extends Definition<unknown, unknown> {
  run(context: WorkflowContext, input: unknown): Promise<unknown>;
}
export interface Registry {
  workflows: readonly RegisteredWorkflow[];
  tasks: readonly Task<unknown, unknown>[];
}
export function registerWorkflow<I, O>(
  workflow: Workflow<I, O>,
): RegisteredWorkflow {
  // Providers validate the registered schema before invoking this erased wrapper.
  return {
    ...workflow,
    run: (context, input) => workflow.run(context, input as I),
  };
}
export interface TaskContext {
  taskVersion: string;
  runId: string;
  stepId: string;
  attemptId: string;
  attempt: number;
  signal: AbortSignal;
}
export interface WorkflowContext {
  /** Proof limits: at most 100 children per run and 100 simultaneous input waits. */
  readonly runId: string;
  task<I, O>(
    step: string,
    task: Task<I, O>,
    input: I,
    retry?: { maxAttempts: number },
  ): Promise<O>;
  child<I, O>(step: string, workflow: Workflow<I, O>, input: I): Promise<O>;
  input<T>(step: string, schema: z.ZodType<T>): Promise<T>;
  sleep(step: string, milliseconds: number): Promise<void>;
}
export const RunSnapshotSchema = z.strictObject({
  runId: z.string(),
  identity: z.string(),
  workflow: z.string(),
  version: z.string(),
  status: z.enum(["running", "completed", "failed", "cancelled"]),
  cancellationRequested: z.boolean(),
  childRunIds: z.array(z.string()),
  unresolvedEffects: z.array(z.string()),
  /** Snapshot shows at most 100 steps; getSteps reads every retained step. */
  stepsTruncated: z.boolean(),
  pendingInputs: z.array(z.string()),
  steps: z.array(
    z.strictObject({
      stepId: z.string(),
      attempts: z.number(),
      status: z.enum(["running", "completed", "failed"]),
      result: z.json().optional(),
    }),
  ),
  output: z.json().optional(),
  failure: z.string().optional(),
});
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;
export interface Orchestrator {
  start<I, O>(
    identity: string,
    workflow: Workflow<I, O>,
    input: I,
  ): Promise<string>;
  get(runId: string): Promise<RunSnapshot>;
  getSteps(
    runId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<{ steps: RunSnapshot["steps"]; cursor?: string }>;
  list(options?: {
    cursor?: string;
    limit?: number;
  }): Promise<{ runs: RunSnapshot[]; cursor?: string }>;
  result(runId: string, options?: { signal?: AbortSignal }): Promise<Json>;
  respond(runId: string, requestId: string, value: Json): Promise<void>;
  cancel(runId: string): Promise<void>;
}
/** `running` plus nonempty pendingInputs means awaiting external input. */
export async function workflowResult<I, O>(
  engine: Orchestrator,
  runId: string,
  workflow: Workflow<I, O>,
  options?: { signal?: AbortSignal },
): Promise<O> {
  const snapshot = await engine.get(runId);
  if (
    snapshot.workflow !== workflow.id ||
    snapshot.version !== workflow.version
  )
    throw new Error("Workflow identity mismatch");
  return parse(workflow.output, await engine.result(runId, options));
}
export class StepFailure extends Error {
  constructor(
    readonly code: "retryable" | "denied" | "invalid" | "unknown",
    message: string = code,
  ) {
    super(message);
  }
}
/** JSON round trip rejects non-JSON boundaries before schema transforms. */
export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.parse(z.json().parse(value));
  z.json().parse(parsed);
  return parsed;
}
export function canonical(value: unknown): string {
  const json = z.json().parse(value);
  if (Array.isArray(json)) return "[" + json.map(canonical).join(",") + "]";
  if (json !== null && typeof json === "object")
    return (
      "{" +
      Object.keys(json)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(json[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(json);
}

export { agentTasks, ownedAgents } from "./owned-agent.js";
