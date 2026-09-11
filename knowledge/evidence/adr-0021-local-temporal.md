---
type: source
id: adr-0021-local-temporal
title: Local Temporal orchestration implementation evidence
status: active
created: 2026-09-11
updated: 2026-09-11
---

# Local Temporal orchestration implementation evidence

This record accompanies [Accepted ADR 0021](../../docs/adr/0021-local-temporal-orchestration.md).
The supported provider, installed desktop integration and private media workflow
have been implemented and were accepted by the maintainer on 2026-09-11. The final review
found and corrected a concrete acceptance gap: the existing MCP connection
serialized tool calls. The maintainer approved explicit per-connection opt-out
from interactive forms; the installed consumer now observes concurrent FFmpeg.

## Starting evidence and limits

The [ADR 0017 evidence](adr-0017-orchestration.md) demonstrated the portable
interface against a real local Temporal service. Its bridge remained alive during
worker/service restart checks. It did not establish recovery after the entire
Drawloom host exits. ADR 0021 must test that additional boundary explicitly.

The installed local CLI exposes `--db-filename`, loopback binding and `--headless`
for its development server. SDK versions remain those pinned in the root catalog.
Exact runtime versions and executed tests will be recorded with final results,
not inferred from dependency presence.

[Temporal's SQLite guidance](https://docs.temporal.io/self-hosted-guide/embedded-server)
was checked on 2026-09-11: SQLite deployments are for development/testing, not
supported production hosting. Drawloom's local-v1 choice does not change that
upstream support limit. No production, distributed, enterprise or live-model
recovery claim is part of this delivery.

## Executed public verification

Tested on macOS arm64 with Bun 1.2.23, Node 24.20.0, Temporal SDK 1.23.0,
CLI 1.3.0 and server 1.27.1. No global tools were upgraded.

- Canonical `bun run check:ci` after the approved concurrency amendment: 651
  passing Bun tests, five explicit opt-in skips, zero failures, 3,379 assertions;
  Node shared conformance also passed. Frozen install made no lockfile changes.
- `bun run test:temporal`: six real-service tests passed (42.24 seconds),
  including the unchanged public conformance suite and an unrelated installed
  package through the real desktop loader. Its durable task counter remains one
  across whole-host restart and input completion.
- `bun run test:temporal:compiled`: passed after rebuilding 20 packages and staging
  252 runtime packages; refreshed compiled workflow execution took 4.82 seconds.
- Actual Tauri application build, runtime execution from its packaged resources,
  authenticated packaged-host startup and stdin-close shutdown passed. Two Rust
  shutdown tests passed. This is not signing/notarization or cross-platform proof.
- Shared run presentation: seven tests, 20 assertions. Controlled browser HTTP
  fixtures verified desktop/light and narrow/dark, input errors, step pagination,
  cancellation and stale-control removal. Those fixtures are not live Temporal.

See [provider and packaging details](../../docs/plans/0021-task2-report.md),
[desktop integration and browser details](../../docs/plans/0021-task3-report.md),
and [contract changes](../../docs/plans/0021-task1-report.md).

## Recovery, authority and review corrections

Real worker/service/whole-host checks preserve completed effects and input waits.
Abruptly interrupted effects either recover from explicit retained receipts or
surface uncertainty with no automatic second handler call. Active agent recovery
uses synthetic/scripted transports; no live-model reattachment is claimed.

Regression-driven corrections include emitted-bundle fingerprints, separately
bundled error classes, transformed input schemas, shutdown distinct from native
cancellation, serialized grant refresh, and bounded retry of an atomic JSON-file
replacement race. The latter repeats a validated read, never a business action.
The scoped gateway retains grants and evidence on every attempt.

OpenTelemetry records content-free startup, preparation, dispatch, attempts,
recovery, cached results and observed state changes. Identifiers are hashed;
state transitions are observations, not an exact measurement of human wait time.

## Consumer and remaining limits

The private installed consumer has completed real local scene processing, explicit
review and draft-master assembly; a changed-input second run; safe single-branch
retry; stale-review rejection; revoked-grant denial; and restart checks. Its actual
browser controls also started, reviewed and completed a master, with playback and
range seeking. Detailed fixtures, paths, screenshots and measurements stay private.
Actual subprocess measurement confirmed that a generic MCP client can execute
three renders concurrently, but Drawloom's connection queues them. That queue
protects association of standard form elicitation with the originating invocation.
Removing it blindly would weaken consent handling. The maintainer subsequently
approved the host-owned `elicitationDisabledServers` policy. Listed connections
omit forms and run concurrently; defaults retain serialized consent. Actual
installed media verification observed three FFmpeg children simultaneously before
review. No proprietary correlation metadata or alternate executor was introduced.

The concurrency follow-up uses real stdio fixtures to verify opted-out overlap,
unchanged serialized consent, rejected unexpected forms, invalid configuration
before execution, no automatic retry and exact per-invocation trace correlation.
Desktop checks verify persistence, validation and capability negotiation both at
startup and reconnect. An independent review found missing trace assertions and
test cleanup; both were corrected. No production correctness issue remained.

The actual private browser flow saved/restored the setting, verified restart
messaging, then started/reviewed/completed a master and tested playback/seek.
Playwright was used because the Browser plugin was unavailable. Page identity,
content, framework-overlay absence, page errors, keyboard actions and screenshots
were checked at 1440×1000/light-dark and 390×844/dark. Screenshots remain private.

The staged Node dependency closure is approximately 288 MiB. Node and Temporal
remain external prerequisites. The local development server is not production
hosting. Wall-clock deadlines continue during shutdown: an interrupted render can
become failed with unresolved effects instead of transparently continuing. No
database reset, automatic effect replay, cloud sharing, model call, paid generation
or publication was performed.

## Verification coverage

- Contract/module validation and shared conformance.
- Real local Temporal, owner isolation, explicit retries and input waits.
- Whole-host/worker/service restart, completed receipts and uncertain effects.
- Installed unrelated public consumer and update protection across projects.
- Desktop controls, light/dark/narrow layout and existing authority regressions.
- Canonical public verification and opt-in real-service gate.

Private video measurements and media remain in the private repository. Public
records may report verification status but never incorporate those private files,
paths, screenshots or payloads.
