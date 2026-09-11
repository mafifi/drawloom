# Local Temporal orchestration

Node provider for the portable `@drawloom/orchestration` contract. The desktop
client also runs in Bun; only the configured Node sidecar loads the worker SDK.
This implements the accepted local-v1 decision in [ADR 0021](../../../docs/adr/0021-local-temporal-orchestration.md).
Temporal's development server is not a production service.

## Composition

```ts
const manager = createLocalTemporalManager({ dataDirectory });
const registration = await manager.prepare({
  projectId, installationId, packageDirectory, entrypoint: 'dist/workflows.js',
});
// Supply registration.orchestrator to the explicitly trusted backend factory.
// Before attachment its methods reject promptly with unavailable readiness.
await registration.attach(backend.taskHandlers);
```

`registration.readiness()` returns the existing desktop-host readiness report.
`manager.listOwners()` reads saved owner records without importing package code;
`hasUnfinishedInstallation(id)` includes unopened owners and unresolved start
intents. The composition root must serialize package replacement/removal against
activation and new workflow starts. `registration.close()` releases one worker;
`manager.close()` stops dispatch and owned workers/service, without workflow cancel.
Only `orchestrator.cancel(runId)` requests durable workflow cancellation.

Owners are fixed to the project and installation. Every run and cursor is checked
against that scope. Get/query/update requests have five-second deadlines; result
waits are intentionally long-lived and accept caller cancellation. Pages contain
at most 100 records. Task dispatch bodies and responses are limited to 1 MiB.

## Local prerequisites and state

The explicit local baseline is Temporal CLI 1.3.0 / server 1.27.1 and actual Node
24.20.0, resolved through PATH or `temporalPath` / `nodePath`. Nothing installs or
upgrades global tools. One manager owns `<dataDirectory>/orchestration`; a live PID
lock rejects another manager. A dead owner can be reclaimed, and sidecars supervise
their parent PID. Only child processes spawned by this manager are stopped.

The headless CLI binds to loopback and uses persistent SQLite with WAL and FULL
synchronous writes. Owners, run-start intents and task receipts are separate
validated JSON records flushed before atomic replacement. They are not transcripts.
No database reset, remote endpoint or automatic plugin trust is provided.

Compiled desktop hosts supply `runtimeDirectory`, pointing at the staged
`orchestration` resource directory. `bundle:host` builds public packages and copies
the frozen installed Node dependency tree, including native worker modules, beside
the compiled Bun host. The Tauri shell passes its resource location explicitly;
Node never tries to load worker files from Bun's embedded filesystem. Staging uses
the current hoisted dependency layout and host platform/architecture; it does not
bundle Node or Temporal, install dependencies, or establish cross-platform support.

## Workflow packaging and recovery

Entrypoints must be prebuilt JavaScript contained within the trusted package after
symlink resolution. The Node bundler validates and fingerprints its actual static
dependency closure, including portable Drawloom contracts and their runtime
dependencies. Unresolved dynamic dependency warnings reject. Bundled Zod copies
are accepted by the existing contract parser. Deterministic authoring remains a
trusted-code obligation, not a security sandbox.

Unfinished work blocks a changed bundle. Completed-work inspection also requires
the matching bundle/worker; no migration or side-by-side upgrade scheme is added.
The host must restore trust and handlers before dispatch. A prepare failure must
not be treated as permission to remove an installation with saved work.
The fingerprint includes emitted executable bytes as well as the source closure,
so a bundler/runtime change cannot silently reuse an unfinished run's code identity.

Receipts save intent before invoking a handler and output before acknowledging it.
Repeated/concurrent completed deliveries return that output. Interrupted receipts
call only the optional `recover` hook; absent or unknown recovery never reruns the
effect. Retryable failures require an explicit per-step attempt bound. Denial,
invalid data and uncertainty do not authorize another effect. Local run-lifetime
signals preserve cancellation listeners installed by completed agent submissions.
Standalone backend bundles can contain another copy of the contract's error class;
the dispatcher recognizes only actual `Error` values with the standard error name
and a validated portable step-failure code. Arbitrary objects or foreign codes do
not become retry authority.
Local shutdown uses a separate host-only abort reason: local handlers stop, but
the agent bridge does not interpret quitting as an explicit native cancellation.

Wall-clock activity and heartbeat deadlines continue while the application is
closed. A task with one allowed attempt may expire before recovery dispatch occurs.
The tested active-handler close/reopen becomes failed with unresolved effects,
without another handler call or a workflow cancellation request. This is not an
unconditional pause/resume promise. A late handler cannot replace a timed-out
receipt, and cancellation does not prove native effects stopped.

`./agent-bridge` exports `createAgentBridge` and `dispatchAgentTask` for host
composition through `AgentDriver` and `JsonStore`. The host supplies independent
context/tool authority and one writer per owner. Stored session/operation IDs do
not establish generic native reattachment: after host loss, active submissions
become unknown rather than fresh submissions. This bridge has synthetic/scripted
evidence only, not live-model recovery evidence.

## Verification

Build public packages before the opt-in real service suite:

```sh
bun run build:packages
bun run test:temporal
bun run test:temporal:compiled
```

The compiled check stages the frozen runtime, then starts a compiled Bun manager
outside the checkout and completes a packaged workflow through the Node worker.
`DRAWLOOM_ORCHESTRATION_RUNTIME` can select the resources in a built `.app` for
the same check. The native shell allows a bounded fifteen-second host drain before
its forced-stop fallback; quitting remains distinct from workflow cancellation.

The test suite starts disposable local services, exercises unchanged public
conformance and installed-style bundles, and closes its processes. Ordinary Bun
tests cover receipts, owner locks/containment and scripted agent authority without
starting Temporal. Test/source type checking is strict; only this provider's
external declaration checks use `skipLibCheck` for the pinned SDK's incompatible
optional Schedule type declarations. Public exports contain no SDK types.

Operation spans use `drawloom.orchestration.startup`, `prepare`, `start`, `task`,
`recovery`, `state` and `shutdown`. Task spans retain attempt/outcome, cache-hit
and hashed run/step/owner correlation. State spans report changes observed by the
host, including waiting and uncertainty; they are not continuous spans or exact
engine-side wait-duration measurements. The state-observation cache is bounded.
Host-owned OpenTelemetry configuration remains opt-in. Inputs, original IDs,
paths, output and exception messages are not recorded as telemetry.
