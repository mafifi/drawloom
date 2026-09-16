export class DesktopClosedError extends Error {
  constructor(state: "closing" | "closed") {
    super(`Desktop is ${state}`);
    this.name = "DesktopClosedError";
  }
}

/** Admission and draining for the desktop application, not provider execution. */
export function createApplicationLifecycle() {
  let state: "running" | "closing" | "closed" = "running";
  let closing: Promise<void> | undefined;
  const admitted = new Set<Promise<unknown>>();
  function assertRunning() {
    if (state !== "running") throw new DesktopClosedError(state);
  }
  return {
    get state() {
      return state;
    },
    assertRunning,
    async run<T>(work: () => T | Promise<T>): Promise<T> {
      assertRunning();
      const pending = Promise.resolve().then(work);
      admitted.add(pending);
      try {
        return await pending;
      } finally {
        admitted.delete(pending);
      }
    },
    close(cancel: () => void, release: () => Promise<void>): Promise<void> {
      if (closing) return closing;
      state = "closing";
      const cancellationErrors: unknown[] = [];
      // Install the shared promise before callbacks can reenter close().
      closing = Promise.resolve().then(async () => {
        try {
          await Promise.allSettled([...admitted]);
          if (!cancellationErrors.length) await release();
          else {
            try {
              await release();
            } catch (error) {
              cancellationErrors.push(error);
            }
            throw new AggregateError(cancellationErrors, "Desktop shutdown failed");
          }
        } finally {
          state = "closed";
        }
      });
      try {
        cancel();
      } catch (error) {
        cancellationErrors.push(error);
      }
      return closing;
    },
  };
}

/** Bind internal calls to the raw application so already admitted commands can drain. */
export function guardDesktopApplication<T extends object>(
  app: T,
  lifecycle: ReturnType<typeof createApplicationLifecycle>,
  synchronous: readonly PropertyKey[] = ["admitKnowledgeCommand", "bindOAuthRedirect"],
): T {
  const children = new Map<PropertyKey, object>();
  return new Proxy(app, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if ((key === "assets" || key === "installations") && value && typeof value === "object") {
        let child = children.get(key);
        if (!child) {
          child = guardDesktopApplication(
            value,
            lifecycle,
            key === "installations" ? ["list", "pendingRestart"] : [],
          );
          children.set(key, child);
        }
        return child;
      }
      if (typeof value !== "function") return value;
      if (key === "close") return value.bind(target);
      if (synchronous.includes(key))
        return (...args: unknown[]) => {
          lifecycle.assertRunning();
          return Reflect.apply(value, target, args);
        };
      return (...args: unknown[]) => lifecycle.run(() => Reflect.apply(value, target, args));
    },
  });
}
