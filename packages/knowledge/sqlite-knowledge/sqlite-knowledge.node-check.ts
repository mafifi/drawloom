import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { knowledgeIndexWorkConformance, knowledgeStorageConformance } from "@drawloom/knowledge/conformance";
import type { KnowledgeAuthorizer, RecordRef, TrustedKnowledgeSubject } from "@drawloom/knowledge";
import { createSqliteKnowledge } from "./src/index.ts";

const owner = { type: "user", id: "owner", properties: { local: true } } as TrustedKnowledgeSubject;
const visitor = { type: "user", id: "visitor", properties: { local: false } } as TrustedKnowledgeSubject;
const authorizer: KnowledgeAuthorizer = { authorize: async (request) => ({ decision: request.subject.id === owner.id }) };
const trustedResource = ({ ref }: { readonly ref?: RecordRef }) => ({
  type: ref ? "knowledge-record" : "knowledge-service",
  id: ref ? `${ref.type}:${ref.origin}:${ref.id}:${ref.revision}` : "local",
  properties: { modelDestination: "test-local-model" },
});
const open = (databasePath: string, overrides: Partial<Parameters<typeof createSqliteKnowledge>[0]> = {}) => createSqliteKnowledge({
  databasePath,
  authorizer,
  resolveResource: trustedResource,
  ...overrides,
});
const source = (id: string, revision: string, body: string) => ({
  ref: { type: "source" as const, origin: "public-test", id, revision }, body, status: "active" as const,
  confidence: { value: "provisional" }, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
});
const claim = (id: string, revision: string, body: string, input: RecordRef) => ({
  ref: { type: "claim" as const, origin: "public-test", id, revision }, body, status: "active" as const, freshness: "current" as const,
  confidence: { value: "provisional" }, provenance: { producer: { type: "test", id: "fixture" }, inputs: [input] },
});

test("unpublished work is offered again after restart and undersized reads do not strand it", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const path = join(root, "knowledge.sqlite");
  let provider = open(path);
  try {
    for (let index = 0; index < 20; index++) await provider.intake.ingest(owner, {
      operation: "upsert", expectedRevision: null, record: source(`restart-${index}`, "r1", "evidence"), links: [],
    });
    const tooSmall = await provider.maintenance.pending(owner, { limit: 20, maxBytes: 1024 });
    assert.notEqual(tooSmall.kind, "denied");
    const first = await provider.maintenance.pending(owner, { limit: 20, maxBytes: 64 * 1024 });
    assert.equal(first.kind, "ok"); if (first.kind !== "ok") return;
    assert.equal(first.units.length, 20);
    provider.close(); provider = open(path);
    const replay = await provider.maintenance.pending(owner, { limit: 20, maxBytes: 64 * 1024 });
    assert.equal(replay.kind, "ok"); if (replay.kind !== "ok") return;
    assert.deepEqual(replay.batch, first.batch);
    assert.deepEqual(replay.units, first.units);
    assert.equal((await provider.maintenance.publish(owner, { batch: replay.batch, proposals: [] })).kind, "published");
    const status = await provider.maintenance.status(owner);
    assert.equal(status.kind, "ok"); if (status.kind === "ok") assert.equal(status.pendingUnits, 0);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("releasing an exact maintenance lease reoffers its units without advancing the checkpoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("released-work", "r1", "evidence"), links: [] });
    const before = await provider.maintenance.status(owner);
    assert.equal(before.kind, "ok"); if (before.kind !== "ok") return;
    const leased = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(leased.kind, "ok"); if (leased.kind !== "ok") return;
    assert.equal((await provider.maintenance.release(owner, { batch: { ...leased.batch, checkpoint: `${leased.batch.checkpoint}-wrong` } })).kind, "conflict");
    assert.equal((await provider.maintenance.release(visitor, { batch: leased.batch })).kind, "denied");
    assert.equal((await provider.maintenance.release(owner, { batch: leased.batch })).kind, "released");
    const after = await provider.maintenance.status(owner);
    assert.equal(after.kind, "ok"); if (after.kind !== "ok") return;
    assert.equal(after.checkpoint, before.checkpoint);
    assert.equal((await provider.maintenance.release(owner, { batch: leased.batch })).kind, "conflict");
    const reissued = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(reissued.kind, "ok");
    if (reissued.kind === "ok") assert.deepEqual(reissued.units, leased.units);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("export cannot disclose denied evidence endpoints or provenance through an allowed claim", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  let restrict = false;
  const provider = open(join(root, "knowledge.sqlite"), { authorizer: { authorize: async ({ resource }) => ({ decision: !restrict || !resource.id.includes(":secret:") }) } });
  try {
    const evidence = source("secret", "r1", "restricted evidence");
    const result = claim("public", "r1", "derived claim", evidence.ref);
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: evidence, links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: result, links: [{ from: result.ref, to: evidence.ref, relation: "support" }] });
    restrict = true;
    const exported = await provider.retrieval.export(owner, { refs: [result.ref], format: "okf", maxBytes: 64000 });
    assert.equal(exported.kind, "denied");
    const read = await provider.retrieval.get(owner, result.ref);
    assert.equal(read.kind, "denied");
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("selective search and expansion do not issue cursors for only denied rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  let restrict = false;
  const provider = open(join(root, "knowledge.sqlite"), { authorizer: { authorize: async ({ resource }) => ({ decision: !restrict || !resource.id.includes(":secret:") }) } });
  try {
    const secret = source("secret", "r1", "needle hidden");
    const derived = claim("derived", "r1", "visible claim", secret.ref);
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: secret, links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: derived, links: [{ from: derived.ref, to: secret.ref, relation: "support" }] });
    restrict = true;
    const searched = await provider.retrieval.search(owner, { query: "needle", limit: 1, maxBytes: 4096 });
    assert.equal(searched.kind, "ok"); if (searched.kind === "ok") { assert.deepEqual(searched.items, []); assert.equal(searched.cursor, undefined); }
    const expanded = await provider.retrieval.expand(owner, { ref: derived.ref, direction: "forward", limit: 1, maxBytes: 4096 });
    assert.equal(expanded.kind, "ok"); if (expanded.kind === "ok") { assert.deepEqual(expanded.items, []); assert.equal(expanded.cursor, undefined); }
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("SQLite provider passes the unchanged portable storage conformance suite", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  try {
    await knowledgeStorageConformance({ ...provider, authorizedSubject: owner, deniedSubject: visitor });
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("SQLite provider passes the configuration-scoped durable index-work conformance", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  try {
    await knowledgeIndexWorkConformance({ intake: provider.intake, indexWork: provider.indexWork, authorizedSubject: owner, deniedSubject: visitor, configuration: { id: "index-work", fingerprint: "index-work-v1", dimensions: 2 } });
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("SQLite records survive restart and authorization denies before body disclosure", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const databasePath = join(root, "knowledge.sqlite");
  const ref: RecordRef = { type: "source", origin: "public-test", id: "restart", revision: "r1" };
  try {
    const first = open(databasePath);
    assert.deepEqual(await first.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(ref.id, ref.revision, "durable local evidence"), links: [] }), { kind: "accepted", revision: "r1" });
    first.close();
    const restarted = open(databasePath);
    try {
      assert.equal((await restarted.retrieval.get(visitor, ref)).kind, "denied");
      assert.equal((await restarted.retrieval.get(owner, ref)).kind, "ok");
      assert.equal((await stat(databasePath)).mode & 0o077, 0);
    } finally { restarted.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("SQLite provider refuses a damaged database instead of resetting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const databasePath = join(root, "knowledge.sqlite");
  try {
    await writeFile(databasePath, "not a SQLite database");
    assert.throws(() => open(databasePath), /SQLite|database|malformed/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source changes stale transitive claim descendants while a cycle remains bounded", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const evidence: RecordRef = { type: "source", origin: "public-test", id: "evidence", revision: "r1" };
  const firstClaim: RecordRef = { type: "claim", origin: "public-test", id: "first", revision: "r1" };
  const secondClaim: RecordRef = { type: "claim", origin: "public-test", id: "second", revision: "r1" };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(evidence.id, evidence.revision, "original evidence"), links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: claim(firstClaim.id, firstClaim.revision, "first claim", evidence), links: [{ from: firstClaim, to: evidence, relation: "support" }] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: claim(secondClaim.id, secondClaim.revision, "second claim", firstClaim), links: [{ from: secondClaim, to: firstClaim, relation: "support" }] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source(evidence.id, "r2", "changed evidence"), links: [] });
    const first = await provider.retrieval.get(owner, firstClaim);
    const second = await provider.retrieval.get(owner, secondClaim);
    assert.equal(first.kind === "ok" && first.record?.ref.type === "claim" && first.record.freshness, "stale");
    assert.equal(second.kind === "ok" && second.record?.ref.type === "claim" && second.record.freshness, "stale");
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("lexical retrieval pages more than 2,000 persisted records without returning the corpus", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  try {
    for (let index = 0; index < 2_001; index++) {
      const result = await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(`record-${index}`, "r1", `needle public record ${index}`), links: [] });
      assert.equal(result.kind, "accepted");
    }
    const page = await provider.retrieval.search(owner, { query: "needle", mode: "lexical", limit: 10, maxBytes: 64 * 1024 });
    assert.equal(page.kind, "ok");
    if (page.kind === "ok") { assert.equal(page.items.length, 10); assert.ok(page.cursor); }
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("lexical natural-language queries retain an exact identifier result without requiring every filler word", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("LANTERN-042", "r1", "Release LANTERN-042 disables automatic retry after an uncertain payment response."), links: [] });
    const result = await provider.retrieval.search(owner, { query: "What changed in LANTERN-042?", mode: "lexical", limit: 10, maxBytes: 64 * 1024 });
    assert.equal(result.kind, "ok"); if (result.kind === "ok") assert.deepEqual(result.items.map((item) => item.record.ref.id), ["LANTERN-042"]);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("FTS maintenance keeps an indexed key-to-rowid map across a record revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const databasePath = join(root, "knowledge.sqlite");
  const provider = open(databasePath);
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("fts-map", "r1", "first searchable body"), links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source("fts-map", "r2", "second searchable body"), links: [] });
    provider.close();
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.deepEqual(database.prepare("SELECT key FROM records_fts_keys ORDER BY key").all().map((row) => String((row as { readonly key: unknown }).key)), ["[\"source\",\"public-test\",\"fts-map\",\"r2\"]"]);
      const plan = database.prepare("EXPLAIN QUERY PLAN SELECT rowid FROM records_fts_keys WHERE key=?").all("[\"source\",\"public-test\",\"fts-map\",\"r2\"]") as readonly { readonly detail: string }[];
      assert.match(plan.map((row) => row.detail).join("\n"), /SEARCH/i);
    } finally { database.close(); }
  } finally { try { provider.close(); } catch {} await rm(root, { recursive: true, force: true }); }
});

test("durable work units retain fan-out beyond one publication across provider restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const databasePath = join(root, "knowledge.sqlite");
  const evidence: RecordRef = { type: "source", origin: "public-test", id: "fan-out", revision: "r1" };
  const drain = async (provider: ReturnType<typeof createSqliteKnowledge>) => {
    for (;;) {
      const pending = await provider.maintenance.pending(owner, { limit: 100, maxBytes: 128 * 1024 });
      assert.equal(pending.kind, "ok"); if (pending.kind !== "ok" || !pending.units.length) return;
      await provider.maintenance.publish(owner, { batch: pending.batch, proposals: [] });
    }
  };
  try {
    const first = open(databasePath);
    await first.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(evidence.id, evidence.revision, "fan-out source"), links: [] });
    for (let index = 0; index < 101; index++) {
      const ref: RecordRef = { type: "claim", origin: "public-test", id: `fan-claim-${index}`, revision: "r1" };
      await first.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: claim(ref.id, ref.revision, `claim ${index}`, evidence), links: [{ from: ref, to: evidence, relation: "support" }] });
    }
    await drain(first);
    await first.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source(evidence.id, "r2", "changed fan-out source"), links: [] });
    const firstUnitPage = await first.maintenance.pending(owner, { limit: 100, maxBytes: 128 * 1024 });
    assert.equal(firstUnitPage.kind, "ok");
    if (firstUnitPage.kind !== "ok") throw new Error("expected work page");
    assert.equal(firstUnitPage.units.length, 100); assert.equal(firstUnitPage.remaining, true);
    first.close();

    const restarted = open(databasePath);
    try {
      const published = await restarted.maintenance.publish(owner, { batch: firstUnitPage.batch, proposals: [] });
      assert.equal(published.kind, "published"); assert.equal(published.remaining, true);
      const finalUnitPage = await restarted.maintenance.pending(owner, { limit: 100, maxBytes: 128 * 1024 });
      assert.equal(finalUnitPage.kind, "ok");
      if (finalUnitPage.kind !== "ok") throw new Error("expected final work page");
      assert.equal(finalUnitPage.units.length, 1); assert.ok(finalUnitPage.units[0]?.affectedClaim);
      const complete = await restarted.maintenance.publish(owner, { batch: finalUnitPage.batch, proposals: [] });
      assert.equal(complete.kind, "published");
      if (complete.kind === "published") assert.equal(complete.remaining, false);
    } finally { restarted.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("newer schemas are refused without changing their database", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const databasePath = join(root, "knowledge.sqlite");
  try {
    const database = new DatabaseSync(databasePath);
    database.exec("CREATE TABLE preserve_me(value TEXT); INSERT INTO preserve_me VALUES ('unchanged'); PRAGMA user_version = 2;");
    database.close();
    const before = await readFile(databasePath);
    assert.throws(() => open(databasePath), /newer/i);
    assert.deepEqual(await readFile(databasePath), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("trusted resource resolution filters mixed records and never takes caller attributes", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const databasePath = join(root, "knowledge.sqlite");
  const permitted: RecordRef = { type: "source", origin: "public-test", id: "permitted", revision: "r1" };
  const hidden: RecordRef = { type: "source", origin: "public-test", id: "hidden", revision: "r1" };
  const permittedClaim: RecordRef = { type: "claim", origin: "public-test", id: "permitted-claim", revision: "r1" };
  const initial = open(databasePath);
  try {
    assert.equal((await initial.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(permitted.id, permitted.revision, "shared needle"), links: [] })).kind, "accepted");
    assert.equal((await initial.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(hidden.id, hidden.revision, "shared needle"), links: [] })).kind, "accepted");
    assert.equal((await initial.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: claim(permittedClaim.id, permittedClaim.revision, "shared derived needle", hidden), links: [{ from: permittedClaim, to: hidden, relation: "support" }] })).kind, "accepted");
  } finally { initial.close(); }
  const resolverCalls: Array<{ readonly action: string; readonly ref?: RecordRef }> = [];
  const provider = open(databasePath, {
    authorizer: { authorize: async (request) => ({ decision: request.resource.properties.modelDestination === "trusted-local-model" && request.resource.properties.visibility !== "hidden" }) },
    resolveResource: ({ action, ref }) => {
      resolverCalls.push({ action, ref });
      return {
        type: ref ? "knowledge-record" : "knowledge-service",
        id: ref ? `${ref.type}:${ref.origin}:${ref.id}:${ref.revision}` : "local",
        properties: { modelDestination: "trusted-local-model", ...(ref?.id === hidden.id ? { visibility: "hidden" } : {}) },
      };
    },
  });
  try {
    const search = await provider.retrieval.search(owner, { query: "needle", mode: "lexical", limit: 10, maxBytes: 64 * 1024 });
    assert.equal(search.kind, "ok");
    if (search.kind === "ok") assert.deepEqual(search.items.map((item) => item.record.ref.id).sort(), [permitted.id]);
    assert.equal((await provider.retrieval.get(owner, hidden)).kind, "denied");
    const evidence = await provider.retrieval.evidence(owner, { root: permittedClaim, direction: "forward", maxDepth: 2, maxRecords: 10, maxLinks: 10, maxBytes: 64 * 1024 });
    assert.equal(evidence.kind, "ok");
    if (evidence.kind === "ok") { assert.deepEqual(evidence.records, []); assert.equal(evidence.links.length, 0); }
    assert.ok(resolverCalls.some((call) => call.action === "knowledge.get" && call.ref?.id === hidden.id));
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("deleting cited evidence leaves dependents stale and durable maintenance work", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const evidence: RecordRef = { type: "source", origin: "public-test", id: "deleted-evidence", revision: "r1" };
  const dependent: RecordRef = { type: "claim", origin: "public-test", id: "dependent", revision: "r1" };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(evidence.id, evidence.revision, "soon deleted"), links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: claim(dependent.id, dependent.revision, "derived claim", evidence), links: [{ from: dependent, to: evidence, relation: "support" }] });
    await provider.intake.ingest(owner, { operation: "delete", expectedRevision: "r1", ref: { ...evidence, revision: "r2" } });
    const stored = await provider.retrieval.get(owner, dependent);
    assert.equal(stored.kind === "ok" && stored.record?.ref.type === "claim" && stored.record.freshness, "stale");
    const pending = await provider.maintenance.pending(owner, { limit: 100, maxBytes: 64 * 1024 });
    assert.equal(pending.kind, "ok");
    if (pending.kind === "ok") assert.ok(pending.units.some((unit) => unit.update.operation === "delete" && unit.affectedClaim?.id === dependent.id));
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("embedding generations reject a superseded stored revision and deletion removes its vectors", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const first: RecordRef = { type: "source", origin: "public-test", id: "embedded", revision: "r1" };
  const configuration = { id: "test-vector", fingerprint: "test-vector-v1", dimensions: 2 };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(first.id, first.revision, "indexed source"), links: [] });
    const prepared = await provider.embeddingIndex.prepare({ configuration, generation: 1, expectedActiveGeneration: null });
    assert.equal(prepared.kind, "ready"); if (prepared.kind !== "ready") throw new Error("expected stage");
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source(first.id, "r2", "revised source"), links: [] });
    assert.equal((await provider.embeddingIndex.stage({ stageId: prepared.stageId, entries: [{ id: "old", ref: first, vector: [1, 0] }], removals: [] })).kind, "conflict");
    assert.equal((await provider.embeddingIndex.stage({ stageId: prepared.stageId, entries: [{ id: "current", ref: { ...first, revision: "r2" }, vector: [1, 0] }], removals: [] })).kind, "staged");
    assert.equal((await provider.embeddingIndex.activate({ stageId: prepared.stageId, expectedActiveGeneration: null })).kind, "activated");
    await provider.intake.ingest(owner, { operation: "delete", expectedRevision: "r2", ref: { ...first, revision: "r3" } });
    const query = await provider.embeddingIndex.query({ configuration, vector: [1, 0], limit: 10 });
    assert.equal(query.kind, "ok"); if (query.kind === "ok") assert.equal(query.items.length, 0);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("embedding activation applies only staged deltas and hides vectors for superseded records", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const configuration = { id: "delta-vector", fingerprint: "delta-vector-v1", dimensions: 2 };
  const first: RecordRef = { type: "source", origin: "public-test", id: "delta", revision: "r1" };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(first.id, first.revision, "first"), links: [] });
    const firstStage = await provider.embeddingIndex.prepare({ configuration, generation: 1, expectedActiveGeneration: null });
    assert.equal(firstStage.kind, "ready"); if (firstStage.kind !== "ready") throw new Error("expected stage");
    const retry = await provider.embeddingIndex.prepare({ configuration, generation: 1, expectedActiveGeneration: null });
    assert.deepEqual(retry, firstStage);
    await provider.embeddingIndex.stage({ stageId: firstStage.stageId, entries: [{ id: "first", ref: first, vector: [1, 0] }], removals: [] });
    await provider.embeddingIndex.activate({ stageId: firstStage.stageId, expectedActiveGeneration: null });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source(first.id, "r2", "second"), links: [] });
    const stale = await provider.embeddingIndex.query({ configuration, vector: [1, 0], limit: 10 });
    assert.equal(stale.kind, "ok"); if (stale.kind === "ok") assert.deepEqual(stale.items, []);
    const secondStage = await provider.embeddingIndex.prepare({ configuration, generation: 2, expectedActiveGeneration: 1 });
    assert.equal(secondStage.kind, "ready"); if (secondStage.kind !== "ready") throw new Error("expected stage");
    await provider.embeddingIndex.stage({ stageId: secondStage.stageId, entries: [{ id: "second", ref: { ...first, revision: "r2" }, vector: [0, 1] }], removals: [{ ...first }] });
    await provider.embeddingIndex.activate({ stageId: secondStage.stageId, expectedActiveGeneration: 1 });
    const query = await provider.embeddingIndex.query({ configuration, vector: [0, 1], limit: 10 });
    assert.equal(query.kind, "ok"); if (query.kind === "ok") assert.deepEqual(query.items.map((item) => item.ref.revision), ["r2"]);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("publication reauthorizes every leased work ref before consuming its batch", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  let revoked = false;
  const provider = open(join(root, "knowledge.sqlite"), {
    authorizer: { authorize: async ({ resource }) => ({ decision: !revoked || !resource.id.includes(":leased:") }) },
  });
  try {
    const leased = source("leased", "r1", "work requiring authorization");
    assert.equal((await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: leased, links: [] })).kind, "accepted");
    const pending = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(pending.kind, "ok"); if (pending.kind !== "ok") return;
    revoked = true;
    assert.equal((await provider.maintenance.publish(owner, { batch: pending.batch, proposals: [] })).kind, "denied");
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("stale leased updates are reissued against the current source revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  try {
    const first = source("lease-refresh", "r1", "original");
    assert.equal((await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: first, links: [] })).kind, "accepted");
    const leased = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(leased.kind, "ok"); if (leased.kind !== "ok") return;
    assert.equal((await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source("lease-refresh", "r2", "replacement"), links: [] })).kind, "accepted");
    assert.equal((await provider.maintenance.publish(owner, { batch: leased.batch, proposals: [] })).kind, "conflict");
    const reissued = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(reissued.kind, "ok");
    if (reissued.kind === "ok") assert.ok(reissued.units.every((unit) => unit.update.ref.revision === "r2"));
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("a stale mixed maintenance batch releases every nonstale unit for re-leasing", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("mixed-a", "r1", "first"), links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("mixed-b", "r1", "second"), links: [] });
    const leased = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(leased.kind, "ok"); if (leased.kind !== "ok") return;
    assert.equal(leased.units.length, 2);
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source("mixed-a", "r2", "replacement"), links: [] });
    assert.equal((await provider.maintenance.publish(owner, { batch: leased.batch, proposals: [] })).kind, "conflict");
    const reissued = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(reissued.kind, "ok");
    if (reissued.kind === "ok") assert.deepEqual(reissued.units.map((unit) => `${unit.update.ref.id}:${unit.update.ref.revision}`).sort(), ["mixed-a:r2", "mixed-b:r1"]);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("acknowledging a deletion records its tombstone and does not starve later index work", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const configuration = { id: "tombstone-index", fingerprint: "tombstone-v1", dimensions: 2 };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("indexed-then-deleted", "r1", "first body"), links: [] });
    const initial = await provider.indexWork.pending(owner, { configuration, limit: 10, maxBytes: 64 * 1024 });
    assert.equal(initial.kind, "ok"); if (initial.kind !== "ok") return;
    assert.equal((await provider.indexWork.acknowledge(owner, { batch: initial.batch })).kind, "acknowledged");
    await provider.intake.ingest(owner, { operation: "delete", expectedRevision: "r1", ref: { type: "source", origin: "public-test", id: "indexed-then-deleted", revision: "r2" } });
    const removal = await provider.indexWork.pending(owner, { configuration, limit: 10, maxBytes: 64 * 1024 });
    assert.equal(removal.kind, "ok"); if (removal.kind !== "ok") return;
    assert.deepEqual(removal.updates.map((update) => update.operation), ["remove"]);
    assert.equal((await provider.indexWork.acknowledge(owner, { batch: removal.batch })).kind, "acknowledged");
    const afterRemoval = await provider.indexWork.pending(owner, { configuration, limit: 10, maxBytes: 64 * 1024 });
    assert.equal(afterRemoval.kind, "ok");
    if (afterRemoval.kind === "ok") assert.deepEqual(afterRemoval.updates, []);
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("after-tombstone", "r1", "later body"), links: [] });
    const later = await provider.indexWork.pending(owner, { configuration, limit: 10, maxBytes: 64 * 1024 });
    assert.equal(later.kind, "ok");
    if (later.kind === "ok") assert.deepEqual(later.updates.map((update) => update.operation), ["upsert"]);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("concurrent maintenance callers return one leased batch after authorization", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  let arrivals = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  const provider = open(join(root, "knowledge.sqlite"), {
    authorizer: {
      authorize: async ({ action, resource }) => {
        if (action.name === "knowledge.maintain" && resource.id.includes(":race:")) {
          arrivals += 1;
          if (arrivals === 2) release();
          await barrier;
        }
        return { decision: true };
      },
    },
  });
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("race", "r1", "work"), links: [] });
    const [first, second] = await Promise.all([
      provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 }),
      provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 }),
    ]);
    assert.equal(first.kind, "ok"); assert.equal(second.kind, "ok");
    if (first.kind === "ok" && second.kind === "ok") {
      assert.deepEqual(first.batch, second.batch);
      assert.deepEqual(first.units, second.units);
    }
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("stale held index work is discarded before replay and deletion removes copied bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const databasePath = join(root, "knowledge.sqlite");
  const provider = open(databasePath);
  const configuration = { id: "held-index", fingerprint: "held-v1", dimensions: 2 };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("held", "r1", "body that must not replay"), links: [] });
    const held = await provider.indexWork.pending(owner, { configuration, limit: 10, maxBytes: 64 * 1024 });
    assert.equal(held.kind, "ok"); if (held.kind !== "ok") return;
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source("held", "r2", "current body"), links: [] });
    const reissued = await provider.indexWork.pending(owner, { configuration, limit: 10, maxBytes: 64 * 1024 });
    assert.equal(reissued.kind, "ok");
    if (reissued.kind === "ok") assert.deepEqual(reissued.updates.flatMap((update) => update.operation === "upsert" ? [update.record.ref.revision] : []), ["r2"]);
    await provider.intake.ingest(owner, { operation: "delete", expectedRevision: "r2", ref: { type: "source", origin: "public-test", id: "held", revision: "r3" } });
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try { assert.equal(Number((database.prepare("SELECT count(*) AS count FROM index_batches WHERE updates LIKE ?").get("%current body%") as { readonly count: unknown }).count), 0); }
    finally { database.close(); }
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("a held index batch respects tighter replay limits without being consumed", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const configuration = { id: "bounded-replay", fingerprint: "bounded-v1", dimensions: 2 };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("bounded-first", "r1", "body"), links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("bounded-second", "r1", "body"), links: [] });
    const held = await provider.indexWork.pending(owner, { configuration, limit: 10, maxBytes: 64 * 1024 });
    assert.equal(held.kind, "ok"); if (held.kind !== "ok") return;
    assert.deepEqual(await provider.indexWork.pending(owner, { configuration, limit: 1, maxBytes: 64 * 1024 }), { kind: "failure", code: "too_large" });
    const replay = await provider.indexWork.pending(owner, { configuration, limit: 10, maxBytes: 64 * 1024 });
    assert.equal(replay.kind, "ok"); if (replay.kind === "ok") assert.deepEqual(replay.batch, held.batch);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("publication rejects duplicate claim targets and superseded evidence atomically", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const support: RecordRef = { type: "source", origin: "public-test", id: "publication-support", revision: "r1" };
  const target: RecordRef = { type: "claim", origin: "public-test", id: "publication-target", revision: "r1" };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(support.id, support.revision, "initial support"), links: [] });
    const batch = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(batch.kind, "ok"); if (batch.kind !== "ok") return;
    const proposal = { record: claim(target.id, target.revision, "derived", support) as never, expectedRevision: null, links: [{ from: target, to: support, relation: "support" as const }] };
    assert.equal((await provider.maintenance.publish(owner, { batch: batch.batch, proposals: [proposal, proposal] })).kind, "conflict");
    assert.equal((await provider.retrieval.get(owner, target)).kind, "ok");
    await provider.maintenance.publish(owner, { batch: batch.batch, proposals: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source(support.id, "r2", "superseded support"), links: [] });
    const staleBatch = await provider.maintenance.pending(owner, { limit: 10, maxBytes: 64 * 1024 });
    assert.equal(staleBatch.kind, "ok"); if (staleBatch.kind !== "ok") return;
    assert.equal((await provider.maintenance.publish(owner, { batch: staleBatch.batch, proposals: [proposal] })).kind, "conflict");
    const missing = await provider.retrieval.get(owner, target);
    assert.equal(missing.kind === "ok" && missing.record, undefined);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("publication rejects a proposal that cites another proposal's superseded revision", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const support: RecordRef = { type: "source", origin: "public-test", id: "cross-support", revision: "r1" };
  const first: RecordRef = { type: "claim", origin: "public-test", id: "cross-first", revision: "r1" };
  const second: RecordRef = { type: "claim", origin: "public-test", id: "cross-second", revision: "r1" };
  const drain = async () => {
    const pending = await provider.maintenance.pending(owner, { limit: 100, maxBytes: 64 * 1024 });
    assert.equal(pending.kind, "ok"); if (pending.kind === "ok") assert.equal((await provider.maintenance.publish(owner, { batch: pending.batch, proposals: [] })).kind, "published");
  };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(support.id, support.revision, "support"), links: [] });
    await drain();
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: claim(first.id, first.revision, "first", support), links: [{ from: first, to: support, relation: "support" }] });
    await drain();
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: "r1", record: source(support.id, "r2", "changed support"), links: [] });
    const batch = await provider.maintenance.pending(owner, { limit: 100, maxBytes: 64 * 1024 });
    assert.equal(batch.kind, "ok"); if (batch.kind !== "ok") return;
    const nextFirst = { ...claim(first.id, "r2", "revised first", { ...support, revision: "r2" }), provenance: { producer: { type: "test", id: "fixture" }, inputs: [first, { ...support, revision: "r2" }] } };
    const secondFromOldFirst = claim(second.id, second.revision, "must not cite old first", first);
    const result = await provider.maintenance.publish(owner, {
      batch: batch.batch,
      proposals: [
        { record: nextFirst as never, expectedRevision: "r1", previous: first, links: [{ from: nextFirst.ref, to: { ...support, revision: "r2" }, relation: "support" as const }] },
        { record: secondFromOldFirst as never, expectedRevision: null, links: [{ from: second, to: first, relation: "support" as const }] },
      ],
    });
    assert.equal(result.kind, "conflict", JSON.stringify(result));
    const stored = await provider.retrieval.get(owner, second);
    assert.equal(stored.kind === "ok" && stored.record, undefined);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("evidence continuation leaves its input cursor replayable", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const evidence: RecordRef = { type: "source", origin: "public-test", id: "cursor-evidence", revision: "r1" };
  const derived: RecordRef = { type: "claim", origin: "public-test", id: "cursor-claim", revision: "r1" };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(evidence.id, evidence.revision, "cursor source"), links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: claim(derived.id, derived.revision, "cursor claim", evidence), links: [{ from: derived, to: evidence, relation: "support" }] });
    const first = await provider.retrieval.evidence(owner, { root: derived, direction: "forward", maxDepth: 2, maxRecords: 1, maxLinks: 1, maxBytes: 64 * 1024 });
    assert.equal(first.kind, "ok"); if (first.kind !== "ok" || !first.cursor) return;
    const request = { root: derived, direction: "forward" as const, maxDepth: 2, maxRecords: 1, maxLinks: 1, maxBytes: 64 * 1024, cursor: first.cursor };
    const replayA = await provider.retrieval.evidence(owner, request);
    const replayB = await provider.retrieval.evidence(owner, request);
    assert.deepEqual(replayB, replayA);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("index work durably advances withdraw-to-delete tombstones before a later active record", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const configuration = { id: "tombstone-sequence", fingerprint: "tombstone-sequence-v1", dimensions: 2 };
  const first: RecordRef = { type: "source", origin: "public-test", id: "tombstone-first", revision: "r1" };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(first.id, first.revision, "active evidence"), links: [] });
    const initial = await provider.indexWork.pending(owner, { configuration, limit: 1, maxBytes: 64 * 1024 });
    assert.equal(initial.kind, "ok"); if (initial.kind !== "ok") return;
    assert.equal((await provider.indexWork.acknowledge(owner, { batch: initial.batch })).kind, "acknowledged");
    await provider.intake.ingest(owner, { operation: "withdraw", expectedRevision: "r1", record: { ...source(first.id, "r2", "withdrawn evidence"), status: "withdrawn" }, links: [] });
    const withdrawn = await provider.indexWork.pending(owner, { configuration, limit: 1, maxBytes: 64 * 1024 });
    assert.equal(withdrawn.kind, "ok"); if (withdrawn.kind !== "ok") return;
    assert.deepEqual(withdrawn.updates.map((update) => update.operation), ["remove"]);
    assert.equal((await provider.indexWork.acknowledge(owner, { batch: withdrawn.batch })).kind, "acknowledged");
    await provider.intake.ingest(owner, { operation: "delete", expectedRevision: "r2", ref: { ...first, revision: "r3" } });
    const deleted = await provider.indexWork.pending(owner, { configuration, limit: 1, maxBytes: 64 * 1024 });
    assert.equal(deleted.kind, "ok"); if (deleted.kind !== "ok") return;
    assert.deepEqual(deleted.updates.map((update) => update.operation), ["remove"]);
    assert.equal((await provider.indexWork.acknowledge(owner, { batch: deleted.batch })).kind, "acknowledged");
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("zz-later-active", "r1", "later active evidence"), links: [] });
    const later = await provider.indexWork.pending(owner, { configuration, limit: 1, maxBytes: 64 * 1024 });
    assert.equal(later.kind, "ok");
    if (later.kind === "ok") assert.deepEqual(later.updates.flatMap((update) => update.operation === "upsert" ? [update.record.ref.id] : []), ["zz-later-active"]);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("index work processes a persisted inactive upsert before reaching later active work", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const databasePath = join(root, "knowledge.sqlite");
  const configuration = { id: "inactive-upsert", fingerprint: "inactive-upsert-v1", dimensions: 2 };
  const first = source("inactive-first", "r1", "stored inactive evidence");
  let provider = open(databasePath);
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: first, links: [] });
    provider.close();
    const database = new DatabaseSync(databasePath);
    try { database.prepare("UPDATE records SET json=? WHERE type=? AND origin=? AND id=? AND revision=?").run(JSON.stringify({ ...first, status: "withdrawn" }), first.ref.type, first.ref.origin, first.ref.id, first.ref.revision); }
    finally { database.close(); }
    provider = open(databasePath);
    const inactive = await provider.indexWork.pending(owner, { configuration, limit: 1, maxBytes: 64 * 1024 });
    assert.equal(inactive.kind, "ok"); if (inactive.kind !== "ok") return;
    assert.deepEqual(inactive.updates.map((update) => update.operation), ["remove"]);
    const replay = await provider.indexWork.pending(owner, { configuration, limit: 1, maxBytes: 64 * 1024 });
    assert.equal(replay.kind, "ok");
    if (replay.kind === "ok") {
      assert.deepEqual(replay.batch, inactive.batch);
      assert.deepEqual(replay.updates, inactive.updates);
    }
    assert.equal((await provider.indexWork.acknowledge(owner, { batch: inactive.batch })).kind, "acknowledged");
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source("zz-after-inactive", "r1", "later active evidence"), links: [] });
    const later = await provider.indexWork.pending(owner, { configuration, limit: 1, maxBytes: 64 * 1024 });
    assert.equal(later.kind, "ok");
    if (later.kind === "ok") assert.deepEqual(later.updates.flatMap((update) => update.operation === "upsert" ? [update.record.ref.id] : []), ["zz-after-inactive"]);
  } finally { try { provider.close(); } catch {} await rm(root, { recursive: true, force: true }); }
});

test("get invalidates a body captured before authorization finishes when the graph changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  let entered!: () => void;
  let release!: () => void;
  const authorizationEntered = new Promise<void>((resolve) => { entered = resolve; });
  const authorizationRelease = new Promise<void>((resolve) => { release = resolve; });
  const provider = open(join(root, "knowledge.sqlite"), {
    authorizer: { authorize: async ({ action, resource }) => {
      if (action.name === "knowledge.get" && resource.id.includes(":get-race-input:")) {
        entered();
        await authorizationRelease;
      }
      return { decision: true };
    } },
  });
  const input: RecordRef = { type: "source", origin: "public-test", id: "get-race-input", revision: "r1" };
  const target: RecordRef = { type: "claim", origin: "public-test", id: "get-race-target", revision: "r1" };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(input.id, input.revision, "support"), links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: claim(target.id, target.revision, "body that must not escape", input), links: [{ from: target, to: input, relation: "support" }] });
    const pending = provider.retrieval.get(owner, target);
    await authorizationEntered;
    assert.equal((await provider.intake.ingest(owner, { operation: "delete", expectedRevision: "r1", ref: { ...target, revision: "r2" } })).kind, "accepted");
    release();
    assert.deepEqual(await pending, { kind: "invalidated" });
  } finally { release(); provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("evidence invalidates a record captured before authorization finishes when the graph changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  let entered!: () => void;
  let release!: () => void;
  const authorizationEntered = new Promise<void>((resolve) => { entered = resolve; });
  const authorizationRelease = new Promise<void>((resolve) => { release = resolve; });
  const target: RecordRef = { type: "source", origin: "public-test", id: "evidence-race", revision: "r1" };
  const provider = open(join(root, "knowledge.sqlite"), {
    authorizer: { authorize: async ({ action, resource }) => {
      if (action.name === "knowledge.evidence" && resource.id.includes(":evidence-race:")) {
        entered();
        await authorizationRelease;
      }
      return { decision: true };
    } },
  });
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(target.id, target.revision, "body that must not escape"), links: [] });
    const pending = provider.retrieval.evidence(owner, { root: target, direction: "forward", maxDepth: 1, maxRecords: 10, maxLinks: 10, maxBytes: 64 * 1024 });
    await authorizationEntered;
    assert.equal((await provider.intake.ingest(owner, { operation: "delete", expectedRevision: "r1", ref: { ...target, revision: "r2" } })).kind, "accepted");
    release();
    assert.deepEqual(await pending, { kind: "invalidated" });
  } finally { release(); provider.close(); await rm(root, { recursive: true, force: true }); }
});

test("vector ranking aggregates passages by exact record before applying the record limit", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-sqlite-knowledge-"));
  const provider = open(join(root, "knowledge.sqlite"));
  const configuration = { id: "passage-crowding", fingerprint: "passage-crowding-v1", dimensions: 2 };
  const long: RecordRef = { type: "source", origin: "public-test", id: "long", revision: "r1" };
  const short: RecordRef = { type: "source", origin: "public-test", id: "short", revision: "r1" };
  try {
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(long.id, long.revision, "long"), links: [] });
    await provider.intake.ingest(owner, { operation: "upsert", expectedRevision: null, record: source(short.id, short.revision, "short"), links: [] });
    const prepared = await provider.embeddingIndex.prepare({ configuration, generation: 1, expectedActiveGeneration: null });
    assert.equal(prepared.kind, "ready"); if (prepared.kind !== "ready") return;
    assert.equal((await provider.embeddingIndex.stage({
      stageId: prepared.stageId,
      entries: [
        ...Array.from({ length: 8 }, (_, index) => ({ id: `long-${index}`, ref: long, vector: [1, 0] })),
        { id: "short-0", ref: short, vector: [0.9, 0.1] },
      ],
      removals: [],
    })).kind, "staged");
    assert.equal((await provider.embeddingIndex.activate({ stageId: prepared.stageId, expectedActiveGeneration: null })).kind, "activated");
    const result = await provider.embeddingIndex.query({ configuration, vector: [1, 0], limit: 2 });
    assert.equal(result.kind, "ok");
    if (result.kind === "ok") assert.deepEqual(result.items.map((item) => item.ref.id), ["long", "short"]);
  } finally { provider.close(); await rm(root, { recursive: true, force: true }); }
});
