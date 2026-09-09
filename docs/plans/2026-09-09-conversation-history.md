# Persistent conversation history implementation

Lifecycle: completed, 9 September 2026. This execution record is not architecture
authority. See accepted [ADR 0014](../adr/0014-persistent-paginated-conversation-history.md),
the [supported API](../reference/conversation-history.md) and
[verification evidence](../reference/conversation-history-evidence.md).

## Global constraints

Public Drawloom only. Preserve existing uncommitted survey files. Work in place
as requested; no commits, pushes, private code or provider generation. Portable
contracts precede implementations. Native transcript stays with Codex. No raw
provider envelopes, secrets, hidden reasoning or media bytes in UI history.
SQLite uses Bun without new dependencies. No storage migration/deletion, remote
service, memory retrieval or new MCP Apps authority.

### Task 1: Contract and SQLite provider

Implement packages/observability/conversation-history and
packages/observability/sqlite-conversation-history. Define contract and failing
shared conformance before provider implementation. Portable Zod data uses
HistoryEntry {id, position: [number,number], role:user|assistant, text,
assets:Asset[], operationId?, state:partial|complete|interrupted}.
Position is an immutable safe-integer tuple assigned by the ingestion producer;
updates preserve position; older backfill may use lower positions. Store uses
tuple then ID for deterministic ordering, separate from monotonic update revision.

Expose async ConversationHistoryStore: page(conversationId,{before?,limit?}),
changes(conversationId,{after?,limit?}), status(conversationId),
checkpoint(conversationId,namespace,key), get(conversationId,id),
commit(conversationId,{expectedRevision,entries?,checkpoints?,sync?}), close().
Each commit performs optimistic conversation revision check; records and private
checkpoint updates in one transaction. Private checkpoints are JSON values keyed
by namespace/key; never returned in pages or changes. Status contains revision,
sync (idle|syncing|unavailable|error|unsupported), hasOlder (provider backfill flag),
optional safe message. Sync update can set hasOlder. page returns entries in
chronological order, olderCursor?, hasOlder (local OR provider), changeCursor,
status. changes returns entries, cursor, hasMore, status; cursors bound to
conversation and store generation. Changes may coalesce repeated edits: this is
a current-record projection, not an audit event log. New cursor requests return a
bounded latest page baseline rather than unbounded history. Defaults 50/max200.

createSqliteConversationHistory(path) returns store. WAL, synchronous FULL,
indexed keyset pagination, persisted store generation, user_version schema,
safe permissions, explicit corruption/newer-schema errors. Reject stale commit,
invalid records/cursors and position changes without mutating data. Duplicate
unchanged writes must not bump revisions. Transaction rollback fault test should
use real SQLite trigger failure, not production fault injection hooks. Tests:
2,100+ entries; pagination with concurrent append; partial record update without
movement; checkpoint atomicity, stale commits, reopen, duplicate no-op,
cross-conversation cursors, newer-version unchanged, corrupt DB preserved.
Write report with RED/GREEN evidence. Do not edit root manifests or other areas;
root agent handles workspace linking. No commits or subagents.

### Task 2: Incremental Codex ingestion and host coordination

Replace eager history projection. Resume excludes turns. Stable native-to-public
IDs; bounded latest/older reading; partial/live reconciliation; per-turn completion
coverage and private checkpoints; zero warm settled item refetch. Root owns this
integration, host error handling, synthetic persistence and data directory policy.

### Task 3: Desktop pagination and incremental HTTP updates

Separate history endpoints from snapshots. Baseline 50, maximum 200, bounded
rendered window, earlier/newer navigation and scroll preservation. Stable updates,
late-response guards, serial polling, generation/revision changed-section HTTP
responses. Existing controls and MCP Apps authority unchanged.

### Task 4: Verification and evidence

Focused task review plus final broad review. Public 10,000-entry/tens-of-MB
measurements: provider calls, response bytes, page latency, memory. Browser
light/dark validation. Canonical CI. Update ADR/reference/evidence and indexes;
accept only on successful required checks. No commits unless separately asked.
