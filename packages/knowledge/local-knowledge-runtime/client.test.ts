import { expect, test, afterEach } from "bun:test";
import { createDesktopAuthorization } from "../../../apps/desktop/host/authorization.js";
const hosts: ReturnType<typeof createDesktopAuthorization>[] = [];
const authority = () => {
  const host = createDesktopAuthorization();
  hosts.push(host);
  return host.knowledge();
};
afterEach(() => {
  for (const host of hosts.splice(0)) host.shutdown();
});
import type { RpcTransport } from "@drawloom/host";
import { createLocalKnowledgeClient } from "./src/client.js";
import { parseStoredLocalKnowledgeConfiguration } from "./src/protocol.js";

test("close waits for runtime shutdown before terminating its transport, once", async () => {
  const calls: string[] = [];
  let finish!: () => void;
  const rpc: RpcTransport = {
    async request(method) {
      calls.push(method);
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {};
    },
    notify() {},
    respond() {},
    subscribe() {
      return () => {};
    },
    async close() {
      calls.push("transport.close");
    },
  };
  const client = createLocalKnowledgeClient(rpc, authority());
  const closing = client.close();
  await Promise.resolve();
  expect(calls).toEqual(["knowledge.close"]);
  finish();
  await closing;
  await client.close();
  expect(calls).toEqual(["knowledge.close", "transport.close"]);
});

test("the bounded client never accepts a caller-supplied knowledge subject", async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  const rpc: RpcTransport = {
    async request(method, params) {
      calls.push({ method, params: (params as { params: unknown }).params });
      if (method === "knowledge.search")
        return {
          kind: "ok",
          mode: "lexical",
          semantic: { status: "unavailable" },
          items: [],
          bytes: 0,
        };
      if (method === "knowledge.get") return { kind: "ok" };
      return { kind: "failure", code: "unavailable" };
    },
    notify() {},
    respond() {},
    subscribe() {
      return () => {};
    },
    async close() {},
  };
  const client = createLocalKnowledgeClient(rpc, authority());
  expect(
    await client.search({ query: "local", mode: "best_available", limit: 5, maxBytes: 4096 }),
  ).toMatchObject({ kind: "ok", mode: "lexical" });
  expect(calls).toEqual([
    {
      method: "knowledge.search",
      params: { query: "local", mode: "best_available", limit: 5, maxBytes: 4096 },
    },
  ]);
  const ref = { type: "source" as const, origin: "public", id: "guide", revision: "r1" };
  expect(await client.get(ref)).toEqual({ kind: "ok" });
  expect(calls[1]).toEqual({ method: "knowledge.get", params: ref });
});

test("obsolete runtime cleanup sends the explicit consent command", async () => {
  const calls: Array<{ method: string; params: unknown }> = [];
  const status = {
    availability: "ready",
    message: "Text search ready",
    configuration: {
      embeddingModel: "qwen3-embedding-0.6b-gguf",
      assessmentModel: "gpt-5.6-terra",
      assessmentTimeoutMs: 300000,
      maxAutomaticStartsPerDay: 6,
      maxAutomaticMillisecondsPerDay: 1800000,
    },
    models: [
      {
        id: "qwen3-embedding-0.6b-gguf",
        title: "Qwen",
        licence: "Apache-2.0",
        source: "https://example.invalid",
        modelDirectory: "/model",
        runtimeDirectory: "/runtime",
        prerequisites: "Metal",
        runtime: { package: "llama.cpp", version: "rev", licence: "MIT" },
        weightsBytes: 1,
        runtimeBytes: 1,
        runtimeDownloadAvailable: false,
        state: "failed",
        message: "runtime_unavailable",
      },
    ],
    obsoleteRuntimePresent: false,
    indexing: "unavailable",
    maintenance: {
      state: "idle",
      pendingUpdates: 0,
      message: "idle",
      automaticStartsToday: 0,
      automaticMillisecondsToday: 0,
    },
  };
  const rpc: RpcTransport = {
    async request(method, params) {
      calls.push({ method, params: (params as { params: unknown }).params });
      return status;
    },
    notify() {},
    respond() {},
    subscribe() {
      return () => {};
    },
    async close() {},
  };
  await createLocalKnowledgeClient(rpc, authority()).cleanupObsoleteRuntime();
  expect(calls).toEqual([
    {
      method: "knowledge.cleanup-obsolete-runtime",
      params: { action: "cleanup_obsolete", consent: true },
    },
  ]);
});

test("saved MLX selection migrates narrowly while unknown model ids remain invalid", () => {
  const prior = {
    embeddingModel: "qwen3-embedding-0.6b-mlx",
    assessmentModel: "gpt-5.6-terra",
    assessmentTimeoutMs: 300000,
    maxAutomaticStartsPerDay: 6,
    maxAutomaticMillisecondsPerDay: 1800000,
  };
  expect(parseStoredLocalKnowledgeConfiguration(prior)).toEqual({
    ...prior,
    embeddingModel: "qwen3-embedding-0.6b-gguf",
    automaticContext: false,
    captureOutcomes: false,
    automaticCuration: false,
  });
  expect(() =>
    parseStoredLocalKnowledgeConfiguration({ ...prior, embeddingModel: "unknown" }),
  ).toThrow();
});

test("preparation validates bounds, excludes authority input and cancels late sidecar replies", async () => {
  const calls: string[] = [];
  let release!: () => void;
  const rpc: RpcTransport = {
    async request(method) {
      calls.push(method);
      if (method === "knowledge.prepare")
        await new Promise<void>((r) => {
          release = r;
        });
      return { kind: "empty", references: [], bytes: 0 };
    },
    notify(method) {
      calls.push(method);
    },
    respond() {},
    subscribe() {
      return () => {};
    },
    async close() {},
  };
  const client = createLocalKnowledgeClient(rpc, authority());
  const controller = new AbortController();
  const request = {
    request: "retained finding",
    binding: { executionId: "operation", conversationId: "fixed" },
    budget: { maxRecords: 8, maxBytes: 12288 },
    remainingMs: () => 5000,
    signal: controller.signal,
  };
  expect(() => client.prepare({ ...request, subject: { id: "forged" } } as never)).toThrow();
  const pending = client.prepare(request);
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  expect(await pending).toEqual({ kind: "cancelled", references: [], bytes: 0 });
  release();
  expect(calls).toEqual(["knowledge.prepare", "knowledge.cancel-operation"]);
});
