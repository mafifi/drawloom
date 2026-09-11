# Evidence, verification and refresh

## What this pass did

On 2026-09-11, this pass inspected public implementation paths and representative tests for
the systems listed in [sources.json](sources.json). That manifest owns exact
repository URLs, local checkouts, revisions and root licence labels.

New repositories were shallow-cloned beneath `/Users/afifim/Development`.
Existing clean DeepSeek Harness and Open Design checkouts were fast-forwarded.
Letta's archived Python implementation was inspected at a separately recorded
Git revision; the current main checkout was not replaced by that archive.
MINJA's source checkout was recovered without installing Git LFS or downloading
its database payloads; those LFS contents remain unmaterialized.

No upstream dependencies, model weights or datasets were installed. No upstream
product tests, benchmark experiments, models, security attacks or services were
run. No production/private data was read into the public reports. Product and
paper results remain attributed claims, not measurements made by this survey.

The independent source passes covered:

- Hindsight and Graphiti: evidence, temporal claims, consolidation and repair.
- Letta and Mem0: agent integration, retained memory, reflection and context.
- A-Mem, HippoRAG and evaluation/security research: algorithms versus operational guarantees.
- DeepSeek, Open Design and vocabularies: host/context integration and record meaning.

The synthesis and diagrams were checked against those reports. Review corrected
three meaningful overstatements: Hindsight mental models bypass ordinary recall;
Graphiti saga bookkeeping is not a searchable community layer; and Letta's
local v1 path must cite its actual reflection prompt, not the v2 prompt used on
another backend. These corrections are reflected in the final source documents.

## Root licence inventory

This is a source inventory, not a legal opinion or a transitive dependency audit.
Hosted-service terms, datasets, model weights and bundled dependencies can have
different conditions. Use each pinned report/source file before redistribution.

| Root licence / declaration | Repositories |
| --- | --- |
| MIT | Hindsight, A-Mem, HippoRAG, DeepSeek Harness, LongMemEval, Sleep-time Compute, MINJA, Archify |
| Apache-2.0 | Graphiti, Letta, Letta Code, Mem0, Open Design, sepio-linkml |
| CC BY 3.0 in README | Older SEPIO-ontology |

The old SEPIO repository and newer LinkML repository intentionally have
different entries. Graphiti's root licence is not a licence for Zep's hosted
infrastructure. Mem0 OSS and its hosted client/API are likewise distinguished.

## Source and artifact verification

Run the retained read-only helper:

```sh
node docs/reference/knowledge-memory-survey/verify-sources.mjs
```

It checks immutable GitHub source links against the registered local Git
objects, validates line ranges and local file targets, and checks diagram
specification/HTML hashes against delivery and browser receipts. It does not
make network calls or execute upstream code. It does not prove the interpretation
of a source line, live GitHub accessibility or runtime correctness.

Exact check counts are retained in [verification-results.json](verification-results.json).
The manifest records that all 15 upstream source checkouts were clean when
captured. Future source refreshes can change that state; do not assume it.

The canonical Drawloom `bun run check:ci` gate passed:

- Dependency and packed-package checks; 20 public packages built.
- Svelte check: zero errors and warnings; desktop build completed.
- Architecture/dependency and shared UI-policy checks passed.
- Type checks and design-document checks passed.
- Bun: **651 passed, 5 skipped, 0 failed** across 121 files.
- Node shared conformance passed; the portable history smoke test passed.

Skipped tests are opt-in live native approval scenarios and an OS credential
round trip. No live-provider or credential-store proof is claimed. The desktop
build reported its existing large-chunk warning; this documentation task did
not change bundling or runtime code. Test-run performance output is not reused
as a benchmark for any surveyed product.

## Archify delivery

The explicitly requested Archify skill was used from its clean checkout at
the revision recorded in the manifest (package identifies itself as
`2.17.0-dev.1`). It was not installed globally or added to Drawloom runtime
dependencies. Sources were authored as architecture JSON and delivered with
the supported CLI, not by editing generated HTML.

Every final diagram has:

- `<name>.architecture.json`: editable source.
- `<name>.html`: standalone generated viewer.
- `<name>.delivery.json`: specification/HTML SHA-256, byte counts and **9/9
  showcase checks, zero errors and warnings**.
- `<name>.visual-check.json`: artifact-bound automated Chrome evidence.
- Four endpoint screenshots and a relative-path HTML contact sheet.

| Diagram | Delivered viewer | Deterministic receipt | Browser receipt / screenshots |
| --- | --- | --- | --- |
| Comparison lens | [HTML](comparison.html) | [Receipt](comparison.delivery.json) | [Receipt](comparison.visual-check.json) · [Contact sheet](comparison.visual-check.html) |
| Hindsight | [HTML](hindsight.html) | [Receipt](hindsight.delivery.json) | [Receipt](hindsight.visual-check.json) · [Contact sheet](hindsight.visual-check.html) |
| Graphiti | [HTML](graphiti.html) | [Receipt](graphiti.delivery.json) | [Receipt](graphiti.visual-check.json) · [Contact sheet](graphiti.visual-check.html) |
| Letta Code | [HTML](letta.html) | [Receipt](letta.delivery.json) | [Receipt](letta.visual-check.json) · [Contact sheet](letta.visual-check.html) |
| Mem0 | [HTML](mem0.html) | [Receipt](mem0.delivery.json) | [Receipt](mem0.visual-check.json) · [Contact sheet](mem0.visual-check.html) |
| A-Mem | [HTML](a-mem.html) | [Receipt](a-mem.delivery.json) | [Receipt](a-mem.visual-check.json) · [Contact sheet](a-mem.visual-check.html) |
| HippoRAG | [HTML](hipporag.html) | [Receipt](hipporag.delivery.json) | [Receipt](hipporag.visual-check.json) · [Contact sheet](hipporag.visual-check.html) |
| DeepSeek | [HTML](deepseek.html) | [Receipt](deepseek.delivery.json) | [Receipt](deepseek.visual-check.json) · [Contact sheet](deepseek.visual-check.html) |
| Open Design | [HTML](open-design.html) | [Receipt](open-design.delivery.json) | [Receipt](open-design.visual-check.json) · [Contact sheet](open-design.visual-check.html) |

The automated browser command measures light-theme containment at 1440×900,
1600×1000, 1920×1080 and 2048×1320. It captures both light and dark themes at
1440×900 and 2048×1320, in READ/Still state. All final browser receipts must
match the final HTML hashes; an earlier capture is not evidence for a revision.

### Perceptual review

Final screenshot review is recorded separately in
[visual-review.json](visual-review.json). Automated receipts deliberately retain
`visualReview: pending`; they cannot approve perceptual quality.

The first image review found a clipped Hindsight lookup route, overly shared
search endpoints in Mem0/Graphiti, and excess lower whitespace. A focused
correction enlarged Hindsight's authored canvas, separated those search
endpoints and increased vertical spacing in the other maps. Validation,
delivery and browser capture were repeated for the corrected artifacts.

Screenshot review covers readability, node/card fit, connections, clipping,
theme contrast and desktop balance. It does **not** test interactive search,
focus, presentation, source-link opening, exports, mobile behavior or
accessibility assistive technology. These are reference diagrams, not an
application UI acceptance exercise.

## Refresh procedure

1. Read the relevant report and manifest revision before relying on a claim.
2. Inspect upstream checkout status. Preserve local changes; do not reset or
   overwrite a checkout to refresh this survey.
3. Fetch and fast-forward a clean checkout where appropriate. Record the new
   full SHA, date and licence changes. Keep archived implementations explicit.
4. Follow the actual write, retrieval, composition and repair call paths again.
   Update changed conclusions and their immutable source links together.
5. Edit architecture JSON only. Run Archify validation with `--quality showcase`
   and `--repo-root` for the product checkout, then `deliver`. Regenerate receipts
   and browser evidence; never hand-edit generated HTML or reuse stale captures.
6. Inspect the new screenshots, rerun the scoped verifier and applicable
   repository checks. Update the retained results and visual-review bindings.
7. Keep findings separate from decisions. A changed upstream implementation
   does not silently amend Drawloom's accepted interfaces.

Read the skill's full delivery contract before regenerating maps. The comparison
lens is analyst-authored and has no upstream source binding; the eight product
maps each bind at least six component source references to the recorded repository SHA.
