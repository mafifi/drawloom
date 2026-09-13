---
type: experiment
id: adr-0025-supported-evaluation
title: ADR 0025 supported evaluation implementation
status: draft
created: 2026-09-13
updated: 2026-09-13
---

# Scope and status

Supported delivery under [Accepted ADR 0025](../../docs/adr/0025-evaluation-boundaries-and-comparative-proof.md).
Implementation and verification are complete and were accepted by the maintainer
on 2026-09-13, with commit authorized. This record separates supported checks from the earlier
retained comparisons and consumer proofs. Technical delivery does not establish
wider judgement quality or production usefulness.

## Contract and local storage

The portable `@drawloom/evaluation` contract and Bun SQLite provider are implemented.
The same exported storage conformance runs against SQLite and an independently
implemented deterministic test store. Scope, immutable definitions/run settings,
opaque orchestration binding, duplicate/conflicting writes, partial findings,
pagination, feedback and absent usage are covered.

Provider-specific tests exercise real SQLite failure injection, private file
permissions, WAL, unsupported/corrupt database preservation and bounded corruption
errors. Review identified and corrected missing unfiltered-page indexes, missing
trial bounds and unnecessary full-definition hydration on point operations.

Fresh post-fix checks on 2026-09-13:

```text
bun test packages/evaluation/evaluation/contract.test.ts \
  packages/evaluation/evaluation/conformance.test.ts \
  packages/evaluation/sqlite-evaluation/conformance.test.ts \
  packages/evaluation/sqlite-evaluation/sqlite.test.ts
13 pass, 0 fail, 60 expect calls
```

Both package TypeScript builds passed. The pre-fix complete root type gate,
dependency-policy gate (30 workspaces) and package artifact checks (29 packages)
also passed; these are not final-head delivery checks. A scoped independent
re-review found the three fixes addressed without new actionable breakage.

Query-plan tests check filtered and unfiltered first/continuation pages without
temporary sorting. A 200-case corruption sentinel verifies that summaries and a
selected checkpoint write do not hydrate unrelated payloads, while explicit full
definition reading still reports corruption. These are bounded-read correctness
checks, not a production throughput benchmark.

## Host integration prework

The trusted loader supplies evaluation only to declared consumers. A claimed
inventory capability without the actual composer cannot satisfy a requirement.
Workflow preparation precedes evaluation preparation; saved reads can work
without a running engine. Cleanup stops workflow dispatch before closing result
storage. This is implemented through the existing backend path, not browser RPC.

Fresh targeted checks on 2026-09-13:

```text
bun test apps/desktop/host/plugin-packages.test.ts \
  apps/desktop/host/plugin-backend.test.ts \
  apps/desktop/host/evaluation-host.test.ts
32 pass, 0 fail, 163 expect calls
```

New declaration/ordering tests failed before their implementation. A real desktop
test loads a synthetic installed backend, reads scoped saved definitions, closes
the application, and sees retained definitions on reopening. No MCP tool calls
occur. The host composition test verifies installation/project isolation, missing
engine start rejection and closed-store reads. The desktop-host contract builds;
dependency policy passes for 32 workspaces. These checks do not establish
workflow execution, model judgement or browser interaction completion.

Additional host composition checks now cover explicit model configuration and
no session/data creation merely on configuration. The actual Codex adapter with
scripted transport assesses the same invocation ID in three distinct installed
owners; all three start and archive separate native sessions, with no native
resume or cross-owner reads. Native read-only/on-request/user-review settings
are asserted at the wire boundary. These are simulated responses, not live
judgement or model-quality evidence. The four focused host suites (including
`evaluation-assessment.test.ts`) pass 35 tests / 185 assertions.

## Execution review checkpoint

The first supported execution slice passed its focused checks, including a real
local Temporal run and a network-denied Node assessment. Independent review then
found gaps that those checks did not establish: native signal attachment before
submission, settlement of active assessments after cancellation, and preservation
of uncertain effects. The real Temporal test used a direct assessment stub, not
the Braintrust/native-judge composition. It therefore did not prove that path.

Review also identified pending unexpected native requests, scorer responses that
passed invocation validation but exceeded checkpoint constraints, lost-start
visibility, and finalization exceeding the bounded detail view. Two scoped fix
rounds corrected these, including malformed-provider uncertainty and a concurrent
start-attempt timestamp race found on re-review. The final scoped re-review found
all findings addressed without new blocking issues. Affected checks passed
(33 tests / 94 assertions) after both exact regressions were observed failing.
The earlier broader fix run passed 55 tests / 190 assertions, the Node
network-denied check and the real local Temporal check. Repository type checking
also passed. This establishes the tested execution behavior, not live judgement
quality or completed installed-consumer delivery.

## Presentation review checkpoint

The first shared presentation slice passed 48 focused tests (234 assertions),
package builds and Svelte/type checks. Its installed synthetic test connected
the real store/composer and authority-wrapped handlers through standard MCP Apps,
using an in-memory orchestration implementation. It is not a real installed
Temporal/browser walkthrough.

Independent review then reproduced navigation races, an unstable retry identity,
and missing explanatory evidence/target usage in detail views. These findings
were corrected in two scoped rounds, including setup refresh and same-view
recovery of drafts and unresolved request identities. Final scoped re-review
found no new blocking issue; four affected tests passed (12 assertions). The
implementer aggregate passed 46 tests (163 assertions), and root's complete type
check passed. These findings were resolved before consumer integration; the
initial passing tests alone were not treated as completion.

The full architecture check passes after moving
host-only test code out of the portable package and review snapshots outside
the source checkout. No portability rule was relaxed for those fixtures.

## Local verification environment

Executable checks on 2026-09-13: Node v24.20.0, Bun 1.2.23, Temporal CLI 1.3.0
(development Server 1.27.1, UI 2.36.0), FFmpeg 8.1.2. These are the tested local
tools, not distributed dependencies or a claim of other-platform verification.

## Installed public knowledge consumer

The independently packaged `@drawloom/knowledge-evaluation` uses the supported
composer, scoped SQLite results, standard MCP Apps and shared evaluation view.
Its seven fixed saved-output definitions cover 122 case instances and 222
scorer invocations, with no target or model calls. Source fixtures retain the
exact recorded bytes from the public knowledge evaluation. Current MLX retrieval,
historical CPU answers and controlled synthetic regressions remain labelled
separately. Chain checks measure retained top-k evidence coverage, not fresh
knowledge-store traversal or new answer quality.

The installed deterministic test runs all cases from a packed artifact extracted
outside the checkout, checks source hashes, saves feedback, reopens storage and
tests another project cannot see its results. A separate real local Temporal
test runs 24 MLX cases / 72 scorers and reopens the manager and package: the same
start reconciles without further scorer calls, and feedback remains available.
Consumer checks passed 8 tests with one opt-in skip (129 assertions); the
separate Temporal check passed (80 assertions). Scoped review verified fixture
hashes and Node v24.20.0 artifact imports, with no important finding. The minor
definition-pagination continuation defect was subsequently corrected.

### Actual desktop and browser

The packed package was installed outside the checkout in an isolated real
desktop host using its default local Temporal, SQLite and Braintrust composition.
Browser verification exposed two integration gaps missed by isolated tests:
Svelte retained a stable presentation object after asynchronous notifications,
and host grant refresh assumed every workbench had an optional controller.
Both have regression tests and fixes. Controllerless evaluation can perform
pure work; it contributes no tool grants. The new actual-application regression
also attempts a protected tool and verifies denial with zero handler calls.
Earlier failed run receipts were retained, not silently retried or cleared.

Edge 153.0.4234.32 passed the installed walkthrough: run saved MLX checks,
inspect case findings, save attributed feedback, compare a deliberate chain
omission (0 versus baseline 1), and use the shared controls in light/dark modes
at 1440×1000 and 390×844. Keyboard navigation reached the next button, the
narrow frame had no horizontal overflow, all 43 recorded MCP App requests
returned 200, and no browser error was observed. Progress was explicitly
refreshed using the current controls; this is not evidence of automatic polling.
After a whole-host restart, the same result identity and feedback were readable
without starting another evaluation.

The separate installed real-Temporal check was rerun on the corrected public
code: one test passed with 84 assertions in 12.92 seconds, including saved
feedback and reconciliation without repeated scorer calls.

Retained public artifacts: [walkthrough measurements](assets/adr-0025-knowledge/proof.json),
[light](assets/adr-0025-knowledge/light.png),
[dark](assets/adr-0025-knowledge/dark.png),
[narrow](assets/adr-0025-knowledge/narrow.png), and
[restart](assets/adr-0025-knowledge/restart.png).
The repeatable mounted-browser regression is explicitly opt-in; normal CI
requires neither a browser installation nor a browser download.

## Supported live native judging

The supported desktop assessment composition, Braintrust single-assessment
provider, SQLite checkpoints and real local Temporal ran two saved public
synthetic passages. Terra was explicitly configured at low effort. The faithful
revision received 1; the contradictory guarantee received 0, with relevant
explanations. No target ran. Native transport acknowledged two starts and two
archives of the exact owned sessions. There was no repeated model submission.

[Sanitised measurements](assets/adr-0025-knowledge/supported-native-judge.json)
record 8.220 seconds including runtime startup, overlapping scorer durations
5.656 / 5.816 seconds, and provider-reported usage. The tiny inputs still incurred
23,356 / 19,031 input tokens, including 12,032 cached tokens each. These are
native-session costs, not just the passage lengths. Cached tokens are a subset,
not an additional total. Actual model identity and monetary cost were not
reported. This establishes the supported integration and obvious distinction,
not broad judge calibration or that model judging earns its cost.
After closing the runtime, reopening the supported scoped store/composer with
no orchestration and no configured judge returned the exact same two findings
and usage records. Readiness correctly remained unavailable for new starts;
cached reads made no model call.

## Delivery verification

The public canonical `bun run check:ci` passed after the host/browser corrections:
963 Bun tests passed, nine opt-in tests skipped, no failures; package/app builds,
Node checks, dependency policy (34 workspaces) and UI policy (522 maintained source
files) passed. This includes the controllerless actual-host regression. Browser
and live native judging above were run separately from canonical CI.

This latest gate also includes the explicit execution `operationId` carried
through the evaluation context and individual assessment provider. It is distinct
from the evaluation result's run identity and supplies existing tool provenance,
not a permission grant. A contrasting public tool-using target verifies it across
the provider's linked cancellation signal. No private identity-map adapter is
required. The final Bun portion ran 972 tests across 187 files in 100.09 seconds.

The private canonical gate also passed: 160 tests, no failures, 928 assertions,
78.29 seconds for its final Bun suite, with frozen install, dependency checks, TypeScript, Svelte and
MCP App build. Its exact-source installed-package check completed in 16.23 seconds
using real local FFmpeg and Temporal. It compared distinct saved good/poor outputs,
retained feedback across restart, and verified denied execution without generation
or acceptance. The public/private boundary is unchanged: private criteria,
fixtures and detailed receipts stay in the private repository.

The installed cancellation case reported uncertainty before eventual child cleanup;
it did not claim synchronous cancellation settlement. Child CPU and peak memory
remain unknown in the portable result, with a separately timed decode qualified
as one process rather than aggregate resource measurement. Read-only private
browser inspection passed light/dark, narrow layout, keyboard focus and reduced
motion. That is not a live UI cancellation test.

The single broad final integration review identified a rendering-key collision
for contract-valid scorer revisions and repeated evidence identities. A mounted
regression reproduced the failure. Complete scorer tuple keys and unkeyed evidence
lists corrected it without narrowing the contract. The complete opt-in mounted
file passed two tests / 14 assertions using the existing browser installation.
The scoped final re-review found no remaining actionable finding. Final package
artifacts were rebuilt and both canonical gates passed afterward.

The supplemental SSR check requires the existing Svelte export condition:
`bun --conditions=svelte test packages/ui/ui/tests/evaluation-workbench.test.js`
passed six tests / 29 assertions. Running without that condition cannot resolve
the nested Svelte-only dependency; no dependency replacement was necessary.
The new mounted fixture also needed an explicit finding-presence assertion to
pass strict TypeScript; that correction precedes the final canonical results.

No live evaluation/judging calls were made for storage or scripted host checks.
Supported live judging above is the explicitly labelled exception, with
exact-owned session cleanup. No commit, push or publication was performed.
