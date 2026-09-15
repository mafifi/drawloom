import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import { createDesktopApplication } from "./application.js";
import type { KnowledgeService } from "./knowledge-host.js";

test("normal product send prepares with fixed conversation, preserves user history and delivers reference content", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-preparation-")); const requests: unknown[] = []; let warmups = 0;
  const status = { availability: "ready" as const, message: "ready", configuration: { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, automaticContext: true },
    models: [{ id: "qwen3-embedding-0.6b-gguf" as const, title: "Local", licence: "Apache-2.0", source: "local", modelDirectory: "/model", runtimeDirectory: "/runtime", prerequisites: "Metal", runtime: { package: "llama.cpp", version: "revision", licence: "MIT" }, weightsBytes: 1, runtimeBytes: 1, runtimeDownloadAvailable: false, state: "missing" as const }], indexing: "unavailable" as const,
    maintenance: { state: "idle" as const, pendingUpdates: 0, message: "idle", automaticStartsToday: 0, automaticMillisecondsToday: 0 } };
  const service: KnowledgeService = { async status() { return status; }, async configure(c) { status.configuration = c; return status; },
    async warmup() { warmups++; return { kind: "unavailable" }; }, async prepare(r) { requests.push(r); return { kind: "ready", text: "Untrusted retained evidence", references: [], bytes: 27 }; },
    async search() { return { kind: "failure", code: "unavailable" }; }, async evidence() { return { kind: "failure", code: "unavailable" }; }, async export() { return { kind: "failure", code: "unavailable" }; }, async ingest() { return { kind: "accepted", revision: "r1" }; }, async download() { return status; }, async cancelDownload() { return status; }, async close() {} };
  const app = await createDesktopApplication(join(root, "data"), { knowledge: { service } });
  try {
    await mkdir(join(root, "working")); await app.command({ kind: "add_project", directory: join(root, "working") });
    const first = await app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" });
    for (const toolName of ["knowledge.search", "knowledge.evidence"]) await app.command({ kind: "operator", conversationId: first.selectedId, workbenchId: "text", command: { kind: "set_tool_grant", toolName, allowed: true } });
    await app.command({ kind: "send", conversationId: first.selectedId, text: "Original words", attachmentKeys: [], contextArtifactIds: [] });
    for (let i = 0; i < 100 && (await app.snapshot()).activeOperation; i++) await new Promise(r => setTimeout(r, 5));
    expect(requests).toHaveLength(1); expect(requests[0]).toMatchObject({ request: "Original words", binding: { conversationId: first.selectedId }, budget: { maxRecords: 8, maxBytes: 12288 } });
    expect(warmups).toBe(1);
    const snapshot = await app.snapshot();
    expect(JSON.stringify(snapshot.operator.artifacts)).toContain("Untrusted retained evidence");
    expect((await app.historyPage(first.selectedId)).entries.find(e => e.role === "user")).toMatchObject({ text: "Original words", preparation: { kind: "ready" } });
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
