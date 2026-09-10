# ADR 0019 observability proof

Retained experiment, not a telemetry backend or production API. Read
[ADR 0019](../../docs/adr/0019-useful-observability.md) and the
[authoritative evidence](../../knowledge/evidence/adr-0019-observability.md).
Run from the public repository root. No private package is needed.

## Local viewer

The root catalog pins `@microsoft/aspire-cli` to 13.5.3. Use the local dependency,
not a global upgrade. Its standalone dashboard may need its runtime on first launch.

```sh
bunx aspire dashboard run --frontend-url http://127.0.0.1:18889 --otlp-http-url http://127.0.0.1:14318 --otlp-grpc-url http://127.0.0.1:14317 --non-interactive --nologo
```

Use the login link printed by that process; never commit it. The viewer is
in-memory, with an unsecured OTLP listener bound only to loopback. Stop this
specific process after inspection. No Docker daemon or hosted account is needed.

## Public scenarios

```sh
bun spikes/adr-0019-observability/benchmark.ts disabled
bun spikes/adr-0019-observability/benchmark.ts recording
DRAWLOOM_OTLP_ENDPOINT=http://127.0.0.1:14318 bun spikes/adr-0019-observability/benchmark.ts export
DRAWLOOM_TELEMETRY=export DRAWLOOM_OTLP_ENDPOINT=http://127.0.0.1:14318 bun spikes/adr-0019-observability/run-desktop.ts
```

Each creates an isolated temporary data directory, never the user's installation.
The benchmark writes its raw 30 warm repetitions after one warm-up. A byte-counting
loopback forwarder observes standard OTLP payloads. It invokes no live model.
Cold startup excludes module loading; CPU includes setup and flushing. On the
tested macOS/Bun combination `maxRSS` is bytes, verified against the system tool.

`browser-proof.mjs` uses an already available Playwright runtime and installed
Chrome. Set `PLAYWRIGHT_MODULE` to that module's local path and
`DRAWLOOM_BROWSER_URL` to the fresh host's bootstrap URL. No browser download is
performed. The proof checks light/dark, actual sent-message visibility, errors
and relay delivery, and writes screenshots in a temporary directory.

`viewer-proof.mjs` uses `ASPIRE_BROWSER_URL` (secret login URL), optional
`ASPIRE_TRACE_ID`, and `ASPIRE_SECTION` (`Traces`, `Structured logs`, `Metrics`).
It inspects the real dashboard. Logs/metrics select the public benchmark resource.
Only sanitized public screenshots may enter public evidence.

Native discovery is opt-in and read-only (creates an isolated Codex session, no
prompt/tool submission):

```sh
DRAWLOOM_OTLP_ENDPOINT=http://127.0.0.1:14318 bun spikes/adr-0019-observability/discovery.ts
```

The retained ADR 0017 workflow imports this spike's small observation helper:

```sh
DRAWLOOM_TELEMETRY=export DRAWLOOM_OTLP_ENDPOINT=http://127.0.0.1:14318 bun run spike:adr-0017
```

This still uses Node for Temporal's worker and bridge, not a desktop Temporal
dependency. The Node type-stripping runner avoids a verified Bun 1.2.23 star-reexport
bundling failure; Node 24.20.0 was tested. Activity correlation is best effort,
bounded and nonblocking; explicit proof checkpoint flushes report success/failure.
Worker/service restart is exercised; the synthetic bridge host remains alive.

## Verification

`bun run check:ci` includes deterministic host, privacy, SDK, relay and stalled
correlation tests. Native/viewer/service runs stay opt-in. SDK conformance runs in
Bun and Node. No supported module may import this directory. Private workbench
proofs and screenshots live only in `drawloom-workbenches`.
