# Local Temporal orchestration implementation

Status: completed. Implementation and the approved MCP concurrency amendment were
verified; the maintainer accepted ADR 0021 and authorised commits on 2026-09-11.
This plan is retained as an execution record; the ADR and API references own the
accepted decisions.

## Binding scope

Public Drawloom owns portable contracts, a Node Temporal provider, host lifecycle,
registration and reusable UI. Private drawloom-workbenches owns the deterministic
video workflow and consumer evidence. Keep public checks independent of private
source/data. No live model calls, paid generation, production downloads, publishing,
enterprise provider, Docker or global tool upgrades.

Use the pinned Temporal SDK and local CLI development server, with persistent
SQLite under the selected Drawloom data directory. This is an explicitly accepted
local-v1 trade-off, not an upstream-supported production deployment. Pause local
execution at application quit; recover at reopen. View navigation does not cancel.
Uncertain external effects never authorize another submission. Retry is per-step
and opt-in. Existing grants, native approvals, tool evidence and history remain
authoritative. Standard MCP Apps remains the only browser/plugin boundary.

## Task 1: Contracts and metadata

Extend @drawloom/orchestration with a portable workflow-module export (Registry),
typed backend task handlers, validated per-task execution limits and readiness
reporting as needed. Preserve existing callers and conformance. Enhanced package
metadata gains workflows.entrypoint (package-relative prebuilt JS) and may request
the existing orchestration capability optionally. PluginBackend returns matching
task handlers; no Temporal types or host APIs in workflow definitions. Validate
definitions, duplicate identities, limits and matching handler identities with
failing tests first. Metadata inspection executes nothing. Update contract docs.

## Task 2: Temporal provider and local lifecycle

Extract the retained adapter into @drawloom/temporal-orchestration (Node). No
supported import of spikes. Compile/cache a trusted workflow module separately
from backend handlers. Owner scope = installation + project. Persist bundle
fingerprints, receipts and run ownership. One loopback CLI service per data root;
no web UI by default; owned process shutdown, locks, explicit prerequisites and
readiness. Authenticated bounded worker/host dispatch. Persist before dispatch;
unchanged completed delivery reuses results, incomplete delivery is reconciled or
unknown, never blindly redispatched. No database resets. Bound graceful drain;
quitting is not workflow cancellation. Timeouts and wall-clock timers remain real.
Run shared conformance on actual Node/Temporal and deterministic provider. Test
service/worker/whole-host restart, unknown effects, stale/cross-owner access,
cancel versus quit, code changes, missing binaries, invalid storage and cleanup.

## Task 3: Installed desktop host and shared presentation

Wire the provider only in composition roots. Supply scoped orchestration to
declaring trusted backends; ordinary editing survives unavailable orchestration.
Validate workflow roots, schemas and handlers. Reject changed code for unfinished
runs and block package replacement/removal across all projects, including unopened
projects. Restore handlers before dispatch. Preserve project authority, existing
tool gateway and session mappings; synthetic/scripted owned-agent tests only.
Use @drawloom/ui for reusable run status, steps/attempts, pending input and cancel.
Keep application style and MCP Apps unchanged. Add safe OpenTelemetry boundaries.

## Task 4: Private deterministic video consumer

Existing installed treatment package declares workflow module and handlers. Run
D1-D2, E1-E2, F1-F2 as parallel branches from exact selected inputs/settings; retain
candidates; wait for explicit review; M1 joins selected scenes with existing A/B/C,
closing material and narration into a draft master, never accepted/published.
Use installed media gateway and existing execution/recovery identities, no second
executor. Recheck lineage before master. Reuse retained private files under
.local-runs/production-media-2026-09-11; map available sample roles honestly, derive
deterministic fixtures if necessary, preserve originals and keep evidence private.
Refresh public dependencies through prepare:public and test installed packages
outside source checkouts. Public scenarios remain independently synthetic.

## Task 5: Verification and review

Real FFmpeg: parallel branches, wait/restart, partial completion recovery, safe
retry, cancellation, denied/revoked grants, stale/rejected candidates and second
run with changed inputs/settings but unchanged code. Verify decoded media facts,
playback/seeking, keyboard, light/dark and narrow UI. Capture timings, overlap,
attempts, bytes and memory with honest limits. Run both canonical check:ci gates,
public UI/dependency guards and opt-in real Temporal tests. Independent code review
and targeted corrections. Update ADR, API reference and indexed evidence together.

## Progress

- Initial checkouts: public working tree clean; existing private state is preserved.
- Preflight: Tasks 1/2 share Registry and handlers; portable definitions stay free
  of Temporal APIs. Tasks 2/3 share scoped service lifecycle and persistent run
  ownership. Tasks 3/4 share package metadata and MCP Apps, no browser extension.
- Ruling: user explicitly requested existing checkouts and uncommitted changes;
  this overrides skill defaults to create worktrees or commit intermediate work.
- Task 1: implemented and reviewed. Focused tests/build/type results are in
  [the task report](0021-task1-report.md). Review found an outdated authoritative
  plugin-package reference, now updated with candidate fields and integration
  status. The packaged-Zod regression is explicitly included in Task 2.
- Task 2: implemented; real Temporal conformance, whole-host recovery, installed
  unrelated package and compiled/Tauri resource checks passed. See Task 2 report.
- Task 3: implemented; host wiring, grants, update protection, shared presentation
  and controlled browser checks passed. See Task 3 report and indexed evidence.
- Task 4: implemented; installed private consumer renders, reviews and assembles
  draft masters. Source/configuration binding, retries, recovery and direct UI
  controls verified. The approved MCP policy opt-out now permits actual concurrent
  FFmpeg execution; the installed consumer measured three child processes at once.
- Task 5: both canonical gates passed (public 651 tests; private 129 tests).
  Real Temporal six-test gate and installed browser workflow passed. Refreshed
  screenshots were inspected after the narrow button-wrapping correction.
  The maintainer subsequently accepted the delivery and authorised commits.
- Maintainer approved explicit per-server elicitation opt-out for parallel calls.
  Default connections retain the consent queue; no parent-request metadata was
  invented. Saved settings apply after restart and reconnection uses the startup
  policy. Runtime/desktop tests and an independent review cover this amendment.
