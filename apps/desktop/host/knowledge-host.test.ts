import { expect, test } from "bun:test";
import type { JsonStore, JsonValue } from "@drawloom/host";
import type { IntakeInput } from "@drawloom/knowledge";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import { createKnowledgeHost, type InstalledGitKnowledgeFeed, type KnowledgeService } from "./knowledge-host.js";

const status = () => ({ availability: "ready" as const, message: "Text search ready.", configuration: DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
  models: [
    { id: "qwen3-embedding-0.6b-gguf" as const, title: "Qwen GGUF", licence: "Apache-2.0 model and conversion", source: "https://example.invalid/model", modelDirectory: "/data/models/active/qwen", runtimeDirectory: "/data/models/runtime/mlx", prerequisites: "Apple Silicon with Metal", runtime: { package: "llama.cpp", version: "0.1.0", licence: "MIT" }, runtimeBytes: 1000, runtimeDownloadAvailable: true, weightsBytes: 10, state: "missing" as const },
  ], indexing: "unavailable" as const,
  maintenance: { state: "idle" as const, pendingUpdates: 0, message: "Idle", automaticStartsToday: 0, automaticMillisecondsToday: 0 } });

for (const outcome of ['uncertain', 'failed', 'unavailable'] as const) {
  test(`persisted pause and resume survive ${outcome} maintenance presentation`, async () => {
    const store = memoryStore();
    let dispatches = 0;
    const message = 'The earlier assessment outcome remains unresolved.';
    const options = { service: service([]), store, selectedProjectId: () => undefined,
      sourceForProject: async () => { throw Error('No source requested'); },
      nightloom: {
        async tick() { dispatches++; return { kind: 'idle' }; },
        async runNow() { dispatches++; return { kind: 'idle' }; },
        async pause() { await store.set('paused', true); },
        async resume() { await store.set('paused', false); },
        async status() { return { available: outcome !== 'unavailable', state: outcome, message,
          paused: (await store.get('paused')) === true, budget: { automaticStarts: 1, automaticReservedMilliseconds: 1000 } }; },
      },
    };
    const host = createKnowledgeHost(options);
    expect(await host.command({ action: 'status' })).toMatchObject({ maintenance: { paused: false, state: outcome, message } });
    expect(await host.command({ action: 'pause', paused: true })).toMatchObject({ maintenance: { paused: true, state: outcome, message } });
    const reopened = createKnowledgeHost(options);
    expect(await reopened.command({ action: 'status' })).toMatchObject({ maintenance: { paused: true, state: outcome, message } });
    expect(await reopened.command({ action: 'pause', paused: false })).toMatchObject({ maintenance: { paused: false, state: outcome, message } });
    expect(await store.get('paused')).toBe(false);
    expect(dispatches).toBe(0);
    await reopened.close();
  });
}
function memoryStore(log: string[] = []): JsonStore {
  const values = new Map<string, JsonValue>();
  return { async get(key) { return values.get(key); }, async set(key, value) { log.push(`save:${key}`); values.set(key, structuredClone(value)); } };
}
function service(log: string[], intake: (input: IntakeInput) => "accepted" | "failure" = () => "accepted"): KnowledgeService {
  return {
    async status() { return status(); }, async configure() { return status(); },
    async search() { return { kind: "ok", mode: "lexical", semantic: { status: "unavailable" }, items: [], bytes: 0 }; },
    async evidence() { return { kind: "ok", records: [], links: [], bytes: 0 }; },
    async export() { return { kind: "ok", records: [], links: [], bytes: 0 }; },
    async ingest(input) { log.push(`ingest:${input.operation}:${"record" in input ? input.record.ref.origin : input.ref.origin}`); return intake(input) === "accepted" ? { kind: "accepted", revision: "r1" } : { kind: "failure", code: "unavailable" }; },
    async download() { return status(); }, async cancelDownload() { return status(); }, async close() {},
  };
}

test("background source failure remains explicit until a successful poll confirms recovery", async () => {
  let unavailable = false;
  const host = createKnowledgeHost({ service: service([]), store: memoryStore(), selectedProjectId: () => "project-one",
    sourceForProject: async () => {
      if (unavailable) throw Error("private path must not leak");
      return { sourceId: "git:fixed", async changes() { return { token: "empty", updates: [] }; }, async acknowledge() {} };
    } });
  await host.command({ action: "source", enabled: true });
  unavailable = true;
  await expect(host.pollSource()).rejects.toThrow();
  expect(await host.command({ action: "status" })).toMatchObject({ source: { state: "unavailable" } });
  host.reportObservationFailure("unrelated"); host.reportObservationRecovery("unrelated");
  expect(await host.command({ action: "status" })).toMatchObject({ source: { state: "unavailable" } });
  expect(JSON.stringify(await host.command({ action: "status" }))).not.toContain("private path");
  unavailable = false; await host.pollSource();
  expect(await host.command({ action: "status" })).toMatchObject({ source: { state: "ready", message: "" } });
  unavailable = true; await expect(host.pollSource()).rejects.toThrow();
  await host.command({ action: "source", enabled: false });
  expect(await host.command({ action: "status" })).toMatchObject({ source: { state: "stopped" } });
  expect((await host.command({ action: "status" }) as { message: string }).message).not.toContain("Check the configured project");
});

test("disabling automatic references while assessment and preparation run invalidates late results without reconfiguring assessment", async () => {
  let configuration = { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, automaticContext: true };
  const backend = service([]); backend.status = async () => ({ ...status(), configuration });
  backend.configure = async next => { configuration = next; return { ...status(), configuration }; };
  let release!: () => void; let starts = 0, assessmentConfigurations = 0;
  backend.prepare = async () => { starts++; await new Promise<void>(r => { release = r; }); return { kind: "ready", text: "private retained material", references: [], bytes: 25 }; };
  const host = createKnowledgeHost({ service: backend, store: memoryStore(), selectedProjectId: () => undefined, sourceForProject: async () => { throw Error(); },
    nightloom: { async tick() { return { kind: "idle" }; }, async runNow() { return { kind: "idle" }; }, async pause() {}, async resume() {}, async status() { return { active: {}, paused: false, budget: { automaticStarts: 1, automaticReservedMilliseconds: 1000 } }; }, async configure() { assessmentConfigurations++; } },
  });
  const input = { request: "request", binding: { executionId: "op", conversationId: "fixed" }, budget: { maxRecords: 8, maxBytes: 12288 } };
  const pending = host.prepare(input, () => true);
  const deliverySignal = host.referenceSignal;
  while (!starts) await new Promise(r => setTimeout(r, 1));
  await host.command({ action: "configure", configuration: { ...configuration, automaticContext: false } });
  expect(deliverySignal.aborted).toBe(true);
  release();
  expect(await pending).toMatchObject({ summary: { kind: "cancelled", references: [] } });
  expect(await host.prepare(input, () => true)).toMatchObject({ summary: { kind: "disabled", references: [] } });
  expect(starts).toBe(1); expect(assessmentConfigurations).toBe(0);
  await expect(host.command({ action: "configure", configuration: { ...configuration, assessmentModel: "other" } })).rejects.toThrow("active knowledge assessment");
});

test("preparation bounds a hung service, rejects revoked grants and resends every execution", async () => {
  const backend = service([]); backend.status = async () => ({ ...status(), configuration: { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, automaticContext: true } });
  let permitted = true, mode: "revoke" | "ready" | "hang" = "revoke", calls = 0;
  backend.prepare = async () => { calls++; if (mode === "hang") return new Promise(() => {}); if (mode === "revoke") permitted = false; return { kind: "ready", text: "reference", bytes: 9, references: [] }; };
  const host = createKnowledgeHost({ service: backend, store: memoryStore(), selectedProjectId: () => undefined, sourceForProject: async () => { throw Error(); } });
  const request = { request: "message", binding: { executionId: "one", conversationId: "same" }, budget: { maxRecords: 8, maxBytes: 12288 } };
  expect(await host.prepare(request, () => permitted)).toEqual({ summary: { kind: "denied", references: [] } });
  mode = "ready"; permitted = true;
  expect(await host.prepare(request, () => permitted)).toMatchObject({ references: { text: "reference" } });
  expect(await host.prepare({ ...request, binding: { ...request.binding, executionId: "two" } }, () => permitted)).toMatchObject({ references: { text: "reference" } });
  expect(calls).toBe(3);
  mode = "hang";
  expect(await host.prepare(request, () => true)).toEqual({ summary: { kind: "timeout", references: [] } });
  await host.close();
});

test("obsolete runtime cleanup is explicit and never changes source collection", async () => {
  let cleanups = 0, sources = 0;
  const backend = service([]);
  backend.cleanupObsoleteRuntime = async () => { cleanups++; return status(); };
  const host = createKnowledgeHost({ service: backend, store: memoryStore(), selectedProjectId: () => "project-one",
    sourceForProject: async () => { sources++; throw Error("not requested"); } });
  await host.command({ action: "status" });
  expect(cleanups).toBe(0);
  await host.command({ action: "cleanup_obsolete", consent: true });
  expect(cleanups).toBe(1);
  expect(sources).toBe(0);
});

test("configured Git knowledge stays fixed to its captured project when UI selection changes", async () => {
  const log: string[] = [];
  let selected = "project-one";
  const requested: string[] = [];
  const feed = (projectId: string): InstalledGitKnowledgeFeed => ({ sourceId: `git:${projectId}`,
    async changes() { log.push(`changes:${projectId}`); return { token: `token:${projectId}`, updates: [] }; },
    async acknowledge(token) { log.push(`ack:${token}`); },
  });
  const host = createKnowledgeHost({ service: service(log), store: memoryStore(log), selectedProjectId: () => selected,
    sourceForProject: async (projectId) => { requested.push(projectId); return feed(projectId); } });
  await host.command({ action: "source", enabled: true });
  expect(await host.command({ action: "status" })).toMatchObject({ source: { projectId: "project-one", enabled: true } });
  selected = "project-two";
  await host.pollSource();
  expect(requested).toEqual(["project-one", "project-one"]);
  expect(log.filter((item) => item.startsWith("changes:"))).toEqual(["changes:project-one", "changes:project-one"]);
  await host.command({ action: "source", enabled: false });
  expect(await host.command({ action: "status" })).toMatchObject({ source: { projectId: "project-one", enabled: false } });
  await host.pollSource();
  expect(requested).toEqual(["project-one", "project-one"]);
});

test("changing model settings never implicitly enables repository collection", async () => {
  let sourceCalls = 0;
  const host = createKnowledgeHost({ service: service([]), store: memoryStore(), selectedProjectId: () => "project-one",
    sourceForProject: async () => { sourceCalls++; throw Error("should not be called"); } });
  await host.command({ action: "configure", configuration: DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION });
  expect(sourceCalls).toBe(0);
  expect(await host.command({ action: "status" })).not.toHaveProperty("source");
});

test("source setup warning is shown without a selected project, survives status refresh, and does not block search", async () => {
  const host = createKnowledgeHost({ service: service([]), store: memoryStore(), selectedProjectId: () => undefined,
    sourceForProject: async () => { throw Error("must not resolve a source without a project"); } });

  await expect(host.command({ action: "source", enabled: true })).rejects.toThrow("Choose a project containing the configured Git source.");
  const refreshed = await host.command({ action: "status" });
  expect((refreshed as { message: string }).message).toContain("Choose a project containing the configured Git source.");
  await expect(host.command({ action: "search", request: { query: "still usable", mode: "lexical", limit: 5, maxBytes: 4096 } }))
    .resolves.toMatchObject({ kind: "ok", mode: "lexical" });
});

test("missing installed Git feed retains one actionable warning after source setup", async () => {
  const host = createKnowledgeHost({ service: service([]), store: memoryStore(), selectedProjectId: () => "project-one",
    sourceForProject: async () => { throw Error("feed package missing at /private/tmp/untrusted-source"); } });

  await expect(host.command({ action: "source", enabled: true })).rejects.toThrow("Installed Git source is unavailable.");
  const result = await host.command({ action: "status" });
  const message = (result as { message: string }).message;
  expect(message).toContain("Installed Git source is unavailable.");
  expect(message.split("Installed Git source is unavailable.")).toHaveLength(2);
  expect(message).not.toContain('/private/tmp/untrusted-source');
  expect(await host.command({ action: "status" })).toMatchObject({ message: expect.stringContaining("Installed Git source is unavailable.") });
});

test('first-source presentation warning survives unrelated configuration and clears only on setup success or explicit stop', async () => {
  let projectId: string | undefined, feedReady = false;
  const host = createKnowledgeHost({ service: service([]), store: memoryStore(), selectedProjectId: () => projectId,
    sourceForProject: async () => {
      if (!feedReady) throw Error('private source detail');
      return { sourceId: 'public-fixture', changes: async () => ({ token: 'empty', updates: [] }), acknowledge: async () => {} };
    } });
  await expect(host.command({ action: 'source', enabled: true })).rejects.toThrow();
  expect(await host.command({ action: 'configure', configuration: DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION })).toMatchObject({ sourceWarning: 'Choose a project containing the configured Git source.' });
  projectId = 'project'; await expect(host.command({ action: 'source', enabled: true })).rejects.toThrow();
  const unavailable = await host.command({ action: 'status' });
  expect(unavailable).toMatchObject({ sourceWarning: 'Installed Git source is unavailable.' });
  expect(JSON.stringify(unavailable)).not.toContain('private source detail');
  feedReady = true;
  expect(await host.command({ action: 'source', enabled: true })).not.toHaveProperty('sourceWarning');
  projectId = undefined; await expect(host.command({ action: 'source', enabled: true })).rejects.toThrow();
  expect(await host.command({ action: 'source', enabled: false })).not.toHaveProperty('sourceWarning');
  await expect(host.command({ action: 'source', enabled: true })).rejects.toThrow();
  await host.pollSource();
  expect(await host.command({ action: 'status' })).toMatchObject({ sourceWarning: 'Choose a project containing the configured Git source.' });
});

test("Run now bypasses backlog timing while only an explicit override bypasses its budget", async () => {
  const calls: string[] = [];
  const nightloom = {
    async tick() { calls.push("tick"); return { kind: "idle" }; },
    async runNow(overrideBudget: boolean) { calls.push(`run:${overrideBudget}`); return { kind: "started" }; },
    async pause() {}, async resume() {},
    async status() { return { paused: false, budget: { automaticStarts: 0, automaticReservedMilliseconds: 0 } }; },
  };
  const host = createKnowledgeHost({ service: service([]), store: memoryStore(), selectedProjectId: () => undefined,
    sourceForProject: async () => { throw Error("not used"); }, nightloom });
  await host.command({ action: "run", overrideBudget: false });
  await host.command({ action: "run", overrideBudget: true });
  expect(calls).toEqual(["run:false", "run:true"]);
});

test("source ACK follows durable intake and an ack-pending receipt; failed intake is never acknowledged", async () => {
  const log: string[] = [];
  const updates = [{ id: "docs/guide.md", revision: "a".repeat(40), previous: null, kind: "source" as const, state: "active" as const, text: "Committed guide" }];
  let fail = false;
  const feed: InstalledGitKnowledgeFeed = { sourceId: "git:fixed", async changes() { log.push("changes"); return { token: "token-1", updates }; }, async acknowledge() { log.push("ack"); } };
  const host = createKnowledgeHost({ service: service(log, () => fail ? "failure" : "accepted"), store: memoryStore(log), selectedProjectId: () => "project-one", sourceForProject: async () => feed });
  await host.command({ action: "source", enabled: true });
  expect(log).toEqual(["save:knowledge-source", "changes", "ingest:upsert:git:fixed", "save:knowledge-source", "ack", "save:knowledge-source"]);
  fail = true; log.length = 0;
  await expect(host.pollSource()).rejects.toThrow("Source intake unavailable");
  expect(log).toEqual(["changes", "ingest:upsert:git:fixed"]);
});

test("restart retries only the same durable ACK and does not repoll or reingest", async () => {
  const log: string[] = [];
  const store = memoryStore(log);
  await store.set("knowledge-source", { projectId: "project-one", sourceId: "git:fixed", pendingAck: { token: "token-1" } });
  log.length = 0;
  const feed: InstalledGitKnowledgeFeed = { sourceId: "git:fixed", async changes() { log.push("changes"); return { token: "wrong", updates: [] }; }, async acknowledge(token) { log.push(`ack:${token}`); } };
  const host = createKnowledgeHost({ service: service(log), store, selectedProjectId: () => "project-two", sourceForProject: async () => feed });
  await host.pollSource();
  expect(log).toEqual(["ack:token-1", "save:knowledge-source"]);
});

test("enabling another source finishes the prior durable ACK before replacing its fixed identity", async () => {
  const log: string[] = [];
  const store = memoryStore(log);
  await store.set("knowledge-source", { projectId: "project-one", sourceId: "git:one", enabled: true, pendingAck: { token: "held-one" } });
  log.length = 0;
  const feeds: Record<string, InstalledGitKnowledgeFeed> = {
    "project-one": { sourceId: "git:one", async changes() { throw Error("must not repoll held batch"); }, async acknowledge(token) { log.push(`ack:one:${token}`); } },
    "project-two": { sourceId: "git:two", async changes() { log.push("changes:two"); return { token: "held-two", updates: [] }; }, async acknowledge(token) { log.push(`ack:two:${token}`); } },
  };
  const host = createKnowledgeHost({ service: service(log), store, selectedProjectId: () => "project-two", sourceForProject: async projectId => {
    log.push(`resolve:${projectId}`); return feeds[projectId]!;
  } });
  await host.command({ action: "source", enabled: true });
  expect(log).toEqual(["resolve:project-one", "ack:one:held-one", "save:knowledge-source", "resolve:project-two", "save:knowledge-source", "changes:two", "save:knowledge-source", "ack:two:held-two", "save:knowledge-source"]);
  expect(await host.command({ action: "status" })).toMatchObject({ source: { projectId: "project-two", enabled: true } });
});
