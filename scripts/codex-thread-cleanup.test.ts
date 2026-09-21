import { expect, test } from "vitest";
import type { RpcTransport } from "@drawloom/host";
import { finishDisposableCodexThread } from "./codex-thread-cleanup.ts";
import { setTimeout as sleep } from "node:timers/promises";

function fixture(failArchive = false) {
  const calls: Array<{ method: string; params: unknown }> = [];
  let closes = 0;
  const transport: RpcTransport = {
    async request(method, params) {
      calls.push({ method, params });
      if (method === "initialize") return { userAgent: "fixture" };
      if (method === "thread/archive" && failArchive) throw Error("archive unavailable");
      if (method === "thread/archive") return {};
      throw Error(`Unexpected method ${method}`);
    },
    notify() {},
    respond() {},
    subscribe() {
      return () => {};
    },
    async close() {
      closes += 1;
    },
  };
  return { calls, closes: () => closes, connect: async () => transport };
}

test("archives only the exact disposable thread identity after preserving a successful result", async () => {
  const f = fixture();
  const primary = { kind: "completed" as const, receipt: "saved" };
  const finished = await finishDisposableCodexThread(primary, {
    threadId: "owned-thread",
    connect: f.connect,
  });
  expect(finished.primary).toBe(primary);
  expect(finished.cleanup).toEqual({ kind: "archived", threadId: "owned-thread" });
  expect(f.calls.filter((call) => call.method === "thread/archive")).toEqual([
    { method: "thread/archive", params: { threadId: "owned-thread" } },
  ]);
  expect(f.closes()).toBe(1);
});

test("preserves a primary failure while still archiving its exact owned thread", async () => {
  const f = fixture();
  const primary = new Error("proof failed");
  const finished = await finishDisposableCodexThread(primary, {
    threadId: "failed-proof-thread",
    connect: f.connect,
  });
  expect(finished.primary).toBe(primary);
  expect(finished.cleanup.kind).toBe("archived");
});

test("reports archive failure without replacing or mutating the saved primary receipt", async () => {
  const f = fixture(true);
  const primary = { kind: "completed", receipt: { output: "kept" } };
  const before = structuredClone(primary);
  const finished = await finishDisposableCodexThread(primary, {
    threadId: "owned-thread",
    connect: f.connect,
  });
  expect(finished.primary).toBe(primary);
  expect(primary).toEqual(before);
  expect(finished.cleanup).toEqual({
    kind: "failed",
    threadId: "owned-thread",
    reason: "archive unavailable",
  });
  expect(f.closes()).toBe(1);
});

test("does not connect or archive when the caller has no exact owned thread identity", async () => {
  let connected = false;
  const primary = { kind: "uncertain" };
  const finished = await finishDisposableCodexThread(primary, {
    connect: async () => {
      connected = true;
      throw Error("must not connect");
    },
  });
  expect(finished).toEqual({ primary, cleanup: { kind: "not_owned" } });
  expect(connected).toBe(false);
});

test("closes a cleanup transport that resolves after connection timeout", async () => {
  let resolve!: (transport: RpcTransport) => void;
  let closes = 0;
  const late = new Promise<RpcTransport>((done) => {
    resolve = done;
  });
  const finishedPromise = finishDisposableCodexThread(
    { kind: "completed" },
    { threadId: "owned-thread", connect: () => late, timeoutMs: 5 },
  );
  await sleep(10);
  resolve({
    request: async () => ({}),
    notify() {},
    respond() {},
    subscribe() {
      return () => {};
    },
    async close() {
      closes++;
    },
  });
  const finished = await finishedPromise;
  await sleep(1);
  expect(finished.cleanup.kind).toBe("failed");
  expect(closes).toBe(1);
});
