# Discovery and resource API — ADR 0016

Implementation reference; [ADR 0016](../adr/0016-discoverable-contributions-and-resources.md)
was accepted on 2026-09-10 after the integrated acceptance walkthrough and checks.

## Discovery and input

`AgentSession.discovery?` supports `list({refresh?, wait?, cursor?})`, `invalidate()` and optional
`readResource({id, revision})`. A snapshot contains its revision, origin-qualified
entries, optional opaque `nextCursor` and per-category loading/availability. Entries distinguish selection, readiness
and resource readability. None grants execution permission. Native tool inventory
is unverified where Codex does not establish callability.

Codex uses installed protocol methods `skills/list`, `app/list`,
`mcpServerStatus/list`, and optional experimental `plugin/list`, concurrently.
`wait:false` returns ready categories while others load; the default waits for the
current reads and one coalesced update. A constantly changing provider may still
report loading. Polling a snapshot never loads another app page automatically.
The first native app page is limited to 100; `cursor` explicitly requests the next
page. The returned snapshot is cumulative, and completed pages retain the same
selection revision. Cursors are opaque, session-bound, validated and coalesced on
repeated delivery; native cursors never reach the browser. Native server-status
reads retain their bounded metadata scan. Each paginated scan is bounded to 100
pages and the catalogue to 10,000 entries. Category failures preserve other
categories and previously completed pages.

The session caches summaries and private native mappings. Explicit refresh joins
active discovery rather than issuing overlapping reads. When idle it invalidates
the catalogue. Native category updates invalidate only that category, rotate the
selection revision and queue one reread after an active request finishes. An MCP
startup notification therefore cannot restart a slow app request. Identical app
notifications are deduplicated. Explicit invalidation/closure rejects stale results.

The desktop returns registered contributions immediately, including while its
native connection or package resource listing is pending. Its browser polls only
loading discovery, coalesces requests, and ignores navigation-late responses.
“Load more apps” requests another native page; search is explicitly limited to
loaded results. Native latency remains visible as loading, not an eight-second
fallback error. Normal transport timeouts and category errors remain authoritative.
The [measured follow-up](../../knowledge/evidence/discovery-latency-fix.md) records
the live timing, counters and browser regression.

Browser selections carry only validated IDs and revisions. Native selections map
to Codex `skill` or `mention` inputs inside the adapter. Registered Drawloom skills
use the established trusted instruction path. Required workbench skills are not
removed, duplicated or loaded merely by browsing. Plugin discovery is read-only,
experimental and off unless the host setting enables it.

## Standard results and safe retrieval

Tools may supply `renderContent` returning standard MCP text, image, audio,
resource-link or embedded-resource blocks. Canonical structured output and
authoritative execution evidence retain their existing ownership. Arbitrary JSON
does not register a skill, file or tool.

The desktop captures recognised content through its existing asset library and
stores display references in history. Capture is bounded to 256 blocks and 16 MiB
of aggregate asset bytes per result. Unsupported/oversized content stays visible
as an unavailable reference. Storage failure is explicit and does not retry an
execution. Native history capture joins the history/checkpoint transaction rather
than recursively writing through the live queue.

MCP Apps use their existing connection for standard `resources/list` and
`resources/read`. Only source-advertised URIs may be requested; a stored returned
link is a source-bound receipt after restart even if it was absent from listing.
Only the requested URI is captured from a response. Public listing exposes
descriptive fields, not server `_meta`. Codex resource discovery uses the installed
`mcpServer/resource/read` endpoint with adapter-owned server/URI mappings.
An unsupported URI is a reference, not permission to fetch a URL or local file.

Native tool-returned links use that same read endpoint even when never listed.
The adapter records their server/URI mapping in its existing private session
store and supplies an opaque `ResourceReference.retrieval` ID/revision. Browser
requests still identify a stored history entry and resource; they cannot submit
native targets. The host retrieves the receipt from history and uses the existing
agent discovery read method. Receipts are scoped to the originating native thread;
cached asset reads do not contact the provider.

Failed Drawloom result capture is retried from the existing canonical tool evidence,
never by reinvoking a tool. The host loads pending display projections once per
conversation and retains failures until stored. Native history synchronization
cannot advance or clear its warning while this recovery fails. Cached history
can recover these records without connecting to Codex.

## History and attachments

`HistoryEntry.resources` and `.selections` retain safe display provenance. SQLite
schema version 2 adds these nullable columns through a transactional version-1
migration, preserving records, checkpoints and cursors. Newer versions are refused.
Native reconciliation preserves the submitted user-facing text and selected
references rather than replacing them with expanded attachment/context input.

Attachments are scoped to the originating conversation even if navigation changes
during upload. Native images use verified image input; text follows the existing
reference path. Viewable audio/video/PDF is not advertised as direct model input.
Unsupported submission is explicit. Resource context is untrusted user reference
material, never automatically trusted instructions or installed skills.

## Evidence status

Focused synthetic tests cover identity, invalidation, discovery without execution,
source-bound reads, cache recovery, capture limits, schema migration and history
reconciliation. A read-only live Codex 0.153.4 probe on 2026-09-10 discovered 207
skills, 3,647 apps, 467 tools and 225 resource entries; counts describe this account
at that time, not a public compatibility guarantee. Experimental plugin discovery
was off. No model turn or tool execution was used for that probe.

The existing private video plugin was exercised through the public desktop with
synthetic content and live Codex on the same date:

- Registration exposed its tools and required skills. An additional explicit
  skill selection and text/image references reached the normal submission path.
- A read-only inspection returned a passage and media using standard MCP content;
  shared resource cards displayed both, without private public-UI components.
- Selecting the returned passage as context produced a native edit review.
  Human approval saved one unaccepted revision; human denial produced zero edit
  invocations. Delegated native review visibly approved an edit, with its surfaced
  rationale, and the edit ran once.
- Direct Save in the existing Svelte MCP App made one app-only call and no model
  send or AI approval request. The resulting draft survived host restart alongside
  the same resource references and sent selection provenance. Finished-output
  selections did not change.

The private consumer owns its detailed receipts and repeatable browser driver.
No private fixtures, screenshots or business content are included in public tests.
Live automatic denial is not claimed: denial, cancellation and stale-request
coverage for delegated review are deterministic transport tests inherited from
ADR 0015. No paid media generation, model downloads or publication occurred.

## Browser verification

The retained browser drivers are `apps/desktop/tests/discovery-browser.mjs` and
`apps/desktop/tests/input-browser.mjs`. They require an explicitly supplied,
authenticated disposable host and an installed browser/Playwright runtime; they
do not download a browser or run as unattended live-provider CI.

Verified in light/dark at 1440, 760 and 390 pixels:

- Dedicated Plugins view, search across 4,301 synthetic entries, 100-row initial
  presentation and explicit expansion to 200. Latest measured open times were
  80–91 ms in this local browser fixture, not provider discovery latency.
- Composer-anchored suggestions without a modal, with arrow/Enter selection
  matching the actual highlighted row. Disabled required skills are skipped;
  document context uses the same keyboard identity model. Escape retains typing.
- Docked wide artifact details; narrow full-content details with Back to
  conversation. Fresh loads and attachment imports preserve the conversation.
- No horizontal page overflow; Send, provider and reviewer controls remain within
  the viewport. Mobile controls wrap instead of being clipped.
- File selection, image previews, clearing/reselecting the same file, reload of
  uploaded references, paste/drop events, removal, simulated upload failure and
  successful retry. Attachment tests ran against the public synthetic workbench
  without a private plugin or model call.

Screenshots were visually inspected. User bubbles use blue/white; chrome follows
the neutral system theme. Non-image attachments/resources start with compact
metadata and collapsed previews. Browser phases reported no page errors.

Profiling the large fixture exposed legacy Svelte prop deep-reading of the whole
ViewModel catalogue. Rune props/derived state removed that repeated traversal;
the browser regression now requires bounded catalogue presentation within five
seconds. It also asserts actual selected-row identity and mobile control bounds,
not just successful clicks or hidden overflow.

## Final gates

On 2026-09-10, frozen installation and `bun run check:ci` passed in both existing
checkouts:

- Public: 375 tests passed, 1,870 assertions, zero failures; Node shared
  conformance, portable-history smoke, Svelte/type checks and UI/dependency guards
  passed. Four opt-in live native-review tests were skipped by the unattended
  gate; the separate live walkthrough above records approval, denial and delegated
  approval. Revocation and automatic denial remain deterministic coverage here.
- Private: 70 tests passed, 489 assertions, zero failures, including Svelte/type
  and public/private-boundary checks after refreshing the public package snapshot.
- The client build retains a non-blocking approximately 574 kB chunk-size
  warning. The bounded catalogue measurements above do not claim a smaller bundle
  or a provider-network performance improvement.

The final attachment retry regression and both retained browser drivers passed.
No new MCP Apps method or plugin permission was needed. Verification used the
existing checkouts; publication is separate from this delivery.
