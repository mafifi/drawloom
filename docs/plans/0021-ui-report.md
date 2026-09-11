# ADR 0021 UI slice report

Historical parent-authored UI slice of Task 3; uncommitted. Subsequent host wiring,
rendered QA and review corrections are recorded in [Task 3](0021-task3-report.md)
and the [final evidence](../../knowledge/evidence/adr-0021-local-temporal.md).

Added controlled `WorkflowRun` through shared UI: run state, attempts, explicit
cancel, input snippet and unresolved effects separate from engine status. No task
results/output rendered. Added strict desktop presentation schemas, per-project
run ViewModel and Settings section. New HTTP handlers are not implemented yet;
Task 3 host integration owns them. No end-to-end/browser claim.

Tests were observed red before implementation:

- Shared export absent: five SSR tests failed. Correct root invocation requires
  `bun --conditions=svelte test`; plain Bun initially failed resolving the existing
  svelte-only dependency export. Frozen install changed nothing; no dependency fix.
- Nested disclosure regression found two buttons where one was expected; fixed
  with the standard shared Collapsible child snippet.
- ViewModel module absent caused the test import to fail.
- Page refresh regression showed current cursor lost on refresh; fixed by retaining
  the bounded page cursor rather than resetting to latest each poll.

Green checks:

- Shared WorkflowRun: six tests, 17 assertions.
- Desktop orchestration ViewModel: five tests, 17 assertions.
- Shared package build and Svelte check: zero errors/warnings.
- Desktop Svelte check: zero errors/warnings after fixing test fixture literal
  inference and the test fetch mock's required Bun preconnect member.
- UI policy: passed (392 maintained files at that run).

Independent review found two issues. Both gained failing regressions first:
browser run fields inherited unbounded strings/attempts, and an in-flight GET
silently blocked Cancel. The projection now bounds each field. Commands invalidate
the active read before posting, so cancellation does not wait for polling and a
late page cannot undo its result. The focused VM/protocol run now passes seven
tests with 31 assertions. Remaining integration checks below are unchanged.

At this slice's handoff, pending work was: HTTP/real provider integration, owner update guard, step-summary
paging beyond 100 rows, browser interaction/layout/accessibility and runtime
rendered validation. Project navigation invalidates pending reads/responses;
it never POSTs cancellation. Input/cancel requests bind project, installation,
run and request identities. Browser commands do not create workflow starts;
those remain installed-workbench operations with existing authority.
