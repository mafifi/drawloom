---
type: source
id: adr-0013-plugin-host-integration
title: Initial integrated plugin and host proof
status: active
created: 2026-09-09
updated: 2026-09-09
---

# Initial integrated plugin and host proof

This record supports [Accepted ADR 0013](../../docs/adr/0013-plugin-boundaries-and-host-integration.md).
It records bounded integration evidence, not completion of the video-workbench
plan. Earlier checkpoints below retain their historical scope and counts.
Verification date: 2026-09-09.

## Ownership exercised

Public Drawloom owns contribution schemas, startup validation, the desktop host,
shared controls and the provisional bridge. A private WIP plugin consumes those
packages, builds one self-contained Svelte HTML resource, and uses its existing
controller. It does not supply a second application host or bridge framework.
No private implementation, fixtures, screenshots or generated assets are retained
in this public record. Public tests use independently authored synthetic cases.

## Historical custom-protocol results

These observations precede the MCP Apps migration below; their test counts and
wire-protocol claims describe the replaced implementation only.

- Frozen install and the public `bun run check:ci` gate passed: 223 tests,
  720 assertions, zero failures; Node shared conformance also passed. The gate
  includes package/desktop builds, TypeScript and dependency/UI policy checks.
- The private frozen install and canonical gate passed: 60 tests, 417 assertions,
  zero failures, Svelte checking and the self-contained resource build.
- In the public desktop's browser host, the registered private view loaded its
  controller's populated synthetic project. Selecting an existing candidate
  updated the shared host viewer. Switching to the generic viewer and reopening
  the plugin preserved that navigation selection.
- After stopping and restarting the host against the same local project
  directories, reopening the view retained the inspected candidate. This checks
  persisted controller state rather than an in-memory component result.
- The browser displayed the integrated view in the system's dark appearance.
  No warning/error console entries were observed during the initial round trip.
  Light appearance, narrow-layout acceptance and native Tauri hosting were not
  verified by this proof.

The fixture used synthetic local media and a fake generation transport. These
observations do not establish live provider behaviour, narration quality or
business-content approval.

## Historical custom-protocol boundary tests and limits

The original host, parent bridge and custom client tests exercised
ownership, strict request validation, source binding, disconnects and timeouts.
Shared plugin conformance covers contribution registration and ownership.

The frame can request only a snapshot or candidate inspection. Inspection is
navigation, not output selection, content acceptance, permission or spend
approval. The host derives routing identities and checks the active workbench;
the frame cannot choose another plugin or invoke the full controller-command
union. A timed-out request is not automatically retried.

The experimental `drawloom-view-proof/v1` envelope was **not MCP Apps conformance**.
It has now been replaced, not promoted. The frame has no same-origin
access and uses a restrictive CSP, but this is a trusted local-plugin experiment,
not a secure execution environment for hostile code. In particular, frame
self-navigation can disclose data through a URL, and CPU use is not bounded.

Agent handoff, concurrent editing, live candidate updates, media access and
host-authorised review/spend remain unproved through this bridge. Their next
steps must follow the ADR's comparison and escalation rule; this successful
read/navigation slice does not authorise a generic RPC or permission framework.

## MCP Apps migration — 2026-09-09

The running host and private resource now use upstream ext-apps 1.7.5 `App`,
`AppBridge` and `PostMessageTransport`, alongside MCP SDK 1.x. The host advertises
UI support, discovers app-visible tools and reads the standard HTML resource.
The old custom client/envelope and tests have been removed or replaced.

- Public frozen install and canonical gate: 221 tests, 710 assertions, zero
  failures; Node shared conformance, desktop build/check and policies passed.
- Private frozen install and canonical gate: 61 tests, 426 assertions, zero
  failures; Svelte checking and the self-contained HTML build passed.
- The compiled Svelte view loaded the populated synthetic project in the public
  browser host. Inspecting another revision updated the shared viewer. After
  restarting the host with the same project directories, reopening the MCP App
  retained that inspected revision. Closing and reopening the rebuilt view
  worked; the browser reported no warning/error console entries in that check.
- Dark appearance was observed. Light/narrow layout, native Tauri hosting,
  hostile-code isolation and live provider execution were not tested here.

The [standard SDK round-trip tests](../../apps/desktop/host/mcp-app.test.ts)
exercise App → AppBridge → MCP client → MCP server, capability negotiation,
standard teardown acknowledgement, invalid tool input, model-only/unknown tool
denial and resource identity rejection. Their synthetic counter payload does not
require `OperatorSnapshot` or `OperatorController`.
The [host tests](../../apps/desktop/host/view-bridge.test.ts) exercise authenticated
resource delivery, active conversation/view routing, denial and persistence.
This is evidence for the implemented MCP Apps subset, not full protocol coverage.

The private server exposes only app-visible reading/inspection tools. Public
selection remains navigation; no review, grant, generation or agent handoff was
added. General resource placement and richer authority are still ADR decisions.

## Current-conversation assistance — 2026-09-09

The private Svelte view now uses standard `App.updateModelContext` and
`App.sendMessage`; the public host handles their upstream AppBridge callbacks.
No MCP Apps extension was introduced. The parent has internal authenticated
mount routing, not a new plugin protocol or capability.

- Public canonical gate: **225 tests, 734 assertions, zero failures**, plus Node
  shared conformance, desktop build/check, dependency and UI/architecture policies.
- Private canonical gate: **63 tests, 439 assertions, zero failures**, plus
  Svelte checking and the single-resource HTML build.
- Protocol tests exercise context updates separately from messaging and preserve
  standard message rejection. Host tests cover no model start on context update,
  current-conversation binding, old mount rejection after reopen/navigation and
  delayed cleanup not invalidating a replacement mount. Context tests cover
  replacement, clearing and unsupported/oversized input.
- Private tests cover selection-specific context, clearing hidden passages on
  group navigation, refresh not restoring hidden context, visible request denial
  and no automatic candidate acceptance. Its tool set is also registered with
  the real public MCP server: the proof caught and corrected missing top-level
  object metadata on one private union input schema, without changing its payload.
- Browser proof on the populated private synthetic project: opening the view
  read the selected passage without starting a model; clicking its revision
  action sent a current-conversation message. Live Codex (CLI 0.153.4) returned
  shorter wording based on that selected passage. The reply appeared in the
  public conversation, not as a new accepted business candidate.
- A subsequent host restart restored the Codex conversation, its reply and the
  original inspected project revision. Native history includes the reference
  material that was sent with the request; clearing ephemeral context does not
  erase an earlier provider transcript. The restored UI currently displays that
  reference text verbatim rather than collapsing it as an attachment.
- The persisted private project SHA-256 before and after the request matched.
  This confirms no project documents, candidate selections, reviews or grants
  changed during the handoff. No paid media, patient data, downloads or business
  publication were involved. The browser console had no warnings/errors in the
  final live-reply check; dark appearance was visually inspected.

This closes the bounded proof for accepting ADR 0013. It is not proof of all
MCP Apps features, Rosalind first-party compatibility, hostile-plugin isolation,
native Tauri hosting, concurrent editing, live candidate updates, review/spend UI
or unrestricted media access. Performance was not measured; realistic startup,
interaction latency, memory and project size are follow-up measurements. Richer
or changed boundaries require explicit approval and a future ADR.
