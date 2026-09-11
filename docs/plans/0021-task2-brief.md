# Task 2: supported local Temporal provider

Read docs/plans/0021-local-temporal.md binding scope and Task 2, plus ADR 0021.
Existing checkouts, no commits, no subagents. Public code only. Use TDD.

Implement @drawloom/temporal-orchestration under packages/orchestration as a
Node provider. Keep imports out of spikes (extract useful source). SDK versions
already in root catalog, use catalog:. Contracts are being amended in Task 1;
read their actual exports before starting. Scope changes to provider package,
provider tests and necessary build/check script configuration; parent owns ADR,
desktop and private integration.

## Consumer shape needed by desktop

Expose a local service manager created for one data directory. It starts lazily
for a declaring installed package, and exposes prepare/register owner, readiness,
list owner records for restoring unopened projects, unfinished installation check,
and close. Owner = project + installation; callers never choose another owner's
run prefix. Registration is two phase: prepare a contained workflow module and
scoped Orchestrator for backend factory, then install returned handlers and start
worker. Starts before ready reject, they never hang. Tell parent exact API early.

The Bun desktop needs a thin client compatible with its host, but the Temporal
worker/bundler must run under a configured/discovered actual Node executable.
@temporalio/client imports in Bun were smoke-tested; do not assume runtime parity:
test actual client requests under Bun as well as full provider suite in Node.
Do not import @temporalio/worker in the Bun process. Prefer Node sidecar for SDK
bundling/worker with existing proof's authenticated HTTP dispatch into host.

Pinned CLI currently temporal 1.3.0, server 1.27.1, Node 24.20.0; no upgrade.
CLI supports --headless --ip 127.0.0.1 --port --db-filename --sqlite-pragma.
Persist under root/orchestration. Acquire exclusive directory ownership with
crash-aware lock; never kill unrelated processes. Detect readiness, CLI failures,
storage errors, port conflicts; no web UI, no default remote binding. Atomic
JSON receipts using fsync/rename acceptable; SQLite is Temporal's state owner.

Cache self-contained package workflow bundle hash and bind runs to it. Hash the
actual dependency closure or require packaged self-contained JS plus public
contract dependencies. Validate package containment including symlinks before
import. Registry comes from portable module export, task handlers remain host
closures and match Task 1 types. Persist owner records before start so global
installation guard sees pending/unopened-project work; uncertain pending start
must remain blocking until reconciled.

Worker calls a bounded authenticated loopback dispatch endpoint with run/step/task
identity. Validate owner, registered task, input, execution limits and attempt. Do
not use task args for credentials. Save intent before handler, result before reply;
matching completed receipt returns cached output with zero handler calls. Dedup
concurrent delivery. Incomplete records call optional recovery only; absent/unknown
recovery returns unknown, never automatically runs effects. Retryable handler
failures only retry when explicit task maxAttempts allows. Stable logical step vs
actual attempt IDs. Unknown/denied/invalid never retry. Recovery is not an extra
grant. Cancellation cancels owned handlers; quit stops dispatch and bounded drains
without calling workflow cancel. In-flight deadlines may fail/return unknown;
document honestly. Stale result attempts must not overwrite newer records.

Get/list/steps bounded and validated. Use owner-bound opaque pagination cursors;
cross-owner run IDs and cursors reject. Query completed workflows works only while
same bundle worker exists; respect blocked bundle mismatch. Restoration must not
implicitly import untrusted plugin code. Do not add automatic plugin trust.

Tests: failing first for receipt idempotence/failure and ownership; then real local
service (opt-in script) shared conformance with unchanged fixture workflows, input
wait across full close/reopen and no completed redispatch, unknown interrupted
receipt, denied/retry policy, two owners, changed code guard, CLI failure, lock,
shutdown. Include stable telemetry operation names and no content in telemetry.
No sleep/wait over 60s without returning progress. Record red/green outputs and
actual results in docs/plans/0021-task2-report.md. No production claims.

Include a packaged workflow with its own bundled Zod copy in the registration
regression. Pinned Zod's Symbol.hasInstance is trait-based (not constructor identity):
a parent experiment with a separately Bun-built Zod module verified distinct
constructors still pass `schema instanceof z.ZodType`. Keep the existing parser;
do not invent a structural schema protocol to address an unproven cross-copy bug.

Owned agent conversation persistence remains part of the accepted interface.
Extract/reuse the existing proof bridge through AgentDriver and JsonStore contracts
where appropriate; do not depend on another provider package or a spike. Exercise
synthetic/scripted drivers for saved session IDs, operations, grants/approvals and
lost responses. The current AgentDriver cannot promise generic reattachment;
stored active submissions may become unknown after whole-host loss, never a fresh
submit. Keep task receipt recovery and native session continuity distinct. Parent
will wire actual host authority, so expose only a minimal internal composition
helper if the bridge needs one rather than new public capability contracts.
