# Operational observability

This is the implemented approach accepted in [ADR 0019](../adr/0019-useful-observability.md).
It observes existing operations, not prompts or conversation transcripts.

## Composition and configuration

The desktop Bun host initializes `@drawloom/otel-host` before application startup.
The package uses standard OpenTelemetry APIs, SDK processors and OTLP/HTTP
exporters for traces, logs and metrics. No Node auto-instrumentation is assumed.
The same isolated SDK/privacy tests run in Bun 1.2.23 and Node 24.20.0.

| Configuration | Meaning |
| --- | --- |
| `DRAWLOOM_TELEMETRY` unset or `disabled` | No SDK initialization or export |
| `DRAWLOOM_TELEMETRY=recording` | SDK processing, default discard exporters, no network export |
| `DRAWLOOM_TELEMETRY=export` | Export to explicitly selected loopback endpoint |
| `DRAWLOOM_OTLP_ENDPOINT=http://127.0.0.1:14318` | Base OTLP endpoint; not the dashboard page |
| `DRAWLOOM_TELEMETRY_SPANS` | Comma-separated, fixed, trusted plugin stage names permitted at startup |

Never put user-entered names or content in the permitted-name configuration.
Unknown names become `operation`. Resource identity is a fixed service name,
not machine identity or filesystem location. Global SDK setup is composition-owned;
a second active setup is rejected. Disabled mode adds no API globals.

The host setup returns `flush()`, `shutdown()` and `diagnostics()`. This is a
composition API, not an injected plugin capability. Diagnostics distinguish
recorded spans/logs, export failures, elapsed flush deadlines and known queue
loss. An unavailable count is `null`, not zero. Standard test exporters may be
injected in recording mode; export mode accepts only the local OTLP configuration.

Defaults: queue 2,048, batch 512, exporter timeout 1 second, outer flush/shutdown
deadline 2 seconds. SDK structured self-observation reports queue-full losses;
metric dimensions are filtered before aggregation with cardinality capped at 128.
Telemetry export failure never changes execution or authoritative evidence.

## Instrumentation conventions

Use the standard `trace`, `logs` and `metrics` APIs. End spans in `finally`.
Use stable operation names with no interpolated input. External-effect retries
retain their existing authority; one actual attempt receives one attempt span.
Only explicit errors/timeouts have error status; denial, cancellation and unknown
outcomes are separately identified. Success-shaped transport responses can still
contain failed domain results and must be classified explicitly.

The finite host map covers commands, discovery, package lifecycle, resource/history
reads, agent requests/submission/approval waits, gateway invocation and execution.
Standard MCP calls record a method and opaque installation identity. Supported
metric families are `operation.duration`, `operation.count`, `telemetry.dropped`
and the SDK's processed/lost record counts. IDs never become metric labels.

`observed` in the desktop host is an internal convenience, not a replacement
tracer interface. Reusable plugin authors do not import it. Plugin stage spans
may use names permitted by their composition root, with the same privacy rules.
Do not initialize an exporter inside an in-process backend module.

## Propagation and trust

The public UI uses a local browser OTel provider and explicit request tracing.
It does not patch global fetch or install an SDK inside an MCP App. The host
extracts W3C `traceparent` after normal HTTP authentication. Baggage is not copied.
Async operation ownership preserves parents across signal processing; tests
exercise concurrent operations and separate logs.

MCP request metadata carries `traceparent`, following
[SEP-414](https://modelcontextprotocol.io/seps/414-request-meta). Tool arguments
are unchanged. The host owns the outgoing context for direct App calls; iframe
metadata cannot impersonate another parent. Standard uninstrumented servers
work unchanged and simply have no child spans. Codex internals remain opaque.

The browser exports standard OTLP JSON to `/api/telemetry/v1/traces`, authenticated
by the existing host cookie and exact origin policy. The relay accepts only
fixed UI request spans: maximum 32 per request, 64 KiB, 1-second input/export
deadlines, four concurrent exports and 120 requests/minute. It strips extra
metadata/resources, permits only fixed attributes, and rejects invalid spans or
stale timestamps. It is not a general OTLP proxy.
The browser receives only an enabled flag, never exporter credentials or an
arbitrary destination. Relay failures do not fail the command it was observing.

SDK export filtering excludes raw exception strings, content, arguments/results,
credentials, paths, arbitrary resource fields, unsafe links and high-cardinality
labels. This is data minimization, not a security sandbox for trusted plugin code.
Authoritative evidence and ADR 0014 history/media storage are untouched.

## Known limits

- Browser `ui.request` ends at response headers. Render readiness is measured
  separately in the proof; no automatic render-completion span is claimed.
- Browser queue overflow before delivery is not included in host loss counts.
  Queue bounds still apply. Host/relay counts cannot prove every UI span arrived.
- The local viewer's OTLP listener is loopback-only but unsecured; its UI uses
  the CLI-generated login token. Do not expose these ports to another machine.
- No native Rust spans, machine-restart capture, durable exporter spool, production
  retention, remote backend choice or provider-internal visibility is established.
- Instrumentation remains optional. Keep useful operations independent of SDK
  initialization, export availability and completeness of trace propagation.

Use the [proof launcher guide](../../spikes/adr-0019-observability/README.md) and
[evidence](../../knowledge/evidence/adr-0019-observability.md), not assumptions
based on dependency presence.
