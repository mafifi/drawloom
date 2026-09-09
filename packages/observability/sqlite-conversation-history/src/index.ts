import { Database } from "bun:sqlite";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from 'node:path';
import {
  ConversationHistoryStatusSchema,
  HistoryChangeOptionsSchema,
  HistoryCommitInputSchema,
  HistoryEntrySchema,
  HistoryPageOptionsSchema,
  HistoryStoreError,
  type ConversationHistoryStatus,
  type ConversationHistoryStore,
  type HistoryChanges,
  type HistoryCommitInput,
  type HistoryEntry,
  type HistoryPage,
} from "@drawloom/conversation-history";

const SCHEMA_VERSION = 1;
const DEFAULT_LIMIT = 50;
const schema = {
  history_meta: 'CREATE TABLE history_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  history_conversations: 'CREATE TABLE history_conversations (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, sync TEXT NOT NULL, has_older INTEGER NOT NULL, message TEXT)',
  history_entries: 'CREATE TABLE history_entries (conversation_id TEXT NOT NULL, id TEXT NOT NULL, position_0 INTEGER NOT NULL, position_1 INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, assets TEXT NOT NULL, operation_id TEXT, state TEXT NOT NULL, changed_sequence INTEGER NOT NULL, PRIMARY KEY (conversation_id, id))',
  history_entries_position: 'CREATE INDEX history_entries_position ON history_entries(conversation_id, position_0, position_1, id)',
  history_entries_changes: 'CREATE INDEX history_entries_changes ON history_entries(conversation_id, changed_sequence)',
  history_checkpoints: 'CREATE TABLE history_checkpoints (conversation_id TEXT NOT NULL, namespace TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY (conversation_id, namespace, key))',
};
const normalizeSql = (sql: string) => sql.replace(/IF NOT EXISTS/gi, '').replace(/\s+/g, '').toLowerCase();
type Cursor = { generation: string; conversationId: string; kind: "page"; position: [number, number] | null; id: string | null } | { generation: string; conversationId: string; kind: "changes"; sequence: number };
type EntryRow = { id: string; position_0: number; position_1: number; role: "user" | "assistant"; text: string; assets: string; operation_id: string | null; state: "partial" | "complete" | "interrupted"; changed_sequence: number };
type StatusRow = { revision: number; sync: ConversationHistoryStatus["sync"]; has_older: number; message: string | null };

function invalid(message: string): HistoryStoreError {
  return new HistoryStoreError("invalid_input", message);
}
function parseId(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw invalid(`${label} must be a non-empty string`);
  return value;
}
function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function decodeCursor(value: string, generation: string, conversationId: string, kind: Cursor["kind"]): Cursor {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object") throw new Error("shape");
    const cursor = decoded as Record<string, unknown>;
    if (cursor.generation !== generation || cursor.conversationId !== conversationId || cursor.kind !== kind) throw new Error("binding");
    if (kind === "changes") {
      if (!Number.isSafeInteger(cursor.sequence) || Number(cursor.sequence) < 0) throw new Error("sequence");
      return cursor as Cursor;
    }
    if (cursor.position === null && cursor.id === null) return cursor as Cursor;
    if (!Array.isArray(cursor.position) || cursor.position.length !== 2 || !cursor.position.every(Number.isSafeInteger) || typeof cursor.id !== "string" || !cursor.id) throw new Error("position");
    return cursor as Cursor;
  } catch (cause) {
    throw new HistoryStoreError("invalid_cursor", "Cursor is invalid for this conversation or store");
  }
}
function record(row: EntryRow): HistoryEntry {
  try {
    return HistoryEntrySchema.parse({ id: row.id, position: [row.position_0, row.position_1], role: row.role, text: row.text, assets: JSON.parse(row.assets), operationId: row.operation_id ?? undefined, state: row.state });
  } catch (cause) {
    throw new HistoryStoreError("unavailable", "Stored conversation history is invalid");
  }
}
function safeRead<T>(read: () => T): T {
  try { return read(); }
  catch (error) {
    if (error instanceof HistoryStoreError) throw error;
    throw new HistoryStoreError('unavailable', 'Stored conversation history could not be read');
  }
}

export function createSqliteConversationHistory(path: string): ConversationHistoryStore {
  parseId(path, "path");
  let db: Database;
  try { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); db = new Database(path, { create: true, strict: true }); }
  catch { throw new HistoryStoreError("unavailable", "Conversation history database could not be opened"); }
  try {
    const version = Number((db.query("PRAGMA user_version").get() as { user_version: number } | null)?.user_version ?? 0);
    if (version > SCHEMA_VERSION) throw new HistoryStoreError("unsupported_version", "Conversation history schema is newer than this provider supports");
    if (version === SCHEMA_VERSION) {
      // Validate before any PRAGMA that changes disk or any initialization DDL.
      for (const [name, expected] of Object.entries(schema)) {
        const row = db.query('SELECT sql FROM sqlite_master WHERE name=?').get(name) as { sql: string } | null;
        if (!row || normalizeSql(row.sql) !== normalizeSql(expected)) throw Error('Invalid history schema');
      }
      const meta = db.query("SELECT key,value FROM history_meta WHERE key IN ('generation','change_sequence')").all() as { key: string; value: string }[];
      if (!meta.some(row => row.key === 'generation' && /^[a-f0-9-]{36}$/.test(row.value)) || !meta.some(row => row.key === 'change_sequence' && /^\d+$/.test(row.value) && Number.isSafeInteger(Number(row.value)))) throw Error('Invalid history metadata');
    } else if ((db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).length) throw Error('Unrecognized history schema');
    chmodSync(dirname(path), 0o700);
    chmodSync(path, 0o600);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
    if (version === 0) db.transaction(() => {
      for (const sql of Object.values(schema)) db.exec(sql);
      db.query("INSERT OR IGNORE INTO history_meta(key,value) VALUES ('generation', ?), ('change_sequence', '0')").run(crypto.randomUUID());
      if (version === 0) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    })();
    chmodSync(path, 0o600);
    // SQLite creates sidecars from the database mode. Also restrict pre-existing
    // sidecars when reopening an installation created with broader permissions.
    for (const sidecar of [path + '-wal', path + '-shm']) if (existsSync(sidecar)) chmodSync(sidecar, 0o600);
  } catch (cause) {
    db.close();
    if (cause instanceof HistoryStoreError) throw cause;
    throw new HistoryStoreError("unavailable", "Conversation history database could not be initialized");
  }

  const generation = String((db.query("SELECT value FROM history_meta WHERE key='generation'").get() as { value: string }).value);
  let closed = false;
  const available = () => { if (closed) throw new HistoryStoreError("unavailable", "Conversation history store is closed"); };
  const readStatus = (conversationId: string): ConversationHistoryStatus => {
    try {
    const row = db.query("SELECT revision,sync,has_older,message FROM history_conversations WHERE id=?").get(conversationId) as StatusRow | null;
    if (row && row.has_older !== 0 && row.has_older !== 1) throw Error('Invalid history status');
    return ConversationHistoryStatusSchema.parse(row ? { revision: row.revision, sync: row.sync, hasOlder: Boolean(row.has_older), message: row.message ?? undefined } : { revision: 0, sync: "idle", hasOlder: false });
    } catch { throw new HistoryStoreError('unavailable', 'Stored conversation status is invalid'); }
  };
  const maxSequence = () => {
    const row = db.query("SELECT value FROM history_meta WHERE key='change_sequence'").get() as { value: string } | null;
    if (!row || !/^\d+$/.test(row.value) || !Number.isSafeInteger(Number(row.value))) throw new HistoryStoreError('unavailable', 'Stored conversation position is invalid');
    return Number(row.value);
  };

  const store: ConversationHistoryStore = {
    async status(conversationId) { available(); return readStatus(parseId(conversationId, "conversationId")); },
    async get(conversationId, id) {
      available(); parseId(conversationId, "conversationId"); parseId(id, "id");
      return safeRead(() => {
      const row = db.query("SELECT * FROM history_entries WHERE conversation_id=? AND id=?").get(conversationId, id) as EntryRow | null;
      return row ? record(row) : undefined;
      });
    },
    async checkpoint(conversationId, namespace, key) {
      available(); parseId(conversationId, "conversationId"); parseId(namespace, "namespace"); parseId(key, "key");
      return safeRead(() => {
      const row = db.query("SELECT value FROM history_checkpoints WHERE conversation_id=? AND namespace=? AND key=?").get(conversationId, namespace, key) as { value: string } | null;
      try { return row ? JSON.parse(row.value) : undefined; }
      catch { throw new HistoryStoreError('unavailable', 'Stored conversation checkpoint is invalid'); }
      });
    },
    async page(conversationId, options = {}) {
      available(); parseId(conversationId, "conversationId");
      return safeRead(() => {
      let parsed; try { parsed = HistoryPageOptionsSchema.parse(options); } catch { throw invalid("Invalid history page options"); }
      const limit = parsed.limit ?? DEFAULT_LIMIT;
      const before = parsed.before ? decodeCursor(parsed.before, generation, conversationId, "page") as Extract<Cursor, { kind: "page" }> : undefined;
      const rows = (before?.position
        ? db.query("SELECT * FROM history_entries WHERE conversation_id=? AND (position_0,position_1,id) < (?,?,?) ORDER BY position_0 DESC,position_1 DESC,id DESC LIMIT ?").all(conversationId, before.position[0], before.position[1], before.id, limit + 1)
        : db.query("SELECT * FROM history_entries WHERE conversation_id=? ORDER BY position_0 DESC,position_1 DESC,id DESC LIMIT ?").all(conversationId, limit + 1)) as EntryRow[];
      const localOlder = rows.length > limit;
      const selected = rows.slice(0, limit).reverse();
      const first = selected[0];
      const status = readStatus(conversationId);
      const boundary: Extract<Cursor, { kind: 'page' }> = first
        ? { generation, conversationId, kind: 'page', position: [first.position_0, first.position_1], id: first.id }
        : before ?? { generation, conversationId, kind: 'page', position: null, id: null };
      return { entries: selected.map(record), olderCursor: localOlder || status.hasOlder ? encodeCursor(boundary) : undefined, hasOlder: localOlder || status.hasOlder, changeCursor: encodeCursor({ generation, conversationId, kind: "changes", sequence: maxSequence() }), status } satisfies HistoryPage;
      });
    },
    async changes(conversationId, options = {}) {
      available(); parseId(conversationId, "conversationId");
      return safeRead(() => {
      let parsed; try { parsed = HistoryChangeOptionsSchema.parse(options); } catch { throw invalid("Invalid history change options"); }
      const limit = parsed.limit ?? DEFAULT_LIMIT;
      if (!parsed.after) {
        const sequence = maxSequence();
        const rows = db.query("SELECT * FROM history_entries WHERE conversation_id=? ORDER BY changed_sequence DESC LIMIT ?").all(conversationId, limit) as EntryRow[];
        return { entries: rows.reverse().map(record), cursor: encodeCursor({ generation, conversationId, kind: "changes", sequence }), hasMore: false, status: readStatus(conversationId) } satisfies HistoryChanges;
      }
      const cursor = decodeCursor(parsed.after, generation, conversationId, "changes") as Extract<Cursor, { kind: "changes" }>;
      if (cursor.sequence > maxSequence()) throw new HistoryStoreError('invalid_cursor', 'History change position is ahead of this store');
      const rows = db.query("SELECT * FROM history_entries WHERE conversation_id=? AND changed_sequence>? ORDER BY changed_sequence ASC LIMIT ?").all(conversationId, cursor.sequence, limit + 1) as EntryRow[];
      const hasMore = rows.length > limit;
      const selected = rows.slice(0, limit);
      const sequence = selected.at(-1)?.changed_sequence ?? cursor.sequence;
      return { entries: selected.map(record), cursor: encodeCursor({ generation, conversationId, kind: "changes", sequence }), hasMore, status: readStatus(conversationId) } satisfies HistoryChanges;
      });
    },
    async commit(conversationId, input) {
      available(); parseId(conversationId, "conversationId");
      let parsed: HistoryCommitInput; try { parsed = HistoryCommitInputSchema.parse(input); } catch { throw invalid("Invalid history commit"); }
      const ids = new Set<string>();
      for (const value of parsed.entries ?? []) { if (ids.has(value.id)) throw invalid("A commit cannot contain duplicate entry IDs"); ids.add(value.id); }
      try {
        return db.transaction(() => {
          const current = readStatus(conversationId);
          if (current.revision !== parsed.expectedRevision) throw new HistoryStoreError("conflict", "Conversation revision does not match expected revision");
          let changed = false;
          let sequence = maxSequence();
          for (const value of parsed.entries ?? []) {
            const existing = db.query("SELECT * FROM history_entries WHERE conversation_id=? AND id=?").get(conversationId, value.id) as EntryRow | null;
            if (existing && (existing.position_0 !== value.position[0] || existing.position_1 !== value.position[1])) throw new HistoryStoreError("conflict", "An existing history entry position cannot change");
            const assets = JSON.stringify(value.assets);
            if (existing && existing.role === value.role && existing.text === value.text && existing.assets === assets && (existing.operation_id ?? undefined) === value.operationId && existing.state === value.state) continue;
            sequence += 1;
            if (!Number.isSafeInteger(sequence)) throw new HistoryStoreError('unavailable', 'History change position is exhausted');
            changed = true;
            db.query(`INSERT INTO history_entries(conversation_id,id,position_0,position_1,role,text,assets,operation_id,state,changed_sequence)
              VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(conversation_id,id) DO UPDATE SET role=excluded.role,text=excluded.text,assets=excluded.assets,operation_id=excluded.operation_id,state=excluded.state,changed_sequence=excluded.changed_sequence`)
              .run(conversationId, value.id, value.position[0], value.position[1], value.role, value.text, assets, value.operationId ?? null, value.state, sequence);
          }
          for (const checkpoint of parsed.checkpoints ?? []) {
            const value = JSON.stringify(checkpoint.value);
            const existing = db.query("SELECT value FROM history_checkpoints WHERE conversation_id=? AND namespace=? AND key=?").get(conversationId, checkpoint.namespace, checkpoint.key) as { value: string } | null;
            if (existing?.value === value) continue;
            changed = true;
            db.query("INSERT INTO history_checkpoints(conversation_id,namespace,key,value) VALUES (?,?,?,?) ON CONFLICT(conversation_id,namespace,key) DO UPDATE SET value=excluded.value").run(conversationId, checkpoint.namespace, checkpoint.key, value);
          }
          const nextSync = parsed.sync ? { sync: parsed.sync.sync, hasOlder: parsed.sync.hasOlder ?? current.hasOlder, message: parsed.sync.message } : current;
          if (nextSync.sync !== current.sync || nextSync.hasOlder !== current.hasOlder || nextSync.message !== current.message) changed = true;
          if (!changed) return current;
          const next = { revision: current.revision + 1, sync: nextSync.sync, hasOlder: nextSync.hasOlder, message: nextSync.message };
          db.query("INSERT INTO history_conversations(id,revision,sync,has_older,message) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,sync=excluded.sync,has_older=excluded.has_older,message=excluded.message").run(conversationId, next.revision, next.sync, next.hasOlder ? 1 : 0, next.message ?? null);
          if (sequence !== maxSequence()) db.query("UPDATE history_meta SET value=? WHERE key='change_sequence'").run(String(sequence));
          return ConversationHistoryStatusSchema.parse(next);
        })();
      } catch (cause) {
        if (cause instanceof HistoryStoreError) throw cause;
        throw new HistoryStoreError("unavailable", "Conversation history commit failed");
      }
    },
    async close() { if (!closed) { closed = true; db.close(); } },
  };
  return store;
}
