import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createLocalKnowledgeRuntime } from "./dist/runtime.js";
import { createManagedLocalKnowledgeClient } from "./dist/client.js";
import { KnownModelManifests } from "@drawloom/local-embeddings";

test("the Node runtime owns one global lexical store and reports missing model prerequisites", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-runtime-"));
  const runtime = await createLocalKnowledgeRuntime({ root, workingDirectory: root, connectCodex: async () => { throw Error("not used"); } });
  try {
    const initial = await runtime.status();
    assert.equal(initial.availability, "ready");
    assert.equal(initial.indexing, "unavailable");
    assert.deepEqual(initial.models.map((model) => [model.id, model.state]), [["qwen3-embedding-0.6b-mlx", "missing"]]);
    assert.match(initial.models[0]?.prerequisites ?? "", /Apple Silicon/);
    assert.equal(initial.models[0]?.runtime.licence, "GPL-3.0-only");
    const accepted = await runtime.ingest({ operation: "upsert", expectedRevision: null, record: {
      ref: { type: "source", origin: "public-test", id: "guide", revision: "r1" }, body: "Local knowledge text path", status: "active",
      confidence: { value: "observed" }, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
    }, links: [] });
    assert.equal(accepted.kind, "accepted");
    const found = await runtime.search({ query: "knowledge", mode: "best_available", limit: 10, maxBytes: 65_536 });
    assert.equal(found.kind, "ok");
    if (found.kind === "ok") {
      assert.equal(found.mode, "lexical");
      assert.equal(found.items[0]?.record.ref.id, "guide");
    }
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
});

test("the managed RPC process keeps SQLite and trusted identity outside the Bun host", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-sidecar-"));
  const client = createManagedLocalKnowledgeClient({ root, workingDirectory: root, nodePath: process.execPath,
    runtimeEntrypoint: join(import.meta.dirname, "dist", "sidecar.js") });
  try {
    const accepted = await client.ingest({ operation: "upsert", expectedRevision: null, record: {
      ref: { type: "source", origin: "managed-test", id: "guide", revision: "r1" }, body: "Managed child lexical boundary", status: "active",
      confidence: { value: "observed" }, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
    }, links: [] });
    assert.equal(accepted.kind, "accepted");
    const found = await client.search({ query: "boundary", mode: "best_available", limit: 5, maxBytes: 16_384 });
    assert.equal(found.kind, "ok");
    if (found.kind === "ok") assert.equal(found.items[0]?.record.ref.origin, "managed-test");
    const leased = await client.maintenancePending({ limit: 1, maxBytes: 16_384 });
    assert.equal(leased.kind, "ok");
    if (leased.kind === "ok") {
      assert.equal((await client.maintenanceRelease({ batch: leased.batch })).kind, "released");
      const reissued = await client.maintenancePending({ limit: 1, maxBytes: 16_384 });
      assert.equal(reissued.kind, "ok");
      if (reissued.kind === "ok") assert.deepEqual(reissued.units, leased.units);
    }
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
});

test("concurrent status checks share cold MLX readiness and close cannot publish a late worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-readiness-"));
  let releaseReady!: () => void;
  const ready = new Promise<void>(resolve => { releaseReady = resolve; });
  let readyCalls = 0, workers = 0, closedWorkers = 0;
  const runtime = await createLocalKnowledgeRuntime({ root, workingDirectory: root, connectCodex: async () => { throw Error("not used"); },
    createEmbeddingSetup: () => ({ async ready() { readyCalls++; await ready; return { manifest: KnownModelManifests["qwen3-embedding-0.6b-mlx"], directory: "/model", runtimeDirectory: "/runtime" }; }, status() { return { kind: "pending_consent" as const }; }, async install() { return { kind: "pending_consent" as const }; }, cancel() {} }),
    createEmbeddingWorker: () => { workers++; return { async embed() { return []; }, async close() { closedWorkers++; } }; },
  });
  try {
    const first = runtime.status(); const second = runtime.status();
    while (readyCalls === 0) await new Promise(resolve => setImmediate(resolve));
    assert.equal(readyCalls, 1);
    const closing = runtime.close();
    releaseReady();
    await Promise.allSettled([first, second, closing]);
    assert.equal(workers, 1);
    assert.equal(closedWorkers, 1);
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
});

test("download status reports progress against the current artifact rather than total model weights", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-progress-"));
  const runtime = await createLocalKnowledgeRuntime({ root, workingDirectory: root, connectCodex: async () => { throw Error("not used"); },
    createEmbeddingSetup: () => ({ async ready() { return undefined; }, status() { return { kind: "downloading" as const, path: "tokenizer.json", received: 2_097_152, expected: 8_388_608 }; }, async install() { return { kind: "pending_consent" as const }; }, cancel() {} }),
  });
  try {
    const model = (await runtime.status()).models[0];
    assert.equal(model?.message, "Downloading tokenizer.json");
    assert.equal(model?.receivedBytes, 2_097_152);
    assert.equal(model?.expectedBytes, 8_388_608);
    assert.ok((model?.weightsBytes ?? 0) > (model?.expectedBytes ?? 0));
  } finally { await runtime.close(); await rm(root, { recursive: true, force: true }); }
});
