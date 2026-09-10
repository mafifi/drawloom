---
type: evidence
id: adr-0017-orchestration
title: Orchestration interface and local Temporal proof
status: active
created: 2026-09-10
updated: 2026-09-10
---

# ADR 0017 orchestration evidence

[Accepted decision](../../docs/adr/0017-orchestration-interfaces.md) and
[implementation plan](../../docs/plans/0017-orchestration-proof.md).
This record distinguishes deterministic tests, real local Temporal execution and
scripted agent transport. No live model, private workbench, paid media or cloud
execution is authorised by this proof. No production readiness claim is made.

## Environment inspected

On 2026-09-10 the installed Temporal CLI reported 1.3.0, bundled Server 1.27.1
and UI 2.36.0. Node reported 24.20.0, Bun 1.2.23. SDK 1.23.0 declares Node
>=20.3.0. Compatibility is established only by actual tests recorded below;
an installed binary or supported Node range is not a passing workflow proof.

## Current verification state

The deterministic and real local Temporal proofs below have passed. Independent
task reviews and whole-change review are complete, with findings fixed and
rechecked. The maintainer accepted ADR 0017 on 2026-09-10 after interface/evidence
review. Acceptance covers the demonstrated contract, not production readiness or
live-provider recovery; the limitations below remain applicable.

## Deterministic and scripted proof

`bun test spikes/adr-0017-orchestration` passed 20 tests, zero failures and 44
Bun expectations on 2026-09-10 (355 ms in the controller's verification run).
The shared conformance also uses Node assertions so it can run unchanged in the
Node-hosted Temporal proof. TypeScript checking passed without diagnostics.

The initial tests failed against unimplemented provider/bridge stubs. Additional
review regressions reproduced missing cancellation references and duplicate
session opening before fixes. Demonstrated behaviours include:

- Idempotent starts, conflicting input rejection, registered id/version lookup
  and rejection of unregistered task versions. Replacing a caller's function or
  schema does not replace the trusted registered implementation.
- One attempt by default; two attempts for the explicit fail-once task; no retry
  for denied, invalid or unknown outcomes. Attempts keep logical step identity.
- Fan-out/join, child cancellation and retained completed results; a typed input
  wait; sequential synthetic turns in one owned conversation.
- All eight typed agent helper operations reach the host dispatcher. Scripted
  Codex transport exercises native approval, input, steering and interruption;
  native approval does not supply a missing Drawloom tool grant.
- A lost Codex submission response becomes unknown. An identical repeated submit
  does not call the adapter again; a later completion signal reconciles it.
  This uses scripted transport, not a live Codex/model session.
- Cancellation while awaiting an agent, and cancellation after submit while
  waiting for human input, both preserve unresolved effect references and request
  cancellation of owned work. Connection close is not proof of stopped effects.
- JSON is checked after schema transformation too; an introduced Date rejects.
  Registered input transformation occurs once, not again during workflow dispatch.
- Both providers reject reuse of an input key with a different schema. Shared
  retry-boundary checks accept the candidate limit of 10 and reject 11. Final
  review caught these provider differences; the shared tests reproduced them
  before the implementations were aligned.

The first review found real omissions in registration, agent task dispatch and
cancellation uncertainty. Focused fixes and re-review cleared those findings.
These checks are in the public test suite and use no private fixtures or services.
Seven additional transport, pagination and child-cleanup checks also passed under
actual Node (210.39 ms), not just Bun's Node compatibility layer. They reject
fractional/nonfinite limits and malformed, lost or non-success bridge responses;
both SIGTERM- and SIGKILL-terminated children can be cleaned up without hanging.

The real transport regression initially made three synthetic writes after losing
a response with three attempts allowed. The fixed proof makes exactly one and
retains an unresolved step. Ambiguous transport errors are non-retryable unknown
outcomes, not a reason to try an approval, steering or submission again.

## Real local Temporal execution

`bun run spike:adr-0017` completed with exit 0 on 2026-09-10. The runner measured
13,479 ms, excluding the preceding public-package build and Node helper checks.
It uses the same
registered workflow definitions and shared conformance as the memory provider.
The unrelated catalogue workflow accepts a list of strings and produces a
normalised, deduplicated, sorted index; it needs no Temporal adapter changes.

| Observation | Actual result |
| --- | --- |
| Shared conformance | Passed against the real loopback service |
| Principal branches | Two child runs; synthetic operations overlapped by 120 ms |
| Logical child identities | Left/right identities unchanged after replay |
| Activity calls at the restart point | 40 across the proof, of which 12 belonged to this principal and its children |
| Activity calls after worker and service restarts | Still 40; no completed activity redispatched |
| Safe fail-once task | Left branch alone: two attempts; right branch and all other principal tasks once |
| Default, denied, invalid and unknown failures | One attempt each |
| Measured safe retry delay | 959 ms (20 ms requested initial interval; local server scheduling determines observed time) |
| Unrelated completed branch | Right branch's deterministic task finished 1,008 ms before the left retry, and was not repeated |
| Lost bridge response with three attempts allowed | One synthetic host write; non-retryable unknown with unresolved step retained |
| Follow-up | Two new activity calls; same owned parent conversation, final typed total 15 |
| Background submit → input wait → cancel | Terminal cancelled with one unresolved operation reference; completed create/submit receipts retained |

### Restart points and topology

Both branches completed before the principal waited at its named `confirm` input
request. The proof then:

1. Stopped and restarted the Node worker and re-read the same run/input request.
2. Stopped the worker and Temporal service, restarted the service against the
   same SQLite file, started the worker with unchanged code and attached a new
   client.
3. Confirmed the same child identities and input request, the unchanged count of
   40 activity calls, and rejection of cross-run/conflicting responses.
4. Answered the pending input and continued the existing parent conversation.

The independent synthetic-agent bridge remained alive during these restarts.
No owned conversation was reopened. This demonstrates workflow-engine recovery
with a surviving bridge, **not** bridge-process, whole-machine or live Codex
recovery. The development service and worker are separate owned child processes;
the runner stops both and closes its authenticated loopback bridge in `finally`.
It leaves only public synthetic logs, receipts, summary and database in its
temporary evidence directory, whose location is printed by the run.

### What is not established

- Restarts happen at a persisted input wait, not at every possible in-flight
  activity boundary. A stalled external activity is bounded by its configured
  heartbeat/timeout handling; its exact cancellation latency was not measured.
- The accepted agent contract has no general operation reattachment API. A lost
  bridge cannot reconstruct open sessions; saved receipts expose known results
  or unknown outcomes without blind resubmission.
- A cancellation request or connection close does not establish that an external
  effect stopped. Unresolved references remain visible separately from engine state.
- Running activity attempt counts remain zero until result/failure metadata
  reaches the workflow. Completed and ordinary failed counts are observed SDK
  counts; transport-timeout attempt detail is not established here.
- No second durable backend, workflow upgrade, cloud deployment, private plugin,
  paid call, live model or production readiness is demonstrated.

## Repository verification

`bun install --frozen-lockfile && bun run check:ci` completed with exit 0:
395 tests passed, four existing opt-in live approval tests skipped, zero failed;
1,914 Bun expectations across 59 files. Node shared conformance also passed.
Package builds/exports, desktop checks/build, dependency/import policy, design
checks and all three TypeScript configurations passed. The desktop build retained
its large-chunk warning; no UI or supported runtime code changed in this proof.

## Dependency footprint

The five Temporal SDK packages (`client`, `worker`, `workflow`, `activity`,
`common`) are pinned at 1.23.0 in the root Bun catalog and installed only as root
development dependencies. No supported Drawloom package depends on them. The
install added 86 packages on this checkout. Approximate installed directory sizes
were 162 MiB for `@temporalio`, 27 MiB for `@swc` and 11 MiB for `webpack`;
these are local directory measurements, not download sizes or a total incremental
dependency calculation.

Bun blocked SWC/protobufjs lifecycle scripts. No trust configuration was changed
and no blocked script was manually run. Native Temporal runtime loading, the
local server handshake and a SWC TypeScript transform worked on this Mac without
them. Other operating systems/architectures are not proven by those checks.

SDK 1.23.0's `schedule-client.d.ts` lines 29 and 100 fail TypeScript 5.9.3's
`exactOptionalPropertyTypes` check (TS2344). The opt-in adapter has a separate
TypeScript configuration with `skipLibCheck: true`; its source remains strict and
keeps `exactOptionalPropertyTypes`. Root and portable-contract checks retain
`skipLibCheck: false`. This is a scoped upstream declaration limitation, not a
claim that the SDK passes Drawloom's full declaration gate unchanged.

## References

- [Temporal workflow authoring and deterministic execution](https://docs.temporal.io/develop/typescript/workflows/basics)
- [Temporal message passing](https://docs.temporal.io/develop/typescript/workflows/message-passing)
- [DeepSeek workflow and jobs source comparison](../../docs/reference/harness-workbench-survey/deepseek.md)

The interface proof does not establish automatic idempotency of arbitrary external
effects, compatibility with another orchestration engine, or live Codex recovery.
