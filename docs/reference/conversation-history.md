# Save and browse conversation history

Drawloom keeps a local copy of messages so people can reopen conversations,
search them and read cached pages while Codex is unavailable. It does not use
that display copy to take over Codex's session, replay execution or automatically
supply model context.

This guide covers the shared history interface, its SQLite implementation and
the desktop's paging and search behaviour.
[ADR 0014](../adr/0014-persistent-paginated-conversation-history.md) records the
original decision; the search amendment is described below.

## The shared history interface

The `@drawloom/conversation-history` package defines the types, validation
schemas and interfaces. `ConversationHistoryStore` saves and reads records;
`ConversationHistoryReader` brings messages in from an agent provider.
`HistoryReadContext` and `HistoryReadBatch` describe that exchange.

Every implementation runs `conversationHistoryConformance(factory)` from the
package's `/conformance` export. These shared tests check the same behaviour
regardless of how the records are stored.

| Store method | What it does |
| --- | --- |
| `page(conversationId, {before?, limit?})` | Reads latest or older messages in chronological order; default 50, maximum 200. |
| `changes(conversationId, {after?, limit?})` | Reads records that have changed, not every intermediate edit. |
| `status(conversationId)` | Reports the saved revision, synchronization status and remaining provider history. |
| `get(conversationId, id)` | Reads one saved message. |
| `search({query, conversationIds?, cursor?, limit?})` | Searches cached message text; maximum 100 hits with plain-text snippets up to 240 characters. |
| `around(conversationId, {entryId, before?, after?})` | Reads up to 200 records around a message, including its position in the page and whether more messages exist. |
| `checkpoint(conversationId, namespace, key)` | Reads private progress information for importing history; never exposed to the browser. |
| `commit(conversationId, {expectedRevision, entries?, checkpoints?, sync?})` | Saves records and progress together if the saved revision still matches. Unchanged data does not create a new change. |
| `close()` | Releases database or other provider resources. |

### Read a local page

This complete example creates a temporary database, saves a synthetic message
and reads it back. It does not connect to Codex or touch existing history:

```ts
import {createSqliteConversationHistory} from '@drawloom/sqlite-conversation-history';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'drawloom-history-example-'));
const history = createSqliteConversationHistory(join(directory, 'history.sqlite'));
try {
  await history.commit('example', {
    expectedRevision: 0,
    entries: [{
      id: 'message-1', position: [0, 0], role: 'user',
      origin: {kind: 'user'},
      text: 'A synthetic message', state: 'complete', assets: [],
    }],
  });
  console.log(await history.page('example', {limit: 10}));
} finally {
  await history.close();
  await rm(directory, {recursive: true, force: true});
}
```

### Understand records and cursors

Each record has a stable ID, a fixed two-integer chronological position, a
user/assistant role, explicit origin, text, completion state and optional operation and asset
references. It contains neither asset bytes nor hidden reasoning or raw provider
messages. Equal positions sort by ID. Editing text does not move the record;
importing older history can add records before it.

Optional resource and selection details record where supplied context came from.
See [history and attachments](discovery-and-resources.md#history-and-attachments).
The version 2 database migration added these fields without creating another
media store.

A **cursor** is a token for continuing a read. Pass it back unchanged; do not
parse it or treat it as permission to execute work. Page cursors identify a
position in one conversation and database generation. Change cursors track saved
updates and may combine several edits to the same record.

Keep the page's baseline change cursor while loading older pages so concurrent
message updates are not missed. A changes request without a cursor returns a
limited starting set rather than an unlimited history.

### Import provider history without replaying work

`AgentSession.history` is optional and separate from live `signals()`.
Its reader can inspect its own checkpoints and individual saved records, then
returns a limited batch of messages and updated progress. The host validates and
saves both together. The provider reader understands Codex; the SQLite store
does not need to.

`hasMore` asks the host to continue checking recent history, for example an
unfinished turn. Each batch commits before the next, and the host releases its
queue between batches so live writes can proceed. A continuation that makes no
progress fails visibly rather than looping forever. `hasOlder` separately
indicates older history, fetched only on demand.

A provider without history support can still execute work. This mechanism adds
no plugin permission or MCP Apps method. `RpcRequestError.code` from
`@drawloom/host` preserves validated JSON-RPC error codes without raw error
messages or data. The adapter, not the storage host, interprets unsupported
provider methods and invalid provider cursors.

## Local provider and data selection

`createSqliteConversationHistory(databasePath)` uses Node's built-in
`node:sqlite`. The interface is portable; this implementation requires the
pinned Node runtime, which supplies `DatabaseSync` and loads the SQLite
extensions the store depends on.

The current database is schema version 5. Earlier stores are rejected at
startup rather than opened or guessed at, and **there is no conversion path**:
the provenance converter was deleted in the move to Node
([ADR 0034](../adr/0034-node-toolchain.md)) because Drawloom has no installed
base to migrate. Unknown or damaged schemas are rejected, not replaced.

### Captured meaning

`origin` distinguishes user text, assistant prose, delivered media, inspected
references and tool results. A tool origin includes its source, stable call ID,
display title, its own outcome and declared text/JSON format. Native and live
capture share the same parser. JSON-looking assistant prose remains prose;
turn completion does not imply tool success. The desktop projects adjacent
process records without moving the answers between them.

Origin is resolved from retained native item identities or execution receipts —
never inferred from wording, JSON shape or filenames. A record whose origin
cannot be established from retained evidence is reported rather than guessed at.

Project bindings and working files, including scripts and recordings, are held
outside this store. Full synchronous commits and SQLite's write-ahead log
protect writes. Revision checks prevent one writer from silently overwriting
another's update. Private checkpoints track import progress.

Version 3 adds FTS5 text search, updated in the same transaction as messages.
Existing cached text is indexed locally without rereading the provider.
The store holds current records, not every previous edit. It does not
automatically prune, reset or repair the database.

`DRAWLOOM_DATA_DIR` selects the installation data folder. New installations
default to `~/.drawloom`. The older
`~/Library/Application Support/Drawloom` is used when it is the only default
present. If both exist, explicitly choose; startup never merges them.

The host prints the chosen folder to stderr and its one-use URL to stdout.
`history.sqlite` lives alongside existing installation data. After validating
the schema, the implementation restricts the history directory to mode 0700 and
the database, WAL and SHM files to 0600 where supported. It does not recursively
change permissions on other data. Keep this private application storage separate
from a project checkout.

## Browser transport

The UI reads 50 messages initially and keeps at most 200 rendered records.
“Load earlier” preserves the visible scroll position; “Back to latest” returns
to recent messages. Stable IDs apply updates to the correct record, and requests
from an earlier navigation are discarded when they arrive late.

Authenticated `/api/history` and `/api/history/changes` requests identify the
conversation explicitly. They do not change execution or approval state.

### Five-journey UI amendment

The approved [desktop sprint](../plans/2026-09-13-five-ui-journeys.md) extended
ADR 0014 with cached-text search and reading around a particular message.
It did not change who owns provider history, how media is captured or what
becomes model context.

Search does not fetch older provider messages, compute embeddings or call a
model. Its coverage is only what is cached. The host combines message matches
with conversation titles and explains incomplete coverage.

| Endpoint | Inputs and behaviour |
| --- | --- |
| `GET /api/conversations/search` | `q`, optional `projectId`, `archived` (`active`, `archived`, `all`), `cursor`, and limited `limit`. Hits identify conversation, project, workbench and match kind; message matches include `entryId` and snippet. |
| `GET /api/history/around` | `conversationId`, `entryId`, `before`, `after`. Reads nearby cached messages without importing earlier history; includes a cursor for subsequent updates. |

Search cursors are tied to the query, filters, conversation metadata and database
generation. Restarting the host alone does not necessarily invalidate them.
On HTTP 409, restart the query rather than reusing an old offset.

The ordered command endpoint accepts `rename_conversation` with a `title`,
`archive_conversation` and `restore_conversation`, each with an explicit
`conversationId`. A manual title survives automatic naming. Archive is
reversible organisation, not deletion, native-session archival or cancellation.

Archive is rejected while the conversation has active work or unresolved input
or approval. `archiveBlockedConversationIds` lets the UI display that current
restriction, but the command checks it again. If saving fails, the host restores
the previous metadata and selection. Older conversations default to active.

### Avoid resending unchanged data

`/api/state` supplies initial state and a host-generation/revision token.
Later requests send `since`; unchanged state returns HTTP 204. Updates include
only changed top-level sections and removed section names. An unknown token
receives a fresh starting state. Conversation text is not in these snapshots.

History responses use an ETag based on saved changes and synchronization status;
unchanged polls also return 204. Polls do not overlap. These optimisations leave
authentication, ordered commands, approval and MCP Apps unchanged.

## Verification

Run the deterministic history tests without connecting an account:

```sh
pnpm vitest run packages/observability/sqlite-conversation-history
pnpm vitest run apps/desktop/host/history-performance.test.ts
```

The optional `node scripts/verify-codex-history-protocol.ts` checks an
installed Codex separately. Run the repository's `pnpm run check:ci` before
integration.

Synthetic measurements are not live model measurements. Smaller history pages
reduce transfer, parsing and memory use; they do not prove lower billed model
token usage.
