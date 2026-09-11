---
type: evidence
id: adr-0020-projects-file-delivery
title: Directory-backed projects and streamed file delivery
status: active
created: 2026-09-11
updated: 2026-09-11
---

# ADR 0020 implementation evidence

Implemented in the public desktop and supported packages under Accepted
[ADR 0020](../../docs/adr/0020-directory-backed-projects-and-file-delivery.md).
The maintainer accepted the ADR on 2026-09-11 after reviewing these checks.
This does not establish a release or untested provider compatibility.
No private plugin code, production media, credentials or raw provider payloads
are included. Acceptance and a cohesive implementation commit were authorised.

## Tested implementation

- Global installation/trust/OAuth; fixed project-scoped controller, backend and
  MCP connection instances. Two public projects retain distinct workbench state
  across navigation and restart. A returning original directory can activate an
  offline placeholder without restarting the host. A replacement directory is
  a new explicit binding; old conversations are not retargeted.
- Directory/device/inode validation, path containment, no symlink traversal and
  opened-file identity checks. Read-only opens do not create missing folders.
  Native start/resume uses the fixed directory; incompatible native continuity
  is rejected. Existing Stop and pending responses do not depend on a drive
  remaining mounted. Cached history remains readable.
- Portable byte-iterable contracts, shared Bun/Node conformance, maximum 64 KiB
  storage reads and bounded whole-buffer compatibility helpers. Streamed imports
  hash incrementally and publish only complete files; actual bytes enforce the
  256 MiB managed-asset ceiling. Existing asset identities remain unchanged.
- Authenticated GET/HEAD, exact/suffix ranges, 206/416, cancellation and streaming
  uploads. A 17 MiB HTTP import verifies admission above the unchanged 16 MiB
  native-image boundary. A stalled upload does not block navigation/Stop;
  cancellation leaves no registered or temporary partial asset.
- Explicit working-file previews, native URL media viewers and downloads;
  viewing does not import files or select model context. Cached assets take
  precedence over live file references.

## Browser observations

Chrome headless on macOS, using Bun 1.2.23, Node 24.20.0 and FFmpeg 8.1.2.
FFmpeg generated a public 30-second 1280×720, 24 fps H.264 test video of
30,592,406 bytes. No provider was invoked.

[Browser results](assets/adr-0020/browser-results.json) record:

- No working-file request before explicitly opening its preview.
- Metadata, playback, seeking to 20 seconds and release on closing in light/dark.
- A streamed native File upload, reloaded attachment references and preserved
  per-conversation drafts after project navigation.
- Unknown-format download and visible invalid-video feedback.
- Keyboard project selection and a 390 px layout without horizontal overflow.
- Host-served standard MCP App HTML in an opaque `allow-scripts` frame: relative
  project video and an approved external image load. Undeclared images, remote
  scripts and general fetch calls remain blocked. Navigating away makes its
  project-file URL return 403.

The controlled external servers received **only one approved image request**;
there were no script, fetch or undeclared-origin calls. See
[origin counts](assets/adr-0020/origin-requests.json). This exercises browser CSP
and native resource delivery, not a claim of a complete MCP App handshake or
network sandbox against malicious trusted backend code. Existing MCP routing
tests continue to cover the standard bridge and request authority.

Screenshots contain synthetic public content only:
[light](assets/adr-0020/files-light.png),
[dark](assets/adr-0020/files-dark.png),
[narrow](assets/adr-0020/files-narrow.png).

The already-retained private master, motion candidate and narration file also
played and sought through authenticated project delivery without import. That
check uses native browser media elements; it is not a video-plugin migration
claim. Its sample-specific report remains in the private ignored runtime folder.
No further download or public copy occurred.

## Range measurements

The same Bun host served thirty different 64 KiB ranges from a **512 MiB** sparse
public file. Each completed response transferred exactly 65,536 bytes; every
recorded delivery span reports exactly that many file bytes. No whole-buffer
helper was used. See [measurements](assets/adr-0020/range-measurements.json).

| Measurement | Observed |
| --- | ---: |
| First request | 8.09 ms |
| Median of 30 requests | 0.83 ms |
| p95 of 30 requests | 1.95 ms |
| Total requested/transferred | 1,966,080 bytes |
| Baseline RSS | 223,068,160 bytes |
| Peak sampled RSS | 233,848,832 bytes |
| RSS increase | 10,780,672 bytes |

RSS includes the Bun server, in-process HTTP measurement client, instrumentation
and public fixture backend. It was sampled every 5 ms; this is neither a precise
allocator bound nor a cross-machine guarantee. The result supports bounded
range delivery, not a claim that a browser will never choose to buffer a video.
[Browser delivery spans](assets/adr-0020/delivery-spans.json) record full/ranged
and cancelled loads without paths or content. Byte counts on cancelled spans
mean bytes read/enqueued, not proof the peer consumed them all.

## Bugs found and corrected during verification

Independent review identified global OAuth disconnection leaving another project
connected, directory loss blocking Stop, upload/navigation queue deadlock, a
missing await before a source read and permanent empty activation after offline
startup. Focused regressions were written and passed after correction. A second
OAuth check covers a runtime created while old connections are being retired.

Real playback found that erroring an abandoned response on request cancellation
could terminate Bun 1.2.23 with an unhandled stream error. The host now closes
that abandoned body and releases its file; the cancelled HTTP transfer is not
reported as completed. Browser playback/seek and an explicit abort regression
passed afterward. Native request-body `releaseLock()` also failed in Bun's
completed upload path; the sole reader is instead closed by EOF or cancellation.

## Reproduction and limits

Run `bun run check:ci` and `bun run check:ui-policy` from the repository root.
The full gate covers portable contracts, dependency/import guards, build,
TypeScript/Svelte, Bun tests and Node shared conformance. Five opt-in tests
(four live Codex review scenarios and an OS credential round trip) are skipped;
no live model or credential-store performance claim is made.

Initial local-delivery verification on 2026-09-11: `bun run check:ci` passed with **571 passing,
5 skipped and 0 failing tests** (2,795 assertions across 96 files), followed by
passing Node shared conformance. Svelte reported no errors or warnings.
`bun run check:ui-policy` passed for 326 maintained source files. Frozen-lockfile
installation required no dependency changes. Independent review found no
remaining blocker after the corrections above.

Opt-in browser/measurement fixtures are
`apps/desktop/tests/file-delivery-host.ts` and `file-delivery-browser.mjs`.
The host creates a new temporary directory and prints its `browser.json` path.
Supply it through `DRAWLOOM_FILE_TEST_METADATA`, plus an installed
`DRAWLOOM_PLAYWRIGHT_PATH`. Stop the host to flush its sanitised span and origin
counts. Tests never launch a model, install production plugins or publish files.
`existing-media-browser.mjs` additionally requires explicitly selected local
folder/files and a caller-selected private output path.

Codex 0.153.4 generated protocol bindings were inspected locally on 2026-09-11:
`ThreadReadParams.includeTurns`, `Thread.cwd`, start/resume `cwd` and resume
`excludeTurns` are present. Scripted adapter tests check directory matching;
this is not live-provider evidence. The native macOS folder chooser has
authenticated endpoint and cancellation tests; a human-operated OS dialog and
packaged Tauri build were not exercised in this run.

R2, remote sync, transcoding, arbitrary URL proxying, automatic working-file
imports, new model-input types and universal artifact lifecycles remain excluded.
The existing supported-media import types remain unchanged; other working-file
formats are downloadable. MCP resource reads retain bounded whole-content
semantics, rather than being relabelled as streaming.

## Shared remote-media follow-up

The maintainer subsequently approved a single declared-media policy shared across
Drawloom. This remains part of ADR 0020, not a separate security framework or
browser protocol. `host/media-policy.ts` owns validation, persistence, provenance
and effective revisions. Activation submits standard MCP App declarations;
recognised MCP media content submits origins through the existing result capture
path. Neither package inspection nor arbitrary prose/JSON grants media access.

The public installed-package integration uses two unrelated synthetic workbenches.
It verifies that one package's declaration is available to another, a later
standard tool result updates the shared list, and the policy survives host restart.
The authenticated remote viewer resolves conversation/entry/resource identities,
not a browser-supplied URL. It loads media directly in the browser and shares the
same media CSP list; scripts and general connections stay denied. Source references
and signed URLs are not broadcast in the policy. No real Veo/R2 service is involved.

Review found two defects, each reproduced before correction: cumulative policy
limits could prevent future history capture, and the remote viewer did not allow
redirects to another declared CDN. Lifetime totals no longer reuse a bounded
single-delivery limit; the viewer receives the same effective list as MCP Apps.
The regressions cover 257 origins, 129 additional declaring identities, durable
reload and shared redirect destinations. Current host-origin exclusion remains.

The shared Sonner component uses `svelte-sonner` 1.2.1 from the root catalog/lock.
Its transitive `runed` export map requires Svelte's resolver condition. The
canonical Bun test script now supplies `--conditions=svelte`, matching the Svelte
build resolver, rather than patching or directly depending on `runed`. The normal
Node conformance command remains unchanged.

### Browser verification of the shared policy

[Results](assets/adr-0020/shared-media-results.json) are from a real Chrome run
against two installed public synthetic packages, using the standard MCP App
handshake and app-only tool call. Browser plugin was not available; the retained
Playwright fixture used the installed local Chrome, at 1440×1000 and 390×844.

- A consumer App loads an origin declared only by the producer package.
- A standard tool result declares a second source. The Sonner notice appears;
  the existing frame retains its unsaved note and cannot yet load the new source.
- Keyboard activation of **Reopen workbench** loads the source in a new frame.
  Only that explicit action discards the note. The host/backend is not restarted.
- Rapid reopening followed by closing leaves no old consumer iframe in the DOM.
  Switching the system theme during cleanup produces no unhandled notification.
- The shared viewer follows a redirect between the two declared origins, releases
  its frame on close, and shows an expired-link error for a non-media 403 response.
- Light/dark and narrow layouts, page identity, nonblank content and no framework
  overlay were checked. There were zero page errors and zero unexpected console
  errors; deliberate CSP denials and the expired resource explain nine messages.
- Reload retains returned references. Host tests separately verify process-restart
  persistence; this browser reload is not claimed as an independent host restart.

The controlled origins received eight media/redirect requests, no script request
and no undeclared-origin request. All `Referer` headers were absent. The
[request record](assets/adr-0020/shared-media-origin-requests.json) omits query
strings; signed URL test markers never enter the shared policy. Reading already
captured inline media still follows the existing capture-once path.

Screenshots: [reopen notice](assets/adr-0020/shared-media-notice.png),
[light](assets/adr-0020/shared-media-light.png),
[dark](assets/adr-0020/shared-media-dark.png),
[narrow expired-link feedback](assets/adr-0020/shared-media-narrow.png).
The intentionally tiny image and plain fixture controls test permissions and
decoding; they are not a proposed production workbench design.

Browser verification exposed a closing-frame theme notification after transport
shutdown and a duration-only iframe outro that could linger during rapid
reopen/close. The theme update now checks the active transport and cancellation;
the bounded cleanup uses a real opacity transition. The final browser check waits
for **all** outgoing frames to disappear, including overlapping old/new instances.

Reproduce using `apps/desktop/tests/shared-media-host.ts` and
`shared-media-browser.mjs`, with the same two environment variables as the earlier
file-delivery fixture. All origins, packages and resources are generated locally;
no real provider, credential sign-in, paid generation or private material is used.

Final post-fix checks on 2026-09-11: `bun run check:ci` passed with **583 passing,
5 opt-in skips and 0 failures**, 2,858 assertions across 101 files. Node shared
conformance passed. Svelte reported zero diagnostics; `bun run check:ui-policy`
passed for 343 maintained source files. Frozen installation and packed-package
checks passed. The existing Vite large-chunk warning remains. The maintainer
subsequently accepted ADR 0020 and authorised committing this work.
