/** One observed, awaited shutdown sequence for the evaluation worker and owned lock. */
export async function forceEvaluationChildExit(child: {
  readonly pid: number | undefined;
  readonly exited: () => boolean;
  readonly kill: (signal: "SIGTERM" | "SIGKILL") => boolean;
  readonly waitForExit: (timeoutMs: number) => Promise<boolean>;
}) {
  if (child.exited()) return;
  if (child.pid === undefined) throw Error("Worker spawn failed with no child pid; idle unproven");
  if (!child.kill("SIGTERM") && !child.exited()) throw Error("Could not signal child with SIGTERM");
  if (child.exited() || (await child.waitForExit(5_000))) return;
  if (!child.kill("SIGKILL") && !child.exited()) throw Error("Could not signal child with SIGKILL");
  if (!child.exited() && !(await child.waitForExit(5_000)))
    throw Error("Child SIGKILL exit was not confirmed within 5 seconds");
}

export function createEvaluationShutdown(options: {
  readonly closeWorker: () => Promise<void>;
  readonly forceCloseWorker?: () => Promise<void>;
  readonly stopSegment: (
    status: "cancelled" | "failed" | "completed",
    progress: number,
    reason?: string,
  ) => Promise<void>;
  readonly releaseLock: () => Promise<void>;
  readonly segmentStarted?: () => boolean;
}) {
  const errors: unknown[] = [];
  let stopReason: string | undefined;
  let closePromise: Promise<void> | undefined;
  let idleConfirmed = false;
  const beginClose = () => {
    closePromise ??= options
      .closeWorker()
      .then(() => {
        idleConfirmed = true;
      })
      .catch(async (error) => {
        errors.push(error);
        if (options.forceCloseWorker)
          try {
            await options.forceCloseWorker();
            idleConfirmed = true;
          } catch (forceError) {
            errors.push(forceError);
          }
      });
  };
  return {
    requestStop(reason: string) {
      stopReason ??= reason;
      beginClose();
    },
    get reason() {
      return stopReason;
    },
    async finish(input: {
      readonly status: "cancelled" | "failed" | "completed";
      readonly progress: number;
      readonly reason?: string;
    }) {
      beginClose();
      await closePromise;
      const recovery = "worker idle is unproven; ownership lock retained; manual recovery required";
      if (!idleConfirmed) errors.push(Error(recovery));
      const status = !idleConfirmed ? "failed" : stopReason ? "cancelled" : input.status;
      const reason = !idleConfirmed ? recovery : (stopReason ?? input.reason);
      if (options.segmentStarted?.() ?? true)
        try {
          await options.stopSegment(status, input.progress, reason);
        } catch (error) {
          errors.push(error);
        }
      if (idleConfirmed)
        try {
          await options.releaseLock();
        } catch (error) {
          errors.push(error);
        }
      if (errors.length)
        throw new AggregateError(
          errors,
          errors
            .map((error) => (error instanceof Error ? error.message : String(error)))
            .join("; "),
        );
    },
  };
}
