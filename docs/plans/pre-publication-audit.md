# Pre-publication architecture audit

Audited at `4afd8fb`. Tracked through `48eceb3` and `16ad5e0`.

Findings keep their original text. Each carries a status line naming the commit
that closed it, or what remains. **Six of the original nine are closed, two are
partly closed, and one is mostly closed. Later F9 remains open; F10's
rendered-test and concrete ViewModel prop gaps are closed.**

Verified by running the checks, not by reading the claims. At each closeout the
commit, statuses and artifacts were checked in the committed tree rather than
taken from a verification record.

Not covered: runtime behaviour of the desktop app, the private workbench
repository, Rust sources under `src-tauri`, and the retained spikes beyond their
boundary rules.

## Current status, 22 September 2026

| ID | Finding | Severity | Status |
| --- | --- | --- | --- |
| F7 | LGPL components in the distributed host runtime | High | Closed at `28c0bf5` — migrated to Node ([ADR 0034](../adr/0034-node-toolchain.md)) |
| F8 | Licence inventory cannot see compiled-in runtimes | Medium | Addressed at `08aee92` — `KnownNodeRuntime`, the upstream runtime bytes and notice, and the staged bundle are verified during `bundle:host`; `check:licenses` remains dependency-graph-only |
| F4 | Composition root resisted decomposition | Medium | Partly closed at `b9b5d15` — four owned application slices were extracted; the remaining root is still large |
| F1b | Domain vocabulary is not in the code | Medium | Partly closed |
| F6 | Loose ends from the documentation rewrite | Low | Mostly closed — two items |
| F1 | Half the memory-to-context chain was missing | High | Closed at `48eceb3` |
| F2 | Safeguards proved only by tests CI never ran | High | Closed at `48eceb3` |
| F3 | No formatter, no linter, no style guidance | Medium | Closed at `16ad5e0` |
| F5 | Ownership inversion the boundary rules cannot catch | Low | Closed at `16ad5e0` |

## Open findings

### F7 — LGPL components in the distributed host runtime (High, decision required)

`apps/desktop/package.json` builds the shipped sidecar with:

```
bun build --compile host/main.ts --outfile src-tauri/binaries/drawloom-host
```

`--compile` embeds the Bun runtime in a binary the desktop application
distributes. ADR 0026 excludes LGPL for components Drawloom distributes or
installs, so this is a release blocker rather than a policy question about Bun as
a development tool.

The governing sentence is already in ADR 0026:

> "This applies to components Drawloom distributes or installs, not to every
> external service or application a user independently authorizes."

`bun run desktop:start` against a user-installed Bun sits on the permitted side of
that line. `--compile` moved the runtime across it. The blocker is a packaging
consequence, not a dependency choice, and is reversible by packaging.

**Scope of the alternative.** Only two files in non-test product source depend on
a Bun API, both for the same reason:

| File | Import |
| --- | --- |
| `packages/evaluation/sqlite-evaluation/src/index.ts:1` | `bun:sqlite` |
| `packages/observability/sqlite-conversation-history/src/index.ts:1` | `bun:sqlite` |

Three packages declare `runtime: "bun"`; everything else is `portable` or
`node`, and `test:node` already proves the portable set runs under Node.

**Recommendation: keep LGPL excluded and move the host runtime.** ADR 0026
already refused a GPL-with-exception case at much higher cost — the MLX embedding
implementation was replaced rather than take the allowance. Admitting LGPL into
the host runtime, the one component every user executes, after refusing it for an
optional accelerator would be inconsistent and would weaken Principle 5 where it
carries the most weight. A narrow allowance is also not a one-time review:
relinking rights for a statically embedded runtime imply a standing packaging
obligation on every release, against a one-time substitution of two imports.

The compliance determination belongs to the maintainer, with counsel if wanted.
This entry records the architectural cost of each option, not a legal opinion.

**Verify before committing to Node:**

- `node:sqlite` maturity on the pinned version. It is experimental on Node 22;
  CI pins 22 in one lane and 24.20.0 in another. `better-sqlite3` (MIT) is the
  fallback, at the cost of a native module.
- Extension loading for `sqlite-vec`. Hybrid retrieval loads it as an extension;
  Node 24 exposes `loadExtension` behind `allowExtension`. Confirm against the
  real index path before migrating.

**Related inventory items, each resolvable without an exception:**

- `javascriptcore-rs` and `javascriptcore-rs-sys` are MIT, and macOS 14 uses the
  system WKWebView rather than a distributed WebKit.
- `r-efi` is `MIT OR Apache-2.0 OR LGPL-2.1-or-later`. **Recorded:** MIT is
  selected for both locked versions (5.3.0, 6.0.0) in `LICENSES/README.md`,
  following the Linux `sqlite-vec` precedent.
- `@img/sharp-libvips-darwin-arm64` is LGPL-3.0-or-later. **The assumption here
  was wrong, and the correction is recorded in `LICENSES/README.md`.** It does
  not reach the tree only through Astro build tooling: `@temporalio/worker`
  depends on `webpack` to bundle workflows, webpack pulls
  `minimizer-webpack-plugin`, and that pulls `sharp`. A `pnpm deploy --prod` of
  `@drawloom/temporal-orchestration` — a shipped sidecar — was verified to
  contain the LGPL library.

  It does not reach the built `.app`, but only because the packaging prune
  removes it as *size* dead weight; that script's list carries no licence
  reason, so the obligation was satisfied by accident and an edit made for size
  reasons would have shipped it. `scripts/check-bundled-licenses.ts` now makes
  the requirement explicit at the artifact, where it is the only thing that can
  be checked. Verified both ways: clean against the staged trees, blocking
  against an unpruned deploy.

### F8 — The licence inventory cannot see compiled-in runtimes (Medium, addressed)

`check:licenses` scans npm and Rust package metadata. The runtime that
`bun build --compile` embeds is not an npm package, so it never enters the scan.
The inventory holds only `@types/bun` and `bun-types`, which are type packages.

The gate therefore reported **0 blockers across 1,778 npm and 431 Rust
dependencies** while the artifact shipped an unreviewed embedded runtime. This is
the same shape as F2: a check that passes because it is not looking.

Switching to Node does not close this. Node embeds V8, OpenSSL, zlib, c-ares and
llhttp, none of which the npm scanner sees either. **Any compiled-in runtime
needs its own inventory step**, and it should exist before release qualification
finishes regardless of how F7 is decided.

**Repair.** Add a release inventory step covering the bundled runtime's own
components, and record it where `check:licenses` results are reported so the
0-blockers line cannot be read as covering more than it does.

**Done, 22 September 2026.** The shipped Node runtime is declared in
`apps/desktop/host/node-runtime.ts#KnownNodeRuntime`, emitted into the inventory
as a bundled native artifact, and mirrored in the policy check's expected list,
so an unrecorded artifact blocks the gate — verified by deleting it. The
determination for Node's aggregate LICENSE, including why its two GPL sections
(ICU4C's `aclocal.m4` and `config.guess`, under the standard Autoconf exception)
do not engage ADR 0026, is in `LICENSES/NODE-RUNTIME.md`. `engines.node` is
asserted against the same manifest, so a version bump that misses it fails.

Two things were found while closing this, and both mattered more than the
bookkeeping:

1. **The notice was not shipping.** `bundle:host` copied the executable and not
   the `LICENSE` beside it, so the bundle carried a distributed runtime with no
   notice at all. `scripts/stage-node-runtime.ts` now copies both and re-derives
   version, architecture and both digests from the files it just wrote;
   `verify-macos-app.mjs` fails the release if the notice is absent or its digest
   differs. The upstream digest is deliberately kept distinct from the signed
   artifact's, because signing rewrites the Mach-O.
2. **A metadata gate cannot see a bundle.** `check:licenses` reasons about the
   dependency graph, which is not the set of files that survives `pnpm deploy`
   and the packaging prune. `scripts/check-bundled-licenses.ts` now assesses the
   licence of every package actually staged, and runs as the last step of
   `bundle:host`. This is what exposed the corrected `sharp` finding below.

### F9 — No macOS runner, so nothing in CI sees the shipped artifact (Medium, open)

Every job in `.github/workflows/` is `ubuntu-latest`. No CI job builds a `.app`,
stages the Node runtime, signs a bundle, or runs
`scripts/verify-macos-app.mjs`. The packaging evidence ADR 0034 relies on —
sidecar closures surviving Tauri's resource copy, the reduced entitlement set,
native modules loading under the hardened runtime, the shipped Node runtime and
its notice — is produced by hand on one machine and by nothing else.

This is F2's shape after F2 was closed: the safeguards are real and the checks
exist, but the thing that would catch a regression does not run. The specific
regression this invites is the one that already happened once — a bundle
mutated after signing, with nothing to notice.

**Partly mitigated, not closed.** The gate is now named and discoverable
(`release:bundle`, `release:sign`, `release:verify`), documented as a manual
step in `apps/desktop/README.md`, and ADR 0034 says plainly that packaging and
signing are not continuous. That makes the gap honest; it does not close it.

**Repair.** A `macos-14` job that runs `release:bundle` and `release:verify` on
an ad-hoc signing identity, which is enough to catch a broken closure, a missing
notice or a stale runtime without holding release credentials in CI.

### F10 — The view layer has no rendered tests (Medium, closed)

`check:ui-policy` passed on 892 files while `PluginViewFrame.svelte` and
`CodexModelSelector.svelte` each did their own `fetch` and schema parsing. The
gate could not see either, because it never looked inside a `.svelte` file for
service access or validation.

**Closed for the rule itself.** Both are now view models with tests, and the
gate is AST-based and targeted: network and service access by name, schema
validation only where the receiver is an imported `*Schema` or `zod` is
imported at all. It fires on real violations and stays silent on `JSON.parse`,
`parseInt` and `Date.parse`, both directions tested. The violations cannot
return unseen.

**Historical stop: nothing rendered a component.** At that point, 0 of 39
`.svelte` files had a rendered test. A view-model test does not exercise mount
order, teardown, or reactivity, and the cases that matter for the plugin frame
are exactly those: mount and unmount, a response arriving after the component
is gone, switching conversations while a request is in flight, and the frame's
close sequence and `loads` counter.

At that stop, the session-level races were covered without a DOM — a mount that
resolved during teardown was still released, and close carried `keepalive` but
not the abort signal — but the DOM-bound half was not.

The repository tests its UI in a real browser against the real host (`test:ui`,
Playwright), and has no jsdom, happy-dom or testing-library. Adding a second
component-rendering stack was rejected immediately before release. The repair
therefore had to reach the plugin frame from the existing Playwright acceptance
with an installed public package and workbench view in the synthetic fixture.

**Current status: the rendered-test gap is closed at `57cb223`, strengthened at
`0be5292`.** The enforced `test:ui` lane mounts the installed plugin view through
the real host, verifies its first load and second-load disconnect, switches
conversations with an open request held past actual iframe removal and outro
cleanup, and asserts exact session close, no late navigation or interaction,
and restoration of the pre-settlement message-listener count. A separate
rendered test rejects an older model response after a conversation switch. This
closes the stated DOM-lifecycle gap; it is not a claim that every View state is
rendered or that every projected presentation field is minimal.

**Historical intermediate close: five of the seven views, the error/loading
duplication, and the form coercion.** `ElicitationForm.svelte`,
`DiscoveryInventory.svelte`,
`GoalControls.svelte`, `PrimaryView.svelte`, and `Sidebar.svelte` now take a
projected `{ presentation, actions }`, each with its own
`*.ts` module (`elicitation-form.ts`, `discovery-inventory.ts`,
`goal-controls.ts`, `primary-view.ts`, `sidebar.ts`) built the same way
`details-pane.ts` builds `DetailsPane.svelte`'s props, and wired from
`+page.svelte` (or, for `ElicitationForm`/`GoalControls`, from
`Conversation.svelte`, which still holds a `DesktopViewModel` — see below).
`GoalControls.svelte` no longer derives goal readiness itself; that
derivation moved into `goalControlsPresentation` in `goal-controls.ts`.
`PrimaryView.svelte` no longer coerces workbench-configuration form values in
its `onsubmit` handler; `configureField` in `primary-view.ts` does the
boolean/number/string coercion and dispatches the command.

The inline-error paragraph's eight occurrences (`ArchivedConversations`,
`ConversationSearch`, `KnowledgeDisclosureView`, `KnowledgeView`,
`LocalKnowledgeSetupView`, `ProjectActivitySummary`, `Sidebar`,
`WorkflowRuns`) are now one shape: `Alert.Root variant="destructive"` with
`Alert.Description`, both already in `packages/ui/ui`. No new primitive was
added. This also fixes `Sidebar.svelte`'s settings-panel error, which was
missing `text-destructive` before — it now gets the same `Alert.Root` as
every other error, so it cannot drift out of sync again. The four
inconsistent loading markups (`Conversation.svelte`'s two, `GoalControls.svelte`,
`Sidebar.svelte`, `ProjectActivitySummary.svelte`) now all use the
`Marker.Root` + `Marker.Icon`/`Spinner` + `Marker.Content` composition that
`Conversation.svelte` already used for its own loading states, again with no
new primitive.

**Historical stop before `fff5210`: `Composer.svelte` and
`Conversation.svelte`.** Both still took the concrete `DesktopViewModel`, as
did `ComposerResources.svelte` and `DiscoveryPicker.svelte`, which
`Composer.svelte` rendered directly with `{vm}`. This was a deliberate stop,
not an oversight. `Conversation.svelte`
alone read or wrote on the order of sixty distinct `vm` members —
attachments, mentions, delegation, tool activity, goal state, elicitations,
scroll bookkeeping, and more — and `Composer.svelte` added the picker,
attachment upload, and model/reviewer selection on top. Narrowing them
properly meant designing a presentation/actions surface for each, deciding
where the nested pieces for `ComposerResources`/`DiscoveryPicker`/
`ElicitationForm`/`GoalControls` get built (probably `+page.svelte`, by the
same pattern used for `PrimaryView`'s `DiscoveryInventory` slice), and
re-threading every call site without a rendered test to catch a mistake.
That is a change of a different order than the other five, on the two
components every conversation actually runs through, and it deserved its own
pass rather than being folded into this one. `ElicitationForm.svelte` and
`GoalControls.svelte` were narrowed anyway, ahead of `Conversation.svelte`
itself: their call sites in `Conversation.svelte` then built
`elicitationFormPresentation(vm, …)`/`goalControlsPresentation(vm)` inline,
since `Conversation.svelte` still had `vm` to build them from.

None of this was a correctness risk at that stop, and closing five of the seven
views, the whole error-paragraph split, and the form coercion did not change
behavior anywhere — `pnpm run test`, `pnpm run desktop:check`, and
`pnpm --filter ./apps/desktop run build` all still passed.

**Current narrowing status: closed at `fff5210`.** `Conversation.svelte` now
takes `ConversationPresentation`/`ConversationActions`, and `Composer.svelte`
takes `ComposerPresentation`/`ComposerActions`. `ComposerResources.svelte` and
`DiscoveryPicker.svelte` receive their own projected presentation/action props;
the route composition builds those projections from `DesktopViewModel`. This
records the implemented ownership boundary without claiming that every field is
the smallest possible projection or that unrelated architecture work is closed.

### F11 — `test:ui` has been broken since the migration (High, closed)

`pnpm run test:ui` fails immediately:

```
ERR_MODULE_NOT_FOUND .../apps/desktop/host/cleanup.js
```

`scripts/test-ui-browser.ts` imports the desktop host's SOURCE, and those
sources use `.js` specifiers that point at `.ts` files. Bun resolved that
mapping automatically, so the lane worked before the migration. Plain Node does
not, and `node scripts/test-ui-browser.ts` cannot load the host at all.

It went unnoticed because `test:ui` is not part of `check:ci` — it is a separate
command, and nothing in the migration ran it. Every other Node lane escapes the
problem for a different reason: `test-packages-node.mjs` imports built `dist/`
output, which has real `.js` files on disk.

This is the whole point of naming the lane explicitly in a verification list. A
green `check:ci` says nothing about it, and the migration's evidence never
covered it.

**Closed.** Took the first repair option: the script's 490-line top-level
`try { ... } finally { ... }` body is now the body of a single
`test("desktop UI acceptance: ...", { timeout: 120_000 }, async () => { ... })`
in `scripts/test-ui-browser.ts` — a mechanical reindent, no logic changed. It
runs under a new dedicated config, `vitest.config.ui.ts`, whose `test.include`
names only that one file, and `test:ui` now runs
`vitest run --config vitest.config.ui.ts` instead of `node
scripts/test-ui-browser.ts`. Vitest already resolves the host's `.js`
specifiers to their `.ts` files the same way it does for the default sweep, so
the host imports load without a compatibility shim.

`vitest.config.ui.ts` does not `mergeConfig` the default `vitest.config.ts`: that
was tried first and rejected, because Vite/Vitest's config merge concatenates
array options such as `test.include` instead of replacing them — a merged
config re-ran the *entire* default sweep in addition to this file. The dedicated
config instead duplicates the small amount of shared setup it needs (the Svelte
plugin and `drawloom-source` resolve conditions) and sets its own `include`
outright. `test:ui` stays the separate, slow Playwright/Chromium lane it always
was — it is still not part of `check:ci`, and CI still runs it as its own job.

Verified: `pnpm run test:ui` exits 0 and launches Chromium against the real
built desktop host (`apps/desktop/build`), exercising the full browser
acceptance matrix — themes, narrow layouts, JSON rendering, chronology,
scrolling, zoom, native-task actions and the scripted browser panel/settings —
in ~11s, ending with the script's own
`"Public UI acceptance: ... passed."` log line. `pnpm run test` (the default
Vitest sweep) still collects exactly 258 test files, matching the count before
this change, confirming the UI lane did not join it. `pnpm run check:ci` still
passes.

The registerHooks-resolver and build-to-`dist` alternatives were not taken:
the first is exactly the bespoke infrastructure ADR 0034 asks to avoid when a
standard tool already does the job, and the second would mean giving the
desktop host a `dist` build step it does not otherwise need, just to satisfy
one script.

### F12 — A4 is not established: nothing interrupts real work (Medium, open)

The release check kills the host and confirms state survives. It does not
interrupt anything, and an earlier version of it claimed otherwise.

That version sent a turn, slept 750ms and killed the host, reporting that a
killed operation "recovers without claiming completion". It had not been
interrupted: the synthetic provider finishes a turn well inside that window,
and polling `/api/state` shows `status: ready` throughout. Adding a barrier
that waits for the host to report an active operation made the check FAIL,
which is how the vacuity was confirmed rather than argued.

Forcing genuine in-flight work needs a pending approval, and an approval
requires an injected driver rather than an HTTP command — so it is not
reachable from a packaging script through the public surface.

**What is covered, and where.** The semantics themselves — no duplicate
execution, and an outcome that cannot be determined reported as unknown rather
than guessed — are proved against a real Temporal server by `test:temporal`:
"killed effect writer leaves durable intent: absent recovery is unknown and
receipt-only recovery never resubmits". That is the correct home for them.

**What remains missing.** A pending approval outstanding at the moment of the
kill; a duplicate-effect counter; an explicit uncertain-outcome assertion at the
application level; and launching the Tauri shell, which the check still never
does. Until those exist, A4 is partially met and the acceptance record should
not be read as establishing it.

### F4 — The composition root resisted decomposition (Medium, partly closed)

`createDesktopApplication` in `apps/desktop/host/application.ts` was a single
function of roughly 1,280 lines — 46 top-level bindings and 44 inner closures —
inside a 1,383-line file. Every neighbour in `apps/desktop/host/` is a 130–330
line module with its own test file.

The repository walkthrough sets the right test: "File size alone is not a defect;
look for repeated rules or two components trying to own the same fact." The
function is where lazy assessment construction, media policy, project state,
history writers, knowledge, orchestration and evaluation wiring all meet.

**Repair.** A seam pass, not a rewrite. The knowledge, orchestration, evaluation
and plugin blocks each have a sibling module they could join.

**Status at `16ad5e0`: open.** The file is now 2,481 lines, but that is not a
like-for-like comparison — `b517ddf` reformatted maintained source with Biome,
expanding previously dense lines. The substantive position is unchanged:
`createDesktopApplication` is still the only top-level function in the file.
`21f43e2` did extract `evaluation-composition.ts`, so the direction is right.

**Current status at `b9b5d15`: partly closed.** History, snapshot projection,
discovery, and package administration now live in their existing-owner modules,
with their handlers spread back into the same top-level application interface.
The extraction kept raw closure calls and lazy initialization intact and reduced
`application.ts` to 2,246 lines. The remaining root still owns deliberately
deferred, higher-coupling paths, so this update records progress rather than
claiming the composition root or the broader architecture is cleared.

### F1b — Domain vocabulary is not in the code (Medium, partly closed)

Drawloom's domain language — fibres, threads, spools, nightloom — is how the
memory-into-knowledge design would explain itself to a reader. Occurrences in
`packages/` and `apps/`, excluding build output, at audit time:

| Term | Count |
| --- | --- |
| `nightloom` | 136 — implemented |
| `thread` | 286 — **none the Drawloom concept**; all Codex `thread/start` RPC, or Node `threadpool` / `threadCpuUsage` |
| `fibre` / `fiber` | 0 |
| `spool` | 0 |
| `distil` / `distill` | 0 — the word ARCHITECTURE uses for the step Nightloom performs |

**Status: partly closed at `48eceb3`.** ADR 0027 states the boundary and
`packages/knowledge/local-knowledge-runtime/RETRIEVAL.md` records the admission
policy, so the deliberate design is no longer invisible. Fibres, threads and
spools remain unwritten. The `thread` collision with Codex sessions is still
unsettled, and settling it stays cheaper now than after those packages exist.

### F6 — Loose ends from the documentation rewrite (Low, two items remain)

**Remaining:**

- `docs/adr/0011-supported-foundation-and-startup-plugins.md` is still
  **Proposed** while `packages/plugins/startup-plugins` ships.
- ADRs 0024–0027 use `- Status:`; 0001–0023 use `- **Status:**`.

**Closed:** the broken link in `knowledge/evidence/adr-0019-observability.md`
(the full tree now passes a relative-link check with zero failures), the missing
`README.md` link to `apps/desktop/README.md`, and the redundant `.gitignore`
entry for `docs/reference/generated/repository-atlas/`.

## Closed findings

### F3 — No formatter, no linter, no style guidance (Medium, closed at `16ad5e0`)

There was no Prettier, ESLint, Biome or dprint configuration anywhere in the
repo, and `CONTRIBUTING.md` did not mention formatting, linting or style once.
Dense and normally spaced code sat within single functions, so "match the
surrounding style" was not actionable advice.

**Closed at `16ad5e0`.** `b517ddf` adopted Biome and reformatted maintained
source as a single mechanical change — the shape recommended, landed before
outside contributions existed to rebase. `biome.json` is committed, `format` and
`check:format` scripts exist, and **`check:format` runs first in `check:ci`**, so
it is enforced rather than available.

### F5 — Ownership inversion the boundary rules cannot catch (Low, closed at `16ad5e0`)

`temporal-orchestration` imported `OrchestrationReadiness` from
`@drawloom/desktop-host` — type-only, and legal under the role model, but the
orchestration capability's readiness vocabulary was defined by the desktop layer.

**Closed at `16ad5e0`** by `21f43e2`, "clarify orchestration ownership and
desktop composition". The import is gone.

### F1 — Half the memory-to-context chain was missing (High, closed at `48eceb3`)

At `4afd8fb`, `@drawloom/context` was imported by exactly one file —
`packages/agent/agent/src/index.ts`, as a schema field on a send request. Nothing
in the knowledge subtree imported it. There was no producer of `CompiledContext`
anywhere. What shipped was agent-pull retrieval through a static
`KNOWLEDGE_RETRIEVAL_GUIDANCE` string with zero test coverage.

The first half of the chain was implemented and well proven: Nightloom's durable
`pending` → `assess-batch` → `release` → `publish` pipeline.

**Closed at `48eceb3`, ADR 0027 Accepted.**

- `@drawloom/knowledge-context` implements a `ContextPreparer` contract, bounded
  to 8 references and 12 KiB, with `knowledge.disclose` rechecked before
  submission and again in a final pass.
- Oversized records degrade to explicit `reference_only` routing rather than
  silent truncation.
- Reference material rides the user-content path. The provider check found Codex
  0.153.4 declares an `untrusted` kind but proved only the wire shape, not the
  model-side treatment; the ADR records the schema SHA-256 and the reproduction
  command. Choosing the unproven-but-flattering channel would have been easier.
- Native history is protected by durable payload correlation in
  `packages/agent/codex-agent/src/reference-display.ts` rather than marker
  stripping, so a user who types the marker keeps their own words.
- A follow-up review found retrieval never abstained on irrelevant queries. That
  closed too: a **0.52 cosine admission floor**
  (`packages/knowledge/local-knowledge-runtime/src/semantic.ts:9`), calibrated on
  an independent 80-pair fixture — 0.173 margin, zero misclassifications —
  preregistered rather than fitted to the frozen corpus, with the recall cost
  published rather than absorbed.

### F2 — Safeguards proved only by tests CI never ran (High, closed at `48eceb3`)

At `4afd8fb`, CI ran `check:ci` and nothing else. `test:temporal` was invoked by
no workflow, and every orchestration recovery test was doubly gated. The sole
executable proof of the stated safeguard "uncertainty is not a retry instruction"
was one skipped test.

**Closed at `48eceb3`.** A `learning-integration` job installs a pinned Temporal
CLI v1.3.0 verified by SHA-256, runs `test:temporal` and `test:temporal:learning`,
and `publish` now requires it — `needs: [check, learning-integration]`. The
safeguard is gated, not merely tested somewhere.

The learning command is now named `test:orchestration:learning` (2026-09-16).
The historical command above records what ran at that commit; the current lane
still tests the orchestration contract using Temporal.

Embedding conformance also reached an enforced lane: the shared suite runs
against the real adapter, real SQLite index and real authorization inside
`check:ci`, with only the GGUF worker variant left opt-in. Its first run failed
and exposed a defect in the shared fixture itself.

## What held up

Verified by running the checks. These look like redundancies and are
load-bearing; do not simplify them without reading the tests that pin them.

- **Boundaries are machine-derived.** Dependency rules are generated from each
  package's own `drawloom.role` field, not a hand-kept list, so a new package is
  governed the moment it declares a role. Zero violations across 2,124 modules
  and 6,462 dependencies.
- **Replaceability is demonstrated.** `agentConformance` runs against both the
  synthetic driver and the Codex fixture under Node. Tools, knowledge, plugins,
  host, conversation history and evaluation each run their contract's shared
  suite against a real provider.
- **The tool authorization path is careful.** `local-tools` re-checks
  authorization after the evidence write, closing the window where a grant is
  revoked mid-flight. Denial is checked before `unknown_tool`, so an unauthorized
  caller cannot probe which tools exist. A failed evidence write fails the call
  closed. The conformance suite mandates this by revoking the binding during the
  `started` write and asserting denial.
- **Knowledge authorization is standards-shaped.** AuthZen request shape rather
  than a bespoke policy language, fail-closed by documented default, and
  "authorization precedes existence, duplicate and conflict checks" — the same
  existence-oracle discipline as the tool path, reached independently.
- **Nightloom is durable, not scripted.** Four Temporal tasks with assessment
  receipts, daily budgets and serial dispatch, tested at the hard cases:
  uncertain assessment reconciled without double submission, a conflicting
  receipt writer unable to promote an unpersisted model outcome, evidence
  references refused outside their bounded package.
- **Publication hygiene is clean.** No tracked build output, `node_modules`,
  `dist` or `target`. No secrets in tracked files.

## Limits the delivery states rather than hides

Carried here so a follow-up does not rediscover them as findings:

- Retrieval precision at scale is unmeasured; the baseline corpus is 24 records.
- Sufficiency abstention remains zero by design — the admission floor filters
  wholly unrelated material, not related-but-incomplete material.
- Lexical admission is independent of the cosine floor, so shared content terms
  may still admit irrelevant lexical records.
- Model-enabled acceptance is Apple Silicon and Metal only.
- The 0.52 floor is a policy for the current Qwen3-Embedding-0.6B Q8_0 GGUF
  model, not a portable score contract. A replacement model requires independent
  calibration.
- Release qualification is not finished. F9 remains open by the approved manual-gate choice, and A4 is still partial. Developer ID signing and notarisation are done, and installation on the clean Mac is partly done; the [notarised release record](../../knowledge/evidence/adr-0034-notarised-release.md) lists what remains. F8 is addressed by the artifact-specific `bundle:host` gate; `check:licenses` alone does not inventory bundled bytes.
