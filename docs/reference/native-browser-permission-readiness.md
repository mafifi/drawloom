# Native browser permission readiness

Inspected 2026-09-20 for [Accepted ADR 0033](../adr/0033-isolated-native-browser-panel.md).
Source findings and implementation evidence are distinguished below. Neither is
an executed end-to-end browser-security test.

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
