# Host OpenTelemetry composition

This package is the single OpenTelemetry owner for a Drawloom host process:
it wires up tracing, logging and metrics behind one composition point, so
libraries never have to initialize their own SDK. Read this if you are
starting up a host, adding instrumentation, or reviewing what observability
data actually leaves the process.

This is an opt-in experiment under Accepted
[ADR 0019](../../../docs/adr/0019-useful-observability.md). Export is opt-in:
nothing leaves the process unless a host chooses it.

## One owner per process

The composition root calls `initializeObservability` once, owns `flush`
and `shutdown`, and instruments through upstream OpenTelemetry APIs.
Libraries instrument against those APIs but never initialize this SDK
themselves — that keeps a single place responsible for what gets exported
and where. Do not combine this owner with another SDK owner in the same
process. Bun and Node verification run in isolated processes, since the
SDK is process-global state.

## Modes

- **`disabled`** initializes no providers and exports nothing.
- **`recording`** uses SDK batching with discard exporters by default;
  supply standard in-memory exporters when a bounded test run needs to
  inspect what was recorded. Their retained storage is owned by the
  caller, not this package.
- **`export`** requires an explicit loopback HTTP base endpoint, uses OTLP
  JSON HTTP for traces, logs and metrics, and rejects custom exporters —
  export is deliberately narrow rather than a general-purpose exporter
  host.

No resource detection, console capture, or SDK diagnostic logger is
installed in any mode.

## What can leave the process

Trusted startup may extend the span vocabulary through `safeSpanNames`;
these values must never come from user content, since anything in the
vocabulary can appear in exported data. Exported operation and event
names, attributes, resources and scope metadata are all filtered.
Exception messages, arbitrary bodies, credentials and paths are excluded
outright. Correlation IDs are accepted only as UUIDs or 16–64 character
hexadecimal strings — anything else is dropped rather than passed through.
Metric dimensions are filtered before aggregation, with SDK cardinality
capped at 128; no custom metric labels or attribute-name extensions are
exposed in this slice.

Known `drawloom.desktop` and `drawloom.mcp` instrumentation scopes stay
visible as themselves; any other scope normalizes to `drawloom`. This lets
private components use their trusted service identity and approved
operation names without exporting free-text scope names of their own.

## Diagnostics

SDK queues own batching and overflow. `diagnostics()` counts ended sampled
spans, emitted logs, observed failed exports and elapsed deadlines.
`droppedRecords` is the cumulative queue-full loss count as of the last
metric collection, and `null` before the first collection. It reads the
SDK's experimental `selfObsMeterProvider` and the structured
`otel.sdk.processor.span.processed` / `otel.sdk.processor.log.processed`
counters — never private fields or diagnostic-text parsing, so it keeps
working if the SDK's internals change shape. These same standard metrics
are exported with the bounded `error.type=queue_full` label.

Failed exports and queue-full drops are different counts, and
unacknowledged remote delivery cannot be determined from either — an
export can succeed locally without a receiving collector having durably
stored it. The outer deadline bounds how long a call waits; it cannot
cancel arbitrary custom exporter work already in flight. Shutdown disables
the installed globals.

## Testing

Run `bun test packages/observability/otel-host/otel.test.ts` for isolated
Bun and Node checks covering concurrent context/log correlation, filtering,
metric aggregation, outage deadlines and real loopback OTLP HTTP export.
