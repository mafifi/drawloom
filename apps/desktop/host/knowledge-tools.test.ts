import { expect, test } from "bun:test";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import { createKnowledgePlugin, knowledgeObservation } from "./knowledge-tools.js";
import type { KnowledgeService } from "./knowledge-host.js";

function service(calls: unknown[]): KnowledgeService {
  const status = { availability: "ready" as const, message: "ready", configuration: DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, models: [], indexing: "unavailable" as const,
    maintenance: { state: "idle" as const, pendingUpdates: 0, message: "idle", automaticStartsToday: 0, automaticMillisecondsToday: 0 } };
  return { async status() { return status; }, async configure() { return status; },
    async search(value) { calls.push(value); return { kind: "ok", mode: "lexical", semantic: { status: "unavailable" }, items: [], bytes: 0 }; },
    async evidence() { return { kind: "ok", records: [], links: [], bytes: 0 }; }, async export() { return { kind: "ok", records: [], links: [], bytes: 0 }; },
    async ingest(value) { calls.push(value); return { kind: "accepted", revision: "r1" }; }, async download() { return status; }, async cancelDownload() { return status; }, async close() {} };
}

test("knowledge retrieval tools expose bounded contract inputs without subject or provider controls", async () => {
  const calls: unknown[] = [];
  const tools = createKnowledgePlugin(service(calls)).plugin.prepare({})().tools!;
  expect(tools.map(tool => tool.name)).toEqual(["knowledge.search", "knowledge.evidence", "knowledge.contribute"]);
  const search = tools[0]!;
  const input = search.parseInput({ query: "global knowledge", mode: "best_available", limit: 5, maxBytes: 4096 });
  expect(await search.execute(input, { invocationId: "i", operationId: "o", signal: new AbortController().signal })).toMatchObject({ kind: "ok", mode: "lexical" });
  expect(calls).toEqual([{ query: "global knowledge", mode: "best_available", limit: 5, maxBytes: 4096 }]);
  expect(() => search.parseInput({ query: "x", mode: "best_available", limit: 5, maxBytes: 4096, subject: { id: "caller" } })).toThrow();
});

test("knowledge contribution creates only a host-owned record for the invocation", async () => {
  const calls: unknown[] = [];
  const tools = createKnowledgePlugin(service(calls)).plugin.prepare({})().tools!;
  const contribute = tools.find(tool => tool.name === "knowledge.contribute")!;
  expect(contribute.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, openWorldHint: false });
  const input = contribute.parseInput({ body: "A bounded deliberate note.", kind: "claim" });
  await contribute.execute(input, { invocationId: "contribution-1", operationId: "operation-1", signal: new AbortController().signal });
  expect(calls.at(-1)).toMatchObject({ operation: "upsert", expectedRevision: null, record: {
    ref: { type: "claim", origin: "host-contribution", id: "contribution-1" },
    body: "A bounded deliberate note.", status: "active", freshness: "current",
    provenance: { producer: { type: "drawloom-host-tool", id: "knowledge.contribute" }, inputs: [] },
  } });
  expect(() => contribute.parseInput({ body: "x", kind: "source" })).toThrow();
  expect(() => contribute.parseInput({ body: "x", expectedRevision: "r1" })).toThrow();
});

test("automatic observations cover safe registered outcomes and exclude internal or unexecuted calls", () => {
  const projected = knowledgeObservation({ toolName: "text.word_count", invocationId: "invocation-1", outcome: { status: "ok" } });
  expect(projected).toMatchObject({ operation: "upsert", expectedRevision: null, record: { ref: { type: "observation", origin: "host-tool", id: "invocation-1" }, status: "active" } });
  expect(JSON.stringify(projected)).not.toContain('"count":');
  expect(knowledgeObservation({ toolName: "package-tool-1", registeredName: "files.inspect", producerOrigin: "package:installed:server", invocationId: "invocation-2",
    outcome: { status: "failed", code: "handler_failed", execution: "completed" } })).toMatchObject({ record: {
      body: "A registered tool operation failed after execution began.", confidence: { operationStatus: "failed", contentCaptured: false },
    } });
  expect(knowledgeObservation({ toolName: "knowledge.search", invocationId: "invocation-2", outcome: { status: "ok" } })).toBeUndefined();
  expect(knowledgeObservation({ toolName: "package-git", registeredName: "git.changes", invocationId: "invocation-3", outcome: { status: "ok" } })).toBeUndefined();
  expect(knowledgeObservation({ toolName: "package-tool-2", invocationId: "invocation-4", outcome: { status: "failed", code: "denied", execution: "not_started" } })).toBeUndefined();
  expect(knowledgeObservation({ toolName: "package-tool-3", invocationId: "invocation-5", outcome: { status: "failed", code: "cancelled", execution: "unknown" } })).toBeUndefined();
  expect(knowledgeObservation({ toolName: "package-tool-4", invocationId: "invocation-6", outcome: { status: "failed", code: "handler_failed", execution: "unknown" } })).toMatchObject({ record: {
    body: "A registered tool operation ended with an unknown execution outcome.", confidence: { operationStatus: "unknown" },
  } });
});
