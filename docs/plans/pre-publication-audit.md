# Pre-publication architecture audit

Audited at `4afd8fb`. Closed out at `48eceb3`.

Findings are kept as written at the time of the audit. Each carries a closeout
note saying what resolved it, or that it remains open. Three of seven are closed.

Verified by running the checks, not by reading the claims: `depcruise` across
2,124 modules, the full Bun suite, `check:licenses`, `check-ui-policy`,
`check-dependency-policy`, a relative-link check across 227 markdown files, and a
credential pattern scan over all tracked non-binary files. At closeout,
`bun run check:ci` was re-run independently (exit code 0), and the commit, ADR
status, CI lane, admission floor and calibration fixture were each checked in the
committed tree rather than taken from the verification record.

Not covered: runtime behaviour of the desktop app, the private workbench
repository, Rust sources under `src-tauri`, and the retained spikes beyond their
boundary rules.

## Open findings

These are the items a follow-up should act on. F3 is the only one that becomes
more expensive with time.

### F3 — No formatter, no linter, and no style guidance (Medium, open)

There is no Prettier, ESLint, Biome or dprint configuration anywhere in the repo,
and `CONTRIBUTING.md` does not mention formatting, linting or style once.
`.editorconfig` sets indentation and little else.

Lines over 120 characters in tracked product source at audit time:

| Lines | File |
| --- | --- |
| 205 | `packages/knowledge/sqlite-knowledge/src/index.ts` |
| 143 | `apps/desktop/src/lib/view-model.svelte.ts` |
| 128 | `packages/evaluation/sqlite-evaluation/src/index.ts` |
| 126 | `apps/desktop/host/application.ts` |

The effect is visible inside single files. `application.ts` holds
`options.evaluation?.model!==undefined?create():evaluationAssessment??=create();`
a few lines from code set with normal spacing. "Match the surrounding style" is
not actionable advice when the surrounding style varies within a function.

**Repair.** Adopt one formatter, commit the reformat as a single mechanical
change, and add `check:format` to `check:ci`.

**Closeout at 48eceb3: still open, and more expensive.** The learning-journey
delivery added 109 changed files and several thousand lines of new source, all
matched by hand. Every commit made before this lands enlarges the eventual
reformat.

### F4 — The composition root resisted decomposition (Medium, open)

`createDesktopApplication` in `apps/desktop/host/application.ts` was a single
function of roughly 1,280 lines — 46 top-level bindings and 44 inner closures —
inside a 1,383-line file. Every neighbour in `apps/desktop/host/` is a 130–330
line module with its own test file: `knowledge-host`, `orchestration-host`,
`plugin-packages`, `plugin-oauth`, `history-coordinator`, `telemetry`.

The repository walkthrough sets the right test for this: "File size alone is not
a defect; look for repeated rules or two components trying to own the same fact."
The function is where lazy assessment construction, media policy, project state,
history writers, knowledge, orchestration and evaluation wiring all meet.

**Repair.** A seam pass, not a rewrite. The knowledge, orchestration, evaluation
and plugin blocks each have a sibling module they could join.

**Closeout at 48eceb3: still open, and larger — 1,383 to 1,497 lines.** Every new
module the delivery introduced (`knowledge-activity`, `knowledge-capture`,
`knowledge-preparation`) is separately tested, so the pattern held everywhere
except the composition root itself.

### F5 — One ownership inversion the boundary rules cannot catch (Low, open)

`packages/orchestration/temporal-orchestration/src/index.ts:11` imports
`OrchestrationReadiness` from `@drawloom/desktop-host`. It is a type-only import,
so there is no runtime coupling, and dependency-cruiser permits it —
`desktop-host` is declared a contract, and provider to contract is legal. But the
orchestration capability's readiness vocabulary is defined by the desktop layer,
which is the inverse of Principle 10.

This is the only instance found across 6,462 dependencies, which says the model
is working.

**Repair.** Move the schema into `@drawloom/orchestration` and re-export it from
`desktop-host`.

**Closeout at 48eceb3: still open.**

### F6 — Loose ends from the documentation rewrite (Low, open)

- `docs/adr/0011-supported-foundation-and-startup-plugins.md` is still
  **Proposed** while `packages/plugins/startup-plugins` ships.
- ADRs 0024–0026 use `- Status:`; 0001–0023 use `- **Status:**`.
- Broken link: `knowledge/evidence/adr-0019-observability.md` points at
  `apps/desktop/host/discovery-deadline.ts`, which no longer exists.
- `README.md` links `apps/` but not `apps/desktop/README.md`, where the run
  instructions live. That file is the best onboarding document in the repository
  — data directory separation, the one-use sign-in URL, and the explicit promise
  that Drawloom will not silently substitute a simulated response when Codex is
  unavailable. A first-time visitor reaches it only by guessing.
- `.gitignore` has both `docs/reference/generated/` and the redundant
  `docs/reference/generated/repository-atlas/`.

**Closeout at 48eceb3: still open.**

### F1b — Domain vocabulary is not in the code (Medium, partly resolved)

Drawloom's domain language — fibres, threads, spools, nightloom — is how the
memory-into-knowledge design would explain itself to a reader. Occurrences in
`packages/` and `apps/`, excluding build output:

| Term | Count |
| --- | --- |
| `nightloom` | 136 — implemented |
| `thread` | 286 — **none the Drawloom concept**; all Codex `thread/start` RPC, or Node `threadpool` / `threadCpuUsage` |
| `fibre` / `fiber` | 0 |
| `spool` | 0 |
| `distil` / `distill` | 0 — the word ARCHITECTURE uses for the step Nightloom performs |

**Closeout at 48eceb3: closed in part.** ADR 0027 states the boundary and
`packages/knowledge/local-knowledge-runtime/RETRIEVAL.md` records the admission
policy, so the deliberate design is no longer invisible. Fibres, threads and
spools remain unwritten. The `thread` collision with Codex sessions is still
unsettled, and settling it stays cheaper now than after those packages exist.

## Closed findings

### F1 — Half the memory-to-context chain was missing (High, resolved)

At `4afd8fb`, `@drawloom/context` was imported by exactly one file —
`packages/agent/agent/src/index.ts`, as a schema field on a send request. Nothing
in the knowledge subtree imported it. There was no producer of `CompiledContext`
anywhere. What shipped was agent-pull retrieval through a static
`KNOWLEDGE_RETRIEVAL_GUIDANCE` string with zero test coverage.

The first half of the chain was implemented and well proven: Nightloom's durable
`pending` → `assess-batch` → `release` → `publish` pipeline.

**Closed at 48eceb3, ADR 0027 Accepted.**

- `@drawloom/knowledge-context` implements a `ContextPreparer` contract, bounded
  to 8 references and 12 KiB, with `knowledge.disclose` rechecked before
  submission and again in a final pass.
- Oversized records degrade to explicit `reference_only` routing rather than
  silent truncation.
- Reference material rides the user-content path. The provider check found Codex
  0.153.4 declares an `untrusted` kind but proved only the wire shape, not the
  model-side treatment; the ADR records the schema SHA-256 and the reproduction
  command. Choosing the unproven-but-flattering channel would have been the
  easier ADR.
- Native history is protected by durable payload correlation in
  `packages/agent/codex-agent/src/reference-display.ts` rather than marker
  stripping, so a user who types the marker keeps their own words.
- A follow-up review found retrieval never abstained on irrelevant queries. That
  closed too: a **0.52 cosine admission floor**
  (`packages/knowledge/local-knowledge-runtime/src/semantic.ts:9`), calibrated on
  an independent 80-pair fixture — 0.173 margin, zero misclassifications —
  preregistered rather than fitted to the frozen corpus, with the recall cost
  published rather than absorbed.

### F2 — Safeguards proved only by tests CI never ran (High, resolved)

At `4afd8fb`, CI ran `check:ci` and nothing else. `test:temporal` was invoked by
no workflow, and every orchestration recovery test was doubly gated. The sole
executable proof of the stated safeguard "uncertainty is not a retry instruction"
was one skipped test.

**Closed at 48eceb3.** A `learning-integration` job installs a pinned Temporal
CLI v1.3.0 verified by SHA-256, runs `test:temporal` and the new
`test:temporal:learning`, and `publish` now requires it —
`needs: [check, learning-integration]`. The safeguard is gated, not merely tested
somewhere.

Embedding conformance also reached an enforced lane: the shared suite now runs
against the real adapter, real SQLite index and real authorization inside
`check:ci`, with only the GGUF worker variant left opt-in. Its first run failed
and exposed a defect in the shared fixture itself.

## What held up

Verified by running the checks.

- **Boundaries are machine-derived.** The dependency rules are generated from
  each package's own `drawloom.role` field, not a hand-kept list, so a new
  package is governed the moment it declares a role. Zero violations across 2,124
  modules and 6,462 dependencies.
- **Replaceability is demonstrated.** `agentConformance` runs against both the
  synthetic driver and the Codex fixture under Node. Tools, knowledge, plugins,
  host, conversation history and evaluation each run their contract's shared
  suite against a real provider.
- **The tool authorization path is careful.** `local-tools` re-checks
  authorization after the evidence write, closing the window where a grant is
  revoked mid-flight. Denial is checked before `unknown_tool`, so an unauthorized
  caller cannot probe which tools exist. A failed evidence write fails the call
  closed. The conformance suite mandates this by revoking the binding during the
  `started` write and asserting denial, making it a contract promise rather than
  an implementation detail.
- **Knowledge authorization is standards-shaped.** AuthZen request shape rather
  than a bespoke policy language. Fail-closed by documented default.
  "Authorization precedes existence, duplicate and conflict checks" — the same
  existence-oracle discipline as the tool path, arrived at independently.
- **Nightloom is durable, not scripted.** Four Temporal tasks with assessment
  receipts, daily budgets and serial dispatch. The tests go at the hard cases:
  uncertain assessment reconciled without double submission, a conflicting
  receipt writer unable to promote an unpersisted model outcome, evidence
  references refused outside their bounded package.
- **Publication hygiene is clean.** No tracked build output, `node_modules`,
  `dist` or `target`. No secrets in 1,710 tracked files. Licence gate passes with
  zero blockers over 1,778 npm and 431 Rust dependencies.

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

---

## Follow-up closeout appended on 15 September 2026

This section was added by Codex during the pre-publication cleanup. The text
above it was already present in the user-owned audit; Task 3 edits were limited
to appending this closeout. No independent pre-edit checksum was saved, so this
statement is not byte-for-byte verification. This follow-up does not claim
authorship of those historical audit results.

- **F3 is resolved.** Biome 2.5.13 is pinned through the root catalog.
  `check:format` is part of `check:ci`, and the maintained-source and deliberate
  exclusion boundaries are documented in `CONTRIBUTING.md`. Svelte and Astro
  remain excluded because the recorded experiment did not prove content
  equivalence; their compiler checks remain in place.
- **F4 received the requested bounded seam pass.** Evaluation, orchestration and
  knowledge composition now have named sibling modules with focused tests.
  `createDesktopApplication` remains the composition root, so this is not a
  claim that it has become small or that further decomposition is required for
  publication.
- **F5 is resolved.** `OrchestrationReadinessSchema` is owned by
  `@drawloom/orchestration`; `@drawloom/desktop-host` re-exports the same schema
  object for compatibility, and the Temporal provider no longer depends on the
  desktop contract.
- **F6 is resolved without changing historical ADR status.** ADR 0011 remains
  Proposed because it expressly reserves broader foundation review and
  maintainer acceptance. Accepted ADR 0013 owns the plugin decisions; package
  presence and partial implementation do not satisfy ADR 0011's reservation.
  The observability deadline now links to the immutable source at commit
  `4351a83`, the root README links directly to desktop setup, and the redundant
  generated-directory ignore was removed. Historical ADR formatting was left
  intact.
- **F1b is not an accepted missing feature.** No accepted contract requires
  fibres or spools, and ADR 0022's experimental vocabulary does not establish a
  product naming requirement. The supported public names remain Knowledge,
  Nightloom and the existing provider RPC identities. Introducing new domain
  types or aliases is outside this cleanup.

The original licence sentence under “What held up” is also narrower than it
reads. `check:licenses` gates installed JavaScript product-candidate dependencies
and requires the current llama.cpp runtime and GGUF model authorities to be
routed to separate release review. Its inventory includes Rust and other
categories, but native artifacts, optional platforms, development-only terms,
notices, source obligations and release packaging still require that review. A
zero-blocker JavaScript result does not clear those release obligations.
