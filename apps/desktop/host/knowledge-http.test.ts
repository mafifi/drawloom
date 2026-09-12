import { expect, test } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import type { KnowledgeService } from "./knowledge-host.js";
import { createDesktopApplication } from "./application.js";
import { serveDesktop } from "./server.js";

const baseStatus = {
  availability: "ready" as const,
  message: "Local text search is ready.",
  configuration: DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
  models: [
    { id: "qwen3-embedding-0.6b-mlx" as const, title: "Qwen MLX", licence: "Apache-2.0 model and conversion", source: "https://example.invalid/model", modelDirectory: "/data/models/active/qwen", runtimeDirectory: "/data/models/runtime/mlx", prerequisites: "Apple Silicon and uv", runtime: { package: "mlx-embeddings", version: "0.1.0", licence: "GPL-3.0-only" }, weightsBytes: 10, state: "missing" as const },
  ],
  indexing: "unavailable" as const,
  maintenance: { state: "idle" as const, pendingUpdates: 0, message: "Idle", automaticStartsToday: 0, automaticMillisecondsToday: 0 },
};

test("knowledge is exposed only through the authenticated, schema-checked application endpoint", async () => {
  const calls: unknown[] = [];
  const service = {
    async status() { return baseStatus; },
    async configure() { return baseStatus; },
    async search(request) {
      calls.push(request);
      return { kind: "ok" as const, mode: "lexical" as const, semantic: { status: "unavailable" as const }, items: [], bytes: 0 };
    },
    async evidence() { return { kind: "ok" as const, records: [], links: [], bytes: 0 }; },
    async export() { return { kind: "ok" as const, records: [], links: [], bytes: 0 }; },
    async ingest() { return { kind: "accepted" as const, revision: "r1" }; },
    async download() { return baseStatus; },
    async cancelDownload() { return baseStatus; },
    async close() {},
  } satisfies KnowledgeService;
  const app = await createDesktopApplication(await mkdtemp(join(tmpdir(), "drawloom-knowledge-http-")), { knowledge: { service } });
  const server = serveDesktop(app, resolve("apps/desktop/build"));
  try {
    expect((await fetch(server.origin + "/api/knowledge", { method: "POST" })).status).toBe(401);
    const boot = await fetch(server.url, { redirect: "manual" });
    const headers = { cookie: boot.headers.get("set-cookie")!.split(";")[0]!, origin: server.origin, "Content-Type": "application/json" };
    const response = await fetch(server.origin + "/api/knowledge", { method: "POST", headers,
      body: JSON.stringify({ action: "search", request: { query: "durable source", mode: "best_available", limit: 5, maxBytes: 4096 } }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ kind: "ok", mode: "lexical", semantic: { status: "unavailable" } });
    expect(calls).toEqual([{ query: "durable source", mode: "best_available", limit: 5, maxBytes: 4096 }]);
    const invalid = await fetch(server.origin + "/api/knowledge", { method: "POST", headers,
      body: JSON.stringify({ action: "search", subject: { id: "caller" }, request: { query: "x", mode: "best_available", limit: 5, maxBytes: 4096 } }) });
    expect(invalid.status).toBe(400);
    expect(calls).toHaveLength(1);
  } finally { await server.close(); }
});

test("knowledge tools use independent per-workbench grants", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-grants-"));
  const observations: unknown[] = [];
  const service = {
    async status() { return baseStatus; }, async configure() { return baseStatus; },
    async search() { return { kind: "ok" as const, mode: "lexical" as const, semantic: { status: "unavailable" as const }, items: [], bytes: 0 }; },
    async evidence() { return { kind: "ok" as const, records: [], links: [], bytes: 0 }; }, async export() { return { kind: "ok" as const, records: [], links: [], bytes: 0 }; },
    async ingest(value) { observations.push(value); return { kind: "accepted" as const, revision: "r1" }; }, async download() { return baseStatus; }, async cancelDownload() { return baseStatus; }, async close() {},
  } satisfies KnowledgeService;
  const app = await createDesktopApplication(join(root, "data"), { knowledge: { service } });
  try {
    const working = join(root, "working"); await mkdir(working);
    await app.command({ kind: "add_project", directory: working });
    await app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" });
    let snapshot = await app.snapshot();
    expect(snapshot.operator.grants.filter(grant => grant.toolName.startsWith("knowledge."))).toEqual([
      { toolName: "knowledge.search", allowed: false }, { toolName: "knowledge.evidence", allowed: false },
      { toolName: "knowledge.contribute", allowed: false },
    ]);
    await app.command({ kind: "operator", conversationId: snapshot.selectedId, workbenchId: "text",
      command: { kind: "set_tool_grant", toolName: "knowledge.search", allowed: true } });
    snapshot = await app.snapshot();
    expect(snapshot.operator.grants.find(grant => grant.toolName === "knowledge.search")?.allowed).toBe(true);
    expect(snapshot.operator.grants.find(grant => grant.toolName === "knowledge.evidence")?.allowed).toBe(false);
    expect(snapshot.operator.grants.find(grant => grant.toolName === "knowledge.contribute")?.allowed).toBe(false);
    await app.command({ kind: "operator", conversationId: snapshot.selectedId, workbenchId: "text",
      command: { kind: "set_tool_grant", toolName: "text.word_count", allowed: true } });
    await app.command({ kind: "send", conversationId: snapshot.selectedId, text: "private-payload-marker", attachmentKeys: [], contextArtifactIds: [] });
    for (let attempt = 0; attempt < 20 && observations.length === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    expect(observations).toHaveLength(1);
    expect(JSON.stringify(observations)).not.toContain("private-payload-marker");
  } finally { await app.close(); }
});
