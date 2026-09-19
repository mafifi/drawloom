# ADR 0031: Integrate native goals and structured plans

- **Status:** Accepted
- **Date:** 2026-09-19
- **Decision owners:** Drawloom maintainers

Accepted by the maintainer on 2026-09-19 after implementation review and
goal/Plan mode verification, including the first-message restart correction.

## Context

The desktop currently omits native goal controls and structured plan updates.
Codex 0.153.4 exposes goal read/set/clear requests and session notifications,
but native continuation does not fit the adapter's host-submitted-turn filter.
A second goal engine would duplicate the provider's authoritative state.

## Decision

Extend the agent contract with optional session-scoped goal controls and snapshots,
and operation-scoped complete plan snapshots. Provider identities remain private.
Codex owns goal persistence, accounting and continuation. Drawloom owns operation
identities, independent authorization, history and shared presentation.

Provider-initiated turns require explicit host admission before Drawloom tool
access. Admission establishes a new operation binding; it never reuses a completed
turn's authority. Native execution remains governed by native controls: admission
is not a claim that already-started provider effects can be prevented or undone.
No host continuation loop or competing goal tools are introduced.

Goal mutations are serialized and tied to the displayed snapshot. Ambiguous
responses require refresh, not automatic mutation retry. Pause stops native goal
pursuit; it is not rollback. Restart reads native state without implicitly resuming.
Native completion is not workbench acceptance. Unsupported providers remain explicit.

Plans are native ordered snapshots, retained through history and rendered with the
AI Elements Plan composition. GoalBar uses shared shadcn controls above the existing
composer. Accounting is provider-reported, not a fabricated local stopwatch.
Absent goals occupy no persistent composer space. Creation is an explicit action
in the existing + picker and slash actions menu; dismissing the objective editor
does not create a goal.

Native Plan mode is an optional agent capability selected through `/plan` or the
existing Actions menu. Selection does not submit a message. The adapter uses
Codex's `collaborationMode/list` presets and `turn/start.collaborationMode`, keeping
the chosen model and native built-in mode instructions. It explicitly enables
`tools.update_plan.enabled`; Plan mode is guidance, not a permission boundary.

Proposed-plan items and task-checklist snapshots are distinct. Native completed
plan text supersedes streamed deltas. The shared Plan component presents proposals;
AI Elements Task supplies subordinate checklist details. Implement plan reserves
the latest completed proposal in a history checkpoint and submits its retained
text as an explicit default-mode operation. Uncertain submissions are not retried.

Entering planning requires a non-active goal and settled execution. Selecting
default does not resume a goal: goal activation stays fenced after a native plan
submission until a default-mode submission is confirmed. No second scheduler,
editable task store or implicit goal activation is introduced.

## Alternatives considered

- **Considered and rejected:** a host-owned goal database and continuation engine,
  because Codex already owns these facts and execution semantics.
- **Source inspected:** DeepSeek Harness `c291e796` separates durable goals from
  process-local continuation activation and supplies a composer GoalBar. It owns
  its agent runtime; Drawloom does not adopt its runtime or scheduler.
- **Source inspected:** Open Design `933dc960` normalizes `turn/plan/updated` into
  task presentation. Drawloom retains validated structured snapshots instead of
  parsing prose or inventing stable provider step identities.
- **Considered and deferred:** independently managed subagents, alternative agent
  providers and a user-configurable budget UI.

## Evidence

The pinned binary's normal and experimental generated protocol schemas both expose
goal requests and plan notifications. Schema availability is not live integration
proof. Execution and verification are tracked in the
[delivery record](../plans/0031-native-goals-and-plans.md).
The [native Plan mode delivery record](../plans/0031-native-plan-mode.md) tracks
the subsequent mode and proposal integration. Source inspection of the pinned
protocol distinguishes `item/plan/delta` and completed `plan` items from
`turn/plan/updated` checklists. Open Design's Codex adapter at `933dc96038` explicitly
enables the native update-plan tool; DeepSeek's Plan-mode package at `c291e7961`
supplies a contrasting runtime-owned implementation, not one adopted by Drawloom.
The [harness survey](../reference/harness-workbench-survey/README.md) preserves the
broader reference boundaries. Executed native checks and their limitations are
recorded in the delivery records; source inspection alone is not execution proof.

## Consequences

Providers may expose goal control without implementing a second host goal store.
The host must account for native continuation without weakening tool authority or
losing approvals. Unknown execution remains unknown; it is never a retry instruction.
Existing conversation and workbench data remain intact. This decision extends the
integration described by ADR 0007; accepted historical text is not rewritten.
