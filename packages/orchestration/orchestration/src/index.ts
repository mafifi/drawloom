import { z } from "zod";
export type Json = z.infer<ReturnType<typeof z.json>>;
/** Shared retry ceiling; retries remain opt-in and do not permit uncertain writes. */
export const MAX_TASK_ATTEMPTS = 10;
/** Local-v1 task attempts remain finite and may run for at most one day. */
export const MAX_TASK_TIMEOUT_MS = 86_400_000;
export const TaskExecutionLimitsSchema = z.strictObject({
  startToCloseTimeoutMs: z.number().int().min(1).max(MAX_TASK_TIMEOUT_MS),
});
export type TaskExecutionLimits = z.infer<typeof TaskExecutionLimitsSchema>;
export const DEFAULT_TASK_EXECUTION_LIMITS: Readonly<TaskExecutionLimits> =
  Object.freeze({ startToCloseTimeoutMs: 30_000 });
export interface Definition<I, O> {
  id: string;
  version: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
}
export interface Task<I, O> extends Definition<I, O> {
  readonly limits?: TaskExecutionLimits;
}
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
const DefinitionIdentitySchema = z.strictObject({
  id: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  version: z.string().min(1).max(128),
});
function definitionIdentity(value: unknown): { id: string; version: string } {
  if (!value || typeof value !== "object") throw new Error("Expected definition");
  return DefinitionIdentitySchema.parse({
    id: Reflect.get(value, "id"),
    version: Reflect.get(value, "version"),
  });
}
function field(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") throw new Error("Expected definition");
  return Reflect.get(value, key);
}
function exactFields(value: unknown, allowed: readonly string[], label: string): void {
  if (!value || typeof value !== "object") throw new Error(`Expected ${label}`);
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`Unexpected ${label} field ${unexpected}`);
}
function schema(value: unknown): z.ZodType<unknown> {
  if (!(value instanceof z.ZodType)) throw new Error("Expected Zod schema");
  return value;
}
function duplicateIdentity(
  kind: "workflow" | "task",
  definitions: readonly Definition<unknown, unknown>[],
): void {
  const seen = new Set<string>();
  for (const definition of definitions) {
    const key = `${definition.id}@${definition.version}`;
    if (seen.has(key)) throw new Error(`Duplicate ${kind} identity ${key}`);
    seen.add(key);
  }
}
/** Resolve the provider timeout for both current and legacy task declarations. */
export function taskExecutionLimits(task: Task<unknown, unknown>): TaskExecutionLimits {
  return TaskExecutionLimitsSchema.parse(
    task.limits ?? DEFAULT_TASK_EXECUTION_LIMITS,
  );
}
/**
 * Validate a trusted portable workflow module without invoking workflow code.
 * The returned registry snapshots definition records and arrays, not runtime input.
 */
export function defineWorkflowModule(value: unknown): Registry {
  if (!value || typeof value !== "object") throw new Error("Expected workflow module");
  exactFields(value, ["workflows", "tasks"], "workflow module");
  const workflowCandidates = Reflect.get(value, "workflows");
  const taskCandidates = Reflect.get(value, "tasks");
  if (!Array.isArray(workflowCandidates) || !Array.isArray(taskCandidates))
    throw new Error("Expected workflow and task arrays");
  const workflows = workflowCandidates.map((candidate: unknown) => {
    exactFields(candidate, ["id", "version", "input", "output", "run"], "workflow");
    const identity = definitionIdentity(candidate);
    const input = schema(field(candidate, "input"));
    const output = schema(field(candidate, "output"));
    const run = field(candidate, "run");
    if (typeof run !== "function") throw new Error("Expected workflow run function");
    return Object.freeze({
      ...identity,
      input,
      output,
      run: (context: WorkflowContext, workflowInput: unknown) =>
        Promise.resolve(run(context, workflowInput)),
    });
  });
  const tasks = taskCandidates.map((candidate: unknown) => {
    exactFields(candidate, ["id", "version", "input", "output", "limits"], "task");
    const identity = definitionIdentity(candidate);
    const input = schema(field(candidate, "input"));
    const output = schema(field(candidate, "output"));
    const suppliedLimits = field(candidate, "limits");
    const limits = TaskExecutionLimitsSchema.parse(
      suppliedLimits ?? DEFAULT_TASK_EXECUTION_LIMITS,
    );
    return Object.freeze({
      ...identity,
      input,
      output,
      ...(suppliedLimits === undefined ? {} : { limits: Object.freeze(limits) }),
    });
  });
  duplicateIdentity("workflow", workflows);
  duplicateIdentity("task", tasks);
  return Object.freeze({
    workflows: Object.freeze(workflows),
    tasks: Object.freeze(tasks),
  });
}
/** Parse the default export of a trusted, prebuilt workflow module. */
export function parseWorkflowModule(value: unknown): Registry {
  return defineWorkflowModule(value);
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
export type TaskRecovery<O> =
  | { readonly status: "completed"; readonly output: O }
  | { readonly status: "retryable" }
  | { readonly status: "unknown" };
/**
 * Backend implementation of one declared task. `recover` may inspect existing
 * receipts only; it must not submit the external effect again.
 */
export interface TaskHandler<I, O> {
  run(input: I, context: TaskContext): O | Promise<O>;
  recover?(
    input: I,
    context: TaskContext,
  ): TaskRecovery<O> | Promise<TaskRecovery<O>>;
}
export interface RegisteredTaskHandler {
  readonly id: string;
  readonly version: string;
  run(input: unknown, context: TaskContext): unknown | Promise<unknown>;
  recover?(
    input: unknown,
    context: TaskContext,
  ): TaskRecovery<unknown> | Promise<TaskRecovery<unknown>>;
}
export interface MatchedTaskHandler {
  readonly task: Task<unknown, unknown>;
  run(input: unknown, context: TaskContext): Promise<Json>;
  recover?(
    input: unknown,
    context: TaskContext,
  ): Promise<TaskRecovery<Json>>;
}
/** Preserve task input/output inference while erasing only at trusted registration. */
export function registerTaskHandler<I, O>(
  task: Task<I, O>,
  handler: TaskHandler<I, O>,
): RegisteredTaskHandler {
  const identity = definitionIdentity(task);
  if (typeof handler.run !== "function") throw new Error("Expected task run function");
  if (handler.recover !== undefined && typeof handler.recover !== "function")
    throw new Error("Expected task recovery function");
  return Object.freeze({
    ...identity,
    run: (input: unknown, context: TaskContext) => handler.run(input as I, context),
    ...(handler.recover === undefined
      ? {}
      : {
          recover: (input: unknown, context: TaskContext) =>
            handler.recover!(input as I, context),
        }),
  });
}
function recoveryResult<O>(task: Task<unknown, O>, value: unknown): TaskRecovery<Json> {
  if (!value || typeof value !== "object") throw new Error("Invalid task recovery outcome");
  const status = Reflect.get(value, "status");
  if (status === "completed") {
    if (Reflect.ownKeys(value).some((key) => key !== "status" && key !== "output"))
      throw new Error("Invalid task recovery outcome");
    return { status, output: parse(task.output, Reflect.get(value, "output")) as Json };
  }
  if (status === "retryable" || status === "unknown") {
    if (Reflect.ownKeys(value).some((key) => key !== "status"))
      throw new Error("Invalid task recovery outcome");
    return { status };
  }
  throw new Error("Invalid task recovery outcome");
}
/**
 * Bind backend handlers to module-owned schemas and limits. Missing, extra and
 * duplicate handlers reject before task execution begins.
 */
export function matchTaskHandlers(
  registry: Registry,
  handlers: readonly RegisteredTaskHandler[],
): readonly MatchedTaskHandler[] {
  const module = defineWorkflowModule(registry);
  if (!Array.isArray(handlers)) throw new Error("Expected task handler array");
  const available = new Map<string, RegisteredTaskHandler>();
  const tasks = new Map<string, Task<unknown, unknown>>(
    module.tasks.map((task) => [`${task.id}@${task.version}`, task] as const),
  );
  for (const handler of handlers) {
    const identity = definitionIdentity(handler);
    const key = `${identity.id}@${identity.version}`;
    if (available.has(key)) throw new Error(`Duplicate task handler identity ${key}`);
    if (!tasks.has(key)) throw new Error(`Unexpected task handler ${key}`);
    if (typeof handler.run !== "function") throw new Error(`Invalid task handler ${key}`);
    if (handler.recover !== undefined && typeof handler.recover !== "function")
      throw new Error(`Invalid task handler recovery ${key}`);
    available.set(key, handler);
  }
  return Object.freeze(
    module.tasks.map((task) => {
      const key = `${task.id}@${task.version}`;
      const handler = available.get(key);
      if (!handler) throw new Error(`Missing task handler ${key}`);
      return Object.freeze({
        task,
        run: async (input: unknown, context: TaskContext) =>
          parse(task.output, await handler.run(parse(task.input, input), context)) as Json,
        ...(handler.recover === undefined
          ? {}
          : {
              recover: async (input: unknown, context: TaskContext) =>
                recoveryResult(
                  task,
                  await handler.recover!(parse(task.input, input), context),
                ),
            }),
      });
    }),
  );
}
export interface WorkflowContext {
  /** Shared limits: at most 100 children per run and 100 simultaneous input waits. */
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
