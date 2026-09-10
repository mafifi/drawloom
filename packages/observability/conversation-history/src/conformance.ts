import { HistoryStoreError, type ConversationHistoryStore, type HistoryEntry } from "./index.js";

export type ConversationHistoryConformanceFactory = () => Promise<ConversationHistoryStore> | ConversationHistoryStore;

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function entry(index: number, overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return { id: `entry-${index}`, position: [Math.floor(index / 100), index % 100], role: index % 2 ? "assistant" : "user", text: `text-${index}`, assets: [], state: "complete", ...overrides };
}
async function code(promise: Promise<unknown>, expected: HistoryStoreError["code"], label: string, forbidden?: string) {
  try { await promise; } catch (error) {
    check(error instanceof HistoryStoreError && error.code === expected, label);
    if (forbidden) check(!`${String(error)} ${JSON.stringify(error)}`.includes(forbidden), `${label} does not expose private values`);
    return;
  }
  throw new Error(label);
}

/** Provider-neutral behavior suite. Each invocation owns and closes one fresh store. */
export async function conversationHistoryConformance(factory: ConversationHistoryConformanceFactory): Promise<void> {
  const store = await factory();
  try {
    check(JSON.stringify(await store.status("alpha")) === JSON.stringify({ revision: 0, sync: "idle", hasOlder: false }), "empty status");
    const reference = entry(0, { resources: [{ id: 'reference-1', source: 'plugin:public', title: 'Source', status: 'ready', asset: { key: 'asset-1', mediaType: 'text/plain', size: 10 } }], selections: [{ id: 'public:skill:short', title: 'Short writing', source: 'public' }] });
    await store.commit('resources', { expectedRevision: 0, entries: [reference] });
    const storedReference = (await store.get('resources', reference.id))?.resources?.[0];
    check(storedReference?.id === 'reference-1' && storedReference.source === 'plugin:public' && storedReference.asset?.key === 'asset-1' && storedReference.status === 'ready', 'resource display references survive storage');
    check(JSON.stringify((await store.page('resources')).entries[0]?.selections) === JSON.stringify(reference.selections), 'sent selections retain provenance');
    await store.commit('empty-backfill', { expectedRevision: 0, sync: { sync: 'idle', hasOlder: true } });
    const empty = await store.page('empty-backfill');
    check(empty.hasOlder && empty.olderCursor, 'empty provider backfill exposes a usable continuation');
    check((await store.page('empty-backfill', { before: empty.olderCursor })).olderCursor === empty.olderCursor, 'empty continuation remains stable');

    const records = Array.from({ length: 2105 }, (_, index) => entry(index));
    let status = await store.commit("alpha", { expectedRevision: 0, entries: records, checkpoints: [{ namespace: "sync", key: "opaque", value: { token: "secret" } }] });
    check(status.revision === 1, "first commit revision");
    check(JSON.stringify(await store.checkpoint("alpha", "sync", "opaque")) === '{"token":"secret"}', "checkpoint committed atomically");

    const newest = await store.page("alpha", { limit: 200 });
    check(newest.entries.length === 200 && newest.entries[0]?.id === "entry-1905" && newest.entries[199]?.id === "entry-2104", "bounded newest chronological page");
    check(newest.hasOlder && newest.olderCursor !== undefined, "older page cursor");
    const older = await store.page("alpha", { before: newest.olderCursor, limit: 200 });
    check(older.entries[0]?.id === "entry-1705" && older.entries[199]?.id === "entry-1904", "keyset pagination remains chronological");

    status = await store.commit("alpha", { expectedRevision: 1, entries: [entry(2200)] });
    check(status.revision === 2, "append revision");
    const stableOlder = await store.page("alpha", { before: newest.olderCursor, limit: 200 });
    check(stableOlder.entries[199]?.id === "entry-1904", "concurrent append does not shift older cursor");

    const original = await store.get("alpha", "entry-5");
    check(original?.text === "text-5", "get record");
    status = await store.commit("alpha", { expectedRevision: 2, entries: [entry(5, { text: "streaming", state: "partial" })] });
    check(status.revision === 3, "record update revision");
    const updated = await store.get("alpha", "entry-5");
    check(updated?.text === "streaming" && updated.state === "partial" && JSON.stringify(updated.position) === "[0,5]", "partial update preserves position");
    await code(store.commit("alpha", { expectedRevision: 3, entries: [entry(5, { position: [9, 9] })] }), "conflict", "position movement rejected");
    check((await store.status("alpha")).revision === 3, "rejected movement does not mutate");

    await code(store.commit("alpha", { expectedRevision: 2, checkpoints: [{ namespace: "sync", key: "opaque", value: "leak-me-not" }] }), "conflict", "stale commit rejected", "leak-me-not");
    check(JSON.stringify(await store.checkpoint("alpha", "sync", "opaque")) === '{"token":"secret"}', "stale checkpoint rolled back");

    status = await store.commit("alpha", { expectedRevision: 3, entries: [updated!] });
    check(status.revision === 3, "duplicate unchanged write is a no-op");
    status = await store.commit("alpha", { expectedRevision: 3, sync: { sync: "syncing", hasOlder: true, message: "safe" } });
    check(status.revision === 4 && status.sync === "syncing" && status.hasOlder && status.message === "safe", "sync status and provider backfill flag");

    const page = await store.page("alpha");
    check(page.entries.length === 50 && page.hasOlder && !JSON.stringify(page).includes("secret"), "default page is bounded and checkpoints stay private");
    const baseline = await store.changes("alpha", { limit: 25 });
    check(baseline.entries.length === 25 && baseline.cursor.length > 0 && baseline.hasMore === false, "new change cursor returns bounded latest baseline");
    status = await store.commit("alpha", { expectedRevision: 4, entries: [entry(5, { text: "done" }), entry(2201)] });
    const delta = await store.changes("alpha", { after: baseline.cursor, limit: 1 });
    check(delta.entries.length === 1 && delta.hasMore, "change pagination is bounded");
    const delta2 = await store.changes("alpha", { after: delta.cursor, limit: 1 });
    check(delta2.entries.length === 1 && !delta2.hasMore, "change cursor advances without dropping a same-commit record");
    check(new Set([...delta.entries, ...delta2.entries].map((value) => value.id)).size === 2, "changes project current records once");

    await code(store.page("beta", { before: newest.olderCursor }), "invalid_cursor", "page cursor bound to conversation");
    await code(store.changes("beta", { after: baseline.cursor }), "invalid_cursor", "change cursor bound to conversation");
    await code(store.commit("alpha", { expectedRevision: 5, entries: [{ ...entry(9), id: "" }] }), "invalid_input", "invalid record rejected");
    check((await store.status("alpha")).revision === 5, "invalid input does not mutate");
  } finally {
    await store.close();
  }
}
