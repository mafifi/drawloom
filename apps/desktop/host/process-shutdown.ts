export function createProcessShutdown(options: {
  closeApplication: () => Promise<void>;
  shutdownTelemetry: () => Promise<void>;
  reportFailure: () => void;
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
      if (application[0]?.status === "rejected" || telemetry[0]?.status === "rejected") {
        options.reportFailure();
        return 1;
      }
      return 0;
    })());
}
