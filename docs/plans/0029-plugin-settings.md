# Plugin and workbench Settings delivery

Status: complete; ADR accepted by the maintainer on 17 September 2026.
Authority: [ADR 0029](../adr/0029-plugin-and-workbench-settings.md).
The original delivery was uncommitted for review; the maintainer has now requested
separate public/private checkpoint commits. No pushes, publication or live generation.

## Global constraints

Public Drawloom owns registration, hosting, lifecycle and generic examples. Private
business pages, prompts, voices and tests remain in drawloom-workbenches. Retain MCP
Apps, existing project bindings and grants. Settings is installation-scoped and has
no conversation authority. Page closure does not cancel setup. No arbitrary native
UI imports, universal form generator or automatic downloads. Test first, preserve
all existing dirty work. Do not create review diff artifacts in either checkout.

## Task 1: Public Settings registration and hosting

Amend the package contract before implementation. Add optional settings page
declarations with id, title, optional owning workbench id, openingTool {server,tool}
and an explicit allowed-tool list. Require unique page identities, valid ownership
and source/resource agreement. Unknown extensions remain ignored; bad enhancements
must not disable unrelated standard contributions. Use app-only opening/settings
tools. Do not expose the setup tools to the model.

Create a narrowly owned installation Settings host, independent of project runtimes,
with list/open/request/close lifecycle and host-issued mount identities. Reuse
standard MCP connections/resource/CSP checks. Activate only explicitly enabled,
selected servers; no backend imports or model startup to inspect settings. Settings
connections must receive global configuration and installation data but no project
directory. Bound operation admission, settle in-flight work on shutdown and close
each connection once. Page teardown does not kill installation operations. Restrict
requests to the exact page's declared app-only tools; validate every message and
invalidate mounts when an installation changes. No conversation context/messages.

Wire real application and HTTP routes, keeping error handling and shutdown honest.
Add Settings navigation per plugin/workbench and a reusable isolated settings frame
using existing AppBridge and shared UI/MVVM conventions. Match approved option 3:
Settings sidebar, named owner entry, custom page; not a conversation side pane.
Keep built-in settings. Show unavailable/disabled owners clearly. Keep form state
with its owner; don't claim universal unsaved navigation protection.

Write failing contract and host tests first: no conversation/project needed; disallowed,
cross-owner, model-only and stale-mount requests; malformed resource/duplicate page;
uninstalled runtime; repeated/concurrent close; connection failure and owner update.
Provide a generic self-contained public fixture with settings, validate real routes
and targeted UI tests. Run focused tests and TypeScript, not full CI per edit.

## Task 2: Private installation and workbench consumers

Build real reusable local-narration and speech-timing Settings pages and setup
operations through the public declaration. Use pinned existing runtime/model
information, explicit review/download, byte progress, cancellation, verification,
atomic readiness and retained operation receipts. Serve Settings without importing
or loading those optional runtimes. Reuse verified local models when selected;
do not silently move/delete existing assets, voice grants or configurations.

Dr Souphi gets an independent workbench Settings page for voice/provider and
editorial defaults, with links to plugin setup. No generation buttons masquerading
as preference saves. Preserve existing project selections. Validate revisions and
conflicting saves. Voice permission remains explicit and separate.

Refresh packed public dependencies through supported preparation. Add private
behaviour/packed-consumer tests for first setup, repeat setup, two projects,
cancellation, hash failure, restart, unavailable runtime and configuration conflicts.
No new images, video takes, historical audio demo or paid calls.

## Task 3: Verification and documentation

Review task implementations independently. Exercise installed Settings navigation,
setup/reopen and existing conversation views. Check keyboard/focus, both themes,
390px, reduced motion and 200% zoom. Run public check:ci once at final state, private
checks and packed-consumer checks; record executed versus unrun acceptance. Update
developer usage, references and evidence. Acceptance and commits require maintainer
approval, now recorded above. No automatic release.

## Progress

- ADR and reference comparison authored before implementation.
- Task 1 implemented and reviewed: actual authenticated routes, no-project
  browser fixture, owner-grouped navigation and lifecycle regressions pass.
  Final canonical repository gate passed.
- Task 2 implemented and independently reviewed. Private packed consumers,
  setup lifecycle, shared project readers and real retained-model adoption pass.
  Details and business evidence remain in the private repository.
- Task 3: installed desktop navigation and all three private pages passed in
  both themes and narrow layout, including saved preferences and prerequisite
  configuration. Public `check:ci`, independent scoped review, packed consumers
  and final real retained-model setup passed. No generation or new model download
  was performed. Native Tauri and full remote-download acceptance were not run;
  the evidence records distinguish these limits. Commit approval is recorded above.
