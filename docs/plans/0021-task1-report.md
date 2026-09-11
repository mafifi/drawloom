# Task 1 report: orchestration contracts and metadata

Date: 2026-09-11

Scope: Task 1 of [the local Temporal implementation plan](0021-local-temporal.md).
All work remains in the existing public checkout and is uncommitted. This slice
adds portable contracts and metadata only; it adds no Temporal dependency,
provider, worker, service, host lifecycle or desktop runtime wiring.

## Result

- `@drawloom/orchestration` now validates portable workflow-module `Registry`
  exports without executing workflow code. Definition records and arrays are
  shallow snapshots; runtime input is not frozen.
- Workflow and task identities, Zod schemas, exact fields and duplicate
  `(id, version)` identities are checked. Workflow and task identity namespaces
  remain separate, preserving the existing catalogue workflow/task pair.
- Tasks may declare a validated `startToCloseTimeoutMs` from 1 millisecond through
  24 hours. Existing task definitions retain a 30-second default through
  `taskExecutionLimits`.
- Typed backend handlers use `registerTaskHandler`. `matchTaskHandlers` requires
  one exact handler per module task and makes module schemas and limits
  authoritative. Inputs, outputs and completed recovery values cross the existing
  JSON/schema boundary.
- The optional reconciliation hook returns only `completed`, `retryable` or
  `unknown`. It is documented as receipt inspection, never effect submission;
  `TaskContext` is unchanged.
- Enhanced plugin metadata accepts a package-relative prebuilt
  `workflows.entrypoint`. Optional requirements accept only the existing
  `orchestration` capability in addition to tool/skill requirements.
- `PluginBackend` may return registered task handlers. Backend dependency reports
  can describe optional orchestration presence. Desktop-host readiness is a
  separate strict callback/report and does not expand `Orchestrator`.

## Test-first evidence

The following focused tests were written and observed failing before their
production changes:

| Red command | Expected failure observed |
| --- | --- |
| `bun test packages/orchestration/orchestration/contract.test.ts --test-name-pattern 'workflow module definitions'` | `defineWorkflowModule` was `undefined` |
| `bun test packages/orchestration/orchestration/contract.test.ts --test-name-pattern 'task handlers must\|matched task handlers'` | `matchTaskHandlers` and `registerTaskHandler` were absent |
| `bun test packages/plugins/plugins/package.test.ts --test-name-pattern 'optional dependencies\|workflow modules'` | optional orchestration and `workflows.entrypoint` both parsed as invalid |
| `bun test packages/desktop/desktop-host/contract.test.ts --test-name-pattern 'orchestration readiness'` | `OrchestrationReadinessSchema` was `undefined` |
| `bun test packages/orchestration/orchestration/contract.test.ts --test-name-pattern 'workflow module definitions'` after the first minimal registry implementation | an unknown task field was accepted, proving strict-field validation was still missing |

Final focused green run:

```text
bun test packages/orchestration/orchestration/contract.test.ts \
  packages/plugins/plugins/package.test.ts \
  packages/plugins/local-plugin-packages/inspection.test.ts \
  packages/desktop/desktop-host/contract.test.ts

18 pass, 0 fail, 90 expect() calls
```

The four affected package TypeScript builds passed, followed by the repository
test/source type check:

```text
bunx --no-install tsc -p packages/orchestration/orchestration/tsconfig.json
bunx --no-install tsc -p packages/plugins/plugins/tsconfig.json
bunx --no-install tsc -p packages/plugins/local-plugin-packages/tsconfig.json
bunx --no-install tsc -p packages/desktop/desktop-host/tsconfig.json
bunx --no-install tsc --noEmit -p tsconfig.json
```

`git diff --check` passed for the Task 1 paths. A source scan found no Temporal,
Node.js, Bun or process imports/usages in the portable orchestration package.
The parent task owns the final canonical repository gate.

## Changed files

- `packages/orchestration/orchestration/src/index.ts`
- `packages/orchestration/orchestration/contract.test.ts`
- `packages/plugins/plugins/src/package.ts`
- `packages/plugins/plugins/package.test.ts`
- `packages/plugins/local-plugin-packages/inspection.test.ts`
- `packages/desktop/desktop-host/src/index.ts`
- `packages/desktop/desktop-host/contract.test.ts`
- `docs/design/orchestration-contract.md`
- `docs/plans/0021-task1-report.md`

No package manifest or lockfile was changed.

## Follow-up concerns for provider/host work

- Package inspection validates only the workflow entrypoint's package-relative
  syntax and does not import it. The host loader must realpath/check the declared
  file, import the prebuilt module in its trusted phase, and pass the default
  export through `parseWorkflowModule` before backend startup.
- The host must call `matchTaskHandlers` before attaching a worker. Type
  compatibility at backend compile time is not a substitute for exact runtime
  identity matching.
- The host must parse readiness callback results with
  `OrchestrationReadinessSchema`; dependency presence is not service readiness.
- Actual timeout mapping, recovery receipt evidence and restart behavior remain
  provider conformance work under Tasks 2 and 3.
