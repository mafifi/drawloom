import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManagedLocalKnowledgeClient } from "@drawloom/local-knowledge-runtime";
import {
  SearchResultSchema,
  type KnowledgeAssessment,
  type KnowledgeMaintenance,
  type KnowledgeRetrieval,
  type RecordRef,
  type TrustedKnowledgeSubject,
} from "@drawloom/knowledge";
import { createNightloomTaskHandlers, type NightloomAssessmentReceipt } from "@drawloom/nightloom";
import type { TaskContext } from "@drawloom/orchestration";
import { createDesktopApplication } from "./application.js";

test("two project conversations capture into the real shared SQLite service and remain readable after host restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-two-projects-"));
  const data = join(root, "data");
  const open = () => createDesktopApplication(data, { knowledge: { service: createManagedLocalKnowledgeClient({ root: join(data, "knowledge"), workingDirectory: root }) } });
  let app = await open();
  const search = async () => SearchResultSchema.parse(await app.knowledgeCommand({ action: "search", request: {
    query: "completed", mode: "best_available", limit: 20, maxBytes: 65_536,
  } }));
  const waitForCapturedCount = async (count: number) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const found = await search();
      if (found.kind === "ok" && found.items.length === count) return found;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw Error(`Expected ${count} durable observations`);
  };
  try {
    const ids: string[] = [];
    for (const name of ["north", "south"]) {
      const directory = join(root, name); await mkdir(directory);
      await app.command({ kind: "add_project", directory });
      await app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" });
      const snapshot = await app.snapshot(); ids.push(snapshot.selectedId!);
      await app.command({ kind: "operator", conversationId: snapshot.selectedId, workbenchId: "text",
        command: { kind: "set_tool_grant", toolName: "text.word_count", allowed: true } });
      await app.command({ kind: "send", conversationId: snapshot.selectedId, text: `DO-NOT-CAPTURE-${name}`, attachmentKeys: [], contextArtifactIds: [] });
      await waitForCapturedCount(ids.length);
    }
    expect(new Set(ids).size).toBe(2);
    const before = await waitForCapturedCount(2);
    expect(JSON.stringify(before)).not.toContain("DO-NOT-CAPTURE");
    if (before.kind !== "ok") throw Error("Search unavailable");
    const references = before.items.map(item => item.record.ref);
    expect(before.mode).toBe("lexical");
    await app.close();
    app = await open();
    await app.restore();
    await app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" });
    const after = await search();
    expect(after.kind).toBe("ok");
    if (after.kind === "ok") expect(after.items.map(item => item.record.ref)).toEqual(references);
    const expanded = await app.knowledgeCommand({ action: "evidence", request: { root: references[0], direction: "forward", maxDepth: 3, maxRecords: 20, maxLinks: 20, maxBytes: 65_536 } });
    expect(expanded).toMatchObject({ kind: "ok" });
    expect(JSON.stringify(expanded)).not.toContain("DO-NOT-CAPTURE");
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
}, 30_000);

test("Nightloom keeps SQLite evidence cursor dimensions fixed and classifies aggregate overflow explicitly", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-evidence-cursor-"));
  const client = createManagedLocalKnowledgeClient({ root: join(root, "knowledge"), workingDirectory: root });
  const subject = { type: "user", id: "local-owner", properties: { scope: "global-knowledge" } } as unknown as TrustedKnowledgeSubject;
  type SourceRef = RecordRef & { type: "source" };
  const rootRef: SourceRef = { type: "source", origin: "public-test", id: "root", revision: "r1" };
  const firstRef: SourceRef = { type: "source", origin: "public-test", id: "first", revision: "r1" };
  const secondRef: SourceRef = { type: "source", origin: "public-test", id: "second", revision: "r1" };
  const record = (ref: SourceRef, body: string) => ({
    ref, body, status: "active" as const, confidence: { value: "observed" },
    provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
  });
  const receipts = new Map<string, NightloomAssessmentReceipt>();
  let assessments = 0;
  const maintenance: KnowledgeMaintenance = {
    async status() { return { kind: "ok", pendingUnits: 0, checkpoint: "unused" }; },
    async pending() { return { kind: "failure", code: "unavailable" }; },
    async publish() { return { kind: "failure", code: "unavailable" }; },
    async release() { return { kind: "failure", code: "unavailable" }; },
  };
  const retrieval: KnowledgeRetrieval = {
    search: (_subject, request) => client.search(request),
    get: (_subject, ref) => client.get(ref),
    expand: (_subject, request) => client.expand(request),
    evidence: (_subject, request) => client.evidence(request),
    export: (_subject, request) => client.export(request),
  };
  const assessment: KnowledgeAssessment = {
    async assess(_subject, request) { assessments++; return { kind: "completed", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint, proposals: [] }; },
    async reconcile(_subject, request) { return { kind: "failure", code: "unavailable", ...request }; },
    async cancel(_subject, request) { return { kind: "cancelled", ...request }; },
  };
  try {
    expect((await client.ingest({ operation: "upsert", expectedRevision: null, record: record(secondRef, "z".repeat(40_000)), links: [] })).kind).toBe("accepted");
    expect((await client.ingest({ operation: "upsert", expectedRevision: null, record: record(firstRef, "y".repeat(40_000)), links: [{ from: firstRef, to: secondRef, relation: "support" }] })).kind).toBe("accepted");
    expect((await client.ingest({ operation: "upsert", expectedRevision: null, record: record(rootRef, "root"), links: [{ from: rootRef, to: firstRef, relation: "support" }] })).kind).toBe("accepted");
    const assess = createNightloomTaskHandlers({
      maintenance, retrieval, assessment, subject, fingerprint: () => "real-sqlite-pagination",
      receipts: {
        async load(requestId) { return receipts.get(requestId); },
        async compareAndSet(requestId, expectedRevision, next) {
          if ((receipts.get(requestId)?.revision ?? null) !== expectedRevision) return false;
          receipts.set(requestId, structuredClone(next)); return true;
        },
      },
    }).find(handler => handler.id === "nightloom.assess-batch")!;
    const context: TaskContext = {
      taskVersion: "1", runId: "host/real-sqlite", stepId: "host/real-sqlite/assess", attemptId: "host/real-sqlite/assess/1", attempt: 1,
      signal: new AbortController().signal,
    };
    const result = await assess.run({
      batch: { id: "real-sqlite-batch", checkpoint: "real-sqlite-checkpoint" },
      units: [{ id: "real-sqlite-unit", update: { ref: rootRef, operation: "upsert" } }],
      maxRecords: 100, maxLinks: 100, maxBytes: 65_536,
    }, context);
    expect(result).toEqual({ kind: "blocked", reason: "evidence_too_large" });
    expect(assessments).toBe(0);
  } finally { await client.close(); await rm(root, { recursive: true, force: true }); }
}, 30_000);
