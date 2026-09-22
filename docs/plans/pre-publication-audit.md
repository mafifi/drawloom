# Pre-publication architecture audit

Audited at `4afd8fb`. Tracked through `48eceb3` and `16ad5e0`.

Findings keep their original text. Each carries a status line naming the commit
that closed it, or what remains. **Five of nine closed, one partly closed,
three open — one of which needs a maintainer decision before release.**

Verified by running the checks, not by reading the claims. At each closeout the
commit, statuses and artifacts were checked in the committed tree rather than
taken from a verification record.

Not covered: runtime behaviour of the desktop app, the private workbench
repository, Rust sources under `src-tauri`, and the retained spikes beyond their
boundary rules.

## Status at `16ad5e0`

| ID | Finding | Severity | Status |
| --- | --- | --- | --- |
| F7 | LGPL components in the distributed host runtime | High | Closed at `6f76337` — migrated to Node ([ADR 0034](../adr/0034-node-toolchain.md)) |
| F8 | Licence inventory cannot see compiled-in runtimes | Medium | **Open — now shipping a Node runtime, so this is live** |
| F4 | Composition root resisted decomposition | Medium | **Open — worse: 2,481 → 2,818 lines** |
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

### F4 — The composition root resisted decomposition (Medium, open)

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
- Release qualification is not finished. F7 and F8 are open against it.
