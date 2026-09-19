import { afterEach, expect, test, spyOn } from "bun:test";
import { Database } from "bun:sqlite";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { HistoryStoreError } from "@drawloom/conversation-history";
import * as historyProvider from "./src/index.js";
const { createSqliteConversationHistory } = historyProvider;

test("provenance conversion is explicit, complete, backed up and idempotent", async () => {
  const file = path();
  const store = createSqliteConversationHistory(file);
  await store.commit("conversation", { expectedRevision: 0, entries: [entry()] });
  await store.close();
  const old = new Database(file);
  old.exec("ALTER TABLE history_entries DROP COLUMN origin; PRAGMA user_version=4;");
  old.close();
  expect(() => createSqliteConversationHistory(file)).toThrow("explicit provenance conversion");
  expect(historyProvider.convertConversationHistory).toBeFunction();
  const backup = file + ".backup";
  expect(() => historyProvider.convertConversationHistory(file, backup, [])).toThrow("provenance");
  expect(
    historyProvider.convertConversationHistory(file, backup, [
      { conversationId: "conversation", id: "one", origin: { kind: "user" } },
    ]),
  ).toEqual({ kind: "converted", entries: 1, backup });
  const saved = new Database(backup, { readonly: true });
  expect(saved.query("PRAGMA user_version").get()).toEqual({ user_version: 4 });
  saved.close();
  expect(historyProvider.convertConversationHistory(file, backup, [])).toEqual({
    kind: "already_current",
  });
  const reopened = createSqliteConversationHistory(file);
  expect(await reopened.get("conversation", "one")).toMatchObject(entry());
  await reopened.close();
});

const directories: string[] = [];
function path() {
  const directory = mkdtempSync(join(tmpdir(), "drawloom-history-"));
  directories.push(directory);
  return join(directory, "history.db");
}
function entry(id = "one") {
  return {
    id,
    position: [-1, 0] as const,
    role: "user" as const,
    origin: { kind: "user" as const },
    text: "hello",
    assets: [],
    state: "complete" as const,
  };
}
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("version one migrates additively with records, checkpoints and cursors unchanged", async () => {
  const file = path();
  let store = createSqliteConversationHistory(file);
  await store.commit("conversation", {
    expectedRevision: 0,
    entries: [entry()],
    checkpoints: [{ namespace: "native", key: "coverage", value: "settled" }],
  });
  const cursor = (await store.page("conversation")).changeCursor;
  await store.close();
  const old = new Database(file);
  old.exec(
    "DROP TRIGGER history_entries_fts_insert; DROP TRIGGER history_entries_fts_delete; DROP TRIGGER history_entries_fts_update; DROP TABLE history_entries_fts; ALTER TABLE history_entries DROP COLUMN resources; ALTER TABLE history_entries DROP COLUMN selections; ALTER TABLE history_entries DROP COLUMN preparation; ALTER TABLE history_entries DROP COLUMN origin; PRAGMA user_version=1;",
  );
  old.close();
  historyProvider.convertConversationHistory(file, file + ".backup", [
    { conversationId: "conversation", id: "one", origin: { kind: "user" } },
  ]);
  store = createSqliteConversationHistory(file);
  try {
    expect((await store.get("conversation", "one"))?.text).toBe("hello");
    expect(await store.checkpoint("conversation", "native", "coverage")).toBe("settled");
    expect((await store.changes("conversation", { after: cursor })).entries).toEqual([]);
    await store.commit("conversation", {
      expectedRevision: 1,
      entries: [{ ...entry(), selections: [{ id: "skill", title: "Skill", source: "public" }] }],
    });
    expect((await store.get("conversation", "one"))?.selections?.[0]?.id).toBe("skill");
  } finally {
    await store.close();
  }
  store = createSqliteConversationHistory(file);
  await store.close();
});

test("version two migration backfills full-text search without changing stored records", async () => {
  const file = path();
  let store = createSqliteConversationHistory(file);
  await store.commit("old", {
    expectedRevision: 0,
    entries: [
      {
        id: "kept",
        position: [0, 0],
        role: "assistant",
        origin: { kind: "assistant" as const },
        text: "Synthetic migration lighthouse",
        assets: [],
        state: "complete",
      },
    ],
  });
  await store.close();
  const old = new Database(file);
  old.exec(
    "DROP TRIGGER history_entries_fts_insert; DROP TRIGGER history_entries_fts_delete; DROP TRIGGER history_entries_fts_update; DROP TABLE history_entries_fts; ALTER TABLE history_entries DROP COLUMN preparation; ALTER TABLE history_entries DROP COLUMN origin; PRAGMA user_version=2;",
  );
  old.close();
  historyProvider.convertConversationHistory(file, file + ".backup", [
    { conversationId: "old", id: "kept", origin: { kind: "assistant" } },
  ]);
  store = createSqliteConversationHistory(file);
  expect((await store.search({ query: "lighthouse" })).items).toEqual([
    expect.objectContaining({ conversationId: "old", entryId: "kept" }),
  ]);
  expect((await store.get("old", "kept"))?.text).toBe("Synthetic migration lighthouse");
  await store.close();
});

test("version three preserves originals and stores preparation references across reopen", async () => {
  const file = path();
  let store = createSqliteConversationHistory(file);
  await store.commit("conversation", { expectedRevision: 0, entries: [entry()] });
  await store.close();
  const old = new Database(file);
  old.exec(
    "ALTER TABLE history_entries DROP COLUMN preparation; ALTER TABLE history_entries DROP COLUMN origin; PRAGMA user_version=3;",
  );
  old.close();
  historyProvider.convertConversationHistory(file, file + ".backup", [
    { conversationId: "conversation", id: "one", origin: { kind: "user" } },
  ]);
  store = createSqliteConversationHistory(file);
  const preparation = {
    kind: "ready" as const,
    references: [
      {
        ref: { type: "source" as const, origin: "public", id: "guide", revision: "r1" },
        status: "active" as const,
        inclusion: "reference_only" as const,
      },
    ],
    receipt: { executionId: "execution", submissionId: "submission" },
  };
  await store.commit("conversation", {
    expectedRevision: 1,
    entries: [{ ...entry(), preparation }],
  });
  await store.close();
  store = createSqliteConversationHistory(file);
  try {
    expect(await store.get("conversation", "one")).toMatchObject({ text: "hello", preparation });
  } finally {
    await store.close();
  }
});

test.each([1, 2])(
  "interrupted migration from version %s rolls back atomically and retains a usable backup",
  async (version) => {
    const file = path();
    let store = createSqliteConversationHistory(file);
    await store.commit("conversation", {
      expectedRevision: 0,
      entries: [entry()],
      checkpoints: [{ namespace: "native", key: "covered", value: "kept" }],
    });
    const cursor = (await store.page("conversation")).changeCursor;
    await store.close();
    const old = new Database(file);
    old.exec(
      "DROP TRIGGER history_entries_fts_insert; DROP TRIGGER history_entries_fts_delete; DROP TRIGGER history_entries_fts_update; DROP TABLE history_entries_fts; ALTER TABLE history_entries DROP COLUMN preparation; ALTER TABLE history_entries DROP COLUMN origin;",
    );
    if (version === 1)
      old.exec(
        "ALTER TABLE history_entries DROP COLUMN resources; ALTER TABLE history_entries DROP COLUMN selections;",
      );
    old.exec(`PRAGMA user_version=${version}`);
    old.close();
    const original = Database.prototype.exec;
    const failure = spyOn(Database.prototype, "exec").mockImplementation(function (
      this: Database,
      sql: string,
    ) {
      if (sql === "ALTER TABLE history_entries ADD COLUMN preparation TEXT")
        throw Error("Injected interruption at additive migration");
      return original.call(this, sql);
    });
    try {
      expect(() =>
        historyProvider.convertConversationHistory(file, file + ".failed-backup", [
          { conversationId: "conversation", id: "one", origin: { kind: "user" } },
        ]),
      ).toThrow();
    } finally {
      failure.mockRestore();
    }
    const interrupted = new Database(file);
    const boundary = interrupted.query("PRAGMA user_version").get();
    interrupted.close();
    expect(boundary).toEqual({ user_version: version });
    historyProvider.convertConversationHistory(file, file + ".backup", [
      { conversationId: "conversation", id: "one", origin: { kind: "user" } },
    ]);
    store = createSqliteConversationHistory(file);
    try {
      expect((await store.get("conversation", "one"))?.text).toBe("hello");
      expect(await store.checkpoint("conversation", "native", "covered")).toBe("kept");
      expect((await store.changes("conversation", { after: cursor })).entries).toEqual([]);
    } finally {
      await store.close();
    }
  },
);

test("existing data directory and SQLite sidecars have private permissions", async () => {
  const file = path();
  chmodSync(dirname(file), 0o755);
  const store = createSqliteConversationHistory(file);
  try {
    await store.commit("conversation", { expectedRevision: 0, entries: [entry()] });
    expect(statSync(dirname(file)).mode & 0o777).toBe(0o700);
    for (const name of [file, file + "-wal", file + "-shm"])
      expect(statSync(name).mode & 0o777).toBe(0o600);
  } finally {
    await store.close();
  }
});

test("empty local history has a usable cursor when native backfill remains", async () => {
  const store = createSqliteConversationHistory(path());
  try {
    await store.commit("conversation", {
      expectedRevision: 0,
      sync: { sync: "idle", hasOlder: true },
    });
    const empty = await store.page("conversation");
    expect(empty.olderCursor).toBeDefined();
    expect((await store.page("conversation", { before: empty.olderCursor })).olderCursor).toBe(
      empty.olderCursor,
    );
    await store.commit("conversation", { expectedRevision: 1, entries: [entry()] });
    expect((await store.page("conversation", { before: empty.olderCursor })).entries).toHaveLength(
      1,
    );
  } finally {
    await store.close();
  }
});

test("reopen preserves records, generation-bound cursors, checkpoints, and private file permissions", async () => {
  const file = path();
  let store = createSqliteConversationHistory(file);
  await store.commit("conversation", {
    expectedRevision: 0,
    entries: [entry()],
    checkpoints: [{ namespace: "native", key: "cursor", value: { value: 3 } }],
  });
  const cursor = (await store.page("conversation")).changeCursor;
  await store.close();

  expect(statSync(file).mode & 0o777).toBe(0o600);
  store = createSqliteConversationHistory(file);
  expect((await store.get("conversation", "one"))?.position).toEqual([-1, 0]);
  expect(await store.checkpoint("conversation", "native", "cursor")).toEqual({ value: 3 });
  expect((await store.changes("conversation", { after: cursor })).entries).toEqual([]);
  await store.close();
});

test("a real SQLite trigger failure rolls back entries, checkpoints, and revision", async () => {
  const file = path();
  const store = createSqliteConversationHistory(file);
  const setup = new Database(file);
  setup.exec(
    "CREATE TRIGGER reject_checkpoint BEFORE INSERT ON history_checkpoints BEGIN SELECT RAISE(ABORT, 'test abort'); END;",
  );
  setup.close();

  await expect(
    store.commit("conversation", {
      expectedRevision: 0,
      entries: [entry()],
      checkpoints: [{ namespace: "native", key: "cursor", value: 3 }],
    }),
  ).rejects.toMatchObject({ code: "unavailable" });
  expect(await store.get("conversation", "one")).toBeUndefined();
  expect(await store.checkpoint("conversation", "native", "cursor")).toBeUndefined();
  expect((await store.status("conversation")).revision).toBe(0);
  await store.close();
});

test("a newer schema is rejected without changing the database", () => {
  const file = path();
  const setup = new Database(file);
  setup.exec(
    "CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('keep'); PRAGMA user_version=3;",
  );
  setup.close();
  const bytes = readFileSync(file),
    permissions = statSync(file).mode;
  expect(() => createSqliteConversationHistory(file)).toThrow(HistoryStoreError);
  expect(readFileSync(file)).toEqual(bytes);
  expect(statSync(file).mode).toBe(permissions);
  const inspect = new Database(file, { readonly: true });
  expect(inspect.query("PRAGMA user_version").get()).toEqual({ user_version: 3 });
  expect(inspect.query("SELECT value FROM sentinel").get()).toEqual({ value: "keep" });
  inspect.close();
});

test("a corrupt database is rejected and its bytes are preserved", () => {
  const file = path();
  writeFileSync(file, "not a sqlite database\n");
  const before = readFileSync(file);
  expect(() => createSqliteConversationHistory(file)).toThrow(HistoryStoreError);
  expect(readFileSync(file)).toEqual(before);
});

test("supported-version schema damage is refused without repair", () => {
  const file = path();
  const db = new Database(file);
  db.exec("CREATE TABLE sentinel(value TEXT); PRAGMA user_version=1;");
  db.close();
  const before = readFileSync(file);
  expect(() => createSqliteConversationHistory(file)).toThrow(HistoryStoreError);
  expect(readFileSync(file)).toEqual(before);
});

test("a wrongly defined named index is refused without modifying the database", async () => {
  const file = path();
  const store = createSqliteConversationHistory(file);
  await store.close();
  const db = new Database(file);
  db.exec(
    "DROP INDEX history_entries_position; CREATE INDEX history_entries_position ON history_entries(text);",
  );
  db.close();
  const before = readFileSync(file);
  expect(() => createSqliteConversationHistory(file)).toThrow(HistoryStoreError);
  expect(readFileSync(file)).toEqual(before);
});

test("persisted status and checkpoint corruption use bounded safe errors", async () => {
  const file = path();
  const store = createSqliteConversationHistory(file);
  await store.commit("conversation", {
    expectedRevision: 0,
    entries: [entry()],
    checkpoints: [{ namespace: "native", key: "cursor", value: 1 }],
  });
  const db = new Database(file);
  db.exec(
    "UPDATE history_checkpoints SET value='private-malformed-json'; UPDATE history_conversations SET sync='private-invalid-status';",
  );
  await expect(store.checkpoint("conversation", "native", "cursor")).rejects.toMatchObject({
    code: "unavailable",
  });
  await expect(store.status("conversation")).rejects.toMatchObject({ code: "unavailable" });
  db.close();
  await store.close();
});

test("provider older history retains a boundary on a short local page", async () => {
  const store = createSqliteConversationHistory(path());
  await store.commit("conversation", {
    expectedRevision: 0,
    entries: [entry()],
    sync: { sync: "idle", hasOlder: true },
  });
  const page = await store.page("conversation");
  expect(page.olderCursor).toBeString();
  await store.commit("conversation", {
    expectedRevision: 1,
    entries: [{ ...entry("older"), position: [-2, 0] }],
  });
  expect(
    (await store.page("conversation", { before: page.olderCursor })).entries.map((e) => e.id),
  ).toEqual(["older"]);
  await store.close();
});
