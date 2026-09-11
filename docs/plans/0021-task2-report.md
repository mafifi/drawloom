# Task 2 report: local Temporal provider

Historical implementation-stage report. ADR 0021 was subsequently accepted on
2026-09-11; see the [final evidence](../../knowledge/evidence/adr-0021-local-temporal.md).

Date: 2026-09-11. Task 2 of [the implementation plan](0021-local-temporal.md).
Public code only, existing checkout, no commits. ADR 0021 remains Proposed.

## Result and integration API

Implemented `@drawloom/temporal-orchestration` under
`packages/orchestration/temporal-orchestration`. No supported source imports a
spike. The retained workflow adapter and agent bridge informed the extraction;
installed registration, persistence, dispatch and process ownership are supported
package code. [The package README](../../packages/orchestration/temporal-orchestration/README.md)
owns usage and limitations.

The desktop composition API is:

- `createLocalTemporalManager({ dataDirectory, temporalPath?, nodePath?, runtimeDirectory? })`.
- `await manager.prepare({ projectId, installationId, packageDirectory, entrypoint })`
  returns `{ registry, orchestrator, readiness(), attach(handlers), close() }`.
- `manager.listOwners()`, `manager.hasUnfinishedInstallation(installationId)` and
  `manager.close()` support restoration, installation guards and shutdown.

Preparation validates real paths and the portable registry, compiles/fingerprints
the actual static dependency closure in Node, and persists owner records. The
backend factory receives the fixed owner's orchestrator. Starts reject before
`attach`; attachment matches every handler before launching its worker. Bun's
process never imports `@temporalio/worker`.

The Node sidecar supervises the exact CLI baseline, SQLite service and workers.
It checks parent liveness; the manager uses an exclusive PID lock with dead-owner
reclamation. Loopback dispatch is authenticated, bounded and owner checked.
Receipts flush intent before the handler and completion before response, deduplicate
concurrent delivery and reconcile incomplete receipts without automatically
resubmitting effects. Run-start intents remain blocking when service state cannot
be established. Provider declarations contain no Temporal SDK types.

## Code paths

| Path under the provider package | Responsibility |
| --- | --- |
| `src/index.ts` | Fixed-owner manager, two-phase registration, persisted run ownership, bounded management, lifecycle and authenticated dispatch |
| `src/processes.ts` | Exclusive data-root lock, exact prerequisite command checks and bounded owned-child shutdown |
| `src/sidecar.ts` | Actual Node worker/bundler and supervised local CLI service |
| `src/workflow.ts` | Portable workflow facade on Temporal, explicit retries, children, input, cancellation and unresolved effects |
| `src/receipts.ts`, `src/storage.ts` | Atomic persisted task intent/completion, recovery, deduplication, task deadlines and cancellation |
| `src/agent-bridge.ts`, `src/agent-task-host.ts` | Existing AgentDriver/JsonStore bridge, owned session/operation receipts and native controls |
| `receipts.test.ts`, `manager.test.ts`, `agent-bridge.test.ts` | Fast receipt, containment/ownership and scripted-agent checks |
| `real.test.mjs`, `fixtures/` | Opt-in real-service conformance, packaged-Zod, Node/Bun and process-loss evidence |

The root manifest adds `test:temporal` and an isolated provider test type check.
The lockfile records the new workspace and the parent's new desktop dependency.
Only the manager source test is excluded from the global declaration check;
the provider's own strict test configuration checks it. `skipLibCheck` is local
to this provider because pinned SDK Schedule declarations conflict with
`exactOptionalPropertyTypes`, as in the retained Temporal proof configuration.

## Test-first evidence

| Red check | Observed failure before implementation/correction |
| --- | --- |
| Receipt tests | `createReceiptDispatcher` absent: 0 pass, 2 fail |
| Manager ownership/containment tests | `createLocalTemporalManager` absent: 0 pass, 2 fail |
| Real unchanged shared conformance | `createLocalTemporalManager` was undefined |
| Completed-task cancellation listener regression | Listener remained false after run cancellation |
| Real background native submission cancellation | Snapshot omitted the unresolved native submission |

The latter two exposed a real lifecycle gap: a completed `agent.submit` task may
leave native execution running. Run-lifetime cancellation signals now reach its
listeners, and the deterministic workflow retains uncertainty until a terminal
agent receipt is observed. Native interruption is not assumed successful.

Intermediate real runs also caught concrete packaging defects: Temporal's virtual
entry had no filesystem file; the generated entry needed provider-side dependency
resolution; portable agent contracts include tools/host/MCP schema dependencies.
The fixes keep those dependencies inside the validated, fingerprinted closure.
A blanket rejection of all Webpack warnings was too broad; unresolved dynamic
dependency warnings are rejected specifically. These failed runs are not counted
as successful evidence.

## Initial verification

Environment: Temporal CLI 1.3.0, server 1.27.1, Node 24.20.0 and Bun 1.2.23 on
the current macOS host. No global upgrades or downloads of business media.

```text
bun test packages/orchestration/temporal-orchestration/receipts.test.ts \
  packages/orchestration/temporal-orchestration/manager.test.ts \
  packages/orchestration/temporal-orchestration/agent-bridge.test.ts
7 pass, 0 fail, 40 assertions

DRAWLOOM_TEMPORAL_TEST=1 node --test \
  packages/orchestration/temporal-orchestration/real.test.mjs
5 pass, 0 fail, 33.85 seconds
```

The five real tests exercise:

1. The unchanged exported public orchestration conformance in Node against real
   Temporal, including fan-out/join, input conflicts, safe retry bounds, denied/
   invalid/unknown outcomes, cancellation, pagination and synthetic owned agents.
   An extra background-native-submission assertion verifies unresolved effects.
2. Whole manager/service/worker close and reopen: completed writes are not repeated;
   input waits persist; owners/cursors are isolated; a workflow bundling its own
   Zod copy registers; changed on-disk code blocks before import; an active handler
   closes/reopens as failed with unknown effects and no second call; explicit
   cancellation remains distinct.
3. An actual Bun process prepares/starts/queries/completes a workflow through the
   local service while the worker and bundler execute in Node.
4. A child host process is killed, then a new manager reclaims dead ownership and
   reopens persisted input. It observes the original effect file and returns the
   prior completed task output with zero handler calls after restart.
5. An effect writer is killed after durable intent and external receipt. Missing
   recovery returns unknown; receipt-only recovery returns completed output without
   another run/submit call.

Provider build and strict test/source type checks passed. Dependency policy passed
for 21 workspaces; frozen install completed without changes; scoped whitespace
checks passed. The parent owns the final canonical gates and independent review.
An intermediate global type check found an in-progress parent-owned dependency
narrowing error in `apps/desktop/host/plugin-backend.ts`; no provider SDK types leak
through its emitted declarations.

## Limits and remaining parent work

- This is the explicitly approved development-server local-v1 deployment, not an
  upstream-supported production service, HA arrangement or cross-platform proof.
- Shutdown does not freeze wall-clock activity/heartbeat deadlines. A one-attempt
  effect may expire before a recovery dispatch is possible. The observed active
  handler restart reports uncertainty; no unconditional paused-render continuation
  is claimed.
- Agent sessions retain native identity and operation receipts, but the generic
  AgentDriver has no reattach lookup. Whole-host active submissions become unknown;
  no live model recovery guarantee is established.
- Trust remains host owned. Restoration does not itself import/approve plugins.
  Package lifecycle changes must be serialized by the composition root against
  activation and new starts. Existing-bundle inspection requires its worker;
  migration and side-by-side versions remain excluded.
- The package records content-free start/task operation spans; host exporter
  configuration and broader desktop observability acceptance remain parent work.
- No durable storage corruption/fault-injection certification or exhaustive
  simultaneous stale-lock reclaim stress test was performed. Filesystem/PID locks
  are local-v1 mechanisms, not distributed consensus.
- Private canonical checks, installed desktop integration, media workflow
  evidence, UI checks and maintainer acceptance remain parent work. Public
  canonical and compiled packaging follow-up are recorded below.
## Independent review corrections

The parent addressed three concrete findings with regressions:

- Fingerprints now bind emitted workflow bytes plus the dependency closure.
  A same-closure/different-code test failed before the helper and passes after it.
- Named input waits no longer require Zod-to-JSON-Schema conversion. A real
  JSON-preserving transform wait failed before the change and passed in the
  full close/reopen scenario (13.18 seconds).
- Dispatcher shutdown now has a distinct same-host abort reason. An actual
  bridge/dispatcher regression first showed native cancellation on close, then
  passed close-without-cancellation and explicit-cancel cases (2 assertions).

The complete real gate then exposed a compatibility regression in the transformed
input-wait correction: different schemas at a repeated named wait were accepted.
The provider now compares JSON-schema fingerprints when available and schema
identity for non-convertible transforms. The unchanged shared conformance and the
real transformed wait both pass; no portable API was added.

## Compiled desktop packaging and follow-up verification

The maintainer delegated packaging/lifecycle correction and the public canonical
gate to this slice after the initial report. A compiled Bun probe reproduced the
missing-resource failure: `import.meta.url` referred to Bun's embedded filesystem,
which an external Node process cannot load. The supported build now uses:

- `scripts/stage-temporal-runtime.ts` and its regression: stage the frozen public
  dependency closure, preserving nested package versions and native module bytes.
- Desktop `bundle:host` and `src-tauri/tauri.conf.json`: build packages, stage the
  runtime and include it as an application resource. The current local tree has
  252 package installations and occupies approximately 288 MiB; size optimization
  is not claimed.
- Provider `runtimeDirectory` composition option and the parent-owned host
  passthrough: resolve Node sidecar files from actual resources, not Bun's virtual
  filesystem. This is provider configuration, not a new plugin capability.
- `src-tauri/src/main.rs`: pass the resource directory and allow a bounded
  fifteen-second graceful host drain. The prior two-second fallback failed the
  2.2-second drain regression; the corrected lifecycle passes.
- `compiled-runtime.test.mjs` and `fixtures/compiled-client.mjs`: compile a Bun
  manager, run it outside the checkout, and complete a bundled workflow with the
  staged Node worker. `test:temporal:compiled` makes this an explicit opt-in gate.

A second failure was reproduced with a separately bundled backend error class:
`StepFailure('denied', ...)` was treated as unknown because `instanceof` crossed
contract copies. `src/failures.ts` narrowly validates actual Error values, standard
names and the four portable codes. A real standalone-bundle regression covers
denial and explicit retry bounds; ordinary objects do not gain retry authority.

Fresh focused evidence on this host:

```text
Receipt and runtime-staging tests: 5 pass, 0 fail, 29 assertions.
Full opt-in real Temporal gate after runner correction: 5 pass, 0 fail, 34.23 seconds.
Compiled Bun runtime check against staged resources: 1 pass, 4.86 seconds.
Rust shell tests: 2 pass, 0 fail (including graceful shutdown regression).
Desktop bundle:host: passed, 20 public packages built, 991 modules compiled.
Tauri build --bundles app: passed; Drawloom.app produced.
Compiled Bun runtime check against actual .app resources after runner correction: 1 pass, 4.85 seconds.
Actual packaged desktop host outside checkout: authenticated startup and clean stdin-close shutdown passed.
```

The `.app` resource check uses
`apps/desktop/src-tauri/target/release/bundle/macos/Drawloom.app/Contents/Resources/orchestration`.
This proves resource materialization and real workflow execution from the compiled
client, not a GUI-installed private scenario. External pinned Node and Temporal
remain prerequisites. Evidence is local macOS arm64 only; signing, notarization,
distribution and cross-platform compatibility have not been established.

The canonical Bun run found another test-only compatibility issue: registering
the Node-only opt-in files through Bun's `node:test` shim raised
`ERR_NOT_IMPLEMENTED`, even with skipped tests. These files now register only in
Node; ordinary provider tests still execute in Bun (10 pass, 50 assertions). The
complete Node real suite was rerun successfully after this correction.

Final delegated public gate passed on 2026-09-11:

```text
bun install --frozen-lockfile: no changes.
bun run check:ci: exit 0.
Bun: 642 pass, 5 opt-in skips, 0 fail, 3186 assertions, 120 files.
Node shared conformance: tools, synthetic agent, Codex agent, plugins and host passed;
portable history schema/export smoke passed (SQLite remains Bun-only).
git diff --check: passed.
```

An intervening gate observed the parent-owned grant-refresh test in its red phase;
the final run above includes its implementation. No private tests or data were
used for the public gate. This report is implementation/verification evidence,
not ADR acceptance, a commit, signing approval or private-workflow acceptance.

## Real installed desktop consumer follow-up

The unrelated installed-consumer gap is now covered by
`installed-host.test.mjs`, which runs
`apps/desktop/tests/installed-temporal-host.mjs` in an actual Bun desktop process.
The application receives a capture wrapper around the actual manager factory at
its composition root; the wrapper delegates preparation unchanged. The desktop
loader, trust checks, backend capability injection, handler attachment, task
authority, service, worker and persistent storage are all real. No controlled
manager, manual handler attachment, model, browser or private package is used.

The public `installed-workflow.mjs` and `installed-backend.mjs` fixtures implement
an unrelated specimen-catalog label confirmation. The test builds self-contained
JavaScript into a temporary installed package outside the checkout. A task writes
a counter through the backend's scoped host store and prepares a label before a
durable boolean input wait. After closing the entire application and creating a
new one, `restore()` reactivates the same project/installation and package. The
test verifies identical pending input identity, a second backend activation,
response/result `MOSS:confirmed`, zero conversations, and a persisted task counter
of one both before and after completion.

Test-first negative control: withholding backend trust failed the readiness
assertion with no registration. Restoring explicit trust exercised the real path.
Two initial test assumptions were corrected against existing contracts: input
waits retain run status `running`, and macOS temporary paths are canonicalized by
the loader. No production contract or implementation was changed for this proof.

`test:temporal` now includes this Node-driven desktop check alongside the existing
real service checks, serializing files. Ordinary Bun discovery still leaves these
opt-in Node suites unregistered. The refreshed `test:temporal:compiled` rebuilt
20 packages and staged 252 runtime packages, then passed its compiled Bun client
check in 4.88 seconds. No new Tauri application build was required or claimed.

Follow-up verification on 2026-09-11:

```text
bun run test:temporal: 6 pass, 0 fail, 41.87 seconds.
  Real installed desktop case: 7.31 seconds in the complete gate.
bun run test:temporal:compiled: 1 pass, 0 fail, 4.88 seconds after fresh build/stage.
bun --conditions=svelte test packages/orchestration/temporal-orchestration:
  10 pass, 0 fail, 50 assertions (Node opt-in files remain excluded from registration).
bun run check:architecture: UI policy and dependency boundaries passed.
git diff --check: passed.
```

The parent's full canonical gate was not rerun for this test-only follow-up.
Changes remain uncommitted; no ADR, business output or private-workflow acceptance
is implied.
