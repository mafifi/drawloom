# Supported evaluation implementation

Status: completed and accepted by the maintainer on 2026-09-13; commit authorized.
Implementation used the existing checkouts. Specification: the maintainer-approved
plan and ADR 0025. Results and limitations are recorded in the
[supported implementation evidence](../../knowledge/evidence/adr-0025-supported-evaluation.md).

## Goal and global constraints

Promote demonstrated evaluation interfaces and integrate supported local evaluation
into Drawloom and the installed private video workbench. Evaluation owns cases,
criteria, findings, comparisons and feedback. Orchestration owns durable scheduling,
progress, cancellation and recovery. Braintrust/Autoevals assess individual steps,
not a second experiment loop. Plugins own domain meaning and media preparation.
Existing agent/tool grants, native review and execution evidence remain authoritative.

Public code stays in drawloom. Proprietary code/data stays in drawloom-workbenches.
No supported code imports spikes. No commits, publication, production ingestion,
downloads, paid media generation or automatic model switching. Use existing pinned
dependencies. No new browser protocol or privileged browser objects. Stop for a
maintainer decision on broader authority or capability-boundary departures.

Adopt interfaces and implementation choices in ADR 0025; delivery status remains
separate. Live model evidence must be distinguished from scripted tests, bounded,
and exact-owned disposable Codex sessions must self-archive after settlement.

## Task 1: Portable contracts and durable local results

Create `packages/evaluation/evaluation` (portable contract/conformance) and
`packages/evaluation/sqlite-evaluation` (Bun provider). Promote demonstrated case,
target, scorer, result, feedback responsibilities; do not import the spike.
Add the minimum versioned definition, management, scoped storage and optional
per-invocation usage contracts needed by subsequent tasks. Contracts must be
declared before implementation, validate unknown input, and remain provider-neutral.

Storage: SQLite authoritative evaluation.sqlite beneath selected data directory;
transactions, WAL, schema version and restrictive permissions. Scoped by fixed
installation/project identity, with stable request/run/case/trial/scorer identities.
Duplicate delivery is harmless; conflicting identity reuse fails. Store case
inputs/selected output, results, findings, references and advisory feedback separately
from orchestration scheduling. Keep durable per-step output available before ack.
Use indexed keyset reads (default50/max200), bounded records, no full-history slicing.
Preserve result/source immutability; feedback is separate and never accepts work.
Reject unsupported newer databases without changes. No migration of spike data.

Write failing shared conformance and run against real SQLite plus a deterministic
test implementation. Test scope isolation, restart, duplicate/conflicting writes,
pagination concurrent arrivals, partial findings, feedback, unknown usage, storage
failure preservation and newer schema refusal. Add package docs/metadata. Report
public symbols and all integration assumptions for Task 2.

## Task 2: Durable evaluation and individual assessment

Implement a portable orchestration consumer with registered evaluation workflow/task
definitions and handlers. Use installed workflow registration; one scheduler only.
Target and each scorer are distinct stable durable steps per case/repetition.
Defaults: one repetition, two concurrent cases. Finite task limits; retries explicit
and recovery-only when existing receipts establish safety. A scoring failure is a
finding, not terminal sibling cancellation. Preserve partial findings/results.
Never replay an ambiguous tool/model submission. Existing bundle/update protections
apply. View closure does not cancel; host shutdown/restart follows orchestration.

Promote the Braintrust local assessment provider and library scorers, validated in
the actual host runtime; vendor SDK types stay private. Use existing agent contract
for optional Codex judging, adding optional normalized target/scorer usage reporting
where required. Preserve current controls; no replacement agent/reviewer. Costs
unknown stay unknown; cached tokens aren't added twice. Bound requests and archival.
Tests cover target-free assessments, expected-answer isolation, scorer failure,
cancel/restart/recovery, attempts and duplicate delivery with real local orchestration
separately from portable tests. Carry actual interfaces forward to Task 3.

## Task 3: Host and installed UI

Expose optional scoped evaluation through existing trusted backend extension;
discovery does not grant execution. Missing orchestration disables starts only.
Host selects providers, readiness and storage. Register versioned handlers through
existing integration rather than arbitrary code from browser requests.
Promote findings/feedback presentation through shared UI and existing MCP Apps.
Run/case pages, baselines, per-step usage, cancellation and uncertainty; no whole
experiment transfer per poll. Preserve neutral themes, MVVM and project binding.
Write integration/DOM tests and use microinteraction/MVVM skills before UI edits.

## Task 4: Installed consumers and delivery

Private: selected master inspection, fresh codec/decoded facts, comparison/advisory
feedback with zero regeneration or acceptance. Reuse private plugin operations and
existing permitted media, preserving originals. Verify cancellation closes children
and measure child resources. Public: frozen knowledge consumer through supported
capability, preserving historical/current/heuristic provenance. No new answers unless
needed for explicitly bounded Codex judgement integration evidence.

Both consumers must work from built installed packages outside their checkouts.
Verify cross-scope denial, grants/native denial, restart after target/scorer completion,
uncertain effect reconciliation, feedback/pagination, UI light/dark/narrow and cleanup.
Run both canonical gates, dependency/UI guards and opt-in real orchestration checks.
Sol/Terra implementation; focused Astra contract/security and final integration review.
Record limitations, timings, actual versus scripted outcomes. Leave uncommitted.
