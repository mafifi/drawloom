import { join } from "node:path";
import { z } from "zod";
import { trace } from "@opentelemetry/api";
import { canonical, StepFailure, taskExecutionLimits, type MatchedTaskHandler, type TaskContext, type Json } from "@drawloom/orchestration";
import { digest, readJson, writeJson } from "./storage.js";
import { LOCAL_EXECUTION_PAUSED } from './signals.js';
import { stepFailureCode } from './failures.js';
import { observe } from './telemetry.js';
export const DispatchRequest = z.strictObject({
  runId: z.string().min(1).max(2048), stepId: z.string().min(1).max(4096),
  task: z.string().min(1).max(256), version: z.string().min(1).max(256),
  input: z.json(), attempt: z.number().int().min(1).max(10), maxAttempts: z.number().int().min(1).max(10),
});
const Receipt = z.strictObject({
  fingerprint: z.string(), attempt: z.number().int().positive(),
  status: z.enum(["intent", "completed", "failed"]),
  output: z.json().optional(), code: z.enum(["retryable", "denied", "invalid", "unknown"]).optional(),
});
type Receipt = z.infer<typeof Receipt>;
/** Single writer, protected by the manager's data-root lock. */
export function createReceiptDispatcher(directory: string, owner: string, handlers: readonly MatchedTaskHandler[]) {
  const active = new Map<string, { fingerprint: string; controller: AbortController; promise: Promise<Json> }>();
  const runCancellation = new Map<string, AbortController>();
  let closed = false;
  const checkOwner = (runId: string) => { if (!runId.startsWith(`${owner}/`)) throw new StepFailure("denied", "Unknown run owner"); };
  async function execute(request: z.infer<typeof DispatchRequest>, fingerprint: string, controller: AbortController): Promise<Json> {
    const handler = handlers.find((value) => value.task.id === request.task && value.task.version === request.version);
    if (!handler) throw new StepFailure("invalid", "Unregistered task");
    const path = join(directory, `${digest(request.stepId)}.json`);
    const saved = await readJson(path);
    const prior = saved === undefined ? undefined : Receipt.parse(saved);
    if (prior && prior.fingerprint !== fingerprint) throw new StepFailure("invalid", "Conflicting step receipt");
    trace.getActiveSpan()?.setAttribute('drawloom.cache.hit', prior?.status === 'completed');
    if (prior?.status === "completed") return prior.output!;
    if (prior && request.attempt < prior.attempt) throw new StepFailure("invalid", "Stale task attempt");
    const context: TaskContext = {
      runId: request.runId, stepId: request.stepId, taskVersion: request.version,
      attempt: request.attempt, attemptId: `${request.stepId}/attempt/${request.attempt}`,
      signal: AbortSignal.any([controller.signal, runCancellation.get(request.runId)!.signal]),
    };
    const previousIsUnknown = prior?.status === "intent" || prior?.code === "unknown";
    if (prior && !previousIsUnknown && !(prior.code === "retryable" && request.attempt > prior.attempt && request.attempt <= request.maxAttempts))
      throw new StepFailure(prior.code ?? "unknown");
    if (!prior && request.attempt !== 1) throw new StepFailure("unknown", "Missing prior attempt receipt");
    const intent: Receipt = { fingerprint, attempt: request.attempt, status: "intent" };
    await writeJson(path, intent);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = taskExecutionLimits(handler.task).startToCloseTimeoutMs;
    try {
      const work = async (): Promise<Json> => {
        if (previousIsUnknown) {
          if (!handler.recover) throw new StepFailure("unknown");
          const recovered = await observe('recovery', () => handler.recover!(request.input, context));
          if (recovered.status === "completed") return recovered.output;
          throw new StepFailure(recovered.status === "retryable" ? "retryable" : "unknown");
        }
        if (controller.signal.aborted) throw new StepFailure("unknown");
        return handler.run(request.input, context);
      };
      const output = await Promise.race([
        work(), new Promise<never>((_, reject) => {
          const abort = () => reject(new StepFailure("unknown"));
          controller.signal.addEventListener("abort", abort, { once: true });
          timer = setTimeout(() => controller.abort(), timeout);
        }),
      ]);
      // A timed-out handler may settle later; only this winning continuation writes.
      await writeJson(path, { ...intent, status: "completed", output });
      return output;
    } catch (error) {
      const code = stepFailureCode(error) ?? "unknown";
      await writeJson(path, { ...intent, status: "failed", code });
      throw new StepFailure(code);
    } finally { clearTimeout(timer); }
  }
  return {
    dispatch(value: unknown): Promise<Json> {
      return Promise.resolve().then(() => {
        if (closed) throw new StepFailure("unknown", "Dispatch closed");
        const request = DispatchRequest.parse(value);
        checkOwner(request.runId);
        let run = runCancellation.get(request.runId);
        if (!run) { run = new AbortController(); runCancellation.set(request.runId, run); }
        if (run.signal.aborted) throw new StepFailure("unknown", "Run cancellation requested");
        if (!request.stepId.startsWith(`${request.runId}/`) || request.attempt > request.maxAttempts)
          throw new StepFailure("invalid", "Invalid task identity or attempt");
        const fingerprint = canonical([request.task, request.version, request.input, request.maxAttempts]);
        const previous = active.get(request.stepId);
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new StepFailure("invalid", "Conflicting active receipt");
          return previous.promise;
        }
        const controller = new AbortController();
        const promise = trace.getTracer("@drawloom/temporal-orchestration").startActiveSpan("drawloom.orchestration.task", async (span) => {
          span.setAttribute("drawloom.attempt", request.attempt);
          span.setAttribute('drawloom.run.id', digest(request.runId));
          span.setAttribute('drawloom.step.id', digest(request.stepId));
          span.setAttribute('drawloom.plugin.id', owner);
          try { const result = await execute(request, fingerprint, controller); span.setAttribute("drawloom.outcome", "ok"); return result; }
          catch (error) { const code = stepFailureCode(error); span.setAttribute("drawloom.outcome", code === 'denied' ? 'denied' : code === 'retryable' || code === 'invalid' ? 'error' : 'unknown'); throw error; }
          finally { span.end(); active.delete(request.stepId); }
        });
        active.set(request.stepId, { fingerprint, controller, promise });
        return promise;
      });
    },
    cancel(runId: string): readonly string[] {
      checkOwner(runId);
      runCancellation.get(runId)?.abort();
      const unresolved: string[] = [];
      for (const [step, value] of active) if (step.startsWith(`${runId}/`)) { unresolved.push(step); value.controller.abort(); }
      return unresolved;
    },
    async close() { closed = true; for (const run of runCancellation.values()) run.abort(LOCAL_EXECUTION_PAUSED); for (const value of active.values()) value.controller.abort(LOCAL_EXECUTION_PAUSED); await Promise.allSettled([...active.values()].map((value) => value.promise)); },
  };
}
