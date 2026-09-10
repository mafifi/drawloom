# Host OpenTelemetry composition

Opt-in experiment under [Proposed ADR 0019](../../../docs/adr/0019-useful-observability.md).
The composition root calls `initializeObservability` once, owns `flush` and
`shutdown`, and instruments through upstream OpenTelemetry APIs. Libraries do
not initialize this SDK. Bun and Node verification run in isolated processes.

`disabled` initializes no providers and exports nothing. `recording` uses SDK
batching with discard exporters by default; supply standard in-memory exporters
when a bounded test run needs inspection. Their retained storage is owned by the
caller. `export` requires an explicit loopback HTTP base endpoint, uses OTLP JSON
HTTP for traces/logs/metrics, and rejects custom exporters. No resource detection,
console capture or SDK diagnostic logger is installed.

Trusted startup may extend the span vocabulary through `safeSpanNames`; these
values must never come from user content. Exported operation/event names,
attributes, resources and scope metadata are filtered. Exception messages,
arbitrary bodies, credentials and paths are excluded. Correlation IDs accept
UUID or 16–64 hexadecimal forms only. Metric dimensions are filtered before
aggregation with SDK cardinality capped at 128. No custom metric labels or
attribute-name extensions are exposed in this slice.

SDK queues own batching and overflow. Diagnostics count ended sampled spans,
emitted logs, observed failed exports and elapsed deadlines. `droppedRecords`
is the cumulative queue-full loss count at the last metric collection (`null`
before collection). It uses the SDK's experimental `selfObsMeterProvider` and
structured `otel.sdk.processor.span.processed` / `otel.sdk.processor.log.processed`
counters, never private fields or diagnostic-text parsing. These standard metrics
are also exported with the bounded `error.type=queue_full` label. Failed exports
and queue-full drops are different counts; unacknowledged remote delivery cannot
be determined. The outer deadline bounds waiting; it cannot
cancel arbitrary custom exporter work. Shutdown disables the installed globals.
Do not combine this owner with another SDK owner in the same process.

Known `drawloom.desktop` and `drawloom.mcp` instrumentation scopes remain visible;
unrecognized scopes normalize to `drawloom`. Private components can use their
trusted service identity and approved operation names without exporting free-text
scope names.

Run `bun test packages/observability/otel-host/otel.test.ts` for isolated Bun and
Node checks covering concurrent context/log correlation, filtering, metric
aggregation, outage deadlines and real loopback OTLP HTTP export.
