# `@drawloom/evaluation-orchestration`

Portable orchestration consumer for `@drawloom/evaluation`. It exports one
workflow Registry and a startup-only composer that returns an evaluation service
and the matching generic task handlers. The host merges the Registry into its
existing workflow entrypoint and attaches those handlers to its existing
dispatcher. There is no second scheduler.

Workflow bodies carry bounded run, case and checkpoint references. Handlers load
the selected definition header and case from the scope-bound store. Target and
each scorer invocation write an immutable checkpoint before acknowledgement;
recovery reads checkpoints and never submits effects. Target/scorer steps have no
automatic effect retry. A scorer exception becomes its own generic error finding,
as do scorer responses that cannot fit the durable checkpoint contract, so sibling
scores remain durable. Explicit unknown outcomes dominate cancellation requests
and aggregate trial uncertainty is independent of scorer order. Plan/finalize
retries are bounded and limited to storage-derived work.

Starts default to one repetition and two concurrently executing cases. The whole
workflow is capped at 1,000 registered task steps, and the serialized plan is
capped at 900 KiB to leave envelope headroom beneath the 1 MiB dispatch bridge.
Stable bounded identities come from the required host identity source; no provider
run-ID format is inferred. Unavailable orchestration disables starts/status/cancel
operations but not saved reads or feedback.
Immediately before provider start, the service persists a write-once attempt.
Until a binding is established, a lost start therefore remains uncertain through
status and cancellation. Finalization uses bounded result summaries for recovery;
oversized aggregate detail stays discoverable without discarding checkpoints.

The `./workflows` export is the reusable workflow-module entrypoint. Real Temporal
coverage is opt-in and remains a provider integration check; this package depends
only on the portable orchestration contract.
