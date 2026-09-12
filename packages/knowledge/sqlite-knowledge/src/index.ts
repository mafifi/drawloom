import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { load as loadVec } from "sqlite-vec";
import {
  AuthZenEntitySchema, AuthorizationResultSchema, EmbeddingConfigurationSchema, EmbeddingIndexActivateSchema,
  EmbeddingIndexPrepareSchema, EmbeddingIndexQuerySchema, EmbeddingIndexStageSchema,
  EvidenceRequestSchema, ExpandRequestSchema, IntakeInputSchema, KnowledgeExportRequestSchema,
  IndexWorkAcknowledgeInputSchema, IndexWorkRequestSchema, KnowledgeRecordSchema, PendingRequestSchema, PublicationInputSchema, RecordRefSchema, WorkBatchReleaseInputSchema,
  SearchRequestSchema, type AuthorizationResult, type AuthZenEntity,
  type EmbeddingIndexQueryResult, type IntakeResult, type KnowledgeAuthorizer,
  type KnowledgeEmbeddingIndex, type KnowledgeIntake, type KnowledgeLink,
  type IndexWorkUpdate, type KnowledgeIndexWork, type KnowledgeMaintenance, type KnowledgeRecord, type KnowledgeRetrieval,
  type PendingKnowledge, type PublicationResult, type RecordReadResult, type RecordRef,
  type SearchResult, type TrustedKnowledgeSubject,
} from "@drawloom/knowledge";

type Database = DatabaseSync;

type Row = Record<string, unknown>;
type Current = { readonly ref: RecordRef; readonly operation: "upsert" | "withdraw" | "delete"; readonly fingerprint: string; };
type StoredCursor = { readonly subject: string; readonly signature: string; readonly epoch: number; readonly payload: unknown; };

export interface TrustedKnowledgeResourceRequest {
  readonly subject: TrustedKnowledgeSubject;
  readonly action: string;
  /** Exact persisted record identity when the operation may disclose that record or a link to it. */
  readonly ref?: RecordRef;
}
/** Host composition supplies attributes and any model destination from authoritative state, never request payloads. */
export interface TrustedKnowledgeResourceResolver {
  resolveResource(request: TrustedKnowledgeResourceRequest): Promise<AuthZenEntity | undefined> | AuthZenEntity | undefined;
}
export interface SqliteKnowledgeOptions extends TrustedKnowledgeResourceResolver {
  readonly databasePath: string;
  readonly authorizer: KnowledgeAuthorizer;
}
export interface SqliteKnowledge {
  readonly intake: KnowledgeIntake;
  readonly retrieval: KnowledgeRetrieval;
  readonly maintenance: KnowledgeMaintenance;
  readonly indexWork: KnowledgeIndexWork;
  readonly embeddingIndex: KnowledgeEmbeddingIndex;
  close(): void;
}

const schemaVersion = 1;
const json = (value: unknown) => JSON.stringify(value);
const bytes = (value: unknown) => Buffer.byteLength(json(value), "utf8");
const logical = (ref: RecordRef) => json([ref.type, ref.origin, ref.id]);
const exact = (ref: RecordRef) => json([ref.type, ref.origin, ref.id, ref.revision]);
const subjectKey = (subject: TrustedKnowledgeSubject) => json([subject.type, subject.id]);
const same = (left: RecordRef, right: RecordRef) => exact(left) === exact(right);
const sameLogical = (left: RecordRef, right: RecordRef) => logical(left) === logical(right);
const row = (value: unknown): Row | undefined => value && typeof value === "object" ? value as Row : undefined;
const text = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;
const integer = (value: unknown): number | undefined => {
  const candidate = typeof value === "number" ? value : typeof value === "string" ? Number(value) : undefined;
  return candidate !== undefined && Number.isSafeInteger(candidate) ? candidate : undefined;
};

function parsedRecord(value: unknown): KnowledgeRecord { return KnowledgeRecordSchema.parse(JSON.parse(String(value))); }
function parsedRef(value: unknown): RecordRef { return RecordRefSchema.parse(JSON.parse(String(value))); }
/** Natural-language lexical lookup ranks any matching token; requiring every filler word turns identifier questions into false negatives. */
function queryText(query: string): string { return query.trim().split(/\s+/).map((term) => `"${term.replaceAll('"', '""')}"`).join(" OR "); }

export function createSqliteKnowledge(options: SqliteKnowledgeOptions): SqliteKnowledge {
  mkdirSync(dirname(options.databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(options.databasePath, { allowExtension: true });
  try {
    const version = integer(row(db.prepare("PRAGMA user_version").get())?.user_version) ?? 0;
    if (version > schemaVersion) throw new Error("Knowledge database schema is newer than this provider");
    try { loadVec(db); } catch (cause) { throw cause; }
    db.enableLoadExtension(false);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    if (version === 0) initialize(db);
    if ((integer(row(db.prepare("PRAGMA user_version").get())?.user_version) ?? 0) !== schemaVersion) throw new Error("Knowledge database schema is unsupported");
    const needsFtsKeyMap = !row(db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name='records_fts_keys'").get())?.found;
    db.exec("CREATE TABLE IF NOT EXISTS evidence_tasks(cursor_id TEXT NOT NULL, task_order INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL, record_id TEXT NOT NULL, revision TEXT NOT NULL, depth INTEGER NOT NULL, link_offset INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS evidence_seen(cursor_id TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL, record_id TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(cursor_id,type,origin,record_id,revision)); CREATE TABLE IF NOT EXISTS index_configurations(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,dimensions INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS index_progress(configuration_id TEXT NOT NULL,type TEXT NOT NULL,origin TEXT NOT NULL,record_id TEXT NOT NULL,revision TEXT NOT NULL,operation TEXT NOT NULL DEFAULT 'upsert',PRIMARY KEY(configuration_id,type,origin,record_id)); CREATE TABLE IF NOT EXISTS index_batches(id TEXT PRIMARY KEY,checkpoint TEXT NOT NULL,subject TEXT NOT NULL,configuration_id TEXT NOT NULL,updates TEXT NOT NULL); CREATE TABLE IF NOT EXISTS index_acknowledgements(id TEXT PRIMARY KEY,checkpoint TEXT NOT NULL,subject TEXT NOT NULL); CREATE TABLE IF NOT EXISTS embedding_stage_entries(stage_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL,origin TEXT NOT NULL,record_id TEXT NOT NULL,revision TEXT NOT NULL,vector TEXT NOT NULL,PRIMARY KEY(stage_id,id)); CREATE TABLE IF NOT EXISTS embedding_stage_removals(stage_id TEXT NOT NULL,type TEXT NOT NULL,origin TEXT NOT NULL,record_id TEXT NOT NULL,revision TEXT NOT NULL,PRIMARY KEY(stage_id,type,origin,record_id,revision))");
    if (!db.prepare("SELECT 1 FROM pragma_table_info('index_progress') WHERE name='operation'").get()) db.exec("ALTER TABLE index_progress ADD COLUMN operation TEXT NOT NULL DEFAULT 'upsert'");
    db.exec("CREATE TABLE IF NOT EXISTS records_fts_keys(key TEXT PRIMARY KEY,rowid INTEGER NOT NULL UNIQUE)");
    if (needsFtsKeyMap) db.exec("INSERT OR IGNORE INTO records_fts_keys(key,rowid) SELECT key,rowid FROM records_fts");
    chmodSync(options.databasePath, 0o600);
  } catch (cause) { db.close(); throw cause; }

  const transaction = <T>(operation: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); db.exec("COMMIT"); return result; }
    catch (cause) { db.exec("ROLLBACK"); throw cause; }
  };
  const epoch = () => integer(row(db.prepare("SELECT value FROM metadata WHERE key = 'epoch'").get())?.value) ?? 0;
  const bumpEpoch = () => db.prepare("UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'epoch'").run();
  const current = (ref: RecordRef): Current | undefined => {
    const result = row(db.prepare("SELECT revision, operation, fingerprint FROM current_records WHERE type=? AND origin=? AND id=?").get(ref.type, ref.origin, ref.id));
    const revision = text(result?.revision); const operation = text(result?.operation); const fingerprint = text(result?.fingerprint);
    if (!revision || !fingerprint || (operation !== "upsert" && operation !== "withdraw" && operation !== "delete")) return undefined;
    return { ref: { type: ref.type, origin: ref.origin, id: ref.id, revision }, operation, fingerprint };
  };
  const record = (ref: RecordRef): KnowledgeRecord | undefined => {
    const value = row(db.prepare("SELECT json FROM records WHERE type=? AND origin=? AND id=? AND revision=?").get(ref.type, ref.origin, ref.id, ref.revision))?.json;
    return value === undefined ? undefined : parsedRecord(value);
  };
  const currentRecord = (ref: RecordRef): KnowledgeRecord | undefined => {
    const pointer = current(ref);
    return pointer && pointer.operation !== "delete" && same(pointer.ref, ref) ? record(pointer.ref) : undefined;
  };
  /** A pinned revision remains inspectable across updates/withdrawal, but deletion erases every logical body. */
  const readableRecord = (ref: RecordRef): KnowledgeRecord | undefined => {
    const pointer = current(ref);
    return pointer && pointer.operation !== "delete" ? record(ref) : undefined;
  };
  const exists = (ref: RecordRef) => record(ref) !== undefined;
  const setCurrent = (value: Current) => db.prepare("INSERT INTO current_records(type,origin,id,revision,operation,fingerprint) VALUES(?,?,?,?,?,?) ON CONFLICT(type,origin,id) DO UPDATE SET revision=excluded.revision,operation=excluded.operation,fingerprint=excluded.fingerprint")
    .run(value.ref.type, value.ref.origin, value.ref.id, value.ref.revision, value.operation, value.fingerprint);
  const deleteFts = (ref: RecordRef) => {
    const key = exact(ref); const found = row(db.prepare("SELECT rowid FROM records_fts_keys WHERE key=?").get(key)); const rowid = integer(found?.rowid);
    if (rowid === undefined) return;
    db.prepare("DELETE FROM records_fts WHERE rowid=?").run(rowid); db.prepare("DELETE FROM records_fts_keys WHERE key=?").run(key);
  };
  const insertFts = (entry: KnowledgeRecord) => {
    if (entry.status !== "active") return;
    const key = exact(entry.ref); db.prepare("INSERT INTO records_fts(key,body) VALUES(?,?)").run(key, entry.body);
    const rowid = integer(row(db.prepare("SELECT last_insert_rowid() AS rowid").get())?.rowid); if (rowid === undefined) throw new Error("Unable to index knowledge record");
    db.prepare("INSERT INTO records_fts_keys(key,rowid) VALUES(?,?)").run(key, rowid);
  };
  const linkedClaims = (changed: RecordRef): Iterable<RecordRef> => {
    // SQLite owns the traversal and cycle set; fan-out never becomes a host array.
    db.exec("CREATE TEMP TABLE IF NOT EXISTS affected_claims(type TEXT,origin TEXT,id TEXT,revision TEXT,PRIMARY KEY(type,origin,id)); DELETE FROM affected_claims");
    db.prepare(`INSERT INTO affected_claims WITH RECURSIVE affected(type,origin,id) AS (
      SELECT ?,?,? UNION
      SELECT l.from_type,l.from_origin,l.from_id FROM links l JOIN affected a
      ON l.to_type=a.type AND l.to_origin=a.origin AND l.to_id=a.id
      JOIN current_records c ON c.type=l.from_type AND c.origin=l.from_origin AND c.id=l.from_id AND c.revision=l.from_revision
      WHERE l.from_type='claim' AND c.operation='upsert' AND l.relation!='history'
    ) SELECT c.type,c.origin,c.id,c.revision FROM affected a JOIN current_records c
    ON c.type=a.type AND c.origin=a.origin AND c.id=a.id
    WHERE c.type='claim' AND c.operation='upsert' AND NOT(c.type=? AND c.origin=? AND c.id=?)`)
      .run(changed.type, changed.origin, changed.id, changed.type, changed.origin, changed.id);
    return { *[Symbol.iterator]() { for (const item of db.prepare("SELECT * FROM affected_claims").iterate()) {
      const value = row(item)!; yield { type: "claim" as const, origin: String(value.origin), id: String(value.id), revision: String(value.revision) };
    } } };
  };
  const staleClaims = (claims: Iterable<RecordRef>) => {
    for (const claim of claims) {
      const item = record(claim);
      if (!item || item.ref.type !== "claim" || item.status !== "active" || !("freshness" in item) || item.freshness === "stale") continue;
      const stale = { ...item, freshness: "stale" as const };
      db.prepare("UPDATE records SET json=? WHERE type=? AND origin=? AND id=? AND revision=?").run(json(stale), claim.type, claim.origin, claim.id, claim.revision);
      deleteFts(claim); insertFts(stale);
    }
  };
  const staleDependents = (changed: RecordRef) => staleClaims(linkedClaims(changed));
  const discardIndexBatchesFor = (ref: RecordRef) => {
    for (const entry of db.prepare("SELECT id,updates FROM index_batches").iterate()) {
      const value = row(entry)!;
      try {
        const updates = JSON.parse(String(value.updates)) as Array<{ readonly operation?: unknown; readonly record?: { readonly ref?: RecordRef }; readonly ref?: RecordRef }>;
        if (updates.some((update) => sameLogical(update.operation === "upsert" ? update.record?.ref ?? ref : update.ref ?? ref, ref))) db.prepare("DELETE FROM index_batches WHERE id=?").run(String(value.id));
      } catch { db.prepare("DELETE FROM index_batches WHERE id=?").run(String(value.id)); }
    }
  };
  const event = (ref: RecordRef, operation: "upsert" | "withdraw" | "delete", affectedOverride?: Iterable<RecordRef>, descendantsOnly = false) => {
    db.prepare("INSERT INTO events(type,origin,id,revision,operation,created_at) VALUES(?,?,?,?,?,?)").run(ref.type, ref.origin, ref.id, ref.revision, operation, Date.now());
    const sequence = integer(row(db.prepare("SELECT last_insert_rowid() AS sequence").get())?.sequence);
    if (!sequence) throw new Error("Unable to create knowledge work event");
    const affected = affectedOverride ?? linkedClaims(ref);
    let count = 0;
    for (const claim of affected) { count++; db.prepare("INSERT INTO work_units(id,event_sequence,affected_type,affected_origin,affected_id,affected_revision,completed,batch_id) VALUES(?,?,?,?,?,?,0,NULL)").run(randomUUID(), sequence, claim.type, claim.origin, claim.id, claim.revision); }
    if (!count && !descendantsOnly) db.prepare("INSERT INTO work_units(id,event_sequence,completed,batch_id) VALUES(?,?,0,NULL)").run(randomUUID(), sequence);
  };
  const allowed = async (subject: TrustedKnowledgeSubject, action: string, ref?: RecordRef): Promise<boolean> => {
    try {
      const resolved = await options.resolveResource({ subject, action, ...(ref ? { ref } : {}) });
      const resource = AuthZenEntitySchema.safeParse(resolved);
      if (!resource.success) return false;
      const result = AuthorizationResultSchema.safeParse(await options.authorizer.authorize({ subject, action: { name: action }, resource: resource.data }));
      return result.success && "decision" in result.data && result.data.decision === true;
    } catch { return false; }
  };
  const allowedRecord = async (subject: TrustedKnowledgeSubject, action: string, value: KnowledgeRecord): Promise<boolean> => {
    for (const ref of [value.ref, ...value.provenance.inputs]) if (!await allowed(subject, action, ref)) return false;
    return true;
  };
  const cursor = (kind: string, subject: TrustedKnowledgeSubject, signature: string, payload: unknown) => {
    const id = randomUUID(); db.prepare("INSERT INTO cursors(id,kind,subject,signature,epoch,payload) VALUES(?,?,?,?,?,?)").run(id, kind, subjectKey(subject), signature, epoch(), json(payload)); return id;
  };
  const readCursor = (id: string, kind: string, subject: TrustedKnowledgeSubject, signature: string): StoredCursor | "invalid_cursor" | "invalidated" => {
    const found = row(db.prepare("SELECT subject,signature,epoch,payload FROM cursors WHERE id=? AND kind=?").get(id, kind));
    if (!found || text(found.subject) !== subjectKey(subject) || text(found.signature) !== signature) return "invalid_cursor";
    const savedEpoch = integer(found.epoch); if (savedEpoch === undefined || savedEpoch !== epoch()) return "invalidated";
    return { subject: subjectKey(subject), signature, epoch: savedEpoch, payload: JSON.parse(String(found.payload)) };
  };

  const intake: KnowledgeIntake = { ingest: async (subject, input): Promise<IntakeResult> => {
    let parsed; try { parsed = IntakeInputSchema.parse(input); } catch { return { kind: "failure", code: "invalid" }; }
    const inputRef = parsed.operation === "delete" ? parsed.ref : parsed.record.ref;
    if (!await allowed(subject, "knowledge.ingest", inputRef)) return { kind: "denied" };
    try { return transaction(() => {
      const ref = parsed.operation === "delete" ? parsed.ref : parsed.record.ref;
      const prior = current(ref); const fingerprint = json(parsed);
      if (prior?.ref.revision === ref.revision) return prior.fingerprint === fingerprint ? { kind: "duplicate", revision: ref.revision } : { kind: "conflict" };
      if (parsed.expectedRevision === null ? prior !== undefined : prior?.ref.revision !== parsed.expectedRevision) return { kind: "conflict" };
      const deletionDependents = parsed.operation === "delete" ? linkedClaims(ref) : undefined;
      if (parsed.operation === "delete") {
        for (const entry of db.prepare("SELECT revision FROM records WHERE type=? AND origin=? AND id=?").all(ref.type, ref.origin, ref.id)) deleteFts({ ...ref, revision: String(row(entry)?.revision) });
        db.prepare("DELETE FROM records WHERE type=? AND origin=? AND id=?").run(ref.type, ref.origin, ref.id);
        db.prepare("DELETE FROM embedding_entries WHERE type=? AND origin=? AND record_id=?").run(ref.type, ref.origin, ref.id);
        db.prepare("DELETE FROM links WHERE (from_type=? AND from_origin=? AND from_id=?) OR (to_type=? AND to_origin=? AND to_id=?)").run(ref.type, ref.origin, ref.id, ref.type, ref.origin, ref.id);
      } else {
        if (parsed.links.some((link) => !same(link.from, ref) || !exists(link.to))) return { kind: "conflict" };
        if (prior && prior.operation !== "delete") deleteFts(prior.ref);
        db.prepare("INSERT INTO records(type,origin,id,revision,json) VALUES(?,?,?,?,?)").run(ref.type, ref.origin, ref.id, ref.revision, json(parsed.record));
        for (const link of parsed.links) db.prepare("INSERT INTO links(from_type,from_origin,from_id,from_revision,to_type,to_origin,to_id,to_revision,relation) VALUES(?,?,?,?,?,?,?,?,?)").run(link.from.type, link.from.origin, link.from.id, link.from.revision, link.to.type, link.to.origin, link.to.id, link.to.revision, link.relation);
        insertFts(parsed.record);
      }
      setCurrent({ ref, operation: parsed.operation, fingerprint }); discardIndexBatchesFor(ref);
      if (prior) deletionDependents ? staleClaims(deletionDependents) : staleDependents(ref);
      event(ref, parsed.operation, deletionDependents); bumpEpoch(); return { kind: "accepted", revision: ref.revision };
    }); } catch { return { kind: "failure", code: "unavailable" }; }
  } };

  const retrieval: KnowledgeRetrieval = {
    search: async (subject, request): Promise<SearchResult> => {
      let parsed; try { parsed = SearchRequestSchema.parse(request); } catch { return { kind: "failure", code: "invalid" }; }
      if (!await allowed(subject, "knowledge.search")) return { kind: "denied" };
      const signature = json({ ...parsed, cursor: undefined }); let offset = 0;
      if (parsed.cursor) { const saved = readCursor(parsed.cursor, "search", subject, signature); if (typeof saved === "string") return { kind: saved }; offset = Number((saved.payload as { offset?: unknown }).offset ?? 0); }
      try {
        // Cursor existence must not disclose filtered-out results. Only create
        // one after finding an authorized successor in this bounded raw window.
        const scanBudget = Math.max(100, parsed.limit * 4);
        const matches = db.prepare("SELECT key, bm25(records_fts) AS score FROM records_fts WHERE records_fts MATCH ? ORDER BY score LIMIT ? OFFSET ?").all(queryText(parsed.query), scanBudget + 1, offset);
        const items: Extract<SearchResult, { readonly kind: "ok" }>["items"] = [];
        let nextOffset: number | undefined;
        for (let index = 0; index < matches.length; index++) {
          const entry = matches[index]!;
          const found = row(entry); const key = text(found?.key); if (!key) continue;
          const [type, origin, id, revision] = JSON.parse(key) as string[]; if (!type || !origin || !id || !revision) continue;
          const ref = { type: type as RecordRef["type"], origin, id, revision }; const item = currentRecord(ref);
          if (item?.status !== "active" || !await allowedRecord(subject, "knowledge.search", item)) continue;
          if (items.length < parsed.limit) { items.push({ record: item, relevance: -(Number(found?.score) || 0) }); continue; }
          nextOffset = offset + index; break;
        }
        if (bytes(items) > parsed.maxBytes) return { kind: "failure", code: "too_large" };
        if (nextOffset === undefined && matches.length > scanBudget) return { kind: "failure", code: "too_large" };
        const next = nextOffset === undefined ? undefined : cursor("search", subject, signature, { offset: nextOffset });
        return { kind: "ok", mode: "lexical", semantic: { status: "unavailable" }, items, bytes: bytes(items), ...(next ? { cursor: next as never } : {}) };
      } catch { return { kind: "failure", code: "unavailable" }; }
    },
    get: async (subject, ref): Promise<RecordReadResult> => {
      const observedEpoch = epoch();
      if (!await allowed(subject, "knowledge.get", ref)) return { kind: "denied" };
      const item = readableRecord(ref);
      if (item && !await allowedRecord(subject, "knowledge.get", item)) return { kind: "denied" };
      if (epoch() !== observedEpoch) return { kind: "invalidated" };
      return item ? { kind: "ok", record: item } : { kind: "ok" };
    },
    expand: async (subject, request) => thisExpand(db, allowed, cursor, readCursor, subject, request),
    evidence: async (subject, request) => thisEvidence(db, allowed, cursor, readCursor, readableRecord, epoch, subject, request),
    export: async (subject, request) => {
      let parsed; try { parsed = KnowledgeExportRequestSchema.parse(request); } catch { return { kind: "failure", code: "invalid" }; }
      if (!await allowed(subject, "knowledge.export")) return { kind: "denied" };
      const records: KnowledgeRecord[] = [];
      for (const ref of parsed.refs) {
        if (!await allowed(subject, "knowledge.export", ref)) return { kind: "denied" };
        const item = readableRecord(ref); if (item) { if (!await allowedRecord(subject, "knowledge.export", item)) return { kind: "denied" }; records.push(item); }
      }
      const links: KnowledgeLink[] = [];
      for (const ref of parsed.refs) for (const item of db.prepare("SELECT * FROM links WHERE (from_type=? AND from_origin=? AND from_id=? AND from_revision=?) OR (to_type=? AND to_origin=? AND to_id=? AND to_revision=?)").iterate(ref.type, ref.origin, ref.id, ref.revision, ref.type, ref.origin, ref.id, ref.revision)) {
        const link = linkFrom(row(item)!);
        if (!await allowed(subject, "knowledge.export", link.from) || !await allowed(subject, "knowledge.export", link.to)) return { kind: "denied" };
        links.push(link);
        if (bytes({ records, links }) > parsed.maxBytes) return { kind: "failure", code: "too_large" };
      }
      if (bytes({ records, links }) > parsed.maxBytes) return { kind: "failure", code: "too_large" };
      return { kind: "ok", records, links, bytes: bytes({ records, links }) };
    },
  };

  const maintenance: KnowledgeMaintenance = {
    status: async (subject) => {
      if (!await allowed(subject, "knowledge.maintain")) return { kind: "denied" };
      const result = row(db.prepare("SELECT count(*) AS count,min(events.created_at) AS oldest FROM work_units JOIN events ON events.sequence=work_units.event_sequence WHERE work_units.completed=0").get());
      const oldest = integer(result?.oldest);
      return { kind: "ok", pendingUnits: integer(result?.count) ?? 0, checkpoint: `epoch-${epoch()}`, ...(oldest === undefined ? {} : { oldestPendingAtMs: oldest }) };
    },
    pending: async (subject, request): Promise<PendingKnowledge> => {
      let parsed; try { parsed = PendingRequestSchema.parse(request); } catch { return { kind: "failure", code: "invalid" }; }
      if (!await allowed(subject, "knowledge.maintain")) return { kind: "denied" };
      const observedEpoch = epoch();
      const existing = row(db.prepare("SELECT id,checkpoint FROM batches WHERE subject=? ORDER BY rowid LIMIT 1").get(subjectKey(subject)));
      const batch = existing ? { id: String(existing.id), checkpoint: String(existing.checkpoint) } : { id: randomUUID(), checkpoint: `work-${randomUUID()}` };
      const entries = db.prepare("SELECT work_units.id AS unit_id,events.type,events.origin,events.id,events.revision,events.operation,work_units.affected_type,work_units.affected_origin,work_units.affected_id,work_units.affected_revision FROM work_units JOIN events ON events.sequence=work_units.event_sequence WHERE work_units.completed=0 AND (work_units.batch_id=? OR (?=0 AND work_units.batch_id IS NULL)) ORDER BY events.sequence,work_units.id LIMIT ?").all(batch.id, existing ? 1 : 0, existing ? 201 : parsed.limit);
        const units = entries.map((entry) => workUnitFrom(row(entry)!));
      if (units.length > parsed.limit || bytes({ batch, units }) + 256 > parsed.maxBytes) return { kind: "failure", code: "too_large" };
      for (const unit of units) {
        if (!await allowed(subject, "knowledge.maintain", unit.update.ref) || (unit.affectedClaim && !await allowed(subject, "knowledge.maintain", unit.affectedClaim))) return { kind: "denied" };
      }
      return transaction(() => {
        if (epoch() !== observedEpoch) return { kind: "failure", code: "unavailable" };
        const persisted = row(db.prepare("SELECT id,checkpoint FROM batches WHERE subject=? ORDER BY rowid LIMIT 1").get(subjectKey(subject)));
        if (persisted) {
          const replayBatch = { id: String(persisted.id), checkpoint: String(persisted.checkpoint) };
          const replayEntries = db.prepare("SELECT work_units.id AS unit_id,events.type,events.origin,events.id,events.revision,events.operation,work_units.affected_type,work_units.affected_origin,work_units.affected_id,work_units.affected_revision FROM work_units JOIN events ON events.sequence=work_units.event_sequence WHERE work_units.batch_id=? AND work_units.completed=0 ORDER BY events.sequence,work_units.id").all(replayBatch.id);
          const replayUnits = replayEntries.map((entry) => workUnitFrom(row(entry)!));
          const authorizedIds = new Set(units.map((unit) => unit.id));
          if (!replayUnits.every((unit) => authorizedIds.has(unit.id))) return { kind: "failure", code: "unavailable" };
          return { kind: "ok" as const, batch: replayBatch, units: replayUnits, remaining: true, bytes: bytes(replayUnits) };
        }
        if (units.length) {
        db.prepare("INSERT INTO batches(id,checkpoint,subject,sequences) VALUES(?,?,?,?)").run(batch.id, batch.checkpoint, subjectKey(subject), json(units.map((unit) => unit.id)));
        for (const unit of units) if (Number(db.prepare("UPDATE work_units SET batch_id=? WHERE id=? AND batch_id IS NULL AND completed=0").run(batch.id, unit.id).changes) !== 1) {
          db.prepare("UPDATE work_units SET batch_id=NULL WHERE batch_id=?").run(batch.id);
          db.prepare("DELETE FROM batches WHERE id=?").run(batch.id);
          return { kind: "failure", code: "unavailable" };
        }
        }
        const result = { kind: "ok" as const, batch, units, remaining: (integer(row(db.prepare("SELECT count(*) AS count FROM work_units WHERE completed=0 AND batch_id IS NULL").get())?.count) ?? 0) > 0, bytes: bytes(units) };
        return result;
      });
    },
    publish: async (subject, input): Promise<PublicationResult> => {
      let parsed; try { parsed = PublicationInputSchema.parse(input); } catch { return { kind: "failure", code: "invalid" }; }
      if (!await allowed(subject, "knowledge.maintain")) return { kind: "denied" };
      const leased = db.prepare("SELECT work_units.id AS unit_id,events.type,events.origin,events.id,events.revision,events.operation,work_units.affected_type,work_units.affected_origin,work_units.affected_id,work_units.affected_revision FROM work_units JOIN events ON events.sequence=work_units.event_sequence WHERE work_units.batch_id=? AND work_units.completed=0").all(parsed.batch.id);
      for (const item of leased) {
        const unit = workUnitFrom(row(item)!);
        if (!await allowed(subject, "knowledge.maintain", unit.update.ref) || (unit.affectedClaim && !await allowed(subject, "knowledge.maintain", unit.affectedClaim))) return { kind: "denied" };
      }
      for (const proposal of parsed.proposals) {
        if (!await allowedRecord(subject, "knowledge.maintain", proposal.record)) return { kind: "denied" };
        if ("previous" in proposal && proposal.previous && !await allowed(subject, "knowledge.maintain", proposal.previous)) return { kind: "denied" };
        for (const link of proposal.links) if (!await allowed(subject, "knowledge.maintain", link.from) || !await allowed(subject, "knowledge.maintain", link.to)) return { kind: "denied" };
      }
      return transaction(() => publish(db, parsed, subject, current, exists, setCurrent, deleteFts, insertFts, bumpEpoch, staleDependents, event));
    },
    release: async (subject, input) => {
      let parsed; try { parsed = WorkBatchReleaseInputSchema.parse(input); } catch { return { kind: "failure", code: "invalid" } as const; }
      if (!await allowed(subject, "knowledge.maintain")) return { kind: "denied" as const };
      return transaction(() => {
        const batch = row(db.prepare("SELECT id FROM batches WHERE id=? AND checkpoint=? AND subject=?").get(parsed.batch.id, parsed.batch.checkpoint, subjectKey(subject)));
        if (!batch) return { kind: "conflict" as const };
        const pending = integer(row(db.prepare("SELECT count(*) AS count FROM work_units WHERE batch_id=? AND completed=0").get(parsed.batch.id))?.count) ?? 0;
        if (!pending) return { kind: "conflict" as const };
        db.prepare("UPDATE work_units SET batch_id=NULL WHERE batch_id=? AND completed=0").run(parsed.batch.id);
        if (Number(db.prepare("DELETE FROM batches WHERE id=? AND checkpoint=? AND subject=?").run(parsed.batch.id, parsed.batch.checkpoint, subjectKey(subject)).changes) !== 1) throw new Error("Lease release changed unexpectedly");
        return { kind: "released" as const };
      });
    },
  };

  const indexWork: KnowledgeIndexWork = {
    pending: async (subject, input) => {
      let parsed; try { parsed = IndexWorkRequestSchema.parse(input); } catch { return { kind: "failure", code: "invalid" }; }
      if (!await allowed(subject, "knowledge.index")) return { kind: "denied" };
      const known = row(db.prepare("SELECT fingerprint,dimensions FROM index_configurations WHERE id=?").get(parsed.configuration.id));
      if (known && (text(known.fingerprint) !== parsed.configuration.fingerprint || integer(known.dimensions) !== parsed.configuration.dimensions)) return { kind: "failure", code: "unavailable" };
      if (!known) db.prepare("INSERT INTO index_configurations(id,fingerprint,dimensions) VALUES(?,?,?)").run(parsed.configuration.id, parsed.configuration.fingerprint, parsed.configuration.dimensions);
      const existing = row(db.prepare("SELECT id,checkpoint,updates FROM index_batches WHERE subject=? AND configuration_id=? ORDER BY rowid LIMIT 1").get(subjectKey(subject), parsed.configuration.id));
      if (existing) {
        const updates = JSON.parse(String(existing.updates)) as Array<{ readonly operation: string; readonly record?: KnowledgeRecord; readonly ref?: RecordRef }>;
        if (updates.length > parsed.limit || bytes(updates) > parsed.maxBytes) return { kind: "failure", code: "too_large" };
        const stale = updates.some((update) => {
          const ref = update.operation === "upsert" ? update.record?.ref : update.ref;
          if (!ref) return true;
          const pointer = current(ref);
          const currentIsActive = pointer?.operation === "upsert" && record(pointer.ref)?.status === "active";
          return update.operation === "upsert"
            ? !currentIsActive || !pointer || !same(pointer.ref, ref)
            : currentIsActive;
        });
        if (stale) db.prepare("DELETE FROM index_batches WHERE id=?").run(String(existing.id));
        else {
        for (const update of updates) {
          if (update.operation === "upsert" && update.record && !await allowedRecord(subject, "knowledge.index", update.record)) return { kind: "denied" };
          if (update.operation === "remove" && update.ref && !await allowed(subject, "knowledge.index", update.ref)) return { kind: "denied" };
        }
        const batch = { id: String(existing.id), checkpoint: String(existing.checkpoint) };
        return { kind: "ok", batch, updates: updates as IndexWorkUpdate[], remaining: true, bytes: bytes(updates) };
        }
      }
      const candidates = db.prepare("SELECT c.type,c.origin,c.id,c.revision,c.operation,p.revision AS indexed_revision,p.operation AS indexed_operation,CASE WHEN c.operation='upsert' AND json_extract(r.json,'$.status')='active' THEN 'upsert' ELSE 'delete' END AS desired_operation FROM current_records c LEFT JOIN records r ON r.type=c.type AND r.origin=c.origin AND r.id=c.id AND r.revision=c.revision LEFT JOIN index_progress p ON p.configuration_id=? AND p.type=c.type AND p.origin=c.origin AND p.record_id=c.id WHERE p.revision IS NULL OR p.revision!=c.revision OR p.operation!=CASE WHEN c.operation='upsert' AND json_extract(r.json,'$.status')='active' THEN 'upsert' ELSE 'delete' END ORDER BY c.type,c.origin,c.id LIMIT ?").all(parsed.configuration.id, parsed.limit + 1);
      const updates: IndexWorkUpdate[] = [];
      for (const candidate of candidates.slice(0, parsed.limit)) {
        const value = row(candidate)!; const type = text(value.type); const origin = text(value.origin); const id = text(value.id); const revision = text(value.revision); const desiredOperation = text(value.desired_operation); const indexedRevision = text(value.indexed_revision); const indexedOperation = text(value.indexed_operation);
        if (!type || !origin || !id || !revision || (desiredOperation !== "upsert" && desiredOperation !== "delete")) continue;
        const ref = { type: type as RecordRef["type"], origin, id, revision };
        const item = desiredOperation === "upsert" ? record(ref) : undefined;
        const currentActive = item?.status === "active" ? item as Extract<KnowledgeRecord, { readonly status: "active" }> : undefined;
        const removalRevision = indexedOperation === "upsert" && indexedRevision ? indexedRevision : revision;
        const removal = desiredOperation === "delete" || (indexedOperation === "upsert" && indexedRevision !== revision)
          ? { id: `remove-${digestIndex(parsed.configuration.id, type, origin, id, removalRevision)}`, operation: "remove" as const, ref: { ...ref, revision: removalRevision } }
          : undefined;
        const upsert = currentActive && (indexedOperation !== "upsert" || indexedRevision !== revision) ? { id: `upsert-${digestIndex(parsed.configuration.id, type, origin, id, revision)}`, operation: "upsert" as const, record: currentActive } : undefined;
        const next = [removal, upsert].filter((entry): entry is IndexWorkUpdate => entry !== undefined);
        if (updates.length && updates.length + next.length > parsed.limit) break;
        if (!updates.length && next.length > parsed.limit && removal) { updates.push(removal); break; }
        updates.push(...next);
      }
      for (const update of updates) {
        if (update.operation === "upsert" && !await allowedRecord(subject, "knowledge.index", update.record)) return { kind: "denied" };
        if (update.operation === "remove" && !await allowed(subject, "knowledge.index", update.ref)) return { kind: "denied" };
      }
      if (bytes(updates) > parsed.maxBytes) return { kind: "failure", code: "too_large" };
      const batch = { id: randomUUID(), checkpoint: `index-${randomUUID()}` };
      if (!updates.length) {
        db.prepare("INSERT INTO index_acknowledgements(id,checkpoint,subject) VALUES(?,?,?)").run(batch.id, batch.checkpoint, subjectKey(subject));
        return { kind: "ok" as const, batch, updates, remaining: false, bytes: 0 };
      }
      db.prepare("INSERT INTO index_batches(id,checkpoint,subject,configuration_id,updates) VALUES(?,?,?,?,?)").run(batch.id, batch.checkpoint, subjectKey(subject), parsed.configuration.id, json(updates));
      return { kind: "ok", batch, updates, remaining: candidates.length > parsed.limit, bytes: bytes(updates) };
    },
    acknowledge: async (subject, input) => {
      let parsed; try { parsed = IndexWorkAcknowledgeInputSchema.parse(input); } catch { return { kind: "failure", code: "invalid" }; }
      if (!await allowed(subject, "knowledge.index")) return { kind: "denied" };
      const acknowledged = row(db.prepare("SELECT checkpoint,subject FROM index_acknowledgements WHERE id=?").get(parsed.batch.id));
      if (acknowledged && text(acknowledged.checkpoint) === parsed.batch.checkpoint && text(acknowledged.subject) === subjectKey(subject)) return { kind: "acknowledged", checkpoint: parsed.batch.checkpoint };
      const batch = row(db.prepare("SELECT checkpoint,subject,configuration_id,updates FROM index_batches WHERE id=?").get(parsed.batch.id));
      if (!batch || text(batch.checkpoint) !== parsed.batch.checkpoint || text(batch.subject) !== subjectKey(subject)) return { kind: "conflict" };
      const configurationId = text(batch.configuration_id); if (!configurationId) return { kind: "conflict" };
      const updates = JSON.parse(String(batch.updates)) as Array<{ readonly operation: string; readonly record?: KnowledgeRecord; readonly ref?: RecordRef }>;
      for (const update of updates) {
        if (update.operation === "upsert" && update.record && !await allowedRecord(subject, "knowledge.index", update.record)) return { kind: "denied" };
        if (update.operation === "remove" && update.ref && !await allowed(subject, "knowledge.index", update.ref)) return { kind: "denied" };
      }
      return transaction(() => {
        for (const update of updates) {
          const ref = update.operation === "upsert" ? update.record?.ref : update.ref;
          if (!ref) return { kind: "conflict" as const };
          const pointer = current(ref);
          const currentIsActive = pointer?.operation === "upsert" && record(pointer.ref)?.status === "active";
          const acknowledged = update.operation === "remove" && pointer && !currentIsActive
            ? { ref: pointer.ref, operation: "delete" as const }
            : { ref, operation: update.operation === "upsert" ? "upsert" as const : "delete" as const };
          db.prepare("INSERT INTO index_progress(configuration_id,type,origin,record_id,revision,operation) VALUES(?,?,?,?,?,?) ON CONFLICT(configuration_id,type,origin,record_id) DO UPDATE SET revision=excluded.revision,operation=excluded.operation").run(configurationId, acknowledged.ref.type, acknowledged.ref.origin, acknowledged.ref.id, acknowledged.ref.revision, acknowledged.operation);
        }
        db.prepare("INSERT INTO index_acknowledgements(id,checkpoint,subject) VALUES(?,?,?)").run(parsed.batch.id, parsed.batch.checkpoint, subjectKey(subject));
        db.prepare("DELETE FROM index_batches WHERE id=?").run(parsed.batch.id);
        return { kind: "acknowledged" as const, checkpoint: parsed.batch.checkpoint };
      });
    },
  };

  const embeddingIndex: KnowledgeEmbeddingIndex = embedding(db);
  return { intake, retrieval, maintenance, indexWork, embeddingIndex, close: () => db.close() };
}

const digestIndex = (...parts: readonly string[]) => createHash("sha256").update(json(parts)).digest("hex").slice(0, 32);

function initialize(db: Database): void {
  db.exec(`
    CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO metadata(key,value) VALUES ('epoch','0');
    CREATE TABLE records(type TEXT NOT NULL, origin TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(type,origin,id,revision));
    CREATE TABLE current_records(type TEXT NOT NULL, origin TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL, operation TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(type,origin,id));
    CREATE TABLE links(from_type TEXT NOT NULL, from_origin TEXT NOT NULL, from_id TEXT NOT NULL, from_revision TEXT NOT NULL, to_type TEXT NOT NULL, to_origin TEXT NOT NULL, to_id TEXT NOT NULL, to_revision TEXT NOT NULL, relation TEXT NOT NULL);
    CREATE INDEX links_forward ON links(from_type,from_origin,from_id,from_revision);
    CREATE INDEX links_reverse ON links(to_type,to_origin,to_id,to_revision);
    CREATE VIRTUAL TABLE records_fts USING fts5(key UNINDEXED, body);
    CREATE TABLE records_fts_keys(key TEXT PRIMARY KEY,rowid INTEGER NOT NULL UNIQUE);
    CREATE TABLE events(sequence INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, origin TEXT NOT NULL, id TEXT NOT NULL, revision TEXT NOT NULL, operation TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE work_units(id TEXT PRIMARY KEY, event_sequence INTEGER NOT NULL, affected_type TEXT, affected_origin TEXT, affected_id TEXT, affected_revision TEXT, completed INTEGER NOT NULL, batch_id TEXT);
    CREATE INDEX work_units_pending ON work_units(completed,batch_id,event_sequence);
    CREATE TABLE batches(id TEXT PRIMARY KEY, checkpoint TEXT NOT NULL, subject TEXT NOT NULL, sequences TEXT NOT NULL);
    CREATE TABLE cursors(id TEXT PRIMARY KEY, kind TEXT NOT NULL, subject TEXT NOT NULL, signature TEXT NOT NULL, epoch INTEGER NOT NULL, payload TEXT NOT NULL);
    CREATE TABLE evidence_tasks(cursor_id TEXT NOT NULL, task_order INTEGER PRIMARY KEY AUTOINCREMENT, phase TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL, record_id TEXT NOT NULL, revision TEXT NOT NULL, depth INTEGER NOT NULL, link_offset INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE evidence_seen(cursor_id TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL, record_id TEXT NOT NULL, revision TEXT NOT NULL, PRIMARY KEY(cursor_id,type,origin,record_id,revision));
    CREATE TABLE index_configurations(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,dimensions INTEGER NOT NULL);
    CREATE TABLE index_progress(configuration_id TEXT NOT NULL,type TEXT NOT NULL,origin TEXT NOT NULL,record_id TEXT NOT NULL,revision TEXT NOT NULL,operation TEXT NOT NULL DEFAULT 'upsert',PRIMARY KEY(configuration_id,type,origin,record_id));
    CREATE TABLE index_batches(id TEXT PRIMARY KEY,checkpoint TEXT NOT NULL,subject TEXT NOT NULL,configuration_id TEXT NOT NULL,updates TEXT NOT NULL);
    CREATE TABLE index_acknowledgements(id TEXT PRIMARY KEY,checkpoint TEXT NOT NULL,subject TEXT NOT NULL);
    CREATE TABLE embedding_configurations(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, dimensions INTEGER NOT NULL);
    CREATE TABLE embedding_stages(id TEXT PRIMARY KEY, configuration_id TEXT NOT NULL, generation INTEGER NOT NULL, expected_active INTEGER, UNIQUE(configuration_id,generation));
    CREATE TABLE embedding_entries(configuration_id TEXT NOT NULL, generation INTEGER NOT NULL, id TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL, record_id TEXT NOT NULL, revision TEXT NOT NULL, vector TEXT NOT NULL, PRIMARY KEY(configuration_id,generation,id));
    CREATE TABLE embedding_active(configuration_id TEXT PRIMARY KEY, generation INTEGER NOT NULL);
    CREATE TABLE embedding_stage_entries(stage_id TEXT NOT NULL,id TEXT NOT NULL,type TEXT NOT NULL,origin TEXT NOT NULL,record_id TEXT NOT NULL,revision TEXT NOT NULL,vector TEXT NOT NULL,PRIMARY KEY(stage_id,id));
    CREATE TABLE embedding_stage_removals(stage_id TEXT NOT NULL,type TEXT NOT NULL,origin TEXT NOT NULL,record_id TEXT NOT NULL,revision TEXT NOT NULL,PRIMARY KEY(stage_id,type,origin,record_id,revision));
    PRAGMA user_version = 1;
  `);
}

function linkFrom(value: Row): KnowledgeLink {
  return {
    from: { type: String(value.from_type) as RecordRef["type"], origin: String(value.from_origin), id: String(value.from_id), revision: String(value.from_revision) },
    to: { type: String(value.to_type) as RecordRef["type"], origin: String(value.to_origin), id: String(value.to_id), revision: String(value.to_revision) },
    relation: String(value.relation) as KnowledgeLink["relation"],
  };
}

async function thisExpand(
  db: Database, allowed: (subject: TrustedKnowledgeSubject, action: string, ref?: RecordRef) => Promise<boolean>,
  cursor: (kind: string, subject: TrustedKnowledgeSubject, signature: string, payload: unknown) => string,
  readCursor: (id: string, kind: string, subject: TrustedKnowledgeSubject, signature: string) => StoredCursor | "invalid_cursor" | "invalidated",
  subject: TrustedKnowledgeSubject, request: unknown,
) {
  let parsed; try { parsed = ExpandRequestSchema.parse(request); } catch { return { kind: "failure" as const, code: "invalid" as const }; }
  if (!await allowed(subject, "knowledge.expand")) return { kind: "denied" as const };
  const signature = json({ ...parsed, cursor: undefined }); let offset = 0;
  if (parsed.cursor) { const saved = readCursor(parsed.cursor, "expand", subject, signature); if (typeof saved === "string") return { kind: saved }; offset = Number((saved.payload as { offset?: unknown }).offset ?? 0); }
  const where = parsed.direction === "forward"
    ? "from_type=? AND from_origin=? AND from_id=? AND from_revision=?"
    : "to_type=? AND to_origin=? AND to_id=? AND to_revision=?";
  const scanBudget = Math.max(100, parsed.limit * 4);
  const entries = db.prepare(`SELECT * FROM links WHERE ${where} ORDER BY rowid LIMIT ? OFFSET ?`).all(parsed.ref.type, parsed.ref.origin, parsed.ref.id, parsed.ref.revision, scanBudget + 1, offset);
  const items: KnowledgeLink[] = [];
  let nextOffset: number | undefined;
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]!;
    const link = linkFrom(row(entry)!);
    if (!await allowed(subject, "knowledge.expand", link.from) || !await allowed(subject, "knowledge.expand", link.to)) continue;
    if (items.length < parsed.limit) { items.push(link); continue; }
    nextOffset = offset + index; break;
  }
  if (bytes(items) > parsed.maxBytes || (nextOffset === undefined && entries.length > scanBudget)) return { kind: "failure" as const, code: "too_large" as const };
  const next = nextOffset === undefined ? undefined : cursor("expand", subject, signature, { offset: nextOffset });
  return { kind: "ok" as const, items, bytes: bytes(items), ...(next ? { cursor: next as never } : {}) };
}

async function thisEvidence(
  db: Database, allowed: (subject: TrustedKnowledgeSubject, action: string, ref?: RecordRef) => Promise<boolean>,
  cursor: (kind: string, subject: TrustedKnowledgeSubject, signature: string, payload: unknown) => string,
  readCursor: (id: string, kind: string, subject: TrustedKnowledgeSubject, signature: string) => StoredCursor | "invalid_cursor" | "invalidated",
  readableRecord: (ref: RecordRef) => KnowledgeRecord | undefined,
  epoch: () => number,
  subject: TrustedKnowledgeSubject, request: unknown,
) {
  let parsed; try { parsed = EvidenceRequestSchema.parse(request); } catch { return { kind: "failure" as const, code: "invalid" as const }; }
  const observedEpoch = epoch();
  if (!await allowed(subject, "knowledge.evidence")) return { kind: "denied" as const };
  const signature = json({ ...parsed, cursor: undefined });
  let cursorId: string;
  if (parsed.cursor) {
    const saved = readCursor(parsed.cursor, "evidence", subject, signature); if (typeof saved === "string") return { kind: saved };
    // A continuation is a replayable capability, not a mutable iterator.  Work
    // from this page belongs to a fresh cursor so a retry starts from exactly
    // the same traversal state.
    cursorId = cursor("evidence", subject, signature, { traversal: "sqlite-work-queue" });
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO evidence_tasks(cursor_id,phase,type,origin,record_id,revision,depth,link_offset) SELECT ?,phase,type,origin,record_id,revision,depth,link_offset FROM evidence_tasks WHERE cursor_id=? ORDER BY task_order").run(cursorId, parsed.cursor);
      db.prepare("INSERT INTO evidence_seen(cursor_id,type,origin,record_id,revision) SELECT ?,type,origin,record_id,revision FROM evidence_seen WHERE cursor_id=?").run(cursorId, parsed.cursor);
      db.exec("COMMIT");
    } catch (cause) { db.exec("ROLLBACK"); throw cause; }
  } else {
    cursorId = cursor("evidence", subject, signature, { traversal: "sqlite-work-queue" });
    db.prepare("INSERT INTO evidence_tasks(cursor_id,phase,type,origin,record_id,revision,depth) VALUES(?,?,?,?,?,?,0)").run(cursorId, "record", parsed.root.type, parsed.root.origin, parsed.root.id, parsed.root.revision);
  }
  const records: KnowledgeRecord[] = []; const links: KnowledgeLink[] = [];
  const hasRoom = (next: KnowledgeRecord | KnowledgeLink) => bytes({ records: [...records, ...(isRecord(next) ? [next] : [])], links: [...links, ...(isRecord(next) ? [] : [next])] }) <= parsed.maxBytes;
  const scanBudget = Math.max(100, (parsed.maxRecords + parsed.maxLinks) * 4);
  let scanned = 0;
  for (;;) {
    if (scanned++ >= scanBudget) return { kind: "failure" as const, code: "too_large" as const };
    const task = row(db.prepare("SELECT task_order,phase,type,origin,record_id,revision,depth,link_offset FROM evidence_tasks WHERE cursor_id=? ORDER BY task_order LIMIT 1").get(cursorId));
    if (!task) break;
    const taskOrder = integer(task.task_order); const phase = text(task.phase); const depth = integer(task.depth); const linkOffset = integer(task.link_offset);
    const type = text(task.type); const origin = text(task.origin); const id = text(task.record_id); const revision = text(task.revision);
    if (taskOrder === undefined || !phase || depth === undefined || linkOffset === undefined || !type || !origin || !id || !revision) return { kind: "failure" as const, code: "unavailable" as const };
    const ref = { type: type as RecordRef["type"], origin, id, revision };
    if (phase === "record") {
      if (records.length >= parsed.maxRecords) break;
      const alreadySeen = row(db.prepare("SELECT 1 AS seen FROM evidence_seen WHERE cursor_id=? AND type=? AND origin=? AND record_id=? AND revision=?").get(cursorId, ref.type, ref.origin, ref.id, ref.revision));
      const item = readableRecord(ref);
      let permitted = item && await allowed(subject, "knowledge.evidence", ref);
      if (item) for (const input of item.provenance.inputs) if (!await allowed(subject, "knowledge.evidence", input)) permitted = false;
      if (alreadySeen || !item || !permitted) { db.prepare("DELETE FROM evidence_tasks WHERE task_order=?").run(taskOrder); continue; }
      if (!hasRoom(item)) {
        if (!records.length && !links.length) return { kind: "failure" as const, code: "too_large" as const };
        if (epoch() !== observedEpoch) return { kind: "invalidated" as const };
        return { kind: "ok" as const, records, links, bytes: bytes({ records, links }), cursor: cursorId as never };
      }
      db.prepare("DELETE FROM evidence_tasks WHERE task_order=?").run(taskOrder);
      db.prepare("INSERT INTO evidence_seen(cursor_id,type,origin,record_id,revision) VALUES(?,?,?,?,?)").run(cursorId, ref.type, ref.origin, ref.id, ref.revision);
      records.push(item);
      if (depth < parsed.maxDepth) db.prepare("INSERT INTO evidence_tasks(cursor_id,phase,type,origin,record_id,revision,depth) VALUES(?,?,?,?,?,?,?)").run(cursorId, "links", ref.type, ref.origin, ref.id, ref.revision, depth);
      continue;
    }
    if (phase !== "links" || depth >= parsed.maxDepth) { db.prepare("DELETE FROM evidence_tasks WHERE task_order=?").run(taskOrder); continue; }
    if (links.length >= parsed.maxLinks) break;
    const where = parsed.direction === "forward" ? "from_type=? AND from_origin=? AND from_id=? AND from_revision=?" : "to_type=? AND to_origin=? AND to_id=? AND to_revision=?";
    const found = row(db.prepare(`SELECT * FROM links WHERE ${where} ORDER BY rowid LIMIT 1 OFFSET ?`).get(ref.type, ref.origin, ref.id, ref.revision, linkOffset));
    if (!found) { db.prepare("DELETE FROM evidence_tasks WHERE task_order=?").run(taskOrder); continue; }
    const link = linkFrom(found);
    if (!await allowed(subject, "knowledge.evidence", link.from) || !await allowed(subject, "knowledge.evidence", link.to)) { db.prepare("UPDATE evidence_tasks SET link_offset=? WHERE task_order=?").run(linkOffset + 1, taskOrder); continue; }
    if (!hasRoom(link)) {
      if (!records.length && !links.length) return { kind: "failure" as const, code: "too_large" as const };
      if (epoch() !== observedEpoch) return { kind: "invalidated" as const };
      return { kind: "ok" as const, records, links, bytes: bytes({ records, links }), cursor: cursorId as never };
    }
    db.prepare("UPDATE evidence_tasks SET link_offset=? WHERE task_order=?").run(linkOffset + 1, taskOrder);
    links.push(link);
    const target = parsed.direction === "forward" ? link.to : link.from;
    db.prepare("INSERT INTO evidence_tasks(cursor_id,phase,type,origin,record_id,revision,depth) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM evidence_tasks WHERE cursor_id=? AND phase='record' AND type=? AND origin=? AND record_id=? AND revision=?) AND NOT EXISTS (SELECT 1 FROM evidence_seen WHERE cursor_id=? AND type=? AND origin=? AND record_id=? AND revision=?)").run(cursorId, "record", target.type, target.origin, target.id, target.revision, depth + 1, cursorId, target.type, target.origin, target.id, target.revision, cursorId, target.type, target.origin, target.id, target.revision);
  }
  const next = row(db.prepare("SELECT 1 AS pending FROM evidence_tasks WHERE cursor_id=? LIMIT 1").get(cursorId)) ? cursorId : undefined;
  if (epoch() !== observedEpoch) return { kind: "invalidated" as const };
  return { kind: "ok" as const, records, links, bytes: bytes({ records, links }), ...(next ? { cursor: next as never } : {}) };
}

function isRecord(value: KnowledgeRecord | KnowledgeLink): value is KnowledgeRecord { return "body" in value; }

function workUnitFrom(value: Row) {
  const update = {
    ref: { type: String(value.type) as RecordRef["type"], origin: String(value.origin), id: String(value.id), revision: String(value.revision) },
    operation: String(value.operation) as "upsert" | "withdraw" | "delete",
  };
  const id = String(value.unit_id);
  if (!value.affected_type || !value.affected_origin || !value.affected_id || !value.affected_revision) return { id, update };
  return { id, update, affectedClaim: { type: "claim" as const, origin: String(value.affected_origin), id: String(value.affected_id), revision: String(value.affected_revision) } };
}

function publish(
  db: Database, input: ReturnType<typeof PublicationInputSchema.parse>, subject: TrustedKnowledgeSubject,
  current: (ref: RecordRef) => Current | undefined, exists: (ref: RecordRef) => boolean,
  setCurrent: (value: Current) => void, deleteFts: (ref: RecordRef) => void,
  insertFts: (entry: KnowledgeRecord) => void, bumpEpoch: () => void,
  staleDependents: (ref: RecordRef) => void,
  event: (ref: RecordRef, operation: "upsert" | "withdraw" | "delete", affectedOverride?: Iterable<RecordRef>, descendantsOnly?: boolean) => void,
): PublicationResult {
  const batch = row(db.prepare("SELECT checkpoint,subject,sequences FROM batches WHERE id=?").get(input.batch.id));
  if (!batch || text(batch.checkpoint) !== input.batch.checkpoint || text(batch.subject) !== subjectKey(subject)) return { kind: "conflict" };
  const unitIds = (JSON.parse(String(batch.sequences)) as unknown[]).filter((id): id is string => typeof id === "string");
  const units = unitIds.map((id) => row(db.prepare("SELECT work_units.id,events.type,events.origin,events.id AS record_id,events.revision,events.operation FROM work_units JOIN events ON events.sequence=work_units.event_sequence WHERE work_units.id=? AND work_units.batch_id=? AND work_units.completed=0").get(id, input.batch.id)));
  if (units.some((unit) => !unit)) return { kind: "conflict" };
  const staleUnitIds: string[] = [];
  for (const unit of units) {
    const value = unit!;
    const ref = { type: String(value.type) as RecordRef["type"], origin: String(value.origin), id: String(value.record_id), revision: String(value.revision) };
    if (!same(current(ref)?.ref ?? { ...ref, revision: "missing" }, ref)) staleUnitIds.push(String(value.id));
  }
  if (staleUnitIds.length) {
    for (const id of staleUnitIds) db.prepare("DELETE FROM work_units WHERE id=? AND batch_id=?").run(id, input.batch.id);
    db.prepare("UPDATE work_units SET batch_id=NULL WHERE batch_id=? AND completed=0").run(input.batch.id);
    db.prepare("DELETE FROM batches WHERE id=?").run(input.batch.id);
    db.prepare("DELETE FROM events WHERE NOT EXISTS (SELECT 1 FROM work_units WHERE work_units.event_sequence=events.sequence)").run();
    return { kind: "conflict" };
  }
  const targets = new Set<string>();
  for (const proposal of input.proposals) {
    if (targets.has(logical(proposal.record.ref))) return { kind: "conflict" };
    targets.add(logical(proposal.record.ref));
  }
  for (const proposal of input.proposals) {
    const permitsOwnPrevious = (ref: RecordRef) => "previous" in proposal && proposal.previous !== undefined && same(proposal.previous, ref) && sameLogical(proposal.record.ref, ref);
    for (const cited of [...proposal.record.provenance.inputs, ...proposal.links.map((link) => link.to)]) {
      if (targets.has(logical(cited)) && !permitsOwnPrevious(cited)) return { kind: "conflict" };
    }
  }
  for (const proposal of input.proposals) {
    if (proposal.expectedRevision === null ? current(proposal.record.ref) !== undefined : current(proposal.record.ref)?.ref.revision !== proposal.expectedRevision) return { kind: "conflict" };
    const currentEvidence = (ref: RecordRef) => { const pointer = current(ref); return pointer?.operation === "upsert" && same(pointer.ref, ref); };
    if (!proposal.record.provenance.inputs.every(currentEvidence) || proposal.links.some((link) => !currentEvidence(link.to))) return { kind: "conflict" };
  }
  for (const proposal of input.proposals) {
    const prior = current(proposal.record.ref); if (prior) deleteFts(prior.ref);
    db.prepare("INSERT INTO records(type,origin,id,revision,json) VALUES(?,?,?,?,?)").run(proposal.record.ref.type, proposal.record.ref.origin, proposal.record.ref.id, proposal.record.ref.revision, json(proposal.record));
    for (const link of proposal.links) db.prepare("INSERT INTO links(from_type,from_origin,from_id,from_revision,to_type,to_origin,to_id,to_revision,relation) VALUES(?,?,?,?,?,?,?,?,?)").run(link.from.type, link.from.origin, link.from.id, link.from.revision, link.to.type, link.to.origin, link.to.id, link.to.revision, link.relation);
    setCurrent({ ref: proposal.record.ref, operation: "upsert", fingerprint: json(proposal) }); insertFts(proposal.record);
    if (prior) staleDependents(proposal.record.ref);
    event(proposal.record.ref, "upsert", undefined, true);
  }
  for (const id of unitIds) db.prepare("UPDATE work_units SET completed=1,batch_id=NULL WHERE id=? AND batch_id=?").run(id, input.batch.id);
  db.prepare("DELETE FROM events WHERE sequence IN (SELECT event_sequence FROM work_units GROUP BY event_sequence HAVING sum(CASE WHEN completed=0 THEN 1 ELSE 0 END)=0)").run();
  db.prepare("DELETE FROM work_units WHERE completed=1").run();
  db.prepare("DELETE FROM batches WHERE id=?").run(input.batch.id); bumpEpoch();
  const remaining = (integer(row(db.prepare("SELECT count(*) AS count FROM work_units WHERE completed=0").get())?.count) ?? 0) > 0;
  return { kind: "published", checkpoint: `published-${input.batch.checkpoint}`, remaining };
}

function embedding(db: Database): KnowledgeEmbeddingIndex {
  const configurationMatches = (left: Row, right: { id: string; fingerprint: string; dimensions: number }) => text(left.fingerprint) === right.fingerprint && integer(left.dimensions) === right.dimensions;
  const atomic = <T>(operation: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try { const value = operation(); db.exec("COMMIT"); return value; }
    catch (cause) { db.exec("ROLLBACK"); throw cause; }
  };
  return {
    async prepare(input) {
      const parsed = EmbeddingIndexPrepareSchema.parse(input); const known = row(db.prepare("SELECT fingerprint,dimensions FROM embedding_configurations WHERE id=?").get(parsed.configuration.id));
      const active = row(db.prepare("SELECT generation FROM embedding_active WHERE configuration_id=?").get(parsed.configuration.id)); const generation = integer(active?.generation) ?? null;
      if (known && !configurationMatches(known, parsed.configuration)) return { kind: "configuration_mismatch" };
      if (generation !== parsed.expectedActiveGeneration || parsed.generation <= (generation ?? 0)) return { kind: "conflict" };
      const pending = row(db.prepare("SELECT id,expected_active FROM embedding_stages WHERE configuration_id=? AND generation=?").get(parsed.configuration.id, parsed.generation));
      if (pending) {
        if ((integer(pending.expected_active) ?? null) !== parsed.expectedActiveGeneration) return { kind: "conflict" };
        return { kind: "ready", stageId: String(pending.id), generation: parsed.generation, activeGeneration: generation };
      }
      return atomic(() => {
        db.prepare("INSERT INTO embedding_configurations(id,fingerprint,dimensions) VALUES(?,?,?) ON CONFLICT(id) DO NOTHING").run(parsed.configuration.id, parsed.configuration.fingerprint, parsed.configuration.dimensions);
        const stageId = randomUUID(); db.prepare("INSERT INTO embedding_stages(id,configuration_id,generation,expected_active) VALUES(?,?,?,?)").run(stageId, parsed.configuration.id, parsed.generation, parsed.expectedActiveGeneration);
        return { kind: "ready" as const, stageId, generation: parsed.generation, activeGeneration: generation };
      });
    },
    async stage(input) {
      const parsed = EmbeddingIndexStageSchema.parse(input); const stage = row(db.prepare("SELECT configuration_id,generation FROM embedding_stages WHERE id=?").get(parsed.stageId)); if (!stage) return { kind: "conflict" };
      const configurationId = text(stage.configuration_id); const generation = integer(stage.generation); if (!configurationId || generation === undefined) return { kind: "conflict" };
      const config = row(db.prepare("SELECT dimensions FROM embedding_configurations WHERE id=?").get(configurationId)); const dimensions = integer(config?.dimensions); if (!dimensions) return { kind: "conflict" };
      if (parsed.entries.some((entry) => entry.vector.length !== dimensions)) return { kind: "dimension_mismatch" };
      const staleReference = parsed.entries.some((entry) => {
        const pointer = row(db.prepare("SELECT revision,operation FROM current_records WHERE type=? AND origin=? AND id=?").get(entry.ref.type, entry.ref.origin, entry.ref.id));
        const revision = text(pointer?.revision); const operation = text(pointer?.operation);
        return revision === undefined || revision !== entry.ref.revision || operation !== "upsert";
      });
      if (staleReference) return { kind: "conflict" };
      atomic(() => {
        for (const removal of parsed.removals) db.prepare("INSERT INTO embedding_stage_removals(stage_id,type,origin,record_id,revision) VALUES(?,?,?,?,?) ON CONFLICT(stage_id,type,origin,record_id,revision) DO NOTHING").run(parsed.stageId, removal.type, removal.origin, removal.id, removal.revision);
        for (const entry of parsed.entries) db.prepare("INSERT INTO embedding_stage_entries(stage_id,id,type,origin,record_id,revision,vector) VALUES(?,?,?,?,?,?,?) ON CONFLICT(stage_id,id) DO UPDATE SET type=excluded.type,origin=excluded.origin,record_id=excluded.record_id,revision=excluded.revision,vector=excluded.vector").run(parsed.stageId, entry.id, entry.ref.type, entry.ref.origin, entry.ref.id, entry.ref.revision, json(entry.vector));
      });
      return { kind: "staged", stageId: parsed.stageId };
    },
    async activate(input) {
      const parsed = EmbeddingIndexActivateSchema.parse(input); const stage = row(db.prepare("SELECT configuration_id,generation,expected_active FROM embedding_stages WHERE id=?").get(parsed.stageId)); if (!stage) return { kind: "conflict" };
      const configurationId = text(stage.configuration_id); const generation = integer(stage.generation); const expectedActive = integer(stage.expected_active) ?? null;
      if (!configurationId || generation === undefined) return { kind: "conflict" };
      const active = row(db.prepare("SELECT generation FROM embedding_active WHERE configuration_id=?").get(configurationId)); if ((integer(active?.generation) ?? null) !== expectedActive || (integer(active?.generation) ?? null) !== parsed.expectedActiveGeneration) return { kind: "conflict" };
      return atomic(() => {
        for (const staged of db.prepare("SELECT id FROM embedding_stage_entries WHERE stage_id=?").iterate(parsed.stageId)) db.prepare("DELETE FROM embedding_entries WHERE configuration_id=? AND id=?").run(configurationId, String(row(staged)?.id));
        db.prepare("DELETE FROM embedding_entries WHERE configuration_id=? AND EXISTS (SELECT 1 FROM embedding_stage_removals r WHERE r.stage_id=? AND r.type=embedding_entries.type AND r.origin=embedding_entries.origin AND r.record_id=embedding_entries.record_id AND r.revision=embedding_entries.revision)").run(configurationId, parsed.stageId);
        db.prepare("INSERT INTO embedding_entries(configuration_id,generation,id,type,origin,record_id,revision,vector) SELECT ?,?,id,type,origin,record_id,revision,vector FROM embedding_stage_entries WHERE stage_id=?").run(configurationId, generation, parsed.stageId);
        db.prepare("INSERT INTO embedding_active(configuration_id,generation) VALUES(?,?) ON CONFLICT(configuration_id) DO UPDATE SET generation=excluded.generation").run(configurationId, generation);
        db.prepare("DELETE FROM embedding_stage_entries WHERE stage_id=?").run(parsed.stageId); db.prepare("DELETE FROM embedding_stage_removals WHERE stage_id=?").run(parsed.stageId); db.prepare("DELETE FROM embedding_stages WHERE id=?").run(parsed.stageId);
        return { kind: "activated" as const, generation };
      });
    },
    async query(input): Promise<EmbeddingIndexQueryResult> {
      const parsed = EmbeddingIndexQuerySchema.parse(input); const config = row(db.prepare("SELECT fingerprint,dimensions FROM embedding_configurations WHERE id=?").get(parsed.configuration.id)); if (!config) return { kind: "unavailable" };
      if (!configurationMatches(config, parsed.configuration)) return { kind: "configuration_mismatch" }; if (parsed.vector.length !== parsed.configuration.dimensions) return { kind: "dimension_mismatch" };
      const active = row(db.prepare("SELECT generation FROM embedding_active WHERE configuration_id=?").get(parsed.configuration.id)); const generation = integer(active?.generation); if (!generation) return { kind: "unavailable" };
      const rows = db.prepare("SELECT e.type,e.origin,e.record_id,e.revision,MIN(vec_distance_cosine(vec_f32(e.vector),vec_f32(?))) AS distance FROM embedding_entries e JOIN current_records c ON c.type=e.type AND c.origin=e.origin AND c.id=e.record_id AND c.revision=e.revision AND c.operation='upsert' JOIN records r ON r.type=e.type AND r.origin=e.origin AND r.id=e.record_id AND r.revision=e.revision WHERE e.configuration_id=? AND e.generation<=? AND json_extract(r.json,'$.status')='active' GROUP BY e.type,e.origin,e.record_id,e.revision ORDER BY distance,e.type,e.origin,e.record_id,e.revision LIMIT ?").all(json(parsed.vector), parsed.configuration.id, generation, parsed.limit);
      const items = rows.map((entry) => { const found = row(entry)!; return { ref: { type: String(found.type) as RecordRef["type"], origin: String(found.origin), id: String(found.record_id), revision: String(found.revision) }, relevance: 1 - Number(found.distance) }; });
      return { kind: "ok", activeGeneration: generation, items };
    },
  };
}
