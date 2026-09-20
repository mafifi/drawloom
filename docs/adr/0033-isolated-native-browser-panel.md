# ADR 0033: Host an isolated native browser in the workspace panel

- **Status:** Accepted
- **Date:** 2026-09-20
- **Decision owners:** Drawloom maintainers

## Context

The maintainer wants to inspect websites and local previews alongside a
conversation before the desktop distribution milestone. An iframe preview is
not a general browser: embedding restrictions and authentication can prevent
ordinary sites from loading. Drawloom already uses Tauri on macOS, but its main
webview is restricted to the authenticated local application origin.

Browsing untrusted pages must not extend the authority of that application or
of an installed workbench. This is a desktop-host integration, not another agent
runtime, a browser automation system or a replacement for the approved workbench
viewer. Existing project/file and MCP Apps boundaries remain authoritative.

## Decision

Use a Tauri child webview positioned within the existing right-hand panel,
using the system WKWebView on macOS 14 and later. Explicitly
accept the pinned Tauri multi-webview API's `unstable` feature dependency, subject
to native verification before release. Do not enable it merely by accepting this
document without implementing the isolation and lifecycle obligations below.

The desktop host owns native instances, navigation policy, browser storage,
downloads, site permissions and teardown. Application/ViewModels own conversation
association and commands; shared shadcn-based presentation owns the toolbar and
panel controls. Native geometry follows the panel, including hiding the child
when dialogs or other panel content must take precedence.

Define and validate a narrow optional host contract before implementation:
availability, open, navigate, back/forward, reload, close and observable status.
Opaque browser identities are conversation-bound. A workbench may request a
browser presentation through an explicitly approved integration, but receives
no webview handle, script evaluation, cookies or page content. Do not silently
extend MCP Apps with a private browser protocol. Specify any new plugin-facing
request separately before wiring it. The first consumer is Drawloom's own UI;
review a generic local-preview consumer as the contrasting use case.

Browser-hosted Drawloom reports native browsing unavailable and offers an explicit
external link. Do not pretend an iframe fallback has equivalent capability.
Keep the existing native main-webview origin restriction intact.

Security requirements:

- Untrusted pages receive no Drawloom IPC, privileged commands, tool grants or
  authenticated application storage. Scope Tauri capabilities to the trusted
  webview, not a wildcard or the containing window indiscriminately.
- Use a separate browser data store. Website sessions may be shared across browser
  tabs in this installation, but not with the Drawloom app or the user's external
  browser. Verify this isolation on the minimum supported macOS version; a second
  webview label alone does not establish it.
- Navigation and redirects must not reach Drawloom's authenticated local origin,
  bootstrap endpoint, file protocols or privileged custom schemes. Include
  subframes, subresources, pop-ups and script-initiated requests in the threat
  analysis: a top-level navigation callback is not a network-isolation proof.
- Allow ordinary website networking, including explicitly entered local-preview
  HTTP URLs except Drawloom's protected endpoint. Do not discover or start local
  servers. This is application-authority isolation, not a local-network sandbox:
  navigation filtering does not intercept every website request. Separate storage
  and server-side authentication/request validation must protect Drawloom from
  website scripts, frames and resources. Do not proxy arbitrary pages through the
  authenticated Drawloom origin.
- Prompt for supported site permissions through Drawloom; deny unimplemented
  permissions and block automatic pop-ups with understandable feedback.
  In-app downloads are deferred: cancel them and offer explicit external opening
  rather than independently fetching or executing files. External scheme handoff
  is allowlisted and user initiated. Do not bypass certificate warnings or site
  restrictions.

### Site permission ownership

This additional native engineering is justified by Drawloom's
[secure-by-default principle](../../ARCHITECTURE.md#decision-principles), not by
a preference for custom browser code. The inspected dependency's automatic
website-level media grant does not preserve the user's control over which site
may request device access. OS consent is an independent protection, not a
substitute for that site-level decision. Ask by default, explicit origin-scoped
consent and denial when enforcement is unavailable are the required safeguards.
The same architecture principles require reuse and restraint: retain Tauri and
WebKit, adding only the missing permission boundary rather than another browser
engine or general permission framework.

The maintainer approved user-controlled site permissions after the pinned native
delegate gap was found. Add **Settings → Browser → Site permissions**, with
origin-scoped decisions that users can inspect and revoke. Supported permissions
default to **Ask**; requesting websites do not select or supply their own identity
to the trusted UI. The native callback supplies the requesting security origin,
frame and tab identity. Show the requesting origin and, for embedded requests,
the containing site's origin. Never apply a containing site's grant to a different
requesting origin.

Offer **Allow once**, **Always allow for this site**, and **Block**. Allow once
resolves only that pending native request and is not persisted. Remembered grants
and blocks are specific to the requesting origin and capability, not a wildcard
domain, conversation or plugin. Revocation resets future requests to Ask; do not
claim that removing a saved grant has stopped an existing media stream without
native confirmation. Settings must explain that distinction.

Hold each native request until an explicit decision. Bind responses to an opaque
request identity and the still-current tab/document; deny dismissed requests and
invalidate pending requests on navigation, closure or shutdown. Duplicate or stale
decisions cannot grant access. If the trusted prompt is unavailable, deny rather
than fall back to Wry's automatic grant. Hide the child webview while a trusted
permission prompt is displayed so website content cannot cover its controls.

The Rust shell owns native callback lifetime and enforcement. Application and
ViewModels own prompt/settings commands and presentation through shared shadcn
controls. Native decisions and retained site preferences have one authoritative
owner, separate from plugin grants and agent approvals. No website permission
grants Drawloom IPC, file, project, tool or conversation access. macOS device
privacy consent remains independently required; do not change OS permissions.

Implement a narrowly scoped macOS WebKit permission adapter using public native
APIs through Tauri's platform-webview access. Install it before external navigation
and fail closed if installation fails. Verify preservation of popup, file-dialog
and delegate lifecycle behaviour; do not assume replacing Wry's delegate retains
its callbacks. Camera and microphone callbacks are source-confirmed candidates;
other permissions are exposed only when native enforcement and callback support
have been established. No JavaScript permission shim or dependency fork is approved.

Retain only conversation-bound tab metadata needed to reopen, not page snapshots
or a browsing transcript. Do not persist credential-bearing URLs or put URLs,
query strings or page titles into content-free telemetry. Restore tabs unloaded
until explicitly opened. Closing a tab destroys its instance, not its website
account or cookies. Define explicit browser-data clearing separately; do not
silently erase login state during app or plugin updates.

Viewing is not agent disclosure. Page extraction, "use as context", agent control,
screenshots and automation are outside this delivery and require their own
authority and provenance decisions. No navigation or restored tab submits a turn.

## Alternatives considered

- **AI Elements Web Preview iframe:** inspected as presentation, not tested as a
  general browser. Suitable for bounded previews, but does not remove embedding
  restrictions. Reuse appropriate controls only; do not inherit permissive iframe
  settings as a security policy.
- **Separate Tauri browser window:** considered as a simpler native alternative
  without docked multi-webview layout. Keep as a fallback proposal if child-webview
  integration cannot meet release checks, not an automatic design substitution.
- **External browser only:** retain for unsupported websites and authentication
  flows, but it does not provide the requested side-by-side workspace experience.
- **Bundled Chromium or a general custom native WebKit bridge:** considered, not
  evaluated. Neither is justified. The subsequently approved narrow permission
  adapter addresses the observed gap without replacing Tauri's browser hosting.

## Evidence

Source inspection on 2026-09-20 found Drawloom's Cargo lock pins Tauri 2.11.5.
Before implementation, the [shell](../../apps/desktop/src-tauri/src/main.rs) created one
`WebviewWindow` and restricts navigation to the local host origin. Its
[configuration](../../apps/desktop/src-tauri/tauri.conf.json) had no granted
Tauri capabilities. The implementation now adds child browser views and narrowly
grants event subscription only to the main webview at the exact application
origin. Website views receive no Drawloom capability grants.

Tauri's installed source gates child `WebviewBuilder` behind `unstable`; its
public [API documentation](https://docs.rs/tauri/2.11.5/tauri/webview/struct.WebviewBuilder.html)
describes navigation, download, incognito and website data-store controls.
[Capabilities](https://v2.tauri.app/security/capabilities/) constrain native API
exposure, not arbitrary website network access.

The [DeepSeek inventory](../reference/harness-workbench-survey/deepseek.md)
records sandboxed HTML document previews rather than proving a general native
browser. The local checkout at `c291e7961a515f6d7af9304e7fd1d257929aef26`
retains document-scoped HTML dependency packing in
`packages/client/ui-sidebar-documentpreview/src/client/html/pack.ts`; this is
source evidence, not an executed isolation test.

The [OpenAI/Rosalind evidence](../reference/mcp-apps-host-evidence.md) records
standard link navigation and a capability-gated first-party authenticated
ChatGPT webview action. It explicitly does not establish renderer isolation or
a supported third-party generic browser API. No proprietary implementation is
copied. Neither reference establishes the exact proposed boundary: explicit
maintainer approval is required under
[ADR 0013](0013-plugin-boundaries-and-host-integration.md) before implementation.

The maintainer approved implementation of this browser boundary on 2026-09-20,
including ordinary browser networking, without accepting this ADR. A subsequent
source check found a native permission blocker, recorded in the
[permission readiness evidence](../reference/native-browser-permission-readiness.md).
The pinned Wry macOS UI delegate grants website media-capture permission; the
inspected Tauri builder has no permission-decision callback. OS privacy controls
remain separate and do not establish the required explicit website denial.
The maintainer subsequently approved the native permission adapter and
Settings/prompt flow above. Native browsing, the delegate adapter and shared
panel/settings presentation are implemented. Native state
tests and scripted rendered checks do not resolve the native verification
obligations. No dependency-source patch or JavaScript permission shim was added.
See the updated readiness evidence for the remaining geolocation, WebKit grant
cache, real-device and lifecycle acceptance gaps.

The maintainer accepted this ADR on 2026-09-20 at the pre-packaging checkpoint.
Acceptance records the architecture and its obligations, not completion of the
remaining native security, lifecycle or update verification.

## Consequences

The native app can offer side-by-side browsing without bundling a second engine.
The ordinary localhost browser experience cannot promise the same capability.
Website compatibility, authentication, native stacking/focus and data-store
separation become maintained responsibilities. Site failures need an external
browser path rather than a compatibility guarantee.

The permission adapter adds real maintenance: native callback ownership and
lifetime, origin-bound decisions, persisted preferences, prompt accessibility,
revocation semantics and regressions across macOS/Tauri/Wry upgrades. Keep that
responsibility consolidated in the native boundary and its shared contract;
do not spread security decisions across Views. Dependency upgrades must rerun
native permission and delegate-compatibility checks. If upstream later supplies
equivalent verified controls, prefer removing the adapter over maintaining two
paths. This cost is accepted for the demonstrated safety requirement, not as
permission to expand the browser's scope. Security is an acceptance obligation,
not a claim established by the presence of settings or an ADR.

This decision does not relax workbench hosting, file authority, consent or
content-free telemetry. If the isolation boundary cannot be demonstrated with
supported controls, block native browsing and return to the maintainer; do not
ship an unrestricted webview to meet the packaging deadline.

## Scope and verification

The approved scope is macOS native browsing, shared controls, explicit
external fallback and conversation-bound unloaded restoration. No agent browser
tools, teams, new provider, browser extensions or cross-platform claim.

Write contract and policy regressions first. Verify trusted/untrusted webview
capabilities; cookie/storage separation; protected loopback endpoints; redirects,
subframes and subresources; custom schemes; denied permissions; downloads and
pop-ups. Exercise keyboard focus, native overlays, resize, dock/expand, both
themes, zoom and reduced motion in the unsigned Tauri app, not just at port 4488.

Verify navigation failure, webview failure, repeated close, shutdown, restart and
app replacement. Preserve conversation/project bindings, working files, settings,
grants and existing credentials. Use disposable profiles for destructive tests;
never reset the user's installation. Public fixtures contain no private content.

Documentation reconciliation and the broader lifecycle/update acceptance precede
signing, notarisation, DMG packaging and clean-machine testing. Record actual
native results separately from scripted and browser-only checks. ADR acceptance
and documentation validation are not implementation or security proof.
