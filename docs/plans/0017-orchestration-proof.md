# ADR 0017 orchestration interface proof

Status: implementation and verification complete (2026-09-10). Implements the
maintainer-approved plan. The maintainer accepted ADR 0017 on 2026-09-10 after
interface and evidence review. The authoritative outcomes and limits
are in [the evidence record](../../knowledge/evidence/adr-0017-orchestration.md),
not this completed execution plan.

## Binding scope

All implementation is retained non-production code under
`spikes/adr-0017-orchestration/`. No supported package, desktop, private repository,
live model, paid generation, deployment or publication changes. Root catalog and
lock may add pinned Temporal development dependencies. Existing checkout.

Plugins author ordinary typed TypeScript without Temporal or host imports.
Runs outlive initiating agent turns and clients. Retries are opt-in per step.
Workflows create/manage only their own conversations. Existing agent contracts,
tool grants, approval resolution and evidence remain authoritative.

## Task 1: Contract and ADR

Define schema-backed identity/version/input/output workflow and task definitions.
Separate replay-safe coordination from host task implementations. Context supports
named stable steps, child workflows, typed external input, durable sleep and owned
agent conversations. Management supports idempotent start, inspect, paginated list,
await, answer and cancellation. Distinguish cancellation request, terminal engine
outcome and unresolved external effects. No reset/time travel/whole-run retry.
Document reference mappings, ownership and exclusions in Proposed ADR and design.

## Task 2: Deterministic conformance and agent bridge

Write failing behavior tests then a minimal in-memory test provider. Run the same
typed synthetic workflows against the test provider and subsequent Temporal
adapter. Prove fan-out/join, typed boundaries, stable start/input/step identities,
explicit retry limits, cancellation ownership, failure cancellation of unfinished
siblings and preservation of completed results. Caller wait cancellation is local.

Use existing AgentDriver for owned sessions and operations: sequential followups,
inspect, await, optional steering/interruption, native approval/input resolution.
Persist bridge receipts through existing storage semantics; reconcile known
results and surface uncertain submissions without repeating effects. Scripted
Codex transport fixtures cover lost responses/approvals, not live model evidence.

## Task 3: Local Temporal proof

Use existing CLI in dedicated loopback service and temporary persistent database;
Node worker with compatible pinned SDK, Bun repository tooling. No global upgrade.
Adapter uses native tasks/children/timers/messages, overrides retries to one
attempt unless opted in, and never retries denied/invalid/ambiguous agent writes.
No Temporal types in public candidate contracts or fixture workflow definitions.
Temporal and memory provider run unchanged workflow definitions/conformance.

Principal proof: parent spine; two overlapping child branches with synthetic agent
work; one safe task deliberately fails then retries; join; wait for explicit typed
human input; followup in existing owned conversation; typed final result. Restart
worker/service against same database while waiting; settled tasks must not rerun.
Second unrelated synthetic workflow requires no adapter modifications.

## Task 4: Evidence and review

Record timings, attempt counts, versions, restart points, dependency footprint and
actual outcomes under knowledge/evidence with index links. Cover invalid/stale/
cross-run input, conflicting repeated start, unsupported steering, absent grants,
concurrent agent submissions, cancelled waits, branch failure and cancellation.
Run frozen install, canonical check:ci and import guards; service-dependent tests
are opt-in. Review contract and implementation. Keep ADR Proposed and changes
uncommitted. Stop for maintainer decision if Temporal types leak into plugin code,
new workflow language or changed authority/plugin boundaries are required.
