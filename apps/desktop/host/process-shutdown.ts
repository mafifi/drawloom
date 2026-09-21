export function createProcessShutdown(options: {
  closeApplication: () => Promise<void>;
  shutdownTelemetry: () => Promise<void>;
  /** Receives every rejection so the cause can be reported, not just the fact. */
  reportFailure: (reasons: readonly unknown[]) => void;
}) {
  let stopping: Promise<number> | undefined;
  return () =>
    (stopping ??= (async () => {
      const application = await Promise.allSettled([
        Promise.resolve().then(options.closeApplication),
      ]);
      const telemetry = await Promise.allSettled([
        Promise.resolve().then(options.shutdownTelemetry),
      ]);
      const reasons = [...application, ...telemetry]
        .filter((settled) => settled.status === "rejected")
        .map((settled) => (settled as PromiseRejectedResult).reason);
      if (reasons.length > 0) {
        options.reportFailure(reasons);
        return 1;
      }
      return 0;
    })());
}
