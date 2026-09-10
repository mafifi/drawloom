import { z } from "zod";
import {
  canonical,
  parse,
  StepFailure,
  MAX_TASK_ATTEMPTS,
  type Json,
  type Orchestrator,
  type RunSnapshot,
  type TaskContext,
  type Workflow,
  type WorkflowContext,
  type Registry,
  type Task,
} from "./contract.ts";
type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  void promise.catch(() => {});
  return { promise, resolve, reject };
}
function aborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error("Cancelled"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", abort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", abort);
        reject(e);
      },
    );
  });
}
/** Deliberately ephemeral TEST provider: no persistence or replay claims. */
export function createMemoryOrchestrator(
  scope: string,
  handler: (
    task: string,
    input: unknown,
    context: TaskContext,
  ) => unknown | Promise<unknown>,
  registry: Registry,
  host: { onCancellation?: (runId: string) => Promise<readonly string[]> } = {},
): Orchestrator {
  const definitionKey = (definition: { id: string; version: string }) =>
    canonical([definition.id, definition.version]);
  const workflows = new Map(
    registry.workflows.map((definition) => [
      definitionKey(definition),
      definition,
    ]),
  );
  const tasks = new Map(
    registry.tasks.map((definition) => [definitionKey(definition), definition]),
  );
  if (
    workflows.size !== registry.workflows.length ||
    tasks.size !== registry.tasks.length
  )
    throw new Error("Duplicate registered definition");
  const resolveWorkflow = (reference: { id: string; version: string }) => {
    const definition = workflows.get(definitionKey(reference));
    if (!definition)
      throw new StepFailure("invalid", "Unregistered workflow version");
    return definition;
  };
  type Run = {
    snapshot: RunSnapshot;
    fingerprint: string;
    completion: Deferred<Json>;
    abort: AbortController;
    children: Set<string>;
    childCount: number;
    steps: Map<string, { fingerprint: string; promise: Promise<unknown> }>;
    inputs: Map<
      string,
      { schema: z.ZodType; deferred: Deferred<unknown>; answer?: string }
    >;
  };
  const runs = new Map<string, Run>();
  const get = (id: string) => {
    const run = runs.get(id);
    if (!run) throw new Error("Unknown owned run");
    return run;
  };
  const engine: Orchestrator = {
    async start<I, O>(identity: string, reference: Workflow<I, O>, raw: I) {
      z.string().min(1).parse(identity);
      const workflow = resolveWorkflow(reference);
      const input = parse(workflow.input, raw);
      const runId = JSON.stringify([scope, identity]);
      const fingerprint = canonical([workflow.id, workflow.version, input]);
      const previous = runs.get(runId);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new Error("Conflicting start");
        return runId;
      }
      const run: Run = {
        snapshot: {
          runId,
          identity,
          workflow: workflow.id,
          version: workflow.version,
          status: "running",
          cancellationRequested: false,
          childRunIds: [],
          unresolvedEffects: [],
          stepsTruncated: false,
          pendingInputs: [],
          steps: [],
        },
        fingerprint,
        completion: deferred<Json>(),
        abort: new AbortController(),
        children: new Set(),
        childCount: 0,
        steps: new Map(),
        inputs: new Map(),
      };
      runs.set(runId, run);
      const step = <T>(
        key: string,
        fingerprint: string,
        execute: (entry: RunSnapshot["steps"][number]) => Promise<T>,
      ): Promise<T> => {
        z.string().min(1).parse(key);
        const stepId = JSON.stringify([runId, key]);
        const old = run.steps.get(stepId);
        if (old) {
          if (old.fingerprint !== fingerprint)
            return Promise.reject(new Error("Conflicting step"));
          return old.promise as Promise<T>;
        }
        const entry: RunSnapshot["steps"][number] = {
          stepId,
          attempts: 0,
          status: "running",
        };
        run.snapshot.steps.push(entry);
        const promise = Promise.resolve()
          .then(() => {
            if (run.abort.signal.aborted) throw new Error("Cancelled");
            return execute(entry);
          })
          .then(
            (value) => {
              entry.status = "completed";
              if (value !== undefined) entry.result = z.json().parse(value);
              return value;
            },
            (error) => {
              entry.status = "failed";
              throw error;
            },
          );
        void promise.catch(() => {});
        run.steps.set(stepId, { fingerprint, promise });
        return promise;
      };
      const context: WorkflowContext = {
        runId,
        task<I, O>(
          key: string,
          reference: Task<I, O>,
          raw: I,
          retry?: { maxAttempts: number },
        ) {
          const task = tasks.get(definitionKey(reference));
          if (!task)
            return Promise.reject(
              new StepFailure("invalid", "Unregistered task version"),
            );
          return step(
            key,
            canonical(["task", task.id, task.version, raw, retry ?? null]),
            async (entry) => {
              const max = z
                .number()
                .int()
                .min(1)
                .max(MAX_TASK_ATTEMPTS)
                .parse(retry?.maxAttempts ?? 1);
              const input = parse(task.input, raw);
              for (let attempt = 1; ; attempt++) {
                entry.attempts = attempt;
                try {
                  const result = await aborted(
                    Promise.resolve().then(() =>
                      handler(task.id, input, {
                        taskVersion: task.version,
                        runId,
                        stepId: entry.stepId,
                        attemptId: `${entry.stepId}:${attempt}`,
                        attempt,
                        signal: run.abort.signal,
                      }),
                    ),
                    run.abort.signal,
                  );
                  return parse(task.output, result) as O;
                } catch (error) {
                  if (
                    run.abort.signal.aborted ||
                    (error instanceof StepFailure && error.code === "unknown")
                  )
                    run.snapshot.unresolvedEffects.push(entry.stepId);
                  if (
                    !(error instanceof StepFailure) ||
                    error.code !== "retryable" ||
                    attempt >= max ||
                    run.abort.signal.aborted
                  )
                    throw error;
                }
              }
            },
          );
        },
        child<I, O>(key: string, child: Workflow<I, O>, input: I) {
          const registered = resolveWorkflow(child);
          return step(
            key,
            canonical(["child", child.id, child.version, input]),
            async (entry) => {
              entry.attempts = 1;
              if (run.childCount >= 100)
                throw new StepFailure("invalid", "Child limit is 100 per run");
              run.childCount++;
              const id = await engine.start(
                JSON.stringify([identity, "child", key]),
                child,
                input,
              );
              run.children.add(id);
              run.snapshot.childRunIds.push(id);
              try {
                return parse(
                  registered.output,
                  await engine.result(id, { signal: run.abort.signal }),
                ) as O;
              } catch (error) {
                await Promise.all(
                  [...run.children].map((id) => engine.cancel(id)),
                );
                throw error;
              }
            },
          );
        },
        input(key, schema) {
          return step(
            key,
            canonical(["input", z.toJSONSchema(schema)]),
            async (entry) => {
              const requestId = JSON.stringify([runId, key, "input"]);
              if (run.snapshot.pendingInputs.length >= 100)
                throw new StepFailure(
                  "invalid",
                  "Input wait limit is 100 per run",
                );
              const request = { schema, deferred: deferred<unknown>() };
              run.inputs.set(requestId, request);
              run.snapshot.pendingInputs.push(requestId);
              entry.attempts = 1;
              return parse(
                schema,
                await aborted(request.deferred.promise, run.abort.signal),
              );
            },
          );
        },
        sleep(key, milliseconds) {
          return step(
            key,
            canonical(["sleep", milliseconds]),
            async (entry) => {
              z.number().finite().min(0).parse(milliseconds);
              entry.attempts = 1;
              let timer: ReturnType<typeof setTimeout> | undefined;
              try {
                await aborted(
                  new Promise<void>((resolve) => {
                    timer = setTimeout(resolve, milliseconds);
                  }),
                  run.abort.signal,
                );
              } finally {
                clearTimeout(timer);
              }
            },
          );
        },
      };
      void Promise.resolve()
        .then(() => workflow.run(context, input))
        .then((output) => {
          const parsed = z.json().parse(parse(workflow.output, output));
          if (run.abort.signal.aborted) throw new Error("Cancelled");
          run.snapshot.status = "completed";
          run.snapshot.output = parsed;
          run.completion.resolve(parsed);
        })
        .catch(async (error: unknown) => {
          run.snapshot.failure =
            error instanceof Error ? error.message : "Workflow failed";
          run.abort.abort();
          await Promise.all([...run.children].map((id) => engine.cancel(id)));
          try {
            const unresolved = z
              .array(z.string().min(1))
              .parse((await host.onCancellation?.(runId)) ?? []);
            run.snapshot.unresolvedEffects = [
              ...new Set([...run.snapshot.unresolvedEffects, ...unresolved]),
            ];
          } catch {
            run.snapshot.unresolvedEffects.push(
              JSON.stringify([runId, "cancellation-cleanup-unknown"]),
            );
          }
          run.snapshot.pendingInputs = [];
          run.snapshot.status = run.snapshot.cancellationRequested
            ? "cancelled"
            : "failed";
          run.completion.reject(error);
        });
      return runId;
    },
    async get(id) {
      const snapshot = structuredClone(get(id).snapshot);
      snapshot.stepsTruncated = snapshot.steps.length > 100;
      snapshot.steps = snapshot.steps.slice(0, 100);
      return snapshot;
    },
    async getSteps(id, options = {}) {
      const offset =
        options.cursor === undefined
          ? 0
          : z.number().int().min(0).parse(Number(options.cursor));
      const limit = z
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(options.limit ?? 20);
      const all = get(id).snapshot.steps;
      return {
        steps: structuredClone(all.slice(offset, offset + limit)),
        ...(offset + limit < all.length
          ? { cursor: String(offset + limit) }
          : {}),
      };
    },
    async list(options = {}) {
      const offset =
        options.cursor === undefined
          ? 0
          : z.number().int().min(0).parse(Number(options.cursor));
      const limit = z
        .number()
        .int()
        .min(1)
        .max(100)
        .parse(options.limit ?? 20);
      const all = [...runs.values()];
      const page = all.slice(offset, offset + limit);
      return {
        runs: await Promise.all(page.map((r) => engine.get(r.snapshot.runId))),
        ...(offset + limit < all.length
          ? { cursor: String(offset + limit) }
          : {}),
      };
    },
    async result(id, options = {}) {
      const promise = get(id).completion.promise;
      return options.signal ? aborted(promise, options.signal) : promise;
    },
    async respond(id, requestId, value) {
      const run = get(id),
        request = run.inputs.get(requestId);
      if (!request) throw new Error("Unknown request");
      const answer = canonical(parse(request.schema, value));
      if (request.answer !== undefined) {
        if (request.answer !== answer) throw new Error("Conflicting response");
        return;
      }
      if (run.snapshot.status !== "running" || run.abort.signal.aborted)
        throw new Error("Stale request");
      request.answer = answer;
      run.snapshot.pendingInputs = run.snapshot.pendingInputs.filter(
        (id) => id !== requestId,
      );
      request.deferred.resolve(value);
    },
    async cancel(id) {
      const run = get(id);
      if (run.snapshot.status !== "running") return;
      run.snapshot.cancellationRequested = true;
      run.abort.abort();
      await Promise.all([...run.children].map((id) => engine.cancel(id)));
    },
  };
  return engine;
}
