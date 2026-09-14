# Observe activity and diagnose problems

Observability helps you answer questions such as “where did this request spend
its time?” and “which step failed?” Drawloom uses OpenTelemetry for traces,
logs and metrics rather than defining another monitoring API.

A **trace** connects related operations; a **span** records one part of that
work. Metrics summarise activity across operations. None of these replaces
conversation history, tool evidence or permission checks.
[ADR 0019](../adr/0019-useful-observability.md) records the approach and its proof.

## Turn on diagnostics

Telemetry is optional and disabled by default. The desktop host sets up
`@drawloom/otel-host` before starting the application.

| Setting | What happens |
| --- | --- |
| `DRAWLOOM_TELEMETRY` unset or `disabled` | No telemetry SDK setup or export. |
| `DRAWLOOM_TELEMETRY=recording` | Process telemetry locally, discarding it by default rather than sending it over the network. Tests can supply exporters. |
| `DRAWLOOM_TELEMETRY=export` | Send telemetry to an explicitly configured local collector. |
| `DRAWLOOM_OTLP_ENDPOINT=http://127.0.0.1:14318` | Set the collector's base endpoint—not its dashboard URL. |
| `DRAWLOOM_TELEMETRY_SPANS` | Allow a comma-separated set of trusted, fixed plugin stage names at startup. |

For example, after building the desktop, this starts it with local processing
but no network export:

```sh
DRAWLOOM_TELEMETRY=recording bun run desktop:start
```

Use your chosen data directory as described in the
[desktop guide](../../apps/desktop/README.md). Recording mode is not itself a
trace viewer.

Do not put user-entered text in stage names. Unknown names become `operation`.
The service name is fixed, not a machine name or filesystem path. Only the
application setup initializes the global SDK; a second active setup is rejected.
Disabled mode installs no API globals.

The setup returns `flush()`, `shutdown()` and `diagnostics()`. Plugins do not
receive these as another capability. Diagnostics report recorded items, export
failures, flush deadlines and known queue losses. An unavailable count is
`null`, not zero.

Default queue size is 2,048, batch size 512, export timeout one second and the
outer flush/shutdown deadline two seconds. Metric label combinations are capped
at 128 after filtering. Export mode accepts only a loopback HTTP collector;
custom test exporters are allowed only in recording mode. Failed telemetry
delivery does not change the result of the work.

## Instrumentation conventions

Use standard OpenTelemetry `trace`, `logs` and `metrics` APIs.
Choose fixed names, finish spans in `finally`, and never include prompts,
arguments or result content in a name or attribute.

Record one attempt span per actual attempt. Instrumentation does not give
permission to retry an external action. Errors and timeouts have error status;
denial, cancellation and unknown outcomes are identified separately. Check the
operation's result: a successful transport response can contain a failed task.

The host instruments commands, discovery, package loading, resources, history,
agent submission and approval waits, and tool invocation and execution.
MCP calls record the method and an opaque installation ID. Metrics include
`operation.duration`, `operation.count`, `telemetry.dropped` and SDK counts
of processed or lost records. Do not use individual IDs as metric labels.

The desktop's `observed` helper is internal, not a new tracing interface for
reusable plugins. Plugin authors can use permitted stage names with standard
APIs, but must not start an exporter inside a loaded backend.

## Connect activity across requests

**Propagation** connects spans across requests so they can appear in the same
trace. The UI creates explicit request spans; it does not replace global
`fetch` or install an SDK inside an MCP App.

After authenticating a request, the host reads its W3C `traceparent` header.
It does not copy baggage, the optional extra metadata that tracing systems may
carry. The host preserves parent relationships while processing asynchronous
signals.

MCP request metadata carries `traceparent`, following
[SEP-414](https://modelcontextprotocol.io/seps/414-request-meta), without changing
tool arguments. The host controls outgoing trace context for App calls; an
iframe cannot choose another operation's parent. Servers without tracing still
work but contribute no child spans. Drawloom cannot see inside Codex.

### Browser relay limits

Browser traces are sent as OTLP JSON to `/api/telemetry/v1/traces`, using the
existing host cookie and exact-origin checks. The relay accepts only fixed UI
request spans, with these limits:

- 32 spans and 64 KiB per request.
- One-second input and export deadlines.
- Four concurrent exports and 120 requests per minute.

It strips extra metadata, accepts only fixed attributes and rejects invalid
spans or stale timestamps. It is not a general telemetry proxy. The browser
receives only an enabled flag, not collector credentials or a configurable
destination. Relay failure does not fail the observed command.

Export filters remove raw exception strings, content, arguments, results,
credentials, paths, unsafe links and arbitrary resource fields. This reduces
data collection; it is not a sandbox that can constrain trusted plugin code.

## Known limits

- The browser's `ui.request` span ends at response headers, not when rendering
  completes. Render readiness was measured separately in the retained proof.
- Browser items dropped before delivery are absent from the host's loss counts.
  Queue limits apply, but the host cannot prove every browser span arrived.
- The proof viewer's collector listens locally without authentication; its UI
  uses a generated login token. Do not expose either port to another machine.
- Native Rust tracing, capture across machine restarts, durable buffering,
  production retention, remote collector selection and provider-internal traces
  are not established by this implementation.
- Work must remain functional with telemetry disabled or its collector
  unavailable.

## Verification and evidence

Tests cover filtering, setup, export limits and concurrent operations.
The retained SDK/privacy measurements used Bun 1.2.23 and Node 24.20.0; those
versions describe the recorded tests, not a new compatibility run.

See the [proof launcher](../../spikes/adr-0019-observability/README.md) and
[measurement record](../../knowledge/evidence/adr-0019-observability.md) for the
test conditions. Dependency presence alone is not proof that instrumentation is
enabled or useful.
