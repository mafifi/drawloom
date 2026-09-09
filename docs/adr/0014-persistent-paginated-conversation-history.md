# ADR 0014: Persistent, paginated conversation history

- **Status:** Accepted
- **Date:** 2026-09-09
- **Decision owners:** Drawloom maintainers

## Context

The maintainer approved implementing this decision and its local provider together.
The existing native display projection eagerly fetches up to 2,000 entries on
reopen; browser polling then resends the entire application snapshot. Neither is
needed for unchanged, durably captured conversation content.

The [reference survey](../reference/harness-workbench-survey/README.md) records
DeepSeek's durable history, derived views and cursor windows, and Open Design's
separation of application conversations from native execution sessions. These
are ownership references, not frameworks to import.

## Decision

Conversation history is a focused observability contract, not memory or a new
top-level storage capability. Add portable `@drawloom/conversation-history` and
Bun-hosted `@drawloom/sqlite-conversation-history` packages. Consumers depend on
the contract; startup composition selects the local implementation. Remote
implementations may follow, but no remote service or distributed executor is added.

Store safe readable records, chronological position, stable identity, completion
state, operation correlation and managed asset references. Keep provider state
in private namespaced checkpoints, outside browser responses. Codex owns its
transcript, compaction and execution continuity. Stored history is never replayed
as model context, hidden reasoning or another source of tool/business authority.

Support bounded latest/older pages and changes since a committed revision.
Chronological order and update revision are distinct. Records and ingestion
checkpoints commit atomically; stale writes are rejected and duplicate unchanged
delivery does not create new record changes. Media bytes stay in managed assets.

The local provider uses SQLite via Bun, indexed keyset reads, WAL and full
synchronous transactions. It versions its schema, refuses newer versions without
mutation, restricts local permissions and surfaces failures instead of silently
resetting data. New installations use `~/.drawloom`; explicit `DRAWLOOM_DATA_DIR`
still wins. Preserve an existing legacy default installation; ambiguous defaults
require an explicit path. No automatic migration or deletion.

Codex resume excludes embedded turns. Ingestion reads metadata separately from
payloads, tracks newest coverage and older backfill separately, reconciles live
and restored records by identity, and advances watermarks only after storage.
Unchanged completed payloads are not routinely refetched. Unfinished work, failed
writes and bounded cursor recovery may require rereads. Cached history remains
readable without a provider. Storage failure neither changes provider outcome
nor authorizes execution retry.

Desktop reads start at 50 entries, with page sizes capped at 200. Older pages
preserve scroll position; the visible window is bounded without limiting stored
history. Navigation invalidates late responses. Conversation changes are separate
from generation/revision-based application updates; unchanged polls return no
body, changed sections only are transferred, and host restart permits replacement.
Existing authenticated commands and MCP Apps boundaries remain unchanged.

The existing host RPC transport also preserves a validated numeric rejection
code through `RpcRequestError`, without exposing provider error text or data.
This is required to distinguish unsupported history methods from invalid native
cursors on the actual process transport, not only in synthetic adapter tests.
It introduces no new provider method or plugin/UI permission.

## Consequences and alternatives

- SQLite supplies atomicity and indexed pagination without an ORM or additional
  dependency. A single JSON document would require rewriting and reading history
  proportional to conversation size; a custom indexed JSONL format would recreate
  database machinery. Neither is selected.
- Durable display records improve offline reading but do not make native sessions
  portable across machines. Native continuity remains adapter-private (ADR 0007).
- Bounded HTTP updates avoid introducing another streaming framework. No plugin
  subscription contract is necessary for this host optimization (ADR 0013).
- No automatic pruning, search, memory retrieval, cloud synchronization or new
  UI authority is introduced. Model-token savings are not claimed for data-only
  App Server history reads; measure payload transfer, parsing and memory instead.

## Acceptance

Accepted after shared conformance, fault/restart, pagination, browser and
10,000-entry measurements passed, together with `bun install --frozen-lockfile`
and `bun run check:ci`. Independent reviews verified the store, host/UI and
native recovery boundaries. The [implementation evidence](../reference/conversation-history-evidence.md)
records results, reproduction commands and limitations. Installed protocol checks
and synthetic transport evidence are not live-provider performance measurements.
