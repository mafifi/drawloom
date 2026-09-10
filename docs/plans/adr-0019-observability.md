# ADR 0019 observability implementation

Status: completed and accepted by the maintainer on 2026-09-11. The durable
design is [ADR 0019](../adr/0019-useful-observability.md); results are in the
[evidence record](../../knowledge/evidence/adr-0019-observability.md). Acceptance and
commit were explicitly authorised after review, separately from this original plan.

## Binding outcome

Opt-in OpenTelemetry instrumentation in the existing public desktop and private
installed workbench, proven using an existing local viewer. Diagnostic value,
privacy and measured cost determine useful span detail. Standard APIs and OTLP,
not a new Drawloom tracing protocol. No paid generation, model downloads, hosted
telemetry, production data, mandatory plugin instrumentation or browser bridge.

## Tasks

1. Draft Proposed ADR, architecture guidance and standard SDK bootstrap with
   tests for propagation, correlated logs, redaction and bounded export failure.
2. Instrument the public UI/HTTP, host discovery/lifecycle, agent requests,
   tools, history/assets and MCP boundaries. Use standard context propagation;
   keep permission and authoritative evidence independent.
3. Instrument private installed recipe and standalone media; prove direct Save,
   native synthetic revision and real FFmpeg. Add public contrasting consumer
   and retained orchestration attempt/parallel/restart evidence.
4. Launch pinned standalone Aspire, inspect traces/logs/metrics; compare disabled,
   recording and local-export modes with cold and 30 warm iterations. Record
   latency/CPU/memory/counts/bytes/loss and discovery diagnosis.
5. Review, canonical gates in both repos, sanitised evidence and API docs.
   Leave Proposed and uncommitted. No performance rewrite as part of diagnosis.

Public supported code never imports retained proof modules. Private evidence
stays private. Existing main checkouts are explicitly requested; no branches.
