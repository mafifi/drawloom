# Diagram delivery and research verification

These are source-informed Archify architecture maps, not generated call graphs or
evidence that the upstream products were executed. The Drawloom map is explicitly
a discussion proposal, not an approved architecture.

## Tool and artifact identity

Used the unchanged local Archify checkout at
`/Users/afifim/Development/archify`, commit
`c1443b31b496eebf4a68bf83151816c955ddb796` (package `2.17.0-dev.1`).
The packaged update check returned `silent/current`; no tooling was upgraded.

Each delivery receipt below contains the exact specification and HTML SHA-256,
byte counts and validation result. Each browser receipt independently binds the
same HTML hash and size. Do not substitute a later rendering for this evidence.

| Map | Exact delivery receipt | Automated browser receipt | Visual correction rounds |
| --- | --- | --- | --- |
| [Drawloom proposal](../generated/evaluation-survey/proposal.html) | [receipt](proposal.delivery.json) | [browser](../generated/evaluation-survey/proposal.visual-check.json) | 0 |
| [Promptfoo](../generated/evaluation-survey/promptfoo.html) | [receipt](promptfoo.delivery.json) | [browser](../generated/evaluation-survey/promptfoo.visual-check.json) | 0 |
| [Arcade](../generated/evaluation-survey/arcade-mcp.html) | [receipt](arcade-mcp.delivery.json) | [browser](../generated/evaluation-survey/arcade-mcp.visual-check.json) | 0 |
| [DeepEval](../generated/evaluation-survey/deepeval.html) | [receipt](deepeval.delivery.json) | [browser](../generated/evaluation-survey/deepeval.visual-check.json) | 0 |
| [Langfuse](../generated/evaluation-survey/langfuse.html) | [receipt](langfuse.delivery.json) | [browser](../generated/evaluation-survey/langfuse.visual-check.json) | 0 |
| [Braintrust SDK](../generated/evaluation-survey/braintrust-sdk-javascript.html) | [receipt](braintrust-sdk-javascript.delivery.json) | [browser](../generated/evaluation-survey/braintrust-sdk-javascript.visual-check.json) | 1 |
| [Autoevals](../generated/evaluation-survey/autoevals.html) | [receipt](autoevals.delivery.json) | [browser](../generated/evaluation-survey/autoevals.visual-check.json) | 1 |
| [LangSmith SDK](../generated/evaluation-survey/langsmith-sdk.html) | [receipt](langsmith-sdk.delivery.json) | [browser](../generated/evaluation-survey/langsmith-sdk.visual-check.json) | 1 |

## Results and scope

- Deterministic delivery: **all eight passed 9/9 checks**, showcase composition,
  zero errors and zero warnings.
- `browser_evidence: passed` for all eight: automated light-theme containment
  measurements at 1440×900, 1600×1000, 1920×1080 and 2048×1320; light/dark
  captures at 1440×900 and 2048×1320. No reported page overflow.
- `visual_review: passed` for the inspected static READ composition: an
  image-capable reviewer inspected each final 2048×1320 light and dark capture,
  including labels, connections, cards and legend. The final three maps received
  one spacing/type correction round. This is not a claim of testing keyboard,
  search, passport interactions or exported SVG/PNG behavior.
- Automated browser receipts deliberately retain `visualReview: pending`.
  They do not encode or replace the separate perceptual review recorded here.
- Product components link to inspected, revision-pinned source files. An external
  service node links to the client's integration code, not inspected proprietary
  server code. The proposal's conceptual responsibilities are not source claims.

## Reproduce

Use Archify's packaged CLI; do not hand-edit the generated HTML. From the Drawloom
checkout, for each product substitute its name for `promptfoo`:

```sh
node /Users/afifim/Development/archify/archify/bin/archify.mjs validate architecture docs/reference/evaluation-survey/promptfoo.architecture.json --quality showcase --repo-root /Users/afifim/Development/promptfoo --json
node /Users/afifim/Development/archify/archify/bin/archify.mjs deliver architecture docs/reference/evaluation-survey/promptfoo.architecture.json docs/reference/generated/evaluation-survey/promptfoo.html --quality showcase --repo-root /Users/afifim/Development/promptfoo --json
node /Users/afifim/Development/archify/archify/bin/archify.mjs visual-check docs/reference/generated/evaluation-survey/promptfoo.html --json
node docs/reference/evaluation-survey/verify.mjs
```

Use Drawloom's root for the proposal. Retain each new delivery receipt before
running the research verifier: it checks exact byte identity, browser binding,
revision-bound source paths and relative report links. The local-only verifier
requires the seven checkouts; it is deliberately not a public CI prerequisite.

No upstream evaluation tests, vendor platforms or model calls were run. This
survey establishes candidate integration points, not performance, offline
operation, security assurance or working Drawloom compatibility.

## Repository verification

On 12 September 2026, `bun install --frozen-lockfile` reported no dependency
changes and the canonical `bun run check:ci` completed successfully. It includes
the UI/dependency policies, package builds, type checks, publishing checks and
Bun/Node tests; opt-in service/model checks remained skipped. The desktop build
reported its existing large-chunk warning, not a failure. `git diff --check`
passed.

The separate read-only survey verifier passed for eight artifacts, 61 component
source references, 96 distinct pinned upstream source links and 42 local report
links. These counts verify references and artifact identity, not correctness of
every interpretation or upstream runtime behavior.
