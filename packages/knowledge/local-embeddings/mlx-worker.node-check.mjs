import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { MlxEmbeddingWorker } from "./dist/index.js";

const readyRecord = `${JSON.stringify({
  kind: "ready",
  protocol: 1,
  modelRevision: "407ad2329cd30702720aafe83f74a1ba30fdfbca",
  dimensions: 1024,
  device: "gpu",
  versions: {
    "mlx-embeddings": "0.1.0",
    mlx: "0.32.2",
    transformers: "5.17.0",
    tokenizers: "0.23.2",
  },
})}\n`;

class FakeReadable extends EventEmitter {
  setEncoding() { return this; }
}

class FakeWritable extends EventEmitter {
  writes = [];
  write(value) { this.writes.push(value); return true; }
  end() {}
}

class FakeChild extends EventEmitter {
  stdout = new FakeReadable();
  stderr = new FakeReadable();
  stdin = new FakeWritable();
  signals = [];
  kill(signal) { this.signals.push(signal); return true; }
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail("condition was not reached");
}

function createWorker(children) {
  return new MlxEmbeddingWorker({
    root: "/controlled",
    model: "qwen3-embedding-0.6b-mlx",
    requestTimeoutMs: 500,
    shutdownTimeoutMs: 100,
    ready: async () => ({
      manifest: { revision: "407ad2329cd30702720aafe83f74a1ba30fdfbca" },
      directory: "/controlled/model",
      runtimeDirectory: "/controlled/runtime",
    }),
    spawn: () => {
      const child = new FakeChild();
      children.push(child);
      return child;
    },
  });
}

test("async stdin EPIPE rejects the request, reaps the child, and permits a healthy replacement", async () => {
  const children = [];
  const worker = createWorker(children);
  const failed = worker.embed({ role: "query", items: ["first"] });
  await waitFor(() => children.length === 1);
  children[0].stdout.emit("data", readyRecord);
  await waitFor(() => children[0].stdin.writes.length === 1);

  children[0].stdin.emit("error", Object.assign(new Error("broken pipe"), { code: "EPIPE" }));
  await assert.rejects(failed, { code: "worker_failed" });
  assert.deepEqual(children[0].signals, ["SIGTERM"]);

  const replacement = worker.embed({ role: "query", items: ["second"] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(children.length, 1, "replacement waits for the actual child exit");
  children[0].emit("exit", 1);
  await waitFor(() => children.length === 2);
  children[1].stdout.emit("data", readyRecord);
  await waitFor(() => children[1].stdin.writes.length === 1);
  children[1].stdout.emit("data", `${JSON.stringify({ kind: "result", id: "2", vectors: [Array(1024).fill(0)] })}\n`);
  await assert.doesNotReject(replacement);
  const closing = worker.close();
  children[1].stdin.emit("error", Object.assign(new Error("shutdown pipe"), { code: "EPIPE" }));
  children[1].emit("exit", 0);
  await assert.doesNotReject(closing);
});

test("stdout and stderr stream errors are controlled worker failures", async () => {
  for (const stream of ["stdout", "stderr"]) {
    const children = [];
    const worker = createWorker(children);
    const pending = worker.embed({ role: "query", items: [stream] });
    await waitFor(() => children.length === 1);
    children[0][stream].emit("error", new Error(`${stream} failed`));
    await assert.rejects(pending, { code: "worker_failed" });
    children[0].emit("exit", 1);
    await worker.close();
  }
});

test("a real failed spawn is terminal and permits a healthy retry and clean close", async () => {
  const children = [];
  let attempts = 0;
  const worker = new MlxEmbeddingWorker({
    root: "/controlled",
    model: "qwen3-embedding-0.6b-mlx",
    requestTimeoutMs: 500,
    shutdownTimeoutMs: 25,
    ready: async () => ({
      manifest: { revision: "407ad2329cd30702720aafe83f74a1ba30fdfbca" },
      directory: "/controlled/model",
      runtimeDirectory: "/controlled/runtime",
    }),
    spawn: (_command, _args, options) => {
      attempts++;
      if (attempts === 1) return spawn("/drawloom-definitely-missing-python", [], options);
      const child = new FakeChild();
      children.push(child);
      return child;
    },
  });

  await assert.rejects(worker.embed({ role: "query", items: ["failed spawn"] }), { code: "worker_failed" });
  const retry = worker.embed({ role: "query", items: ["healthy retry"] });
  await waitFor(() => children.length === 1);
  children[0].stdout.emit("data", readyRecord);
  await waitFor(() => children[0].stdin.writes.length === 1);
  children[0].stdout.emit("data", `${JSON.stringify({ kind: "result", id: "1", vectors: [Array(1024).fill(0)] })}\n`);
  await assert.doesNotReject(retry);
  const closing = worker.close();
  children[0].emit("exit", 0);
  await assert.doesNotReject(closing);
});
