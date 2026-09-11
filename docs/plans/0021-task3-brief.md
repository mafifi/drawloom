# Task 3: Installed host integration and shared run presentation

Implement ADR 0021 Task 3 after the provider API is reviewed. Existing checkout,
uncommitted. Read root guides, DESIGN.md, tasks 1/2 reports and ADR before editing.
No private source, data or content. No new browser/plugin protocol. Do not spawn.

## Handoff state (parent work now yours)

Task2 provider finished; read its report. Parent added host/orchestration-host.ts
with lazy manager factory, preparation, readiness, saved-owner restoration and
configuration guard. Its tests pass 2/9 assertions. Host presentation helper
strips outputs/results and validates scope, 1/7 assertions. These are NOT yet
wired into application.ts/server.ts. Reuse and complete them; review their edges.
plugin-packages.ts now has prepareWorkflows callback gated by backend trust,
non-orchestration prerequisites, then attach after backend activation; close
before backend disposal. Focused loader test passes 1/5 assertions.
workflow-authority.ts wraps handlers with async installation/project/run/attempt
provenance that expires after handler return; 2/8 assertions pass. Wire this into
the EXISTING tool gateway policy/evidence, not a second gateway. Current policy
requires a live conversational operation and would deny detached workflows.

For each dispatched task refresh current grants before work and before gateway
invocation (async wrapper around existing invoke). Require the bound installation
and project to match; no ambient authority from merely knowing runId. Persist tool
evidence using createDesktopEvidence in installation/project-scoped runtime store
with workflow run correlation. No fake conversation/history entry. Never grant a
tool automatically. For a package owning multiple workbenches, require grants in
all its declaring workbenches until an explicit narrower task/workbench association
exists; the current recipe owns exactly one. Explain this conservative limit.

IMPORTANT race: the current guardInstallation is check-only. Serialize package
configuration application against new orchestrator.start calls in host helper.
After a configuration change requiring restart, block new starts for that
installation until restart; otherwise a workflow could start using old settings
after the check. Wrap supplied scoped orchestrator.start, retain other methods.
Guard must include unseen saved owners; no service-only query dependency.

Parent added @drawloom/temporal-orchestration workspace dependency in desktop
manifest but lock may need bun install. Use dynamic import in manager factory so
ordinary non-workflow app startup does not load SDK or start services. Expose
explicit configured paths via host options/environment conventions. Provider
manager API type is ReturnType<typeof createLocalTemporalManager>.
Parent has stopped editing public host/UI files for this task; you own them now.
Do not edit provider or private code. Parent handles private consumer work.

## Composition

Wire the supported Temporal manager only in the desktop composition root. One
manager/service per data directory; project+installation owner scopes. Prepare a
trusted contained workflow module before backend activation, inject its scoped
orchestrator only when declared, then validate/attach its returned task handlers
before starting dispatch. Readiness is separate from ordinary plugin readiness:
missing CLI or unavailable orchestration must not disable editing or standard MCP
contributions. Required dependencies keep their existing fail-closed semantics.

Restore trusted project handlers for every unfinished owner before recovery,
including projects not currently selected. Preserve directory validation and
disabled/missing-project behavior. Do not retarget runs on project navigation.
Guard configuration/replacement of installed packages with unfinished runs across
all projects using provider ownership records; no side-by-side versions. Unexpected
package changes block recovery, visibly. Inspection still executes nothing.
On host quit drain/close orchestration BEFORE disposing plugin handlers/tools;
quitting must not send workflow cancellation. Existing native agent mappings,
history/media, app routing, grants and authority remain unchanged.

Useful current integration locations: apps/desktop/host/application.ts,
plugin-packages.ts, plugin-backend.ts, plugin-installations.ts and main.ts.
Parent already amended plugin-backend.ts to inject optional requested orchestration
and a schema-validated readiness callback; dependency reports include declared
orchestration presence. Six loader tests/32 assertions pass, including missing
orchestration leaving backend editing available. Two-phase manager integration is
still pending; retain these changes rather than redoing them.
Avoid growing application.ts with a second orchestration engine; extract focused
composition/presentation helpers. Startup error handling must retain safe useful
messages, not discard all failures under a generic unavailable badge.

## Public presentation

Parent already added `WorkflowRun` in @drawloom/ui with controlled run/title,
cancel callback/pending/error and typed-input snippet. Reuse it rather than adding
another run card. Six SSR tests (17 assertions), package build/Svelte check and UI
policy passed; desktop/browser integration remains yours. Parent owns the shared
component files until this task begins.

Parent also added `apps/desktop/src/lib/orchestration-protocol.ts`,
`orchestration-view-model.svelte.ts` and `WorkflowRuns.svelte`, mounted in Settings.
Complete their host wiring; do not duplicate these. The UI is not claimed working
end-to-end until those APIs exist. Five focused VM tests cover explicit project
scope, late navigation/command reads, typed-input targeting and bounded paging.

Internal HTTP contract:

- GET `/api/orchestration/owners?projectId=...` => WorkflowOwnersSchema.
- GET `/api/orchestration/runs?projectId=...&installationId=...&limit=20&cursor=...`
  => WorkflowPageSchema (no cursor for latest).
- POST `/api/orchestration/runs` => parse WorkflowCommandSchema (cancel/respond),
  return WorkflowRunSchema for exactly that run after command acceptance.
- Add a bounded steps endpoint and VM/UI paging for `stepsTruncated` as needed.

Run projection explicitly removes `steps[].result`, `output` and raw `failure`.
Never pass the raw provider snapshot to this strict public-browser schema. Bound
command JSON bytes (64 KiB), authenticate/validate Origin using current server
guards, retain command ordering, and do not keep cancellation waiting behind a
long running task. Browser poll/navigation cancellation is read cancellation only.
The VM shows one bounded run page and refreshes that page, not an accumulated log.

Use existing authenticated desktop host APIs and validated browser envelopes for
bounded run listing, inspection, typed input responses and cancellation. Scope
requests to a selected project+installed workbench, never arbitrary native run IDs
or providers. Bound pages/step summaries; do not poll full history or payloads.
No browser capability object; private UI continues through standard MCP App tools.

Add reusable presentational run status/details and input/cancel controls through
@drawloom/ui. Consumers own I/O/ViewModels. Distinguish waiting for input,
cancellation requested, terminal failure and unresolved effects; uncertainty is
not ordinary success or an invitation to retry. Show meaningful workflow labels,
steps and attempt counts. Do not expose raw Temporal envelopes or media payloads.
Use the existing Plugins/Settings/main-content layout, not a new drawer. Preserve
neutral system theme, blue user messages and four-layer styling. StatefulButton
only for the action pending; shared fields/buttons/markers/disclosures.

Keep private domain-specific review decisions in the workbench. A generic typed
input fallback may inspect/submit validated JSON rather than introducing a form
schema framework; show input errors without resolving the wait. In-flight response
navigation and run cancellation must invalidate stale controls.

## Tests and verification

Write failing tests before each slice. Exercise unrelated installed public
workflow package through this exact loader (outside source checkout), backend
trust, missing binaries/optional orchestration, both owner scopes, all-project
unfinished update guard, changed source, close ordering, new run controls and stale
navigation responses. Public tests require no private repo or Temporal service;
real service tests remain opt-in and use the supported provider.

Run focused desktop/protocol/component/UI policy checks and report exact results.
Use frontend-testing-debugging skill for rendered validation. Parent completes
cross-repository/browser acceptance; don't claim unperformed evidence. Record
report at docs/plans/0021-task3-report.md including changed files, tests, limitations
and any integration decisions needed. No commits.
