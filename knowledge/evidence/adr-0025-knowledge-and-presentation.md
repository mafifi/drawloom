---
type: experiment
id: adr-0025-knowledge-and-presentation
title: ADR 0025 frozen knowledge evaluation and MCP App inspection
status: active
created: 2026-09-13
updated: 2026-09-13
---

# Scope

Fourth bounded sprint for Proposed [ADR 0025](../../docs/adr/0025-evaluation-boundaries-and-comparative-proof.md).
The [plan](../../docs/plans/adr-0025-knowledge-presentation-sprint.md) limits this
to a retained public consumer and standard MCP Apps presentation. No new model
calls, downloads, production ingestion or private material are required.

## Input provenance

- [Frozen public corpus](../../evaluations/knowledge/corpus.ts): invented facts,
  24 held-out questions, unchanged since ADR 0024.
- [Retained MLX report](assets/adr-0024/local-knowledge-mlx-10k.json): paired lexical
  and actual MLX Qwen retrieval at 10,000 records. Reassessing these outputs is
  not a fresh embedding benchmark.
- [Retained answer report](assets/adr-0024/local-knowledge-answers-10k.json): 72
  actual historical Terra answers, across lexical and the older CPU Qwen/Nomic
  configurations. These answers must not be relabelled as MLX results. Citation
  checks and surface assertions are heuristics, not universal factual correctness.

## Fresh lexical sanity check

The supported Node evaluation runner was also exercised in an isolated temporary
directory with 10,000 synthetic records, without a model or download. Its returned
reference lists for all 24 questions exactly match the lexical side of the
retained MLX report. Corpus SHA-256:
`70ab90e0be0e1ba9e7872dbd1e7286b1ef5c5fd343660b5e950cbd8c7a90e5e5`.

Captured run: ingestion 3,000.88 ms; first retrieval 1.68 ms; 30 warm queries,
median 0.549 ms and p95 5.143 ms; sampled process peak RSS 195,215,360 bytes;
SQLite plus WAL/SHM at measurement 23,635,176 bytes. These are one-machine sanity
measurements, not new hybrid quality or whole-host memory claims.

The runner expects a fresh directory: an attempted second intake into its first
completed fixture failed on the old `ferry-rule@r1` revision. No data was reset;
a separate fresh directory was used for the captured report. This is a retained
fixture rerun limitation, not evidence of production recovery failure.

The [captured lexical report](assets/adr-0025-knowledge/fresh-lexical-10k.json)
retains per-question references and measurements. Through the existing
`loadAnswerCases` path, the supported SQLite provider then expanded 208 retrieved
roots across those 24 questions. All completed within the 65,536-byte per-chain
allowance and had their returned provenance inputs and link endpoints present.
The [chain receipt](assets/adr-0025-knowledge/fresh-evidence-chains.json) records
identities, revisions, relationships and completeness without duplicating bodies.
This is actual evidence API access, separate from the top-k coverage score below.
It does not prove that irrelevant roots were useful or that every possible large
graph can be returned within this allowance.

## Candidate consumer and findings

The same candidate Braintrust `assess-existing` path processed **122 results**:

| Input | Results | What this run actually does |
| --- | ---: | --- |
| Paired current lexical/MLX retrieval | 48 | Recompute reference relevance, current revisions and required-chain top-k coverage |
| Historical lexical/CPU Qwen/CPU Nomic answers | 72 | Recompute citation/abstention heuristics against retained retrieval and frozen lineage |
| Explicitly copied-output regressions | 2 | Drop a required chain reference; return only a stale source revision |

Target execution and model invocation counts are both **zero**. Frozen files are
hash-checked; neither answers nor embeddings were regenerated. Historical surface
assertions remain imported evidence and are excluded from the newly computed
score. The installed document retains the actual model labels, source hashes,
corpus revision, case identities and method limitations.
The [final inspection document](assets/adr-0025-knowledge/inspection-results.json)
retains all 122 results for review.

The controlled `c1` regression changes required-chain coverage from 100% to 0%
while relevance and current-revision checks remain 100%. Its explanation says
2/3 required references remain: this is an all-required check, not a proportional
2/3 score. This demonstrates why per-finding comparison is more useful than one
average. The second regression identifies stale-only evidence. Neither is labelled
as an observed failure of the retained MLX run.

`required-chain-top-k` explicitly measures whether required references appear in
the search result, **not** graph traversal. Historical grounded-answer checks are
transparent citation and abstention heuristics, not a fresh model judgement or a
universal factual-correctness measure. We did not use new labels to claim that
historical CPU answers prove MLX answer quality.

## Actual desktop and MCP App integration

A self-contained installed package supplies the standard `inspection` MCP server,
opening tool, app-only feedback tool, compiled Svelte HTML, and the existing
placement-only backend extension. No new host capability or browser protocol was
introduced. The App uses shared UI components/theme and View/ViewModel separation.

It displays case findings, mode comparisons, provenance and advisory feedback.
Feedback targets an exact result, is stored separately in plugin data, and cannot
change scores, approve work or execute a target. Attribution is an entered label,
**not a verified user identity**. The proof is not a shared annotation service.

The actual desktop host was run with isolated synthetic state and the installed
artifact outside the source checkout. Playwright used already-installed Chrome
152.0.7977.83; no browser or model was downloaded. Checked:

- Keyboard case selection and Save, invalid attribution and durable success.
- Per-case comparison and feedback reload.
- Light/dark at 1440×1000 and dark at 390×844, reduced motion and no horizontal
  overflow, browser errors or framework overlay.
- Whole-host shutdown and restart: same feedback recovered with no second save.
- Installed source result hash unchanged before and after both browser runs.
- Historical CPU mode filtering returns its 24 answer cases; returning to the
  controlled regression retains only that exact result's saved feedback.

Receipts: [initial exercise](assets/adr-0025-knowledge/browser-exercise.json),
[after restart](assets/adr-0025-knowledge/browser-verify.json).
Screenshots: [light](assets/adr-0025-knowledge/inspection-exercise-light-1440.png),
[dark](assets/adr-0025-knowledge/inspection-exercise-dark-1440.png),
[narrow](assets/adr-0025-knowledge/inspection-exercise-dark-390.png).
These are inspection evidence in the existing artifact pane, not a finished
full-width evaluation product design.
All browser checks were repeated against the final reviewed build, not only the
pre-review version. Both runs reported zero page or console errors.

### Failures found, not hidden

The first browser exercise exposed native form submission blocked by the existing
MCP App sandbox. The fix uses an explicit shared button command; it does **not**
add `allow-forms` or broaden iframe permissions. The desktop remounts its artifact
surface at the narrow breakpoint; the test explicitly reopens it and confirms
durable feedback, rather than claiming transient drafts survive remounting.

Focused review also found a reload/save race, hidden reload error text and a
feedback write that could exceed the next read's byte limit. Targeted regression
tests now cover both operation orderings, separate load/save errors (including
consecutive failures), and refusal before replacing an oversized feedback file.
All three findings were fixed and independently retested. Remaining copy and
comparison derivations were moved from the leaf View into its existing ViewModel,
with a non-default copy fixture. No new state-management layer was needed. The builder
rejects existing output paths and escapes closing script/style sequences; that
hardening is separately build-tested rather than inferred from a screenshot.

## Verification and remaining decision

`bun run check:ci` passed: 861 Bun tests, six explicitly opt-in skips, zero
failures and 4,206 assertions; Node shared conformance and its additional SQLite,
worker and retrieval checks also passed. This includes dependency and maintained
UI guards. Live native review and cold model setup were not rerun by that gate.
The final focused suite passed **15 tests and 73 assertions**, with zero failures.
Node source checking passed; the compiled Svelte App had zero errors and warnings.
Both leaf components passed explicit UI policy. After the review fixes, architecture
checks passed again: 1,646 modules, 5,186 dependencies and no violations. The full
gate was run once, followed by these targeted checks for the retained-proof fixes.
The [verification receipt](assets/adr-0025-knowledge/verification.json) records
counts, review disposition and hashes of the final proof source files. Sol handled
the bounded implementation; Astra performed the focused review; root verified
the fixes and actual host integration.
The canonical UI scanner excludes retained spikes, so checking both App Svelte
files explicitly is necessary. No supported package imports the proof.

Reproduction paths (run from the public checkout with installed dependencies):

```sh
bun test spikes/adr-0025-evaluation/knowledge-inspection.test.ts \
  spikes/adr-0025-evaluation/inspection-server.test.ts \
  spikes/adr-0025-evaluation/inspection-build.test.ts \
  spikes/adr-0025-evaluation/inspection/inspection-view-model.test.ts
bunx tsc --noEmit -p spikes/adr-0025-evaluation/tsconfig.node.json
bunx svelte-check --workspace spikes/adr-0025-evaluation/inspection \
  --tsconfig ./tsconfig.json --threshold warning
```

The [proof README](../../spikes/adr-0025-evaluation/README.md) describes building
a fresh, non-existing output directory and installing it. The retained
`inspection-desktop.mjs` launcher uses the real application with an explicitly
supplied disposable runtime and built package. `inspection-browser.mjs` reads
its restricted local receipt; `verify` mode checks existing feedback without
writing another entry. Authentication receipts are not copied into evidence.
The fresh lexical check used the existing `evaluations/knowledge/runner.ts`
with `--root <fresh-directory> --scale`, followed by `loadAnswerCases` against
that generated SQLite database with the recorded query references.

This sprint advances the knowledge and presentation gates. It does not select a
supported evaluation backend or accept ADR 0025. Still to settle before promotion:

- Broader calibration of model judgements and a clear place for native usage
  aggregation; six previous live judgements are narrow evidence.
- Autonomous tool-choice evaluation versus the instructed edit/effect checks.
- Residual media checks documented in the [media sprint](adr-0025-media-consumers.md),
  including cancellation/process cleanup and child-process resource measurement.
- Whether these demonstrated interfaces earn supported packages and how the
  inspection experience should be integrated as a product feature.

No new Codex tasks were created, so this sprint adds nothing to the user's task
list. Public synthetic receipts only; private evidence remains private. ADR 0025
stays Proposed, changes remain uncommitted, and disposable runtime files have not
been deleted. All six isolated desktop-host processes started during browser
iterations were stopped; no unrelated host or user task was stopped. The bounded
sprint reached its reviewable handoff in approximately 42 minutes, before its
one-hour checkpoint and two-hour stop.
