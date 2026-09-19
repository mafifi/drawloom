# Native Plan mode delivery

Status: implementation and verification complete. ADR 0031 accepted by the
maintainer on 2026-09-19; local commit authorised.

## Approved outcome

Native Plan mode is selected through `/plan` or + Actions. The existing Plan
component remains the main proposal surface; Task supplies checklist details.
Agent checklists remain provider-owned, not a separately editable task database.
An explicit Implement plan action submits the exact latest completed proposal.
Active goals must be paused and execution settled before entering planning.

## Interaction brief

Recipe: explicit mode selection and consequential action confirmation. The
composer displays the selected next-turn mode; proposals retain their operation
and completion state. Partial or stale proposals cannot be implemented. Pending
actions use StatefulButton, errors remain alongside the action, and duplicate
clicks cannot repeat submission. Keyboard, touch and reduced-motion paths use
existing shared picker, Plan, Task and shadcn controls. Mode selection neither
grants permission nor guarantees a read-only sandbox. No new scheduler.

## Execution ledger

- Contract and native adapter: implemented; scripted mode/proposal tests and
  deterministic/supported/unsupported shared conformance passing.
- Proposal history and host safety: implemented; host end-to-end test, partial
  replacement, duplicate/stale reservation and accepted-dispatch/save-failure
  regressions passing.
- Shared Plan/Task and composer integration: implemented; ViewModel and projection
  regressions passing. Rendered browser matrix passing.
- Conformance and installed acceptance: passing. Final public canonical gate
  passed (1,548 passed, 8 skipped, no failures), including Node and packed-consumer
  checks. Private consumer gate passed (262 passed, 2 skipped, no failures).

Ruling: preserve the current dirty feature checkout and installation; use this
maintained ledger and external temporary test logs, not review diff artifacts.
The user's no-commit and no-new-install instructions override skill defaults.

Ruling: an implementation receipt remains reserved after any uncertain dispatch
or later failure. Do not automatically repeat it. This can require a fresh explicit
conversation request after a failure that happened before dispatch, but avoids
duplicate external effects. The receipt stores no second copy of the proposal.

## Verification

Failing tests precede each slice. Cover native mode mapping, unsupported modes,
proposal final replacement, pause/default-mode boundaries, stale/duplicate and
uncertain implementation requests, history reopening, shared UI accessibility,
and a disposable native planning-to-implementation run. Run public canonical and
affected private consumer checks; distinguish synthetic and live evidence.

Executed synthetic evidence includes supported/unsupported mode conformance,
adapter final-item replacement, native-history correlation, ViewModel commands,
latest-conversation checklist projection and retained proposal implementation.
An injected metadata-save failure reproduced loss of an already accepted native
operation. Its regression now verifies that operation ownership survives until
native completion; no submission is repeated.

The browser matrix passed light/dark desktop, narrow dark and 200% light layouts,
including mode selection, explicit implementation, overflow, reading position,
keyboard and reduced-motion coverage. It uses synthetic responses and performs
no writes to the user's conversations. The installed Actions menu and approved
episode viewer were separately inspected at the existing 4488 installation.

The opt-in `scripts/native-planning-live.ts` proof executed a disposable native
Plan turn, explicit default-mode implementation and reopen. Its exact created
session was archived after connection closure. This is live provider evidence,
not a second production-provider claim. Review confirmed the pinned protocol's
null developer-instructions semantics and same-identity history reconciliation.
No generated media, new installation, permissions changes or business acceptance
were involved.

### History-sync follow-up

The installed conversation exposed a native metadata validation bug: an interrupted
turn legitimately had null completion time and duration. The reader rejected those
fields and blocked the conversation's entire latest-history synchronization.
The pinned protocol explicitly permits null start/completion/duration fields.
Four failing regressions covered interrupted, failed, completed and running turns;
the reader now accepts unknown timing without inventing timestamps or outcomes.
All 48 targeted history/coordinator cases passed.

A private SQLite backup was retained before the installed recovery. Restarting the
same 4488 host cleared the warning through normal reconciliation, not manual status
editing. All 49 existing entries remained, with no changes to text, assets, origins,
selections or resource associations. Reopening retained the successful state and
the approved episode viewer. No conversation reset, synthesis or turn submission
was used to repair history. Final follow-up `bun run check:ci` passed: 1,552 tests
passed, 8 skipped, none failed; Node and packed-consumer checks also passed. The
skipped cases remain the explicitly listed lanes below, not history-fix failures.

Skipped public cases: four opt-in native approval cases, OS credential round trip,
real Temporal assessment recovery and two mounted evaluation-workbench cases.
Skipped private cases: real reviewed-video rendering and real-model setup adoption.
Those lanes were not claimed as fresh proof; the native planning run and browser
matrix above were executed separately.
