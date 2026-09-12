import { expect, test } from "bun:test";
import type { JsonStore, JsonValue } from "@drawloom/host";
import type { IntakeInput } from "@drawloom/knowledge";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import { createKnowledgeHost, type InstalledGitKnowledgeFeed, type KnowledgeService } from "./knowledge-host.js";

const status = () => ({ availability: "ready" as const, message: "Text search ready.", configuration: DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
  models: [
    { id: "qwen3-embedding-0.6b-mlx" as const, title: "Qwen MLX", licence: "Apache-2.0 model and conversion", source: "https://example.invalid/model", modelDirectory: "/data/models/active/qwen", runtimeDirectory: "/data/models/runtime/mlx", prerequisites: "Apple Silicon and uv", runtime: { package: "mlx-embeddings", version: "0.1.0", licence: "GPL-3.0-only" }, weightsBytes: 10, state: "missing" as const },
  ], indexing: "unavailable" as const,
  maintenance: { state: "idle" as const, pendingUpdates: 0, message: "Idle", automaticStartsToday: 0, automaticMillisecondsToday: 0 } });
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

  const afterSource = await host.command({ action: "source", enabled: true });
  const afterSourceMessage = (afterSource as { message: string }).message;
  expect(afterSourceMessage).toContain("Choose a project containing the configured Git source.");
  expect(afterSourceMessage).toContain("No installed Git source is configured.");
  const refreshed = await host.command({ action: "status" });
  expect((refreshed as { message: string }).message).toContain("Choose a project containing the configured Git source.");
  await expect(host.command({ action: "search", request: { query: "still usable", mode: "lexical", limit: 5, maxBytes: 4096 } }))
    .resolves.toMatchObject({ kind: "ok", mode: "lexical" });
});

test("missing installed Git feed retains one actionable warning after source setup", async () => {
  const host = createKnowledgeHost({ service: service([]), store: memoryStore(), selectedProjectId: () => "project-one",
    sourceForProject: async () => { throw Error("feed package missing at /private/tmp/untrusted-source"); } });

  const result = await host.command({ action: "source", enabled: true });
  const message = (result as { message: string }).message;
  expect(message).toContain("Installed Git source is unavailable.");
  expect(message.split("Installed Git source is unavailable.")).toHaveLength(2);
  expect(await host.command({ action: "status" })).toMatchObject({ message: expect.stringContaining("Installed Git source is unavailable.") });
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
