# ADR 0017: Orchestration interfaces

- **Status:** Accepted
- **Date:** 2026-09-10
- **Decision owners:** Drawloom maintainers
- **Related:** ADRs 0005, 0007, 0008 and 0013–0016

## Context

Plugins need to coordinate work: a spine can fan out independent branches, join
results, wait for a person and continue an existing agent conversation. Making
each plugin build its own retry, run-management and agent-coordination machinery
would duplicate infrastructure. Making the public host understand a particular
video recipe would violate its public/private boundary.

ADR 0005 already assigns cross-capability coordination, durable run identity and
child-work lineage to orchestration. This decision focuses on that interface.
It does not choose a production backend. A local Temporal adapter is a retained
experiment to challenge the proposed interface, not a supported runtime.

## Decision

### Author TypeScript against Drawloom, not a workflow language

Trusted plugins register schema-backed, versioned workflow and task definitions
at explicit startup composition. Workflows are ordinary TypeScript functions;
they use conditionals, loops and Promise.all with a small Drawloom execution
context for tasks, child workflows, durable waits and owned agent conversations.
No Temporal imports belong in a plugin's workflow definition or candidate public
contract. No graph interpreter, dynamic code installation or UI language is added.

Coordination code must be replay-safe. Side effects and external state access run
through tasks or the agent/tool bridge, not direct filesystem/network calls in
coordination code. Payloads are schema-validated JSON values and managed references;
they are not media bytes, raw transcripts, hidden reasoning or credentials.
Type safety does not establish determinism or sandbox security.

### Manage runs separately from callers

Expose start, inspection, bounded listing, await, input response and cancellation.
Start is idempotent for the same caller request identity and input; conflicting
reuse rejects. Runs outlive the initiating turn and client connection. Aborting
a caller's wait does not cancel work.

Input requests have stable identities and typed responses. Duplicate identical
responses are harmless; stale, conflicting or cross-run responses reject.
Resuming means observing an existing run or answering its pending input, not
resetting failed execution. Report engine state separately from uncertainty about
external effects. Cancellation is a request, not rollback or proof of termination.

### Coordinate existing agent and tool capabilities

A workflow may create and revisit its own conversations, including sequential
follow-up turns. It may inspect/await their operations and request interruption
or supported steering. It cannot take over an unrelated user conversation or
submit concurrent turns to one owned conversation.

The existing agent contract owns native execution and approval/input resolution.
The provider keeps its native transcript and continuation state. Orchestration
does not add another agent loop or copy display history into model context.
The bridge retains only the receipts needed to identify and reconcile work.

Workflow initiation never grants additional tool access. Existing tool gateways,
native review and authoritative execution evidence remain independent. Business
acceptance stays plugin-owned. A workflow input wait is not an alternative native
reviewer or a grant to perform the next effect.

### Retry only explicit steps

Default to one attempt. Authors may request bounded retries per step, but the
handler remains responsible for deduplicating or reconciling its side effects.
Keep logical step identity distinct from actual attempt identity. Denial, invalid
input and ambiguous agent submission are not automatically retryable.

Completed results survive backend recovery without another dispatch. Interrupted
agent calls are reconciled when evidence permits; otherwise report uncertainty
without re-submitting. An uncaught terminal branch failure requests cancellation
of unfinished owned siblings, preserving completed results and unresolved effects.

## Principles and reference comparison

Apply [architecture principles](../../ARCHITECTURE.md#decision-principles),
particularly useful typing, replaceable boundaries, proportional efficiency,
proven boundaries, safe defaults and familiar user control. The video workbench
motivates the need; an unrelated synthetic workflow challenges product coupling.

- [Temporal TypeScript workflow basics](https://docs.temporal.io/develop/typescript/workflows/basics)
  establish ordinary functions, deterministic coordination and external activities.
  The candidate facade must be tested, not assumed to make all Temporal features
  portable. The local adapter overrides default activity retries.
- DeepSeek Harness at `b2e3b2a0125854567a4a5fcba75782e42fe84901` exposes a
  [workflow seam](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/packages/workflow/workflow/src/runtime-types.ts)
  for scripts, child agents, results and cancellation. Its
  [local jobs](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/packages/jobs/jobs-local/src/index.ts)
  are process-local, not a durable scheduler. Our approved differences are trusted
  registered TypeScript definitions, explicit schema-backed boundaries, independent
  workflow lifetime and a durable backend proof. Cordis and its client kernel are
  not adopted.
- Codex integration reuses Drawloom's accepted adapter and agent contracts. No
  claim is made that Codex itself offers the same portable workflow interface.

## Proof and acceptance

The [implementation plan](../plans/0017-orchestration-proof.md) governs a retained
spike under `spikes/adr-0017-orchestration/`. Candidate signatures and ownership
examples live in the [contract design](../design/orchestration-contract.md).
Actual outcomes live in the [proof record](../../knowledge/evidence/adr-0017-orchestration.md).
A shared conformance
suite must run against the minimal test provider and real local Temporal adapter,
using unchanged plugin workflows. Tests cover fan-out/join, typed input, safe
retry, idempotency, cancellation, agent continuity, failures and worker/service
restart. Scripted Codex transport evidence is not live-model evidence.

Accepted by the maintainer on 2026-09-10 after review of the interface and recorded
results. Acceptance establishes the demonstrated orchestration contract, not a
supported package, a production backend choice, live Codex recovery guarantees
or compatibility with another workflow engine. The retained implementation remains
non-production evidence. Its independent agent bridge survives the tested worker
and service restarts; bridge-process loss is not proved as transparent recovery.
Stop for a new decision if a Temporal type must enter plugin authoring, a new
workflow language is required, or accepted authority/plugin boundaries change.

## Consequences and exclusions

Plugins can share coordination infrastructure without sharing business policy.
The interface adds replay and lifecycle obligations which must be explicit to
authors. Passing a local development-server experiment establishes neither
production durability nor portability to another engine.

No supported orchestration package, desktop integration, private plugin changes,
media transport, live model calls, paid generation or cloud hosting is introduced.
Workflow upgrades, whole-run reset/retry, unrelated conversation attachment,
distributed agent coordination and cross-engine history migration are excluded.
Temporal remains an experiment; Cloudflare Workflows and Effect are not selected
or rejected as future implementations by this decision.
