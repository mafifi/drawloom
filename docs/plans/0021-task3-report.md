# Task 3 report: desktop orchestration integration

Historical implementation-stage report. ADR 0021 was subsequently accepted on
2026-09-11; see the [final evidence](../../knowledge/evidence/adr-0021-local-temporal.md).

Date: 2026-09-11. Scope: [Task 3 brief](0021-task3-brief.md) under
[Proposed ADR 0021](../adr/0021-local-temporal-orchestration.md).
Public checkout only; no provider/private edits, subagents or commits.

## Result

The desktop composition now lazily creates the supported local manager, prepares
trusted installed workflow modules, supplies fixed project/installation
orchestrators, and attaches wrapped task handlers through the existing loader.
Ordinary startup without installed workflows or saved owners does not load the
provider SDK or start a service. The existing optional/required dependency rules,
standard MCP contributions and backend editing behavior are preserved.

Trusted startup options are `orchestration.temporalPath` and
`orchestration.nodePath`; `main.ts` maps `DRAWLOOM_TEMPORAL_PATH` and
`DRAWLOOM_NODE_PATH`. An optional composition-owned manager factory supports
controlled host integration tests, not browser or package configuration.
The provider's [README](../../packages/orchestration/temporal-orchestration/README.md)
owns the executable baseline and local development-server limitations.

Configuration changes and scoped starts share a per-installation queue. A started
run is visible to the unfinished-work check before configuration can change;
successful changes block subsequent starts from old settings until restart.
Checks use manager ownership records, including unseen projects. Restoration
activates trusted handlers for every saved project, not only the selection.
Unavailable project/package owners remain visible, changed-bundle preparation
remains blocked, and failed restoration reports safe readiness without disabling
ordinary app startup. Quit closes the manager before plugin handlers/connections;
it does not call workflow cancellation. Repeated manager close shares one drain.

## Authority and evidence

`workflow-authority.ts` supplies installation/project/run/step/attempt provenance
only during a dispatched handler. `workflow-tools.ts` plugs that provenance into
the existing gateway, policy and evidence path; it is not a second gateway.
Tasks use `TaskContext.runId` as their tool binding's operation ID. Knowing a run
ID outside the live dispatch does not grant authority. A cancelled task cannot
authorize another gateway invocation even if it supplies a fresh signal.

Current grants are refreshed before a task and before every gateway call. The
task waits for its project's actual loader/controller registration; navigation
never changes its owner. Until a narrower task/workbench association exists,
every registered workbench owned by the installation must grant the tool. A
missing controller/grant denies access. No automatic grants are added.

Recovery handlers use the same owner/grant checks and may invoke existing status
or recovery tools. The trusted recovery contract—not tool-name heuristics—requires
receipt inspection/reconciliation without resubmitting effects. No direct private
storage access or additional recovery capability was invented.

`createDesktopEvidence` persists records in the project runtime store under
`tool-evidence:workflow:<sha256-of-owner/run/step/attempt>`. The bounded key avoids
filesystem component limits while preserving the identity tuple. Correlation uses
the workflow run. These records do not create conversations or history entries;
native agent authority, review, grants and transcript ownership are unchanged.

## HTTP and presentation

The existing authenticated same-origin server now implements owners, runs,
steps and cancel/respond routes from the internal protocol. Command bodies are
stream-bounded to 64 KiB before parsing. Run commands serialize per owner/run,
separately from long operator/task execution. Scope and page bounds are validated;
provider outputs, step results and raw failures are removed before presentation.
Host-authored failure messages distinguish unconfirmed commands from accepted
commands whose refreshed state cannot be read. Input errors leave the wait open.

Settings reuses the supplied `WorkflowRun` component. The ViewModel retains one
bounded run page and one bounded selected step page; polling refreshes those
pages. Navigation and commands invalidate late reads. Page, owner, input and cancel
pending indicators belong to their actual action. Cancellation hides stale input
controls. No new drawer, browser capability or MCP App protocol was added.

## Changed files

New or completed host files:

- `apps/desktop/host/orchestration-host.ts` and `.test.ts`
- `apps/desktop/host/orchestration-presentation.ts` and `.test.ts`
- `apps/desktop/host/orchestration-http.ts` and `.test.ts`
- `apps/desktop/host/orchestration-application.test.ts`
- `apps/desktop/host/workflow-authority.ts` (existing handoff tests retained)
- `apps/desktop/host/workflow-tools.ts` and `.test.ts`
- Composition wiring in `application.ts`, `server.ts`, and `main.ts`

Presentation changes:

- `apps/desktop/src/lib/orchestration-view-model.svelte.ts` and its test
- `apps/desktop/src/lib/WorkflowRuns.svelte`
- `apps/desktop/tests/orchestration-browser.mjs`

The parent's supplied `plugin-backend.*`, `plugin-packages.*`, desktop dependency,
`PrimaryView.svelte`, orchestration protocol, and shared WorkflowRun component were
retained and exercised. No shared component change was necessary for step paging.
The scoped review patch includes these handed-off integration changes as well as
this report; it excludes provider/contracts/private work.

## Verification

Parent review corrections after this slice: navigation aborts GET reads, not
already-dispatched commands; per-project grant refreshes are serialized and
published as a complete group; failure revokes the group without poisoning later
refreshes. Reverting installation settings clears the restart latch. Shared run
rows show logical step names with full identity retained as a tooltip. Updated
final verification belongs in the linked ADR 0021 evidence record.

New failing-first checks observed missing application/HTTP wiring, missing scoped
tool support and step browsing, the start/configuration race, invisible offline
owners, restoration failure escaping startup, duplicate close, lost input-error
feedback, incorrectly attributed pending states, and task cancellation permitting
a fresh invocation. Each was followed by the focused green check. Reopen coverage
was then expanded through the installed application path.

Final focused command:

```sh
bun test apps/desktop/host/orchestration-host.test.ts \
  apps/desktop/host/orchestration-presentation.test.ts \
  apps/desktop/host/orchestration-application.test.ts \
  apps/desktop/host/orchestration-http.test.ts \
  apps/desktop/host/workflow-authority.test.ts \
  apps/desktop/host/workflow-tools.test.ts \
  apps/desktop/host/plugin-backend.test.ts \
  apps/desktop/host/plugin-packages.test.ts \
  apps/desktop/src/lib/orchestration-protocol.test.ts \
  apps/desktop/src/lib/orchestration-view-model.test.ts
```

Result: **46 pass, 0 fail, 234 assertions**. The installed application test loads
an unrelated public document package from a disposable directory outside the
checkout, connects a real controlled MCP HTTP endpoint, tests grant denial and
allowance, navigation and scoped evidence, configuration blocking, close ordering,
and restoration of both project handlers. Its Temporal manager is controlled;
this is host integration evidence, not another live Temporal conformance run.

Additional checks:

- `bun --conditions=svelte test packages/ui/ui/tests/workflow-run.test.js`:
  **6 pass, 0 fail, 17 assertions**. An initial plain `bun test` invocation failed
  resolving the Svelte-only `runed` export; the canonical Svelte condition fixes
  the invocation without changing dependencies.
- `bunx --no-install tsc --noEmit -p tsconfig.json`: passed.
- `bun run --cwd apps/desktop check`: **0 errors, 0 warnings**.
- `bun run check:ui-policy`: passed, 416 maintained source files.
- `bun run --cwd apps/desktop build`: passed; existing large-chunk warning,
  final main client chunk 678.89 kB / 179.40 kB gzip.
- `bun install --frozen-lockfile`: passed, no dependency changes.
- Scoped `git diff --check`: passed.

## Rendered QA

The frontend-testing-debugging skill used regular Playwright because the Browser
plugin was not available. Flow: authenticated disposable desktop → Settings →
Local workflows → select owner → browse/replace step pages → rejected typed input
→ cancel run → stale input controls disappear.

Chrome headless, 1280×950 light and 390×950 dark, at
`http://127.0.0.1:57640` during the final run. Page identity and meaningful render,
absence of framework overlays, page/console health, no document-width overflow,
exact command owner/run scope, and interactions passed. The deliberate input
rejection's HTTP 400 was expected. The disposable host was stopped afterwards.
No browser dependencies were installed.

Screenshots, inspected visually:

- `/tmp/drawloom-task3-ui/workflow-1280.png`
- `/tmp/drawloom-task3-ui/workflow-390.png`

The browser test uses controlled HTTP presentation responses, not a real workflow
service or private workbench. Parent-owned live installed-workbench/browser and
both repositories' canonical acceptance gates remain separate.

## Limits and handoff

- [Task 2](0021-task2-report.md) owns real Temporal/provider recovery evidence.
  This slice did not rerun that service suite or perform paid/model operations.
- Compiled Tauri/Bun executable packaging of the provider's Node sidecar/resources
  is not exercised. Source Bun desktop integration is wired; distribution resource
  placement needs explicit testing before claiming bundled-desktop support.
- No generic workflow-to-native-agent session reattachment was introduced.
- Multi-workbench grant intersection is intentionally conservative and can require
  granting the same tool in multiple workbenches. A narrower association requires
  a separately approved contract, not an inferred task name.
- `check:ci`, independent review and cross-repository acceptance remain parent
  responsibilities. ADR 0021 remains Proposed.
