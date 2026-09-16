# Replaceable capabilities: verification record

This records new checks for [Accepted ADR 0028](../adr/0028-replaceable-learning-context-and-decisions.md).
Implementation and verification are complete. The maintainer authorised acceptance
and commit on 2026-09-16; this is not release qualification or publication.
The delivery branch is `feature/replaceable-capabilities`, based on `main` at `627c3a4`.

## What has been checked

| Area | New evidence | Current limit |
| --- | --- | --- |
| Access decisions | Shared conformance for local and deterministic implementations; separate foreground/background limits, cancellation, queue expiry and noncooperative evaluation tests | No external policy-engine compatibility claim |
| Tool enforcement | Revocation during decisions and evidence writes; second-decision failure recorded as not started; concurrent workflow authority tests | Does not make external facts atomic |
| Knowledge operations | Parent budgets and structured failures across retrieval, assessment and embeddings; deterministic Node runtime checks; real orchestration recovery | No new live-model acceptance |
| Worker authorization | Spawned Node and staged installed-entrypoint tests; mixed load, malformed requests, revocation and uncertain submission recovery; disclosure/configuration corrections passed scoped review | No new operating-system support claim |
| Context assembly | Default and alternative shared conformance; actual synthetic Codex input and history checks, including steering after a completed operation | No new live model acceptance |
| Scoped consent | Atomic migration, real storage restart, equivalent/narrower/broader declarations, manual processing, real desktop settings and assessment revocation checks; admission/invalidation corrections passed scoped review | No automatic data transfer between providers |
| Learning replacement | Shared conformance for the actual local worker and bounded deterministic example; both power the same rendered desktop screens and pass installed-consumer checks | No live-model quality claim |
| Approval presentation | Native application and alternative inbox tests; rendered keyboard, theme and layout checks; lifetime and delayed-response corrections passed scoped review; shared conformance through actual application | Native model interactions were scripted, not live |
| Packed consumers | Portable public exports installed from tarballs and loaded under Node; separately built desktop artifact exercises approvals and default local learning through an installed Node worker | No new operating-system support claim |

## Where the tests live

- [Authorization packages](../../packages/authorization/): portable decision and scheduling tests.
- [Tool authorization](../../packages/tools/local-tools/authorization.test.ts): protected execution and failure outcomes.
- [Desktop knowledge authorization](../../apps/desktop/host/knowledge-authorization.test.ts): host admission and shared scheduling.
- [Worker protocol](../../packages/knowledge/local-knowledge-runtime/worker-authorization.test.ts) and
  [installed runtime](../../packages/knowledge/local-knowledge-runtime/installed-runtime.test.ts): actual process paths.
- [Context integration](../../apps/desktop/host/knowledge-http-preparation.integration.test.ts): request preparation and provider input.
- [Consent](../../apps/desktop/host/learning-consent.test.ts): saved permissions and migration.
- [Approval application](../../apps/desktop/host/approval-application.test.ts) and
  [rendered presentation](../../apps/desktop/tests/approval-presentation-browser.mjs): native authority and desktop interactions.
- [Public replacement examples](../../packages/examples/replacement-examples/) and
  [packed-consumer runner](../../scripts/test-replacement-packages.ts): exported interfaces outside workspace source resolution.

These links identify executable tests. Reading a test is not evidence that it ran;
the final results below must record the executed commands and outcomes.

## Executed checks and outstanding acceptance

Targeted suites have been run as each slice was implemented. The worker's Node
checks reported 25 passes and one explicitly skipped installed-model check. Its
broader scoped Bun run found one overly restrictive provenance check; after fixing
that rule, the affected Git and authorization tests passed. This was a targeted
rerun, not a claim that the whole suite was rerun.

The first rendered approval run used installed Chrome with controlled native
snapshots and responses. It covered light/dark themes at 1280px, a 390px layout,
CSS 200% zoom, reduced motion, touch and keyboard interaction. Actual native
application wiring was tested separately. The matrix was repeated successfully
after the lifetime correction, including Stop feedback and navigation before an
old response settles. A subsequent state-only correction for a delayed Stop on a
superseded request passed its targeted regression and review without changing the
View or rerunning the matrix. The final approval targeted run reported 83 passes;
root and desktop TypeScript checks also passed.

The worker correction added tests for mismatched conversation/destination facts
and failed or cancelled configuration responses after settings were saved. Its
covering Bun run reported 25 passes; three targeted spawned Node checks passed.
Both findings cleared scoped re-review. These are correction results, not a rerun
of every earlier worker check.

The learning integration run passed 110 tests with 798 assertions, followed by four
targeted host tests for unsupported warmup. The separate shared/local ViewModel run
passed 25 tests with 81 assertions. Review identified two local polling races and
two consent admission/invalidation races; their correction results belong below,
not in these earlier passing totals.

The production desktop build passed. The rendered learning matrix passed for both
the default local service and the public deterministic example: search, evidence,
saved preferences without implied consent, explicit scope confirmation, persistence,
failed-save draft preservation, keyboard controls, light/dark themes, 390px width,
CSS 200% zoom and reduced motion. The existing disclosure/recovery/Activity browser
regression also passed against a disposable default-local installation. No browser
JavaScript errors or horizontal overflow were observed. These were installed Chrome
checks on macOS, not a cross-platform accessibility certification.

`bun run test:temporal` initially failed five cases because the workflow bundle's
containment list omitted the new portable authorization contract. Adding that exact
contract (not its providers or a broad directory exception) and rebuilding produced
**6 passes, no skips**. `bun run test:orchestration:learning` then passed **6 real
orchestration recovery tests** and the **12 scripted learning-journey checks**. Those
use real local SQLite and Temporal with scripted assessment/native input; they do
not establish answering quality. Disposable services and browser-host data were
closed and cleaned up by their owning fixtures.

Root `check:types`, architecture, dependency, licence and UI guards passed. The
design check has no errors and retains the existing unused `effortAccent` token
warning. The licence gate reports zero installed JavaScript blockers; its separate
native-artifact and optional-platform review qualifications still apply.

The local polling corrections passed four new regressions and scoped review:
29 ViewModel tests, 93 assertions. Healthy status polls retain action failures, and
older reads cannot replace a completed command's state. No View markup changed.

The final packed proof installed one offline closure of 378 packages. Its separately
built desktop artifact used 63 verified installed public dist modules, not workspace
source aliases. Shared approval conformance exercised default and inbox presentations
through the actual application and synthetic native transport. Default local learning
conformance used the installed Node worker. The covering application approval run
passed 20 tests with 111 assertions. Scoped review passed for both corrections.

The first canonical `bun run check:ci` reached the Bun suite after passing its
earlier stages. It reported **1,375 passes, 8 skips, 1 failure and 1 cleanup error**:
the project navigation/restart test exceeded its default five-second test deadline.
An isolated run with a 20-second diagnostic budget passed in 6.50 seconds. Timing
showed two shutdowns waiting for asynchronously started orchestration preparation,
about 3.2 seconds each; a synthetic unavailable manager removed that wait. The
forced test termination caused the later transport cleanup error. This is not a
passing canonical result; correction and final verification remain pending.

The learning recovery lane was repeated after the consent corrections and passed
again (6 Node recovery tests plus 12 scripted journey checks).

The consent corrections passed 63 tests with 530 assertions after four new failing
regressions. Saving unchanged preferences no longer cancels unrelated work, and
capture admission is invalidated when capture is disabled during its asynchronous
checks. Root and desktop TypeScript checks passed; scoped review found both issues
addressed.

Final review identified and cleared three further issues: completed manual curation
could not be started again from the shared screen; the public replacement example
rejected new-revision deletions and lost deletion replay identity; and it allowed a
historical exact revision to be overwritten. The correction run passed **33 tests,
159 assertions**. Shared conformance verifies immutable revisions and deletion replay
against both services. The navigation fixture now isolates unrelated orchestration
startup and retains all nine original assertions, passing in 235 ms without extending
its timeout. Scoped re-review passed all four corrections.

A new rendered regression proved two distinct manual runs through the actual host,
consent, coordinator and local adapter while automatic curation stayed off. Running,
uncertain, unavailable and paused states stayed protected. The full learning browser
matrix was then repeated successfully for both local and alternative implementations
after the correction. Its disposable hosts and exact temporary directories were
closed and removed. Review also identified a pre-existing cleanup limitation: an
error closing knowledge could prevent later application cleanup. The maintainer
requested that it be resolved before acceptance; the follow-up is recorded below.

The next canonical run passed **1,376 Bun tests, with 8 explicit skips and no
failures**, then exposed two failures in the Node evaluation runner. That runner
still returned the old boolean authorization result. It now validates and forwards
the structured result and operation budget, and its existing TypeScript project
is included in the canonical type check. All five targeted evaluation runner tests
passed after the correction. This intermediate result is not counted as a passing
gate. The strengthened packed-consumer checks
also passed separately after the final intake corrections.

## Final result — 16 September 2026

**`bun run check:ci` passed, exit 0**, including formatting, dependency/licence/UI
and architecture guards, package artifacts, desktop build/check, evaluation and
publishing types, Bun tests, Node tests and installed replacement consumers.

- Bun: **1,376 passed, 8 skipped, 0 failed**, across 250 files.
- Node's reported test suites: **82 passed, 1 skipped, 0 failed**, in addition to
  the scripted shared-conformance checks.
- Packed proof: 378-package offline installation; separately built application
  resolved 63 installed public dist modules. Default local learning and both
  approval presentations passed through the application/worker paths.
- Separate recovery lanes: **6 Temporal tests**, plus **6 learning orchestration
  tests and 12 scripted journey checks**. The learning lane was repeated after
  the final corrections and passed.
- Rendered checks: default and alternative learning screens passed the final
  keyboard/theme/narrow/zoom/reduced-motion matrix. Manual repeat curation passed
  its actual shared-screen regression. Earlier approval checks are described above.

The Bun skips are four live native-review cases, one OS credential round trip, one
opt-in installed evaluation/Temporal case and two mounted-component cases. The
Node skip is installed GGUF model conformance. These are **not** passing acceptance;
the separate browser and recovery checks above have their own stated scopes.

Main remains the `627c3a4` rollback baseline. The maintainer authorised acceptance
and a feature-branch commit after the shutdown follow-up; no push or publication.

## Shutdown follow-up

New failing regressions reproduced history remaining open after a learning close
failure and project retirement returning before pending peers settled. Cleanup now
attempts all ordered steps, awaits peers and newly created runtimes, and reports
collected failures afterwards. Concurrent application close calls share one cleanup
run. Session/MCP cleanup, project resources and history writers retain their order
without allowing one rejection to skip the remaining resources.

The targeted run passed **14 tests and 92 assertions**; focused code review passed.
The full `bun run check:ci` passed again after the shutdown fix: **1,379 Bun tests
passed, 8 skipped, none failed**, plus the Node lane and installed replacement
consumers. The learning recovery lane also passed again: 6 real
orchestration tests and 12 scripted journey checks. No arbitrary shutdown timeout
or forced termination was introduced.

Review-only scratch diffs were removed from the checkout. Durable implementation
tests and this verification record remain; temporary review material is not part
of the commit.

No live Codex call, model download, private consumer run or new model-backed
acceptance was performed for this delivery. Retained model results belong to their
original ADR evidence; they are not fresh verification of these changes. No runtime
artifact, package or website was published.
