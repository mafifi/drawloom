---
type: evidence
id: discovery-latency-fix
title: Progressive discovery removes the eight-second presentation barrier
status: active
created: 2026-09-11
updated: 2026-09-11
---

# Discovery latency follow-up

The maintainer accepted ADR 0019 and authorised this separate fix. The
[original diagnosis](adr-0019-observability.md#follow-up-diagnosis-11-september)
remains the before record; its eight-second timeout and eager full app scan are
not the current behaviour. The [current API](../../docs/reference/discovery-and-resources.md)
defines progressive loading and opaque continuation, using the same native RPCs.

## What changed

- Registered contributions return without waiting for Codex or package resources.
- Skills, apps, native MCP status and opt-in plugin discovery run independently.
- Native app pages load only on demand. Reading cached metadata makes no provider
  request. A repeated continuation or refresh during an active read is coalesced.
- Native category notifications invalidate that category, not the whole catalogue.
  A notification during its read queues a reread after completion. Snapshot revision
  rotation rejects old selections; notification handling adds no execution authority.
- The browser polls only while discovery reports loading, retains expanded pages
  and draft selections, and ignores late responses after navigation. Errors remain
  visible and selections removable. Search explicitly covers loaded results.

The obsolete display-deadline helper and its dedicated tests were removed; the
provider's existing request timeouts remain. No user state or runtime data was reset.

## Live read-only observation

11 September 2026, installed Codex 0.153.4, Bun 1.2.23, same Mac. Disposable public
desktop state; no prompt submission, tool execution, paid generation or global
configuration changes. Only operational counters and timing are retained.

| Observation | Before | Final follow-up run |
| --- | --- | --- |
| Initial host catalogue read | 8,007.65 ms to fallback | 1.48 ms with registered entries |
| Refresh while loading | 8,001.68 ms; overlapping native app request | 0.98 ms; coalesced |
| Skills available | Hidden behind app discovery/deadline | 1,013.61 ms from initial read |
| Native MCP tools available | Sequentially after app scan | 6,697.17 ms, independently of apps |
| First native app page available | Entire 37-page scan before publication | 16,442.45 ms; 100 apps |
| Cached host read | Not measured in original path | 3.12 ms; zero native requests |
| Explicit next app page | Eagerly fetched | 57.01 ms; 200 cumulative apps |

Readiness was sampled every 200 ms; these are single-run local observations, not
a latency distribution or a promise for other accounts. Host timings are not
browser paint measurements. Baseline full scan contained 3,681 apps and about
4.93 million JSON characters. The new first page contains 100, not that full scan.

The decisive trace is `e953965a27ead9d63567f41d1924600f`:

- Skills: one request, 84.94 ms.
- MCP status: 2,933.27 ms, followed by a 2,773.92 ms reconciliation following startup
  invalidation. No overlapping status request.
- Apps: 15,463.35 ms cold, followed by a 73.55 ms reconciliation of an app-update
  notification. No overlapping app request. The explicit second-page read is a
  separate 33.92 ms native request.

The cold native app call remains slow. We have removed Drawloom's blocking,
duplicate startup reads and eager app pagination—not optimised Codex internals or
added native request cancellation. Reconciliation of an upstream change is not an
unchanged cached read. Cached-read counter above was checked separately.

An intermediate iteration still restarted all categories on MCP startup updates;
the trace exposed three overlapping app calls. A focused failing regression drove
category-specific invalidation before the final observation above.

Raw sanitised receipt: [discovery-fixed.json](assets/adr-0019/discovery-fixed.json).
Aspire inspection: [nonblocking host and independent native requests](assets/adr-0019/discovery-fixed.png).
The short parent span represents a completed host response, not a claim that its
detached provider work completed in that interval. The viewer's trace-wide duration
includes those children. No iframe or provider-internal spans are fabricated.

## Verification

The real adapter's controlled transports cover slow apps, independent ready skills
and tools, coalesced refresh, explicit pagination and cursor cycles, invalid and
stale continuations, source-bound resource reads, unavailable methods, native
selection mapping and invalidation during image preparation. Shared discovery
conformance includes nonblocking cached reads and rejection of unissued cursors.

Host tests cover nonblocking package resource discovery, receipt invalidation,
cached capture reuse across reconnect, failure visibility and recovery when a
successful live session supersedes a cached connection failure. Review found that
last case; its regression was observed failing and then passing.

Browser path: regular Playwright 1.62.1 with installed Chrome (Browser plugin/skill
not available). The existing desktop ran at an isolated loopback address with
disposable state. Controlled discovery responses exercised ready local entries →
later native skills → explicit next app page → retained selected skill. There were
exactly three discovery reads and one explicit page request per scenario; settled
discovery stopped polling. Light and dark at 1280×900, dark at 760×900 passed.
Navigation during a held response did not show the old conversation's content.
An explicit 503 refresh left the selected skill removable. No page errors or
framework overlay were observed. Screenshots:
[light](assets/adr-0019/discovery-ui-light.png),
[dark](assets/adr-0019/discovery-ui-dark.png),
[narrow](assets/adr-0019/discovery-ui-narrow.png).

Browser responses in that regression are controlled, not live Codex. A separate
unmocked desktop walkthrough then selected Codex in the composer, opened Skills,
and used the context picker's “Load more apps”. Registered skills became visible
in **136.10 ms** from provider selection; the first HTTP catalogue response arrived
in **73.11 ms** with three registered entries and native categories loading. The
first native app page was visible at **15,673.35 ms**; the explicit second page
arrived at **16,182.05 ms**, containing 200 cumulative apps. There were 29 discovery
responses during this sampled run, zero page errors, and exactly one application
command: `create_conversation`. No send, skill selection or tool invocation occurred.
[Sanitised live browser receipt](assets/adr-0019/discovery-live-browser.json) retains
counts and category states, never native contribution names or credentials.
No private fixtures or private catalogue contents appear in the public proof.

Canonical `bun run check:ci`: **517 pass, 5 explicit opt-in skips, 0 fail;
2,532 assertions, 85 files**. Node shared conformance passed. Svelte checking
reported zero errors/warnings; dependency and UI-policy guards passed (302 UI
sources). The pre-existing large client-chunk build warning remains. Full CI
initially caught a stopped-polling pending flag regression; it was fixed and the
entire gate rerun successfully. Independent targeted review reports its connection
recovery finding resolved, with no remaining Critical/Important findings.

## Reproduction

`DRAWLOOM_OTLP_ENDPOINT=http://127.0.0.1:14318 bun spikes/adr-0019-observability/discovery.ts`
uses the explicitly configured local Aspire endpoint (omit the variable for no
network export). It writes sanitised timing to its disposable runtime directory.

`apps/desktop/tests/progressive-discovery-browser.mjs` uses
`DRAWLOOM_PLAYWRIGHT_PATH` and `DRAWLOOM_PROOF_LOG`, the latter identifying a
disposable host launch log. It does not log or retain the bootstrap credential.
The opt-in `spikes/adr-0019-observability/discovery-live-browser.mjs` accepts the
same variables and uses a fresh host's bootstrap URL for an unmocked inventory-only
walkthrough. Recreate the disposable host between runs; never target user state.

No publication or private plugin implementation change is part of this fix.
