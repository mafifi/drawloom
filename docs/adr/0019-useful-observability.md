# ADR 0019: Useful observability through traces, logs and metrics

- **Status:** Accepted
- **Accepted:** 2026-09-11
- **Date:** 2026-09-10
- **Decision owners:** Drawloom maintainers
- **Related:** ADRs 0005–0008, 0013–0018

## Purpose

Observability should reduce the time and guesswork needed to explain system
behaviour. Instrumentation earns its place by answering a diagnostic question,
with proportionate runtime cost and without exposing users' content.

This applies proportional efficiency, proven boundaries and secure defaults.
Acceptance depends on diagnostic value and measured overhead, not a span count.
The maintainer accepted the demonstrated instrumentation approach and its measured
trade-offs on 11 September 2026. The production exclusions below remain in force.

## Decision

Use OpenTelemetry APIs for instrumentation, host-owned SDK setup and OTLP export.
Do not define a replacement tracer API or place SDK initialization in libraries.
Traces describe operations; correlated logs and events explain them; metrics show
distributions and counts. Tool evidence and paginated conversation history remain
authoritative independent records, never reconstructed from sampled telemetry.

The initial composition uses opt-in local export and a recording mode that exercises
the SDK but discards output by default. Tests may inject standard in-memory exporters;
the application does not retain an unbounded in-memory trace archive. Disabled mode
exports nothing. Standard SDK queueing/batching is bounded;
shutdown has an outer deadline. Export errors must not affect business outcomes,
retry tools or weaken evidence persistence. Lost records are reported separately.

## Initial span ownership

| Owner | Operations | Diagnostic question |
| --- | --- | --- |
| Public UI | Meaningful requests; separate browser readiness measurement | Network acknowledgement versus visible results? |
| Host | Commands, discovery, package inspection/connection/activation/cleanup | Where is processing or readiness blocked? |
| Capability implementations | Tool calls, history pages, assets, agent requests | Which existing boundary consumed time? |
| Agent adapter | Connection, submission, requests, approval waits | Execution, provider waiting or human waiting? |
| Gateway | Invocation and actual attempt, result | What ran or was denied, cancelled or uncertain? |
| Plugins | Validation, preparation, rendering | What explains a tool invocation? |
| Workbench | Revision and assembly | How do calls serve the user's action? |
| Orchestration proof | Activities, retries, branches and continuation links | What overlapped, retried or resumed? |

Use stable names and bounded attributes. IDs belong in spans when needed, never
high-cardinality metric labels. Do not span every function, delta or rerender.
Denied/cancelled outcomes are distinct from unexpected errors. Approval waiting
is not active execution. Disconnected/uncertain outcomes are not invented success.

## Propagation and trust

Use W3C context across the authenticated UI HTTP connection. Carry standard MCP
request metadata only where the installed protocol supports it; no tool argument
changes. Uninstrumented plugins remain usable. Enhanced backends need no new
privileged capability. MCP Apps stays unchanged: instrument host-side handling,
not a proprietary iframe telemetry bridge. Context is correlation, not authority.

Codex calls are observed from Drawloom; no claim is made about provider-internal
spans. Detached/restarted work uses existing IDs and span links where demonstrated,
not a conversation-long span. Do not add a general persistence/event framework.

Exclude prompts, arguments/results, documents, media, credentials, private paths
and arbitrary exception messages. Public UI ingestion is authenticated and
bounded; no exporter secrets enter browser configuration. Export only to the
explicitly configured local endpoint in this experiment. No global capture.

## Reference comparison and experiment

[OpenTelemetry](https://opentelemetry.io/docs/languages/js/) supplies standard
instrumentation APIs and exporters; Bun and browser context behavior must be
verified, not inferred from Node support. The inspected DeepSeek revision
`b2e3b2a0125854567a4a5fcba75782e42fe84901` uses feedback-authorised session-log
capture through SDK batching. This proposal instead observes safe operational
metadata and does not upload session content. See the existing harness survey.
[MCP propagation convention](https://modelcontextprotocol.io/seps/414-request-meta)
uses `_meta.traceparent`, not tool arguments. The installed MCP SDK 1.30.0
preserves this metadata in real HTTP and linked-transport tests. This demonstrates
our boundary, not automatic instrumentation or trace support in arbitrary servers.

Use [standalone Aspire](https://aspire.dev/dashboard/standalone/) as a pinned local
proof viewer, not a selected production storage backend. Its data is in-memory.
Retain public launchers/fixtures under `spikes/adr-0019-observability/`; no supported
code imports them. Private recipe instrumentation and evidence stay private.

Compare disabled, recording and export modes: cold plus 30 warm runs, median/p95,
CPU, peak memory, span count, transferred bytes and losses. Inspect complete traces,
correlated logs and metrics in the viewer. Test concurrency, failure, cache hits,
permission denial, approval waiting, exporter outage and bounded shutdown. Trace
real local FFmpeg and synthetic native revision without paid generation.

Use discovery as a diagnosis, not a performance rewrite: identify slow requests
and missing useful spans, then record a targeted follow-up. Report actual effort
and limits, not broad productivity claims. Both canonical gates and independent
review are required before presenting acceptance evidence.

## Implemented experiment and refinements

The supported composition package is `@drawloom/otel-host`. It configures the
standard SDK, filters exportable fields and bounds shutdown; it is not a new
observability capability contract. Reusable code uses OpenTelemetry directly.
Enhanced plugins receive no new host object. A standalone executable plugin
owns its own opt-in SDK setup; an in-process backend uses the host's API context.
See [configuration and instrumentation guidance](../reference/observability.md).

The initial catalogue was refined from actual traces:

- Keep separate submission, active operation and approval-wait spans. A successful
  submission is not successful execution; typed failures must be marked before
  their owning span ends. Unresolved work is `unknown`, not silently successful.
- Keep explicit history pages and cached resource reads. Remove automatic history
  cursor-poll spans: they filled the viewer without explaining useful work.
- Propagate the host context on direct MCP App tool calls as standard metadata.
  Ignore an iframe's proposed trace parent; this changes neither the App protocol
  nor editing authority. No iframe render or provider-internal parent is invented.
- Record fixed log event names and safe outcomes, not arbitrary exception text.
  Count outcomes with bounded metric dimensions; opaque operation/installation
  identities are trace attributes only.
- In the retained workflow proof, activities never await diagnostic disk writes.
  Coalesced, bounded correlation persistence has an explicit deadline at proof
  checkpoints. Lost correlation cannot cause execution retries.

[Measured evidence](../../knowledge/evidence/adr-0019-observability.md) records
the comparison, native discovery diagnosis, verification and limitations. This
does not select Aspire for production retention, promise visibility inside Codex,
or claim Rust/Tauri IPC instrumentation. Browser spans currently measure response
headers, not render completion; separate visible-result checks are labelled as such.
Host SDK queue loss and relay rejection are measurable; browser SDK queue loss
before relay delivery remains unknown. No claim of end-to-end lossless capture.

## Acceptance and follow-up

The experiment is implemented and accepted following review of diagnostic value,
small-operation overhead and disclosure of unobserved boundaries.
Discovery cancellation/category isolation is a targeted follow-up, not part of
this change. Broader capture, hosted destinations, retention and any new plugin
boundary require a separate decision.
