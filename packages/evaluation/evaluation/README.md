# `@drawloom/evaluation`

Portable, provider-neutral evaluation definitions and durable-result contracts.
Evaluation records evidence; it does not schedule work, approve an effect, accept
content, or publish anything.

Definitions bind immutable versioned cases to optional target and scorer
descriptors. A scope-bound store persists immutable run bindings, target/scorer
checkpoints and terminal trial results. Scorer findings are stored individually;
advisory feedback is a separate append-only record against an exact result.
The run intent materializes bounded repetition/concurrency settings. A separate
write-once binding records the orchestration provider's run ID after start; it is
not orchestration engine state.
A write-once start-attempt record is saved immediately before the provider start
boundary so a lost response remains visibly uncertain through later status and
cancellation reads without inventing a provider run ID.
Trial identities are zero-based: a run with `repetitions: 1` permits only trial
`0`, and every durable point write rejects an index outside the saved run intent.

All content-bearing JSON is bounded. Media remains an authorized reference; this
contract does not transport bytes or grant access. Missing `usage` means unknown.
When present, cached input tokens are a subset of input tokens and must not be
added again when aggregating totals. Requested and actual model names are optional
provider observations on each invocation, separate from normalized usage.
`getResultSummary` and result pages expose bounded terminal metadata and an exact
finding count independently of the bounded aggregate detail view. If retained
checkpoints make that view too large, the summary remains readable and the detail
read fails explicitly rather than dropping evidence.

The shared conformance suite is exported from `@drawloom/evaluation/conformance`.
Portable `EvaluationTarget` and `EvaluationScorer` invocation boundaries carry
typed Zod input/output schemas and an abort signal. Expected material appears
only in scorer arguments, never target arguments. Trusted composition resolves
descriptor IDs/revisions to snapshotted implementations; definitions contain no code.

`EvaluationComposer` is a startup-only capability. Its single `compose` call
captures a scope-bound store/provider/orchestrator and returns an
`EvaluationService` plus the ordinary registered task handlers for the host's
existing workflow dispatcher. Starts can be unavailable while saved reads and
feedback remain usable. Host-owned assessment providers may expose a fixed scorer
catalog; selection by ID/revision grants no tool, agent, or acceptance authority.
