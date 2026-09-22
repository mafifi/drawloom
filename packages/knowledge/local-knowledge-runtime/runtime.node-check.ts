import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createLocalKnowledgeRuntime as createRuntime } from "./dist/runtime.js";
import { createManagedLocalKnowledgeClient as createClient } from "./dist/client.js";
import { KnownModelManifests } from "@drawloom/local-embeddings";
import { createDesktopAuthorization } from "../../../apps/desktop/host/authorization.ts";
const hostOwners: ReturnType<typeof createDesktopAuthorization>[] = [];
const newHost = () => {
  const host = createDesktopAuthorization();
  hostOwners.push(host);
  return host;
};
afterEach(() => {
  for (const host of hostOwners.splice(0)) host.shutdown();
});
const createLocalKnowledgeRuntime = (
  options: Omit<Parameters<typeof createRuntime>[0], "authorizer">,
) => createRuntime({ ...options, authorizer: newHost().foreground });
const createManagedLocalKnowledgeClient = (
  options: Omit<Parameters<typeof createClient>[0], "authority"> &
    Partial<Pick<Parameters<typeof createClient>[0], "authority">>,
) => createClient({ ...options, authority: options.authority ?? newHost().knowledge() });

const syntheticRef = {
  type: "source" as const,
  origin: "synthetic",
  id: "private",
  revision: "r1",
};
const syntheticAssessment = {
  requestId: "synthetic-assessment",
  payloadFingerprint: "synthetic-payload",
  evidence: {
    roots: [{ unitId: "unit-1", root: syntheticRef }],
    complete: true,
    records: [
      {
        ref: syntheticRef,
        body: "synthetic assessment secret",
        status: "active" as const,
        confidence: {},
        provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
      },
    ],
    links: [],
  },
};

for (const interruption of ["cancelled", "denied"] as const)
  test(`spawned configure reconciles persisted destination after ${interruption} post-write status`, async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-configuration-authority-"));
    const controller = new AbortController();
    let interruptStatus = false;
    const destinations: unknown[] = [];
    const host = createDesktopAuthorization({
      authorize: async (request) => {
        if (interruptStatus && request.action.name === "knowledge.maintain") {
          if (interruption === "cancelled") controller.abort();
          else return { decision: false };
        }
        if (request.action.name === "assess") {
          destinations.push(request.context?.destination);
          return { decision: false };
        }
        return { decision: true };
      },
    });
    const authority = host.knowledge();
    const client = createClient({
      root,
      workingDirectory: root,
      authority,
      runtimeEntrypoint: join(import.meta.dirname, "test-support/assessment-sidecar.mjs"),
    });
    const old = authority.admit(
      {
        operationId: crypto.randomUUID(),
        method: "knowledge.assess",
        params: syntheticAssessment,
        background: true,
        assessmentDestination: "gpt-5.6-terra",
      },
      { signal: new AbortController().signal, remainingMs: () => 5000 },
    );
    try {
      const status = await client.status();
      interruptStatus = true;
      await assert.rejects(
        client.configure(
          { ...status.configuration, assessmentModel: "synthetic-next" },
          {
            signal: controller.signal,
            remainingMs: () => 5000,
          },
        ),
      );
      assert.equal(old.isCurrent(), false);
      interruptStatus = false;
      let result = await client.assess(syntheticAssessment);
      for (
        let attempt = 0;
        result.kind === "failure" && result.code === "unavailable" && attempt < 100;
        attempt++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        result = await client.assess(syntheticAssessment);
      }
      assert.equal(result.kind, "denied");
      assert.deepEqual(destinations, ["synthetic-next"]);
      await assert.rejects(readFile(join(root, "native-calls.jsonl")), { code: "ENOENT" });
      const refreshed = await client.status();
      const unchanged = authority.admit(
        {
          operationId: crypto.randomUUID(),
          method: "knowledge.assess",
          params: syntheticAssessment,
          background: true,
          assessmentDestination: "synthetic-next",
        },
        { signal: new AbortController().signal, remainingMs: () => 5000 },
      );
      try {
        await client.configure(refreshed.configuration);
        assert.equal(unchanged.isCurrent(), true);
      } finally {
        unchanged.dispose();
      }
    } finally {
      old.dispose();
      await client.close();
      host.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  });
test("spawned assessment rechecks host disclosure after preflight and cannot submit after revocation", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-assessment-authority-"));
  let checks = 0;
  const host = createDesktopAuthorization({
    authorize: async () => {
      if (++checks === 3) {
        host.invalidate();
        return { decision: true };
      }
      return { decision: true };
    },
  });
  const client = createClient({
    root,
    workingDirectory: root,
    authority: host.knowledge(),
    runtimeEntrypoint: join(import.meta.dirname, "test-support/assessment-sidecar.mjs"),
  });
  try {
    assert.deepEqual(await client.background.assess(syntheticAssessment), {
      kind: "failure",
      requestId: syntheticAssessment.requestId,
      payloadFingerprint: syntheticAssessment.payloadFingerprint,
      code: "cancelled",
    });
    const calls = await readFile(join(root, "native-calls.jsonl"), "utf8");
    assert.match(calls, /thread\/memoryMode\/set/);
    assert.doesNotMatch(calls, /turn\/start/);
  } finally {
    await client.close();
    host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

test("spawned assessment cancellation after submission keeps uncertainty and never resubmits", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-assessment-uncertain-"));
  await writeFile(join(root, "hang-submission"), "synthetic fixture");
  const host = createDesktopAuthorization();
  const client = createClient({
    root,
    workingDirectory: root,
    authority: host.knowledge(),
    runtimeEntrypoint: join(import.meta.dirname, "test-support/assessment-sidecar.mjs"),
  });
  try {
    const controller = new AbortController();
    const pending = client.background.assess(syntheticAssessment, {
      signal: controller.signal,
      remainingMs: () => 5000,
    });
    let calls = "";
    const deadline = Date.now() + 3000;
    while (!calls.includes("turn/start") && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      calls = await readFile(join(root, "native-calls.jsonl"), "utf8").catch(() => "");
    }
    assert.match(calls, /turn\/start/);
    controller.abort();
    assert.deepEqual(await pending, {
      kind: "uncertain",
      requestId: syntheticAssessment.requestId,
      payloadFingerprint: syntheticAssessment.payloadFingerprint,
    });
    assert.equal((await client.background.assess(syntheticAssessment)).kind, "uncertain");
    calls = await readFile(join(root, "native-calls.jsonl"), "utf8");
    assert.equal(calls.split('"turn/start"').length - 1, 1);
  } finally {
    await client.close();
    host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

for (const code of ["malformed_result", "rejected", "budget_exhausted"] as const) {
  test(`spawned worker preserves ${code} without granting disclosure`, async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-policy-failure-"));
    const host = createDesktopAuthorization({
      authorize: async () => {
        if (code === "malformed_result") return {} as never;
        if (code === "rejected") throw Error("synthetic failure");
        return new Promise(() => {});
      },
    });
    const client = createClient({ root, workingDirectory: root, authority: host.knowledge() });
    try {
      const deadline = performance.now() + 500;
      assert.deepEqual(
        await client.search(
          { query: "synthetic", mode: "lexical", limit: 10, maxBytes: 10000 },
          { signal: new AbortController().signal, remainingMs: () => deadline - performance.now() },
        ),
        { kind: "failure", code },
      );
    } finally {
      await client.close();
      host.shutdown();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("spawned foreground context discards references when disclosure is revoked while awaiting policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-context-revoke-"));
  const host = createDesktopAuthorization({
    authorize: async (request) => {
      if (request.action.name === "knowledge.disclose") host.invalidate("fixed-execution");
      return { decision: true };
    },
  });
  const client = createClient({ root, workingDirectory: root, authority: host.knowledge() });
  try {
    await client.ingest({
      operation: "upsert",
      expectedRevision: null,
      record: syntheticAssessment.evidence.records[0]!,
      links: [],
    });
    const status = await client.status();
    await client.configure({ ...status.configuration, automaticContext: true });
    assert.deepEqual(
      await client.prepare({
        request: "synthetic",
        binding: { executionId: "fixed-execution", conversationId: "fixed-conversation" },
        budget: { maxRecords: 8, maxBytes: 12288 },
        signal: new AbortController().signal,
        remainingMs: () => 5000,
      }),
      { kind: "cancelled", references: [], bytes: 0 },
    );
  } finally {
    await client.close();
    host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

test("spawned mixed reads retain host foreground and background capacities through shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-mixed-authority-"));
  let entered = 0,
    asked = 0,
    allAsked!: () => void;
  const ready = new Promise<void>((resolve) => {
    allAsked = resolve;
  });
  const host = createDesktopAuthorization({
    authorize: async () => {
      entered++;
      return new Promise(() => {});
    },
  });
  const authority = host.knowledge();
  const client = createClient({
    root,
    workingDirectory: root,
    authority: {
      ...authority,
      admit(request, operation) {
        const lease = authority.admit(request, operation);
        return {
          ...lease,
          authorizer: {
            authorize(facts, evaluation) {
              if (++asked === 48) allAsked();
              return lease.authorizer.authorize(facts, evaluation);
            },
          },
        };
      },
    },
  });
  try {
    const query = { query: "synthetic", mode: "lexical" as const, limit: 10, maxBytes: 10000 };
    const pending = [
      ...Array.from({ length: 36 }, () => client.search(query)),
      ...Array.from({ length: 12 }, () => client.background.search(query)),
    ];
    await ready;
    assert.equal(entered, 16);
    assert.deepEqual(await client.search(query), { kind: "failure", code: "overflow" });
    assert.deepEqual(await client.background.search(query), { kind: "failure", code: "overflow" });
    host.shutdown();
    for (const result of await Promise.all(pending))
      assert.deepEqual(result, { kind: "failure", code: "shutdown" });
  } finally {
    await client.close();
    host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

test("death of the exact owned worker settles a read waiting on host policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-dead-worker-"));
  let entered!: () => void;
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const host = createDesktopAuthorization({
    authorize: async () => {
      entered();
      return new Promise(() => {});
    },
  });
  const client = createClient({ root, workingDirectory: root, authority: host.knowledge() });
  try {
    const pending = client.search({
      query: "synthetic",
      mode: "lexical",
      limit: 10,
      maxBytes: 10000,
    });
    await ready;
    const owned = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.includes("sidecar.js") && line.includes(JSON.stringify(root)));
    assert.equal(owned.length, 1);
    const pid = Number(owned[0]!.trim().split(/\s+/, 1)[0]);
    process.kill(pid, "SIGKILL");
    assert.deepEqual(await pending, { kind: "failure", code: "unavailable" });
  } finally {
    await client.close().catch(() => undefined);
    host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

test("spawned worker uses the host replacement and never returns a partially authorized page", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-host-policy-"));
  let deny = false;
  let failRecord = false;
  const host = createDesktopAuthorization({
    authorize: async (request) => {
      if (failRecord && request.resource.type === "knowledge-record")
        return { kind: "failure", code: "unavailable" };
      return { decision: !deny };
    },
  });
  const client = createManagedLocalKnowledgeClient({
    root,
    workingDirectory: root,
    authority: host.knowledge(),
  });
  try {
    assert.equal(
      (
        await client.ingest({
          operation: "upsert",
          expectedRevision: null,
          record: {
            ref: { type: "source", origin: "synthetic", id: "private", revision: "r1" },
            body: "synthetic confidential phrase",
            status: "active",
            confidence: { value: "observed" },
            provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
          },
          links: [],
        })
      ).kind,
      "accepted",
    );
    deny = true;
    const query = { query: "synthetic", mode: "lexical" as const, limit: 10, maxBytes: 10000 };
    assert.deepEqual(await client.search(query), { kind: "denied" });
    deny = false;
    failRecord = true;
    assert.deepEqual(await client.search(query), { kind: "failure", code: "unavailable" });
  } finally {
    await client.close();
    host.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});

test("the Node runtime owns one global lexical store and reports missing model prerequisites", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-runtime-"));
  const runtime = await createLocalKnowledgeRuntime({
    root,
    workingDirectory: root,
    connectCodex: async () => {
      throw Error("not used");
    },
  });
  try {
    const initial = await runtime.status();
    assert.equal(initial.availability, "ready");
    assert.equal(initial.indexing, "unavailable");
    assert.deepEqual(
      initial.models.map((model) => [model.id, model.state]),
      [["qwen3-embedding-0.6b-gguf", "failed"]],
    );
    assert.match(initial.models[0]?.prerequisites ?? "", /Apple Silicon/);
    assert.equal(initial.models[0]?.runtime.licence, "MIT");
    assert.equal(initial.models[0]?.message, "runtime_unavailable");
    assert.equal(initial.obsoleteRuntimePresent, false);
    const accepted = await runtime.ingest({
      operation: "upsert",
      expectedRevision: null,
      record: {
        ref: { type: "source", origin: "public-test", id: "guide", revision: "r1" },
        body: "Local knowledge text path",
        status: "active",
        confidence: { value: "observed" },
        provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
      },
      links: [],
    });
    assert.equal(accepted.kind, "accepted");
    assert.deepEqual(await runtime.warmup(), { kind: "unavailable" });
    const preparation = {
      request: "knowledge",
      binding: { executionId: "execution", conversationId: "fixed-conversation" },
      budget: { maxRecords: 8, maxBytes: 12288 },
      remainingMs: () => 5000,
      signal: new AbortController().signal,
    };
    // The trusted host now owns effective consent; the runtime retains its authorizer.
    // Legacy preference storage cannot override a separately admitted preparation.
    assert.equal((await runtime.prepare(preparation)).kind, "ready");
    const prepared = await runtime.prepare(preparation);
    assert.equal(prepared.kind, "ready");
    if (prepared.kind === "ready") {
      assert.equal(prepared.references[0]?.ref.id, "guide");
      assert.match(prepared.text, /Local knowledge text path/);
    }
    const found = await runtime.search({
      query: "knowledge",
      mode: "best_available",
      limit: 10,
      maxBytes: 65_536,
    });
    assert.equal(found.kind, "ok");
    if (found.kind === "ok") {
      assert.equal(found.mode, "lexical");
      assert.equal(found.items[0]?.record.ref.id, "guide");
    }
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("the managed RPC process keeps SQLite and trusted identity outside the desktop host", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-sidecar-"));
  const client = createManagedLocalKnowledgeClient({
    root,
    workingDirectory: root,
    nodePath: process.execPath,
    runtimeEntrypoint: join(import.meta.dirname, "dist", "sidecar.js"),
  });
  try {
    const accepted = await client.ingest({
      operation: "upsert",
      expectedRevision: null,
      record: {
        ref: { type: "source", origin: "managed-test", id: "guide", revision: "r1" },
        body: "Managed child lexical boundary",
        status: "active",
        confidence: { value: "observed" },
        provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
      },
      links: [],
    });
    assert.equal(accepted.kind, "accepted");
    const initial = await client.status();
    await client.configure({ ...initial.configuration, automaticContext: true });
    const prepared = await client.prepare({
      request: "boundary",
      binding: { executionId: "sidecar-operation", conversationId: "fixed" },
      budget: { maxRecords: 8, maxBytes: 12288 },
      remainingMs: () => 5000,
      signal: new AbortController().signal,
    });
    assert.equal(prepared.kind, "ready");
    if (prepared.kind === "ready") assert.equal(prepared.references[0]?.ref.origin, "managed-test");
    const found = await client.search({
      query: "boundary",
      mode: "best_available",
      limit: 5,
      maxBytes: 16_384,
    });
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
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("concurrent status checks share cold GGUF readiness and close cannot publish a late worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-readiness-"));
  let releaseReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    releaseReady = resolve;
  });
  let readyCalls = 0,
    workers = 0,
    closedWorkers = 0;
  const runtime = await createLocalKnowledgeRuntime({
    root,
    workingDirectory: root,
    connectCodex: async () => {
      throw Error("not used");
    },
    createEmbeddingSetup: () => ({
      async ready() {
        readyCalls++;
        await ready;
        return {
          manifest: KnownModelManifests["qwen3-embedding-0.6b-gguf"],
          directory: "/model",
          runtimeDirectory: "/runtime",
        };
      },
      status() {
        return { kind: "pending_consent" as const };
      },
      async install() {
        return { kind: "pending_consent" as const };
      },
      cancel() {},
      async obsoleteRuntimePresent() {
        return false;
      },
      async cleanupObsoleteMlxRuntime() {
        return { kind: "nothing_to_remove" as const };
      },
    }),
    createEmbeddingWorker: () => {
      workers++;
      return {
        async embed() {
          return [];
        },
        async close() {
          closedWorkers++;
        },
      };
    },
  });
  try {
    const first = runtime.status();
    const second = runtime.status();
    while (readyCalls === 0) await new Promise((resolve) => setImmediate(resolve));
    assert.equal(readyCalls, 1);
    const closing = runtime.close();
    releaseReady();
    await Promise.allSettled([first, second, closing]);
    assert.equal(workers, 1);
    assert.equal(closedWorkers, 1);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("the production worker receives readiness from the selected setup", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-selected-setup-"));
  const selectedReady = {
    manifest: KnownModelManifests["qwen3-embedding-0.6b-gguf"],
    directory: "/trusted/model",
    runtimeDirectory: "/trusted/runtime",
  };
  let workerReady: (() => Promise<typeof selectedReady | undefined>) | undefined;
  const runtime = await createLocalKnowledgeRuntime({
    root,
    workingDirectory: root,
    connectCodex: async () => {
      throw Error("not used");
    },
    createEmbeddingSetup: () => ({
      async ready() {
        return selectedReady;
      },
      status() {
        return {
          kind: "ready" as const,
          directory: selectedReady.directory,
          runtimeDirectory: selectedReady.runtimeDirectory,
        };
      },
      async install() {
        return { kind: "pending_consent" as const };
      },
      cancel() {},
      async obsoleteRuntimePresent() {
        return false;
      },
      async cleanupObsoleteMlxRuntime() {
        return { kind: "nothing_to_remove" as const };
      },
    }),
    createEmbeddingWorker: (_modelRoot, _model, ready) => {
      workerReady = ready;
      return {
        async embed() {
          return [];
        },
        async close() {},
      };
    },
  });
  try {
    await runtime.status();
    assert.equal(typeof workerReady, "function");
    assert.strictEqual(await workerReady?.(), selectedReady);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("download status reports progress against the current artifact rather than total model weights", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-progress-"));
  const runtime = await createLocalKnowledgeRuntime({
    root,
    workingDirectory: root,
    connectCodex: async () => {
      throw Error("not used");
    },
    createEmbeddingSetup: () => ({
      async ready() {
        return undefined;
      },
      status() {
        return {
          kind: "downloading" as const,
          path: "runtime.tar.gz",
          received: 2_097_152,
          expected: 8_388_608,
        };
      },
      async install() {
        return { kind: "pending_consent" as const };
      },
      cancel() {},
      async obsoleteRuntimePresent() {
        return false;
      },
      async cleanupObsoleteMlxRuntime() {
        return { kind: "nothing_to_remove" as const };
      },
    }),
  });
  try {
    const model = (await runtime.status()).models[0];
    assert.equal(model?.message, "Downloading runtime.tar.gz");
    assert.equal(model?.receivedBytes, 2_097_152);
    assert.equal(model?.expectedBytes, 8_388_608);
    assert.ok((model?.weightsBytes ?? 0) > (model?.expectedBytes ?? 0));
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("obsolete runtime cleanup requires the explicit runtime method and returns refreshed status", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-cleanup-"));
  let cleaned = 0;
  const runtime = await createLocalKnowledgeRuntime({
    root,
    workingDirectory: root,
    connectCodex: async () => {
      throw Error("not used");
    },
    createEmbeddingSetup: () => ({
      async ready() {
        return undefined;
      },
      status() {
        return { kind: "pending_consent" as const };
      },
      async install() {
        return { kind: "pending_consent" as const };
      },
      cancel() {},
      async obsoleteRuntimePresent() {
        return cleaned === 0;
      },
      async cleanupObsoleteMlxRuntime() {
        cleaned++;
        return { kind: "removed" as const, paths: ["owned"] };
      },
    }),
  });
  try {
    assert.equal((await runtime.status()).obsoleteRuntimePresent, true);
    assert.equal((await runtime.cleanupObsoleteRuntime()).obsoleteRuntimePresent, false);
    assert.equal(cleaned, 1);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("obsolete runtime cleanup propagates a safety refusal", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-cleanup-refused-"));
  const runtime = await createLocalKnowledgeRuntime({
    root,
    workingDirectory: root,
    connectCodex: async () => {
      throw Error("not used");
    },
    createEmbeddingSetup: () => ({
      async ready() {
        return undefined;
      },
      status() {
        return { kind: "pending_consent" as const };
      },
      async install() {
        return { kind: "pending_consent" as const };
      },
      cancel() {},
      async obsoleteRuntimePresent() {
        return true;
      },
      async cleanupObsoleteMlxRuntime() {
        return { kind: "refused" as const, code: "unsafe_target" as const };
      },
    }),
  });
  try {
    await assert.rejects(runtime.cleanupObsoleteRuntime(), /unsafe_target/);
  } finally {
    await runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});
