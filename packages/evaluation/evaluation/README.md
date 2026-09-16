# `@drawloom/evaluation`

The contract for assessing an agent's work. Read this before defining an
evaluation case, writing a target or scorer, or building something that starts,
reads or reports on a run.

Evaluation records evidence; it does not schedule work, approve an effect,
accept content or publish anything. A definition binds immutable versioned
cases to optional target and scorer descriptors. A scope-bound store then
persists immutable run bindings, target/scorer checkpoints and terminal trial
results, with scorer findings stored individually and advisory feedback kept
as a separate append-only record against an exact result.

## Runs and trials

A run's intent materialises bounded repetition and concurrency settings, and
trial identities are zero-based: a run with `repetitions: 1` permits only
trial `0`, and every durable point write rejects an index outside the saved
run intent.

Starting work with an orchestration provider is inherently uncertain—the
response can be lost even when the start succeeded. To keep that uncertainty
visible rather than hidden, the store saves a write-once start-attempt record
immediately before the provider start boundary, then a separate write-once
binding once the provider's run ID is confirmed. Later status and cancellation
reads can then tell a lost response from a run that never started, without
inventing a provider run ID.

## Content and usage

All content-bearing JSON is bounded. Media remains an authorised reference;
this contract does not transport bytes or grant access. Missing `usage` means
unknown, not zero. When present, cached input tokens are a subset of input
tokens and must not be added again when aggregating totals. Requested and
actual model names are optional provider observations on each invocation,
kept separate from normalised usage.

`getResultSummary` and result pages expose bounded terminal metadata and an
exact finding count independently of the bounded aggregate detail view. If
retained checkpoints would make that detail view too large, the summary stays
readable and the detail read fails explicitly rather than silently dropping
evidence.

## Targets, scorers and composition

The shared conformance suite is exported from `@drawloom/evaluation/conformance`,
for testing any implementation of this contract. Portable `EvaluationTarget`
and `EvaluationScorer` invocation boundaries carry typed Zod input/output
schemas and an abort signal. Expected material appears only in scorer
arguments, never target arguments, so a target cannot see the answer it is
being judged against. Trusted composition resolves descriptor IDs and
revisions to snapshotted implementations; definitions themselves contain no
code.

`EvaluationComposer` is a startup-only capability. Its single `compose` call
captures a scope-bound store, provider and orchestrator, and returns an
`EvaluationService` plus the ordinary registered task handlers for the host's
existing workflow dispatcher. Starts can be temporarily unavailable while
saved reads and feedback remain usable. A host-owned assessment provider may
expose a fixed scorer catalog; selecting from it by ID and revision grants no
tool, agent or acceptance authority.

See the [evaluation package layout](../../README.md) for how this contract
relates to its orchestration consumer and providers, and
[ADR 0025](../../../docs/adr/0025-evaluation-boundaries-and-comparative-proof.md)
for the boundaries it implements.
