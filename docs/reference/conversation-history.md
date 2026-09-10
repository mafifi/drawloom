# Conversation history

Supported implementation of accepted [ADR 0014](../adr/0014-persistent-paginated-conversation-history.md).
History belongs to observability. It is a
stored display projection, not provider execution state, memory or a transcript
to inject into the model.

## Portable boundary

`@drawloom/conversation-history` exports strict Zod schemas, inferred types,
`ConversationHistoryStore`, `ConversationHistoryReader`, `HistoryReadContext`,
`HistoryReadBatch` and bounded error types. `/conformance` exports
`conversationHistoryConformance(factory)`; run it against each implementation.

| Store method | Purpose |
| --- | --- |
| `page(conversationId, {before?, limit?})` | Latest or older chronological page; default 50, maximum 200. |
| `changes(conversationId, {after?, limit?})` | Changed current records, not a replayable event log. |
| `status(conversationId)` | Committed revision, synchronization status and remaining provider history. |
| `get(conversationId, id)` | One normalized stored record. |
| `checkpoint(conversationId, namespace, key)` | Private ingestion state; never exposed to the browser. |
| `commit(conversationId, {expectedRevision, entries?, checkpoints?, sync?})` | Atomic compare-and-set write; unchanged data is a no-op. |
| `close()` | Release provider resources. |

Entries contain a stable ID, immutable two-integer chronological position,
user/assistant role, readable text, completion state, optional operation
correlation and managed asset references. They contain no asset bytes, hidden
reasoning or raw provider envelopes. Equal positions are ordered by ID. Updating
an entry does not reposition it. Backfill can introduce lower positions.

The [ADR 0016 implementation](discovery-and-resources.md#history-and-attachments)
adds optional resource and selection provenance. SQLite schema version 2 migrates
version 1 transactionally; it does not create another media or evidence store.

Page cursors bind to the store generation and conversation, and anchor before
a particular chronological record. Change cursors identify a stored change
position and may coalesce repeated edits. Neither is an execution credential.
Consumers must not parse either cursor. A page also returns a baseline change
cursor. Keep that cursor while loading older pages so concurrent changes are
not skipped. A changes request without a cursor returns a bounded baseline.

`AgentSession.history` is optional and distinct from `signals()`. Its reader
receives read-only access to its own namespaced checkpoints and individual
normalized records. It returns a bounded normalized batch and checkpoint updates.
The host validates and commits both together. The reader interprets native
protocols; the SQLite provider knows nothing about Codex. Missing history support
does not remove execution support. No plugin permission or MCP Apps method is
added by this integration.

A batch may set `hasMore` to request another bounded **latest reconciliation**
batch, for example when scanning metadata for a previously unfinished turn. The
host commits each batch before continuing and releases its queue between batches
so live writes can proceed. This is separate from `hasOlder`: older payloads are
still imported only on demand. A continuation that commits no progress fails
visibly instead of polling indefinitely.

`@drawloom/host` exposes `RpcRequestError.code` for native JSON-RPC rejection
codes. The process transport validates the integer code and discards provider
error messages/data. The adapter interprets unsupported methods and invalid
cursors; the host does not interpret provider-specific recovery rules.

## Local provider and data selection

`@drawloom/sqlite-conversation-history` exports
`createSqliteConversationHistory(databasePath)`. It requires Bun's built-in
SQLite API; importing it under Node is not supported. The contract remains
portable and its schema/export smoke runs under Node. There is no ORM.

The database uses schema version 1, WAL, full synchronous commits, indexes on
chronological and change positions, optimistic conversation revisions and private
keyed checkpoints. Stored records are current projections, not an append-only
audit log. Unsupported or damaged schemas are rejected rather than rebuilt.
No automatic pruning, reset, repair, migration or database replacement occurs.

`DRAWLOOM_DATA_DIR` selects an explicit directory. Otherwise new installations
use `~/.drawloom`. An existing `~/Library/Application Support/Drawloom` remains
selected if the modern default does not exist. If both exist, startup requires
an explicit selection. The host prints the selected directory on stderr; its
bootstrap URL remains on stdout. Existing project/session JSON, assets, tool
evidence and mappings are preserved. `history.sqlite` is created alongside them.
After schema validation, the selected history directory is restricted to mode
0700 and the database/WAL/SHM files to 0600 on supported filesystems. This also
covers an existing installation created with broader permissions. No recursive
permission rewrite is performed. Treat this directory as private local data,
not a source checkout.

## Browser transport

The authenticated loopback host serves `/api/history` and
`/api/history/changes`, keyed by conversation identity. The UI initially reads 50
entries. “Load earlier” retains the visible scroll anchor; the rendered window
holds at most 200 entries. “Back to latest” returns to the recent page. Stable
record identities reconcile updates. Navigation epochs reject late responses.

`/api/state` returns a baseline plus a host-generation/revision token. Subsequent
requests include `since`; unchanged requests return HTTP 204 with no body.
Changed responses contain only changed top-level sections and removed section
names. Unknown generations/positions receive a replacement baseline. A host can
inspect unchanged controllers without retransferring their data. Conversation
content is not part of these snapshots. History responses carry an ETag based
on change position and synchronization status; unchanged conditional polls also
return 204. Polls do not overlap. Authentication, ordered commands, review
authority and MCP Apps routes retain their existing boundaries.

## Verification

- `bun test packages/observability/sqlite-conversation-history`
- `bun test apps/desktop/host/history-performance.test.ts`
- `bun run scripts/verify-codex-history-protocol.ts` (optional installed-Codex check)
- `bun run check:ci`

Synthetic fixture measurements are not live model measurements. History reads
primarily reduce transfer, parsing and memory. They do not by themselves prove
any reduction in billed model tokens.
