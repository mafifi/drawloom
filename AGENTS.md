# Drawloom agent guide

This file is a map, not a complete manual. Read the closest `AGENTS.md` for the
area you change.

## Read first

1. `README.md`
2. `ARCHITECTURE.md`
3. The applicable ADRs in `docs/adr/`
4. `DESIGN.md` when changing visual or user-interface design
5. The nearest nested `AGENTS.md`

## Non-negotiable rules

- Define or amend a contract before adding its implementation.
- Keep contract packages independent of provider packages.
- Make provider selection only in a composition root.
- Run the same conformance suite against every implementation of a contract.
- Parse and validate data at trust boundaries.
- Keep one authoritative home for each fact; link instead of copying.
- Update architecture, decisions, or knowledge records when their truth changes.
- Keep external dependency versions in the root Bun catalog; workspaces use
  `catalog:` for external packages and `workspace:*` for internal packages.
- Keep portable packages free of Bun, Node.js, Cloudflare, and Tauri ambient
  APIs. Cross host-specific behaviour through an explicit contract.
- Keep retained spike code outside supported packages and applications. No
  module outside `spikes/` may import a spike module.
- Make complexity earn its place: apply the principles and decision test in
  `ARCHITECTURE.md` before adding material abstraction or lifecycle machinery.
- Before cross-repository work, state which repository owns each change and
  whether it is public. Follow the public/private boundary and admission test
  in `ARCHITECTURE.md`; keep proprietary work outside this repository.
- Never copy private code, prompts, fixtures, data or assets here without
  explicit publication approval. This applies to tests, examples and spikes
  too. A package's `private: true` flag does not make its source confidential.
- Public CI must work without private repositories, credentials or services.
  Keep shared conformance public and business scenario tests private.
- Challenge new public abstractions with a contrasting consumer; do not import
  business decisions into core contracts under generic names. Known-private
  dependency checks supplement this review, not replace it.

## Area guides

- Working-material and AI edit boundaries are recorded in
  [ADR 0015](docs/adr/0015-working-material-ownership-and-edit-approval.md).
  Consult it before changing file lifecycle or plugin editing contracts; do not
  assume a universal preview, revision, undo or import requirement. Native review
  is implemented; independent tool grants and ADR 0014 history/media guarantees
  still apply. Consult its linked evidence before claiming ambient tool isolation.

- Before work on conversation history, runtime/host boundaries, plugin composition,
  context, artifacts or workbench integration, consult the
  [harness and workbench survey](docs/reference/harness-workbench-survey/README.md).
  It links the detailed DeepSeek Harness and Open Design capability inventories,
  source references, diagrams, limitations and candidate follow-ups. Read the
  relevant inventory sections, not just the executive takeaways. Check recorded
  revisions and refresh affected evidence before a new decision; package presence
  is not proof of enabled behavior, and source-inspected tests are not passing
  test results. Keep discoveries separate from approved Drawloom contracts.

- Apply [proven boundaries before invention](ARCHITECTURE.md#reference-led-changes-and-approval).
  Plugin contract and proof revisions follow the explicit approval gate in
  [ADR 0013](docs/adr/0013-plugin-boundaries-and-host-integration.md#reference-comparison-and-alternatives).
  Compare both OpenAI/Rosalind and DeepSeek Harness before changing a boundary.
  Stop for maintainer approval when they differ or the proposal departs from
  either reference; a working demo or generic naming is not approval. Record
  the concrete consumer need, reference evidence and decision in the ADR before
  implementation. This applies to backend and UI contracts, not only rendering.

- UI work follows [ADR 0012](docs/adr/0012-shared-ui-components-and-guidance.md).
  Use `@drawloom/ui` compositions, and StatefulButton for the action actually
  pending. Keep unrelated disabled controls plain. Run `bun run check:ui-policy`;
  its errors include replacement advice. The optional `.codex/hooks.json` hook
  repeats that advice after edits once reviewed and trusted through `/hooks`.
  Do not bypass hook trust; CI checks remain required whether hooks run or not.

- `packages/AGENTS.md`: package roles and dependency constraints.
- `docs/AGENTS.md`: ADR, plan, and reference-document conventions.
- `knowledge/AGENTS.md`: OKF profile and provenance requirements.
- `spikes/AGENTS.md`: retained non-production experiment and evidence rules.

## Verification

Install the pinned toolchain dependencies and run the canonical gate from the
repository root:

```sh
bun install --frozen-lockfile
bun run check:ci
```

`check:ci` validates dependency policy, runs strict TypeScript checking, and
runs the Bun test suite. Add target-specific checks when a package first claims
Node.js, Cloudflare, or Tauri compatibility; do not claim untested portability.
