import assert from "node:assert/strict";
import test from "node:test";
import { createEvaluationShutdown, forceEvaluationChildExit } from "./evaluation-shutdown.ts";

test("shutdown awaits close before receipt finalization and lock release", async () => {
  const events: string[] = [];
  const shutdown = createEvaluationShutdown({
    closeWorker: async () => {
      events.push("close");
    },
    stopSegment: async () => {
      events.push("receipt");
    },
    releaseLock: async () => {
      events.push("release");
    },
  });
  shutdown.requestStop("operator cancellation");
  await shutdown.finish({ status: "cancelled", progress: 12 });
  assert.deepEqual(events, ["close", "receipt", "release"]);
});

test("close and receipt rejection are observed while lock release is still awaited", async () => {
  const events: string[] = [];
  const shutdown = createEvaluationShutdown({
    closeWorker: async () => {
      events.push("close");
      throw Error("close rejected");
    },
    forceCloseWorker: async () => {
      events.push("force-close");
    },
    stopSegment: async () => {
      events.push("receipt");
      throw Error("receipt rejected");
    },
    releaseLock: async () => {
      await Promise.resolve();
      events.push("release");
    },
  });
  shutdown.requestStop("resource monitor failed");
  await assert.rejects(
    shutdown.finish({ status: "failed", progress: 5 }),
    /close rejected.*receipt rejected/s,
  );
  assert.deepEqual(events, ["close", "force-close", "receipt", "release"]);
});

test("startup failure releases the lock without inventing a receipt segment", async () => {
  const events: string[] = [];
  const shutdown = createEvaluationShutdown({
    closeWorker: async () => {
      events.push("close");
    },
    stopSegment: async () => {
      events.push("receipt");
    },
    releaseLock: async () => {
      events.push("release");
    },
    segmentStarted: () => false,
  });
  await shutdown.finish({ status: "failed", progress: 0, reason: "startup failure" });
  assert.deepEqual(events, ["close", "release"]);
});

test("a stop requested while close is pending cannot persist completed", async () => {
  let finishClose!: () => void;
  const closePending = new Promise<void>((resolve) => {
    finishClose = resolve;
  });
  const terminal: Array<{ status: string; reason?: string }> = [];
  const shutdown = createEvaluationShutdown({
    closeWorker: () => closePending,
    stopSegment: async (status, _progress, reason) => {
      terminal.push({ status, ...(reason ? { reason } : {}) });
    },
    releaseLock: async () => {},
  });
  const finishing = shutdown.finish({ status: "completed", progress: 100 });
  await Promise.resolve();
  shutdown.requestStop("operator cancellation");
  finishClose();
  await finishing;
  assert.deepEqual(terminal, [{ status: "cancelled", reason: "operator cancellation" }]);
});

test("forced child shutdown refuses absent pid, failed signals and unconfirmed SIGKILL", async () => {
  const base = {
    exited: () => false,
    kill: (_signal: "SIGTERM" | "SIGKILL") => true,
    waitForExit: async (_timeoutMs: number) => false,
  };
  await assert.rejects(forceEvaluationChildExit({ ...base, pid: undefined }), /no child pid/);
  await assert.rejects(
    forceEvaluationChildExit({ ...base, pid: 123, kill: () => false }),
    /Could not signal child/,
  );
  const signals: string[] = [];
  await assert.rejects(
    forceEvaluationChildExit({
      ...base,
      pid: 123,
      kill: (signal) => {
        signals.push(signal);
        return true;
      },
    }),
    /SIGKILL exit was not confirmed/,
  );
  assert.deepEqual(signals, ["SIGTERM", "SIGKILL"]);
});
