# Discover skills, tools and resources

Discovery lets a user see what is available and select it as context without
running a tool or starting an agent turn. Resources are content a server lists or
returns, such as a document, image or audio file. Drawloom keeps the source identity
when presenting and reading them.

Use this guide when adding a discoverable contribution, presenting tool results
or passing selected material to an agent.
[ADR 0016](../adr/0016-discoverable-contributions-and-resources.md) records the
accepted design. Current behaviour is explained first; dated verification follows.

## Discovery and input

### List what is available

An agent may expose `AgentSession.discovery`. Its `list({refresh?, wait?, cursor?})`
returns a snapshot with a revision, entries and loading/availability for each
category. An entry says where it came from, whether it can be selected and whether
its resource is readable. Being listed does not grant permission or prove a native
tool can actually be called.

The Codex adapter reads skills, apps and MCP status through `skills/list`,
`app/list` and `mcpServerStatus/list`. Experimental `plugin/list` is read-only
and disabled unless the host explicitly enables it. These provider methods stay
inside the adapter; browser code uses the shared discovery interface.

Registered Drawloom contributions appear immediately, even while native discovery
or resource listing is loading. `wait:false` returns ready categories without
waiting for slower ones. The default waits for current reads and one combined
update; a continuously changing provider may still report loading.

### Load more and refresh safely

Native apps load in explicit pages, initially up to 100. Polling does not fetch the
next page. A `cursor` requests it, and the returned snapshot includes completed
earlier pages. Search covers only loaded results. Each scan is limited to 100 pages
and the catalogue to 10,000 entries.

Cursors are opaque: callers pass them back unchanged rather than interpreting
them. They belong to one session; native provider cursors never reach the browser.
Completed pages retain their selection revision. Repeated page requests share
one read instead of starting duplicates.

Refresh joins active work; when idle it invalidates the cache. Upstream changes
refresh only the affected category. Duplicate notifications are ignored, and one
follow-up read is scheduled after an active request. A slow app request therefore
does not restart whenever MCP status changes. Category errors preserve healthy
categories and completed pages; closure or explicit invalidation rejects stale
results.

The browser polls only while loading and ignores responses arriving after
navigation. Loading remains visible rather than becoming a made-up fallback error.
Normal transport timeouts and errors still apply. The
[discovery latency record](../../knowledge/evidence/discovery-latency-fix.md)
contains the measured follow-up.

### Select without granting access

Selections carry validated `{id, revision}` values. The adapter resolves native
skills and mentions privately; callers do not supply native paths or provider
input objects. Registered skills use the trusted instruction path only when
selected or required by the workbench. Browsing does not load their bodies.
Required skills remain active without duplication.

Resources and attachments are different: they are untrusted reference material,
not new skills or trusted developer instructions. Selecting one never grants
access to another file, tool or service.

## Standard results and safe retrieval

### Present a result once

A tool can implement `renderContent` to return standard MCP text, image, audio,
resource-link or embedded-resource blocks alongside its validated structured
result. Arbitrary JSON does not register a resource, skill or tool.

The desktop saves recognised display content through its asset library and history.
Capture is limited to 256 blocks and 16 MiB of aggregate asset bytes per result.
Unsupported or oversized content remains an unavailable reference. Storage failure
is visible; it never causes the tool to execute again.

If Drawloom result capture fails, recovery reads the existing tool execution record
and retries only display storage. Pending records are loaded once per conversation.
History synchronisation cannot clear its warning or advance past failed recovery.
Cached history can recover those records without reconnecting to Codex.

### Read from the original source

MCP Apps use their existing connection for standard `resources/list` and
`resources/read`. Requests must identify an advertised resource or a link the
source previously returned. A saved returned link acts as a **receipt**: it records
the source and resource that can be requested again after restart.

The host captures only the requested URI from a response. Public listings include
descriptive fields, not server `_meta`. A URI is not general permission to fetch
a URL or local file.

Codex resource reads use its installed `mcpServer/resource/read` endpoint. The
adapter privately records the server/URI mapping, including links returned by
tools but never listed. It exposes only a `ResourceReference.retrieval` ID and
revision. The browser identifies a saved history entry/resource; it cannot replace
the native target. Receipts belong to their originating native thread. Reading a
cached asset does not contact the provider.

## History and attachments

`HistoryEntry.resources` and `.selections` retain the displayed resource and
selection identities. Their nullable columns were added transactionally in
SQLite schema version 2, preserving existing records, checkpoints and cursors.
Later storage changes are described in the [history guide](conversation-history.md);
the version-2 change is historical, not a claim that it is today's latest schema.

Native history reconciliation preserves the text the user submitted and their
selected references. It does not replace the visible message with expanded
attachment instructions. Native capture participates in the history/checkpoint
transaction rather than recursively writing through the live event queue.

Uploads stay attached to the originating conversation even if navigation changes
while bytes are arriving. Codex image input uses verified managed images; text
uses the reference path. Viewable audio, video or PDF is not advertised as direct
model input. Unsupported submissions fail explicitly.

## Evidence status

The remaining sections retain observations from the 2026-09-10 acceptance work.
They describe those versions and fixtures, not fresh verification of today's UI,
account inventory or test totals. Detailed consumer receipts remain with their
owning repository. No model work was repeated for this documentation rewrite.

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
