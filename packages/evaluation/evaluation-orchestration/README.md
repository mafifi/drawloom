# `@drawloom/evaluation-orchestration`

The portable orchestration consumer for `@drawloom/evaluation`. Read this
before wiring evaluation runs into a host's workflow dispatcher, or before
changing how a run recovers after interruption.

It exports one workflow Registry and a startup-only composer that returns an
evaluation service and the matching generic task handlers. The host merges
the Registry into its existing workflow entrypoint and attaches those
handlers to its existing dispatcher—there is no second scheduler.

## How a run stays recoverable

Workflow bodies carry bounded run, case and checkpoint references rather than
the content itself. Handlers load the selected definition header and case
from the scope-bound store, and each target or scorer invocation writes an
immutable checkpoint before acknowledgement. Recovery reads those checkpoints
back; it never resubmits an effect. Target and scorer steps have no automatic
effect retry, so a scorer exception becomes its own generic error finding, as
do scorer responses that cannot fit the durable checkpoint contract—this
keeps sibling scores durable even when one scorer misbehaves. Explicit
unknown outcomes take priority over cancellation requests, and aggregate
trial uncertainty does not depend on scorer order. Plan and finalize retries
are bounded and limited to storage-derived work.

Immediately before the provider start, the service persists a write-once
attempt record. Until the matching binding is established, a lost start
therefore stays visibly uncertain through status and cancellation reads
rather than being reported as failed or successful. Finalization uses bounded
result summaries for recovery; an oversized aggregate detail view stays
discoverable without discarding the underlying checkpoints.

## Defaults and limits

Starts default to one repetition and two concurrently executing cases. A
whole workflow is capped at 1,000 registered task steps, and the serialized
plan is capped at 900 KiB to leave envelope headroom beneath the 1 MiB
dispatch bridge. Stable bounded identities come from the required host
identity source; no provider run-ID format is inferred. When orchestration is
unavailable, starting, checking status and cancelling are disabled, but saved
reads and feedback remain usable.

## Using it

The `./workflows` export is the reusable workflow-module entrypoint. Real
Temporal coverage is opt-in and remains a provider integration check; this
package itself depends only on the portable orchestration contract from
`@drawloom/orchestration`. See
[`@drawloom/evaluation`](../evaluation/README.md) for the definitions and
store contract this package schedules against.
