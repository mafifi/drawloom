# Conversation history implementation evidence

Recorded 9 September 2026 for [ADR 0014](../adr/0014-persistent-paginated-conversation-history.md).
Implementation acceptance and independent boundary reviews passed.
This record does not claim live-provider performance or model-token savings.

## Environment and boundaries

Public synthetic data only, on macOS 26.6.2 arm64, Bun 1.2.23 and Node 24.20.0.
Fixtures use isolated temporary directories. They do not open the user's data
directory, invoke a model, or load a private workbench. The installed protocol
check inspected Codex CLI 0.153.4 without executing a turn.

The runtime stores display records under observability. Codex still owns its
native transcript and continuity. The SQLite provider is Bun-only; the contract
and exported conformance remain portable. Browser history does not carry private
checkpoints, native envelopes, reasoning, media bytes or duplicated tool evidence.

## Measurements

The two repeatable fixtures exercise different boundaries. Times are observations,
not latency guarantees; RSS is the largest sampled process resident-set value,
not an isolated history allocation or an operating-system peak. The native fixture
excludes its child process from the parent RSS measurement. JSON byte counts exclude
HTTP/RPC framing and headers unless explicitly stated.

| Observation | Native child process → Codex adapter → SQLite | SQLite → authenticated browser HTTP |
| --- | ---: | ---: |
| Public entries | 10,000, one large turn | 10,000 |
| Source/response volume | 44,916,950 native response JSON bytes | 44,248,890 source text bytes |
| Initial entries | 50 | 50 |
| Initial response volume | 224,376 native response JSON bytes | 226,827 HTTP body bytes |
| Initial elapsed time | 26.07 ms, includes ingestion | 1.91 ms, stored page over loopback |
| Cached older-page elapsed time | 0.75 ms, direct store | 0.93 ms, loopback |
| Warm restart: unchanged item payload requests | **0**, after only newest 50 were cached | No provider attached |
| Cached older-page provider requests | **0** | **0** |
| Total payload requests for full import | Exactly 10,000, each `limit: 1` | No provider attached |
| Unchanged application/history poll bodies | Not this fixture's boundary | **0 / 0 bytes**, HTTP 204 |
| One changed message | Stable stored identity | **408 bytes**, one record |
| Sampled process RSS | 195,411,968 bytes | 186,269,696 bytes |

Reproduce independently for cleaner process-memory baselines:

```sh
bun test apps/desktop/host/native-history-performance.test.ts
bun test apps/desktop/host/history-performance.test.ts
```

The native fixture crosses an actual stdio process boundary and reopens both the
adapter and SQLite after the first page. It later verifies every stored page in
exact order. The child synthesizes one requested item at a time; neither bootstrap
nor a page read constructs all 10,000 source records. SQL queries use indexed
keyset boundaries with a bounded `LIMIT`; there is no full-history read and slice.

## Failure and consistency checks

- Shared provider conformance: bounded/default pages, stable cursors during new
  arrivals, immutable chronology, separate update revisions, CAS conflicts,
  duplicate no-ops, change pagination and private checkpoint isolation.
- Real SQLite fault injection: a trigger rejects checkpoint insertion after record
  preparation; entries, checkpoints and revision all roll back. Corrupt schemas,
  malformed stored values and newer schemas fail without rebuilding or replacing
  the database. Existing directories and database/WAL/SHM permissions are checked.
- Host integration: a failed history write does not change a successful synthetic
  execution into failure or create a second candidate. Cached Codex records open
  without connecting. Existing assets, project state and native mappings survive.
- Live display: partial deltas coalesce; terminal writes flush; image/text delivery
  merges in either order. Reader error text is replaced by fixed host-safe messages.
- Browser logic: late navigation responses are discarded, a stalled old request
  cannot block a new conversation, normal earlier navigation retains its historical
  window, and background bootstrap obtains its older-page boundary.
- Incremental application state: no-body unchanged responses, changed sections
  only, deleted-section handling and generation replacement after restart.
- Native transport: metadata-only resume/list requests, single-item image pages,
  supported large frame capture, over-budget frame rejection, and codes-only RPC
  rejection without private provider text. A real stdio `-32601` response produces
  an unsupported-history status without disabling subsequent fixture execution.
- Native recovery: separate newest/older coverage, unfinished metadata scanning,
  long cursor-cycle rejection and fresh traversal scopes after expired cursors.
  A real host/SQLite reconnect regression imports all 251 turns after a new-head
  gap, preserves the prior record's position and places every new record after it.
  Independent review rechecked these repaired boundaries before acceptance.

Regression tests were observed failing before the corresponding corrections for
record/checkpoint rollback, missing reader APIs, native chronology, partial-turn
coverage, earlier-page presentation, background bootstrap, text/image merging,
navigation polling, safe reader failures, empty-cache continuation and permissions.
Test source, rather than this summary, remains the exact assertion authority.

## Browser evidence

The maintained production build was checked with headless Microsoft Edge
152.0.4191.66 using
the optional Playwright script. The fixture contains 10,000 entries and two public
synthetic conversations. No personal conversation was captured.

| Check | Observed result |
| --- | --- |
| Initial page | 50 entries |
| Earlier navigation | Maximum 200 rendered; scroll anchor displacement 0 px |
| Late earlier-page response after navigation | No old records in the new conversation |
| Appearance | System light and dark modes |
| Viewports | 1440 × 1000 and 390 × 844 |
| Browser errors | None |
| Unchanged polling | Both endpoints observed returning HTTP 204 |

[Light](generated/conversation-history/light.png),
[dark](generated/conversation-history/dark.png), and
[narrow dark](generated/conversation-history/mobile-dark.png) captures are generated
evidence, not design source. Regenerate them; do not hand-edit them.

To reproduce, build the desktop, run `bun run scripts/history-browser-fixture.ts`,
then pass its one-use bootstrap URL to `node scripts/verify-history-browser.mjs`.
Set `DRAWLOOM_PLAYWRIGHT_PATH` to an existing Playwright module; optionally choose
`DRAWLOOM_BROWSER_CHANNEL` and `DRAWLOOM_BROWSER_EVIDENCE_DIR`. Playwright is not a
new production dependency. Stop the fixture after verification; it removes only
its own temporary installation.

## Verification gate

On 9 September 2026, `bun install --frozen-lockfile` passed without dependency
changes and `bun run check:ci` passed: **292 tests, 0 failures, 1,531 assertions**,
plus Node shared conformance and the portable history schema/export smoke.
Svelte reported 0 errors and 0 warnings. The desktop production build retains
its non-blocking large-chunk advisory; no bundle-size improvement is claimed.
The separate installed Codex protocol check passed. Browser verification passed
in both themes with no console/page errors and zero scroll-anchor displacement.

Run `bun install --frozen-lockfile` and `bun run check:ci` from the repository root.
The gate includes dependency/private/spike/UI guards, package build/artifacts,
Svelte and TypeScript checks, publishing checks, Bun tests and Node conformance.
`bun run scripts/verify-codex-history-protocol.ts` separately checks the installed
App Server schema. Actual model-backed compatibility/performance remains a distinct
future measurement; synthetic evidence must not be relabelled as live evidence.
