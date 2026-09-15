import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { KnownModelManifests, LlamaEmbeddingWorker } from "./dist/index.js";

class FakeReadable extends EventEmitter {
  setEncoding() {
    return this;
  }
}
class FakeChild extends EventEmitter {
  stdout = new FakeReadable();
  stderr = new FakeReadable();
  signals = [];
  kill(signal) {
    this.signals.push(signal);
    queueMicrotask(() => this.emit("exit", 0));
    return true;
  }
}
const response = (value) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const unit = [1, ...Array(1023).fill(0)];

test("Node worker tokenizes and validates a llama.cpp embedding", async () => {
  const child = new FakeChild();
  const worker = new LlamaEmbeddingWorker({
    root: "/controlled",
    model: "qwen3-embedding-0.6b-gguf",
    port: () => 54321,
    apiKey: () => "node-private-test-key",
    ready: async () => ({
      manifest: KnownModelManifests["qwen3-embedding-0.6b-gguf"],
      directory: "/model",
      runtimeDirectory: "/runtime",
    }),
    spawn: () => child,
    fetch: async (input) => {
      const path = new URL(String(input)).pathname;
      return path === "/tokenize"
        ? response({ tokens: [1] })
        : path === "/v1/models"
          ? response({ object: "list", data: [] })
          : response({
              object: "list",
              model: "qwen3-embedding-0.6b-gguf",
              data: [{ object: "embedding", index: 0, embedding: unit }],
            });
    },
  });
  try {
    assert.equal((await worker.embed({ role: "document", items: ["portable"] })).length, 1);
  } finally {
    await worker.close();
  }
  assert.deepEqual(child.signals, ["SIGTERM"]);
});
