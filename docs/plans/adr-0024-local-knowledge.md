# ADR 0024 implementation

Status: closed by maintainer acceptance on 2026-09-12. The subsequent
[MLX completion](adr-0024-mlx-pivot.md) and cohesive commit were explicitly requested.
This plan retains the original delivery and verification history. Accepted
[ADR 0024](../adr/0024-local-knowledge-memory-and-retrieval.md) owns the decision;
its [evidence record](../../knowledge/evidence/adr-0024-local-knowledge.md) retains
deferred checks and evaluation limits. Closure does not mark unperformed checks
as passed.

## Global constraints

- Knowledge and memory cross projects; project context and transcripts do not.
- SQLite owns knowledge; OKF is an authorized export. Indexes are rebuildable.
- Core enforces authorization using trusted identity, not enterprise assignments.
- Local embeddings only; model downloads require explicit consent.
- Codex assessment is replaceable and explicitly model-configured. Never silently
  select Astra or retry an uncertain submission.
- Temporal maintenance has an explicit host scope, not a fabricated project.
- Standard Git MCP package owns collection. No repository code execution.
- Public tests and evidence contain no private or production material.
- Existing history, assets, project data, grants and MCP Apps remain authoritative.
- Original delivery instruction: leave code uncommitted and ADR Proposed. The
  maintainer subsequently accepted the ADR and requested a cohesive commit after
  the MLX pivot and recovery fix. Continue to report real and simulated evidence apart.

## Ordered slices and owners

1. Portable intake, retrieval, evidence, maintenance, assessment and embedding
   contracts; failing shared conformance. Terra implements; Astra reviews.
2. SQLite persistence and authorization-aware retrieval; deterministic contrasting
   provider. Terra implements with Sol integration.
3. Local embedding worker and revision-bound hybrid indexes; setup and cancellation.
   Terra implements; root verifies runtime/model evidence.
4. Replaceable Codex assessment, bounded Nightloom and host-scoped Temporal recovery.
   Sol integrates; Astra reviews authority and failure behavior.
5. Existing host tools, observations, installed Git source and shared-shell UI.
   Sol integrates; Terra owns bounded source/UI tasks when contracts are stable.
6. End-to-end evaluation, local/live evidence, canonical gates and final Astra review.

## Verification

Each slice starts with failing behavioral tests and ends with focused verification
and independent review. Shared conformance runs against both implementations, not
just isolated unit tests. Required scenarios include duplicate intake, source
change/withdraw/delete, full paginated evidence, stale publication, denied derived
disclosure, restart/uncertainty, budget exhaustion and cross-project use.

Use fixed public held-out questions to compare lexical and hybrid retrieval at
10,000 records and stress 100,000, with 30 warm queries and cold startup reported
separately. Measure evidence quality, answer/citation quality, index resources and
latency. Do not claim useful embeddings until real Qwen/Nomic evaluation earns it.

Canonical gate: `bun run check:ci`. Keep model, live Codex and Temporal checks
explicitly separate from service-free public conformance.

## Progress

- Baseline: clean working tree at 6890fac.
- Supported contract/provider packages, managed Node runtime, registered knowledge
  tools, Git package and existing-shell UI are implemented and under verification.
- Actual SQLite lexical scale runs, one live Codex assessment with saved-request
  recovery, a targeted real Temporal restart check and desktop search/evidence
  observations are recorded in the linked evidence. These are not acceptance.
- Multi-update Nightloom batching, owner-bound lease release and bounded evidence
  traversal are implemented. The canonical `bun run check:ci` gate passed,
  including the separately executed Node knowledge checks and shared conformance.
- Explicit model download consent was received; both pinned models passed setup
  verification and real local inference. Sequential 10k hybrid and 72 paired live
  answer cases are complete. Both models passed the 10k latency target; Nomic
  used fewer resources. Actual answers showed one identifier-coverage benefit,
  not a clear gain across semantic questions. The value gate remains unmet.
- Fresh public gate: 829 Bun passes, five explicit opt-in skips; Node conformance
  passed. Twenty evaluation tests, UI policy, packaged-host startup and Rust
  check/two tests passed. Retrieval review corrections are covered by regressions.
- The 100k semantic stress attempt was stopped for review after 100k intake and
  partial indexing. Do not claim a completed 100k hybrid benchmark. Browser OKF
  download and remaining live journey/failure scenarios are not yet verified.
- Workflow adjustment: maintainer's existing-checkout and no-commit directions
  override skill worktree/commit steps. Reviews inspect the uncommitted diff.
- Maintainer review: accept the existing implementation and retain hybrid search;
  assess broader value using stronger representative workloads as Drawloom
  develops. Earlier unmet gates and unperformed checks remain recorded above,
  with their disposition in the Accepted ADR rather than further synthetic sprints.
