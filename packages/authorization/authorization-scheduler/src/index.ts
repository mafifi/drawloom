import {
  AuthZenRequestSchema,
  AuthorizationResultSchema,
  type Authorizer,
  type AuthorizationEvaluationOptions,
  type AuthorizationResult,
  type AuthorizationFailureCode,
  type AuthZenRequest,
} from "@drawloom/authorization";
export interface AuthorizationClock {
  now(): number;
  schedule(callback: () => void, milliseconds: number): () => void;
}
const systemClock: AuthorizationClock = {
  now: () => performance.now(),
  schedule(callback, milliseconds) {
    const timer = setTimeout(callback, milliseconds);
    return () => clearTimeout(timer);
  },
};
const failure = (code: AuthorizationFailureCode): AuthorizationResult => ({
  kind: "failure",
  code,
});
function budget(options: AuthorizationEvaluationOptions): number {
  try {
    const ms = options.remainingMs();
    return Number.isFinite(ms) && ms >= 0 ? ms : 0;
  } catch {
    return 0;
  }
}
function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
}
interface Job {
  request: AuthZenRequest;
  options: AuthorizationEvaluationOptions;
  deadline: number;
  controller: AbortController;
  done: boolean;
  settle(result: AuthorizationResult): void;
}
interface Pool {
  limit: number;
  waitingLimit: number;
  active: Set<Job>;
  queue: Job[];
}

/** One host owns one scheduler. Ports choose traffic class outside request facts.
 * Shutdown settles clients immediately; noncooperative evaluations remain observed
 * until settlement and cannot be forcibly terminated by an in-process scheduler. */
export function createAuthorizationScheduler(
  provider: Authorizer,
  clock = systemClock,
): {
  foreground: Authorizer;
  background: Authorizer;
  shutdown(): void;
} {
  let closed = false;
  const foreground: Pool = { limit: 12, waitingLimit: 24, active: new Set(), queue: [] };
  const background: Pool = { limit: 4, waitingLimit: 8, active: new Set(), queue: [] };
  const remaining = (job: Job) =>
    Math.max(0, Math.min(job.deadline - clock.now(), budget(job.options)));
  function finish(job: Job, result: AuthorizationResult) {
    if (job.done) return;
    job.done = true;
    job.settle(result);
    job.controller.abort();
  }
  function drain(pool: Pool) {
    while (!closed && pool.active.size < pool.limit && pool.queue.length) {
      const job = pool.queue.shift()!;
      if (job.done) continue;
      if (job.options.signal.aborted) {
        finish(job, failure("cancelled"));
        continue;
      }
      if (remaining(job) < 50) {
        finish(job, failure("budget_exhausted"));
        continue;
      }
      pool.active.add(job);
      let evaluation: Promise<AuthorizationResult>;
      try {
        evaluation = provider.authorize(job.request, {
          signal: job.controller.signal,
          remainingMs: () => remaining(job),
        });
      } catch {
        evaluation = Promise.resolve(failure("rejected"));
      }
      // Both handlers remain installed even when the client stops waiting.
      void Promise.resolve(evaluation)
        .then(
          (value: unknown) => {
            if (job.done) return;
            if (job.options.signal.aborted) {
              finish(job, failure("cancelled"));
              return;
            }
            if (remaining(job) <= 0) {
              finish(job, failure("budget_exhausted"));
              return;
            }
            let result: AuthorizationResult;
            try {
              const parsed = AuthorizationResultSchema.safeParse(value);
              result = parsed.success ? parsed.data : failure("malformed_result");
            } catch {
              result = failure("malformed_result");
            }
            // Unknown results may execute getters during validation. Timers cannot
            // run during that synchronous work; recheck before publishing a decision.
            if (job.done) return;
            if (job.options.signal.aborted) {
              finish(job, failure("cancelled"));
              return;
            }
            if (remaining(job) <= 0) {
              finish(job, failure("budget_exhausted"));
              return;
            }
            finish(job, result);
          },
          () =>
            finish(
              job,
              failure(
                job.options.signal.aborted
                  ? "cancelled"
                  : remaining(job) <= 0
                    ? "budget_exhausted"
                    : "rejected",
              ),
            ),
        )
        .then(() => {
          pool.active.delete(job);
          drain(pool);
        });
    }
  }
  function port(pool: Pool): Authorizer {
    return {
      authorize(request, options) {
        if (closed) return Promise.resolve(failure("shutdown"));
        if (options.signal.aborted) return Promise.resolve(failure("cancelled"));
        const admittedAt = clock.now();
        const ms = Math.min(2000, budget(options));
        if (ms < 50) return Promise.resolve(failure("budget_exhausted"));
        let snapshot: AuthZenRequest;
        try {
          snapshot = structuredClone(AuthZenRequestSchema.parse(request));
          freeze(snapshot);
        } catch {
          return Promise.resolve(failure("invalid_facts"));
        }
        if (pool.active.size >= pool.limit && pool.queue.length >= pool.waitingLimit)
          return Promise.resolve(failure("overflow"));
        return new Promise((resolve) => {
          let clearTimer = () => {};
          const cancel = () => finish(job, failure("cancelled"));
          const job: Job = {
            request: snapshot,
            options,
            deadline: admittedAt + ms,
            controller: new AbortController(),
            done: false,
            settle(result) {
              clearTimer();
              options.signal.removeEventListener("abort", cancel);
              const index = pool.queue.indexOf(job);
              if (index >= 0) pool.queue.splice(index, 1);
              resolve(result);
            },
          };
          pool.queue.push(job);
          options.signal.addEventListener("abort", cancel, { once: true });
          clearTimer = clock.schedule(
            () => finish(job, failure("budget_exhausted")),
            Math.max(0, job.deadline - clock.now()),
          );
          if (options.signal.aborted) cancel();
          drain(pool);
        });
      },
    };
  }
  return {
    foreground: port(foreground),
    background: port(background),
    shutdown() {
      closed = true;
      for (const pool of [foreground, background])
        for (const job of [...pool.queue, ...pool.active]) finish(job, failure("shutdown"));
    },
  };
}
