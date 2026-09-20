# Native browser permission readiness

Inspected 2026-09-20 for [Accepted ADR 0033](../adr/0033-isolated-native-browser-panel.md).
Source findings, scripted checks and native observations are distinguished below.
The dated follow-ups supersede the earlier checkpoint's open items only where
they record an executed result; none is a general browser-security certification.

## Pinned implementation

The desktop Cargo lock resolves Tauri **2.11.5**, tauri-runtime-wry **2.11.4**
and Wry **0.55.1**. Inspected registry source paths within those crates:

- `wry/src/wkwebview/class/wry_web_view_ui_delegate.rs`, lines 126–137:
  `request_media_capture_permission` calls its decision handler with
  `WKPermissionDecision::Grant`. This implementation applies on macOS; it is
  not an iOS-only branch. It is independent of Drawloom's Tauri capability grants.
- `wry/src/wkwebview/mod.rs`, lines 599–602: Wry installs that UI delegate on
  the WKWebView.
- `tauri/src/webview/mod.rs`: the inspected builder exposes navigation,
  new-window and download callbacks, but no site-permission decision callback.
  `on_web_resource_request` handles Tauri's own protocol, not all website HTTP.
- The same Tauri module, lines 1607–1675, exposes `with_webview` on the main
  thread, including a raw WKWebView handle. It warns that platform dependencies
  can change in minor releases. That escape hatch is not itself a permission
  policy or a tested delegate integration.

Source inspection does **not** establish that a website can capture media on this
machine: macOS privacy authorisation and application configuration also govern
actual device access. It does establish that the pinned library does not supply
the requested unconditional website-level denial through the inspected builder.
Geolocation and other permissions still need separate native verification.

## Decision and implementation status

The maintainer approved a native permission adapter, with Ask by default,
origin-bound prompts and review/revocation in Drawloom Settings. Supported requests
offer Allow once, Always allow for this site, and Block. Denial of unimplemented
permissions is an acceptance requirement, not yet a verified blanket guarantee. The authoritative decision is in
[ADR 0033](../adr/0033-isolated-native-browser-panel.md#site-permission-ownership).

The implemented macOS-only native permission adapter uses
Tauri's platform-webview access and public WebKit delegate APIs. It lives inside
the Rust shell and is installed before external navigation; installation failure
rejects navigation. It retains the original delegates for upload and navigation
callbacks. This is additional native ownership, not a new agent or plugin
interface. Actual website compatibility still needs native acceptance.

Alternatives are an audited upstream dependency solution (requiring version,
licence and compatibility review), or deferring the panel and retaining external
browsing. A separate native window uses the same underlying permission delegate
and does not by itself fix this issue.

JavaScript overrides, missing usage-description keys, or relying on the user's
OS denial are not substitutes for native permission enforcement. No such
workaround was installed. Dependency sources were not patched. The lockfile now
includes the explicitly pinned native dependencies and multi-webview feature.

## Verification and remaining work

Implemented: the host-only contract, native adapter, browser panel/tab switching,
Open browser action, and Settings → Browser with origin/capability-specific
choices. Rust is the sole permission-state owner. Native commands require the
actual main webview and application origin; events target that webview only.
Saved tab metadata is deliberately origin-only and restored unloaded, so a
restored tab does not retain its previous path, query, fragment or title.

Executed checks include native state/completion/IPC tests, a debug executable
build, and synthetic rendered panel/permission/settings checks. The rendered
fixture injects a scripted native transport: it is not WKWebView security proof.
After the Mac was unlocked, the existing host was backed up and gracefully
stopped. A freshly built unsigned native app reopened the same installation on
4488 with its existing conversation and project visible. Native acceptance then
found that Open browser displayed its toolbar but rejected the native command.
The pinned Tauri implementation requires explicit command ACL permission for
the HTTP-hosted main view. A generated, exact-origin/main-view-only permission
corrected that failure; a regression checks allowed and rejected contexts.
After rebuilding, native Open browser opened a focused blank tab and loaded
Example Domain inside the child webview, confirmed by a rendered screenshot.

An earlier app-selection attempt launched a stale release bundle and produced
a macOS crash report. The report's executable UUID matched that old bundle, not
the fresh debug build. Source inspection also identified expected setup errors
crossing Tauri's panic-in-Cocoa startup boundary. Startup handling now consumes
those errors, cleans up its owned host and presents a native error before exit;
the native missing-host test displayed that alert, quit without a leftover
process, and was followed by successful reopening of the existing installation.
All 25 Rust tests passed. Permission-prompt, storage-isolation and full update
acceptance remain outstanding; successful launch and one rendered website do
not establish those broader guarantees.

Remaining native questions include geolocation (no public decision callback was
found in the pinned macOS WebKit API), within-document media grant caching after
Reset to Ask, uploads, popup/download behavior, native zoom/focus, isolation from
the authenticated app, and lifecycle/update preservation. Camera and microphone
are the only exposed site settings. Motion is denied by its native callback;
other unsupported permissions are not yet claimed as enforced. Corrupt or
unsupported browser preferences leave the main application usable and make only
the browser unavailable, with recovery guidance. Tests verify the original file
is preserved and mutating browser commands cannot replace it with defaults.

The maintainer subsequently accepted the ADR and authorised checkpoint commits
on 2026-09-20. Signing and packaging remain outside this increment. Acceptance
does not close these verification gaps; the browser is not yet release-verified.

## Native acceptance follow-up, 2026-09-20

The unsigned WKWebView application was exercised with the public, loopback-only
[`native-browser-acceptance.fixture.ts`](../../scripts/native-browser-acceptance.fixture.ts).
This is a manually operated native fixture, not a scripted bridge substitute.

- Popups produced visible blocked feedback without another browser window.
- A synthetic download was cancelled with external-browser guidance.
- A credentialed cross-origin fetch to the protected application was unreadable
  (`TypeError`); an attempted frame remained blank with navigation-blocked feedback.
  This establishes these probes, not general local-network isolation.
- A redirect to the protected host did not load it. The final feedback was the
  generic load failure rather than the more specific blocked-navigation message.
- Geolocation returned permission-denied code 1. No coordinates were retained.
  This does not establish the cause or blanket enforcement for other APIs.
- After graceful shutdown, the host listener and desktop process exited. The
  existing installation was backed up before reopening. Its existing conversation
  and workbench remained accessible; the browser tab restored unloaded and loaded
  only when selected. A synthetic localStorage marker survived. The session cookie
  did not, which does not test persistence of cookies with an expiry.

Camera and microphone requests initially remained pending without a visible site prompt.
Content-free tracing in a rebuilt native app confirmed that the microphone
request did not reach Drawloom's permission callback. WebKit logs reached its
permission-prompt path. This is an unresolved native acceptance failure, not
evidence that the site's request was approved or that Drawloom's dialog is at
fault. Current upstream
[WebKit source](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/UserMediaPermissionRequestManagerProxy.cpp)
performs system validation before calling the application policy delegate; this
is diagnostic context, not proof of the installed OS implementation or root cause.

The maintainer then confirmed a macOS permission prompt was visible and approved
it directly. Drawloom's separate origin-bound microphone dialog appeared; the
native callback and prompt-delivery traces were present. Selecting Block returned
`NotAllowedError` to the page. A repeated request remained denied, and Settings
→ Browser showed the synthetic origin with Microphone · Blocked and Reset to Ask.
No website capture was granted at this point. The original wait was therefore
resolved by the system prompt, not a Drawloom UI change. Allow-once, revocation,
embedded-origin and navigation-race acceptance remain separate checks.

The maintainer explicitly approved the loopback fixture's one-time microphone
test. Reset to Ask removed the previous block; the next request displayed the
origin-bound dialog. Allow once returned a stream and the fixture immediately
stopped every track, without recording or transmitting media. A second request
in the same document returned another stream without a new native callback:
WebKit reused the document's temporary grant. Reloading the page caused the next
request to prompt again. Block then returned `NotAllowedError`; the retained
origin/capability preference was verified as blocked. The test tab was closed,
the workbench viewer restored, and the loopback fixture server stopped.

This verifies the one-time native decision and reload boundary, **not** a promise
to prompt for every JavaScript media request. The visible Allow once wording
needs to disclose the observed document lifetime before release. Persistent-grant
revocation (especially same-document WebKit caching), embedded origins and
navigation races remain unverified. No Always allow grant was made, and the
maintainer's separate macOS privacy choices were not modified by the agent.

Fresh targeted checks: 16 host shutdown/recovery/project tests passed, 4 plugin
installation tests passed, and all 25 Rust tests passed. The added plugin fixture
replaces a manifest in place, preserves installation settings/identity, rejects a
corrupt replacement without overwriting settings, and recovers the prior version.
It does not establish running-backend update recovery, credential continuity,
application replacement failure or pending-approval recovery. The public canonical
gate passed with 1,632 tests passing, 8 optional skips and no failures. The private
consumer gate passed with 262 tests passing, 2 optional skips and no failures;
no private code or content changed. These gates do not include the outstanding
native acceptance scenarios. Forced termination, the broader replacement matrix and the
remaining permission scenarios are still open. No signing or packaging occurred.
## Permission reset correction under verification

Reset to Ask must invalidate WebKit's document-local grant, not only the saved
preference. The native boundary tracks requesting origins for each live webview
(including embedded origins). Reset unloads only affected webviews, denies their
pending decisions and retains their tab metadata and website profile. Reopening
is explicit. Website form edits in those pages may be lost; Settings discloses
this before activation. No page script is injected to implement revocation.

Interaction brief: use the existing Reset to Ask StatefulButton and durable
outcome notice. The host owns invalidation and teardown; the controller owns
pending/error state. No optimistic success or automatic retry. Pointer and
keyboard use the same command; no animation is needed. Verify same-document
reuse, embedded origins, unrelated tabs, pending decisions, failure and reopen.
The final follow-up below records the native same-document revocation result.
Embedded-origin and navigation-race native coverage remain separate from the
model-level tests.

### Current verification checkpoint, 2026-09-20

- Public canonical gate with optional Keychain and Temporal checks enabled: 1,636
  Bun tests passed, six optional skips, no failures; Node and packed replacement
  checks passed. The Keychain test reads a synthetic value from a fresh process
  and deletes its exact test credential. This gate precedes the final unloaded-tab
  Reload eligibility correction, which has separate rendered verification.
- Rebuilt-public-package private consumer gate: 262 passed, two optional skips,
  no failures; the private checkout remains unchanged.
- Rust: 27 tests passed, including pending-decision invalidation and cached-grant
  target discovery without an outstanding prompt. These are not native capture proof.
- The public rendered UI matrix passed with the pinned Playwright headless browser.
  The optional real Temporal installed-evaluation recovery test also passed without
  repeating scorers. The canonical gate's other optional lanes remain separate.
- The unsigned native application rebuilt successfully. An offline backup preceded
  relaunch with the existing installation configuration at 4488. The retained
  conversation and approved workbench sections reopened; the browser test tab was
  separate from the workbench. A launch without that explicit configuration showed
  the existing startup-failure dialog; no reset was performed.
- After maintainer macOS consent, the rebuilt app honoured the saved loopback
  microphone Block decision. Reset to Ask unloaded that page and retained its tab;
  explicit Go followed by a new request displayed a fresh Drawloom permission
  dialog. Working files still match the offline backup. Persistent-grant test
  approval is still needed before testing revocation end to end; no persistent
  Allow decision was made. Forced termination/reopen, application replacement and the remaining
  native permission/recovery scenarios above are not claimed complete.

The smaller layered icon is separately committed and visually checked in Icon
Composer and Finder. Lifecycle changes remain uncommitted pending native acceptance.

### Final native follow-up, 2026-09-20

With explicit maintainer approval, Always allow was selected for microphone access
on the loopback fixture only. The page received a stream and immediately stopped
all tracks; repeating the request in that document also succeeded. No recording
or transmission occurred. Settings displayed the exact origin as Allowed.

Reset to Ask removed the saved grant and unloaded that native page. Its tab and
address remained, with guidance to reopen. After explicit reopening, another
microphone request displayed a fresh Drawloom prompt. This verifies revocation
of the observed same-document cached grant, not just deletion of preferences.

The app was then deliberately terminated with SIGKILL while that new site prompt
was pending. Its owned host closed its listener and exited. Reopening the same
installation restored the existing conversation and workbench, without replaying
the permission decision or initiating an agent turn. The browser remained
unloaded at startup; explicit selection/opening restored the page. Both the
synthetic localStorage value and expiring cookie survived. A new microphone
request prompted again and was dismissed, returning NotAllowedError.

After graceful app/host shutdown, the final unsigned app was rebuilt at the same
bundle path and reopened against the same installation. The conversation,
workbench, browser metadata and both website storage markers survived. Opening
the already-running app again reused its existing process and host. This proves
same-location development-bundle replacement, not signed DMG installation or
rollback after a failed filesystem copy.

Cleanup removed only the fixture's exact localStorage key and cookie, verified
their absence, closed its disposable tab and stopped its loopback server. No
saved website permission remains. The approved workbench was restored. Working
files compare byte-for-byte with the offline backup; no private source changed.
The offline host-directory comparison also preserved conversation history,
installation settings, grants and project bindings. Differences were confined to
the exercised browser state and runtime bookkeeping/database sidecars; this does
not imply runtime databases are byte-stable across startup.

Additional regression coverage exercises backend versions in fresh host processes:
both versions activate, a broken replacement fails, and restoring the old version
recovers without changing retained synthetic data. The existing manifest fixture
separately verifies installation identity/settings. This is restart-based update
coverage, not hot replacement of an executing plugin. Native permission diagnostic
prints used during investigation were removed from the maintained implementation.
Read-only review identified stale presentation after a reset that tears down the
native page but fails while saving. A failing-then-passing controller regression
now requires one authoritative read after failed mutations, without resubmitting
the action or hiding its error. The reviewer confirmed that targeted resolution.

Release limits remain explicit: native embedded-origin/navigation-race coverage,
minimum-supported-macOS coverage, unsupported permission APIs, forced restart
during an active model/tool operation, and signed installer/failed-copy recovery
are not established by these checks. Scripted native-approval tests reject stale
decisions after reopen, and execution recovery tests fence unresolved work; those
are not a substitute for an actual active-model crash test. The earlier optional
live native approval and mounted evaluation-viewer lanes remain unrun here.

Final verified checkpoint: the public canonical gate passed with 1,638 tests,
six optional skips and no failures, with Keychain and Temporal checks enabled.
The rendered UI matrix passed; all 27 Rust tests passed. The private consumer
gate passed with 262 tests, two optional skips and no failures. The reviewed
unsigned build reopened the same installation, showed no saved site permissions,
and was left on the approved workbench viewer. These results supersede earlier
test counts, not the release limits above. The private checkout has no new source
changes to commit.
