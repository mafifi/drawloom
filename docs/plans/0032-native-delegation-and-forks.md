# Native delegation and forks: delivery record

Status: implemented and verified within the evidence matrix below, 2026-09-20.
Authorised by the maintainer on 2026-09-20. ADR remains Proposed; changes uncommitted.
Decision: [ADR 0032](../adr/0032-native-delegation-and-conversation-forks.md).

## Outcome and constraints

Expose parent-mediated delegation, native child observation and supported controls,
and independent same-project conversation forks. Preserve native semantics,
source-bound resources, current grants and the single installation at 4488.
No second scheduler, child transcript store, teams, worktrees or active goal
inheritance. No automatic commits, ADR acceptance or publication.

## Delivery slices

1. Contract schemas, capability interfaces and failing conformance examples.
2. Codex child discovery, lifecycle routing, operation admission and approvals.
3. Independent fork receipts, explicit configuration and registration recovery.
4. Existing Actions registry and shared inline child presentation.
5. Synthetic, native, restart, rendered and private consumer verification.

## Evidence and limits

Source inspection used installed Codex 0.153.4 and its experimental generated
schema, plus the matching upstream tag:

- [App Server](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/README.md)
- [Thread lifecycle](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/app-server/src/request_processors/thread_processor.rs)
- [Native spawning](https://github.com/openai/codex/blob/rust-v0.153.4/codex-rs/core/src/agent/control/spawn.rs)
- [Harness comparison](../reference/harness-workbench-survey/README.md)

Parent-owned children cannot be treated as independent direct-input sessions.
Native fork configuration is resolved separately from history copying. Goal
inheritance is an explicit native option, not a required property of a fork.
Drawloom denies unbound tool origins. The adapter admits descendant events only
after validating native ancestry and exact execution identity.

The existing installation at 4488 has been updated in place. Its data directory,
project bindings and approved workbench viewer were preserved.

### Implementation progress

- Optional delegation and fork contracts, validated child snapshots and session
  notifications are present. Shared discovery and fork-receipt conformance runs
  against deterministic fixtures and Codex's scripted transport. Provider lifecycle
  and host ownership have separate regression coverage.
- The adapter verifies descendant ancestry and the current native turn before
  child admission. Parent and child requests share one native interaction decoder.
  Unadmitted or stale native approval/input requests are explicitly refused rather
  than borrowing authority. Nested children have independent execution ownership.
  Native MCP outputs use the existing resource capture callback with exact child
  operation attribution; duplicate result events are captured once.
- Native fork receipts prevent resubmission after ambiguous responses and repair
  confirmed native identity registration. Desktop registration copies retained
  history identities and resource references into the same fixed project; partial
  registration is recoverable without another native fork. Actions prepare an
  editable delegation request or show the shared-files fork confirmation.
- Host admission and operation ownership helpers exist. Approval retirement and
  partial history settlement are scoped to the actual execution. Host child
  admission retains correlation receipts and verifies the project on recovery.
  Inline presentation treats saved child snapshots as observations, not authority.
  Restart discovery admits already-running, validated descendants through the
  same host path exactly once. It does not resume or reconfigure children. Unloaded
  children retain unknown controls.

### Disposable native evidence, 2026-09-20

`scripts/native-delegation-live.ts` exercises only a synthetic read-only MCP tool
in a new temporary project. The first run proved child admission and one tool
execution, but its approval assertion failed because the fixture used the normal
read-only auto-approve policy. This was a test configuration error, not evidence
of approval routing. Its exact parent task was archived.

The corrected fixture explicitly requests native review for that synthetic tool.
Its run passed: one child, a child-owned human approval, one gateway invocation,
child completion and parent completion were observed. The owning connection was
closed and the exact disposable parent task was archived using the existing
cleanup procedure. No user task or installed settings were changed.

Raw receipts and synthetic event evidence remain local at
`/private/var/folders/9r/mrvfc4ss3lb8n9r2kwm5y3bc0000gn/T/drawloom-native-delegation-y7tWOo/`.
The earlier fixture failure is retained in the sibling directory ending `QDsgno`.
The interruption scenario's first run (`gzrNaQ`) confirmed child interruption and
zero gateway execution, but timed out waiting for the parent to finish on its own.
Child interruption does not imply parent termination. The corrected fixture
explicitly stops its disposable parent after observing the child outcome.

The corrected run (`ofvD8T`) passed child interruption, parent reconnect, descendant
discovery, native fork creation, receipt reread and fork reopen. The fork retained
the source history identities, had no goal and issued no automatic first turn.
Both exact parent and fork identities were archived. These are adapter-level live
proofs, not installed UI, active-child restart or revoked-grant acceptance. Raw
receipts remain beside the earlier run directories. Later changes still require
final verification.

After review fixes, `VsqcyU` passed the interruption/reconnect/fork scenario again
with zero gateway executions and both disposable identities archived. The public
review-fix suite passed 61 tests. A read-only review found two pre-dispatch recovery
defects (fork rejection and interruption preparation); both have failing-then-passing
regressions. A third regression covers reconnect admission of already-running
children; shutdown during admission releases ownership without exposing tools.

The public browser suite passed draft-preserving follow-up, keyboard `/fork`,
shared-files confirmation/cancellation and plus-menu delegation in light/dark and
narrow layouts, alongside the existing scroll/zoom checks. These use intercepted
synthetic snapshots/commands, not evidence of provider execution. Private consumer
checks passed 262 tests with two explicit opt-in model/provider lanes skipped;
the final rebuilt snapshot is checked again after the installed recovery fix below.

### Installed verification and writer ownership

The installed Actions menu exposes delegation and forks, and keyboard `/fork`
opens the shared-files confirmation. A disposable native parent produced one
child result, `SYNTHETIC_CHILD_OK`, displayed through the existing inline process
composition with parent-directed follow-up and no ordinary child chat controls.
No project files, media or grants were changed by this verification.

This acceptance found a defect not exercised by the earlier adapter fixture:
`thread/fork` leaves the fork loaded in its submitting App Server. Opening it from
another session failed with an active-writer rejection while the source connection
remained open. Fork submission now uses a short-lived native connection and
releases its writer before returning the confirmed fork. The parent and its
children are not closed. A regression failed before the fix and passed afterward;
the live script now keeps the parent open while opening the independent fork.

The confirmed earlier fork recovered after restart without another submission.
A separate explicit fork then opened successfully through the installed host
while its source remained connected. It retained completed history and project
binding, had no goal or automatic first turn, and answered the explicit test
message with `FORK_INTERACTIVE_OK`. The browser showed the retained source result
and the independent response in the correct order.

The three disposable local conversations were archived, the original conversation
was selected again, and owning connections were closed before native cleanup.
`scripts/codex-thread-cleanup.ts` confirmed archive of precisely these native IDs:

- `01a0bd16-8ad9-73c0-8282-2e4a013059b6`
- `01a0bd17-c1de-7131-8a19-5322c467622f`
- `01a0bd1c-982e-7fe0-a45b-726ccf25fda4`

The cleanup receipt is `/tmp/drawloom-delegation-installed-cleanup.log`. No user
conversation was archived. A further adapter-level interruption/reconnect/fork
run (`WW99Vi`) also passed and archived its exact parent and fork. Active-child
restart and revoked-grant paths have scripted coverage, not live native proof.

### Gate scope

The final canonical public run passed 1,610 Bun tests with eight explicit skips,
Node checks and packed replacement/application checks (exit 0). The rebuilt
private-consumer gate passed 262 tests with two explicit skips, and a subsequent
frozen install passed. The final browser matrix and 56 focused delegation/fork
tests passed. Documentation, formatting and diff-whitespace checks passed.
One intervening run failed
because public packaging and private artifact preparation concurrently wrote the
same Svelte build directory; the gate was rerun without concurrent preparation.
This failure is not counted as a passing verification.

Local logs: `/tmp/drawloom-delegation-final-verified-gate.log`,
`/tmp/drawloom-delegation-writer-private-gate.log`,
`/tmp/drawloom-delegation-final-rendered.log`, and
`/tmp/drawloom-delegation-final-targeted.log`. These logs contain synthetic check
results; installed episode content is not copied into public fixtures or evidence.

The eight canonical opt-in skips are four live native approval-policy scenarios,
the OS credential round trip, real Temporal knowledge recovery, and two mounted
evaluation-view scenarios. The separate native delegation tests are not a claim
that these skipped lanes ran. Private checks retain two opt-in skips: real model
installation and reviewed motion rendering. Neither generation nor model setup
is required for this slice.

## Verification checklist

### Interaction brief

Delegation is parent-agent initiated, not an action in `/` or `+`, following
maintainer review. Ordinary requests may ask the parent to delegate. Child
follow-up uses **Assisted input**, preserving the existing draft and preparing
editable parent-directed text without sending. Fork remains in both menus.

Child inspection uses **Contextual navigation** inside the existing process
composition. Labels and native status remain visible; results/details disclose
through shared controls. Failures, uncertainty and waiting approvals remain
discoverable even if completed process details are collapsed. Follow-up prepares
a parent draft. Interruption uses **Outcome notice**: only its button is pending,
and acknowledgement is not termination. Retained snapshots cannot enable controls
without a current connection and an exact current native reference.

Fork uses **Guarded commitment** for shared-file consequences: the action explains
that project files are shared and no worktree is created. It is unavailable during
source execution. A confirmed fork navigates once; failure preserves the source
and draft. Unknown submissions keep their receipt and do not offer blind retry.

Application/ViewModels own availability, requests, pending/error states and
drafts. Views use shared shadcn controls, existing scroll fade and process layout;
no new animation or layout scale. Keyboard, touch and assistive paths use the same
commands. Reduced motion changes no meaning. Verify narrow/docked layout, 200%
zoom, rapid activation, reconnect, stale actions, interruption and focus return.

### Acceptance checklist

- [x] Shared conformance: deterministic and scripted Codex, unsupported cases.
- [x] Child lineage, concurrent operations and lifecycle after parent completion.
- [x] Allowed, denied, revoked and unknown-origin tools; exact approval ownership.
- [x] Restart, stale controls, interruption and ambiguous response recovery (live
  reconnect plus scripted active-child restart; not a live active-child restart claim).
- [x] Fork boundaries, configuration, receipts and partial local registration.
- [x] Live/history parity and source-bound resources.
- [x] Actions and inline presentation: themes, narrow/docked, zoom and keyboard.
- [x] Disposable native run and exact-identity cleanup.
- [x] Public canonical and private built-consumer checks (explicit opt-in skips above).
- [x] Existing 4488 installation and approved viewer acceptance.
