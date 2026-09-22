const finished = (child) => child.exitCode !== null || child.signalCode !== null;

const exitResult = (child) => ({ code: child.exitCode, received: child.signalCode });

const waitForExit = (child, timeoutMs) => {
  if (finished(child)) return Promise.resolve(exitResult(child));
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      child.off("error", failed);
      child.off("exit", exited);
    };
    const failed = (error) => {
      cleanup();
      reject(error);
    };
    const exited = (code, received) => {
      cleanup();
      resolve({ code, received });
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`owned child did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.once("error", failed);
    child.once("exit", exited);
  });
};

export const createOwnedChildProcesses = ({ stopTimeoutMs = 5_000 } = {}) => {
  const owned = new Set();
  const track = (child) => {
    if (!finished(child)) {
      owned.add(child);
      child.once("exit", () => owned.delete(child));
    }
    return child;
  };
  const waitForReadiness = (child, detect, { timeoutMs, output }) => {
    if (finished(child))
      return Promise.reject(
        new Error(
          `owned child exited before readiness (code ${String(child.exitCode)}, signal ${String(child.signalCode)}): ${output()}`,
        ),
      );
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        child.stdout?.off("data", changed);
        child.off("error", failed);
        child.off("exit", exited);
      };
      const settle = (action, value) => {
        cleanup();
        action(value);
      };
      const changed = () => {
        try {
          const ready = detect();
          if (ready !== undefined) settle(resolve, ready);
        } catch (error) {
          settle(reject, error);
        }
      };
      const failed = (error) => settle(reject, error);
      const exited = (code, received) =>
        settle(
          reject,
          new Error(
            `owned child exited before readiness (code ${String(code)}, signal ${String(received)}): ${output()}`,
          ),
        );
      const timer = setTimeout(
        () => settle(reject, new Error(`did not start within ${timeoutMs}ms: ${output()}`)),
        timeoutMs,
      );
      child.stdout?.on("data", changed);
      child.once("error", failed);
      child.once("exit", exited);
      changed();
    });
  };
  const stop = async (child, signal = "SIGINT") => {
    if (finished(child)) return exitResult(child);
    let waiting = waitForExit(child, stopTimeoutMs);
    child.kill(signal);
    try {
      return await waiting;
    } catch (error) {
      if (signal === "SIGKILL" || finished(child)) {
        if (finished(child)) return exitResult(child);
        throw error;
      }
      waiting = waitForExit(child, stopTimeoutMs);
      child.kill("SIGKILL");
      return waiting;
    }
  };
  const reap = async () => {
    const results = await Promise.allSettled([...owned].map((child) => stop(child, "SIGKILL")));
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length)
      throw new AggregateError(
        failures.map((result) => result.reason),
        "could not reap every verifier-owned child",
      );
  };
  return { track, waitForReadiness, stop, reap };
};

const fetchAndConsumeWithDeadline = async (input, init, timeoutMs, fetcher, consume) => {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`request timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal;
  try {
    const response = await fetcher(input, { ...init, signal });
    return await consume(response);
  } finally {
    clearTimeout(timer);
  }
};

export const fetchWithDeadline = (
  input,
  init = {},
  timeoutMs = 10_000,
  fetcher = globalThis.fetch,
) => fetchAndConsumeWithDeadline(input, init, timeoutMs, fetcher, (response) => response);

export const fetchJsonWithDeadline = (
  input,
  init = {},
  timeoutMs = 10_000,
  fetcher = globalThis.fetch,
) =>
  fetchAndConsumeWithDeadline(input, init, timeoutMs, fetcher, async (response) => ({
    response,
    value: await response.json(),
  }));
