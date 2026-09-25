# Sources for the Decisions page

Not published. Each claim on `page.md` with the file that supports it.

## What a decision record is

- Records explain decisions that constrain future work; the problem, choice,
  rejected options, verification and cost: `docs/adr/README.md` (opening paragraph).
- Six sections (Context, Decision, Alternatives considered, Evidence,
  Consequences, plus Status header); "untested option is a judgement, not a
  result"; state limits as plainly as findings: `docs/adr/0000-template.md`
  (template body and "Writing an ADR").
- Accepted records are not rewritten; a new ADR supersedes and links back;
  partial supersession recorded on the status line: `docs/adr/README.md`
  ("Writing one"), `docs/adr/0000-template.md`, `docs/AGENTS.md` (bullets on
  immutability and supersession).
- Statuses Proposed, Accepted, Deprecated, Superseded: `docs/adr/README.md`.
  (No record is currently Deprecated, so the page lists only the three in use.)
- "Some proposed records have permission to build": ADR 0011 and ADR 0030
  status descriptions in `docs/adr/README.md` ("Implementation is authorised";
  "Proposed; implementation authorised").
- ARCHITECTURE.md groups decisions by capability and is the better starting
  point: `docs/adr/README.md` opening.

## Status lines (from each record's header, lines 3-10)

- 0001 Accepted, with "Partially superseded by: ADR 0006" header field.
- 0003 "Accepted; toolchain and `bun` runtime class superseded by ADR 0034".
- 0009 Accepted, "Amends: ADR 0003"; README says "ADR 0010 amends its
  manual-only trigger" (0010 header: "Amends: ADR 0009, publication trigger only").
- 0011, 0030, 0032: Proposed.
- 0017 Accepted, "Amended by: ADR 0021".
- 0022 Accepted; README qualifies "Accepted for the demonstrated ... boundaries".
- 0024 "Accepted; partially superseded by ADR 0026, ADR 0027 and ADR 0028".
- 0027 "Accepted; context composition partially superseded by ADR 0028".
- All others: Accepted.

## One-line summaries (Decision section of each record unless noted)

- 0001: one authoritative home per kind of information ("One authoritative home").
- 0002: Apache-2.0; proprietary products in separate repos, one-way dependency.
- 0003: strict TypeScript/ESM; public types not dependent on a specific host runtime; portable packages.
- 0004: behaviour as TypeScript interfaces, Zod at trust boundaries, shared conformance (README index line).
- 0005: capability table with "Owns / Does not own"; Context and Alternatives.
- 0006: "Make complexity earn its place"; simplest design for present, evidenced needs.
- 0007: one agent-execution boundary; provider owns native transcript; Codex integration (README index).
- 0008: typed definition and handler, validated input/output, grants and execution evidence (README index "Invocation, grants and execution evidence").
- 0009: `publishing/<piece>/`, Astro, Remotion, GitHub Pages.
- 0010: deploy on pushes to `main` affecting publishing; drafts excluded.
- 0011: implement ADR 0007/0008 contracts; trusted startup registration; acceptance awaits review.
- 0012: `@drawloom/ui` shared controls from shadcn-svelte preserving accessible composition; StatefulButton for the actual pending command.
- 0013: plugin = package of contributions; "Registration, activation and permission are separate".
- 0014: display history separate from native transcript; "never replayed as model context".
- 0015: responsibility map; native provider approval; "No universal revision, lock, undo stack or rollback guarantee".
- 0016: "Discovery and selection never grant execution permission".
- 0017: workflows as ordinary TypeScript; replay-safe; no workflow language.
- 0018: Agent Plugins 1.0.0, MCP Apps, small trusted backend extension.
- 0019: OpenTelemetry, opt-in local export, content-free diagnostics (README index).
- 0020: conversation bound to project "permanently during normal navigation"; streamed file delivery.
- 0021: local Temporal dev server, SQLite, loopback, no web UI, accepted despite development-only status.
- 0022: accepts demonstrated lifecycle/ownership boundaries; does not freeze schema or APIs.
- 0023: Drawloom owns enforcement; organisation owns identity, attributes, policy (table).
- 0024: SQLite local store, evidence relationships, lexical plus semantic search.
- 0025: evaluation owns cases/findings; orchestration owns scheduling; Braintrust local JS and Autoevals.
- 0026: permissive or reviewed MPL-2.0; mlx-embeddings GPL-3.0-only and MLX-VLM (GPL-with-exception GCC libs via SciPy) rejected; llama.cpp and Qwen GGUF (Context).
- 0027: bounded knowledge references (max eight, 12 KiB), opt-in capture and consent (README index "opt-in capture"; 0027 Decision).
- 0028: replace learning/decision implementation, keep shared desktop screens.
- 0029: installation-scoped Settings pages, independent of conversation sessions.
- 0030: four theme layers authoritative; shared ordered projection for live and retained turns.
- 0031: native goals and plans; provider-initiated turns need explicit host admission before Drawloom tool access.
- 0032: delegation and forks; every child operation needs its own admission; never lend parent identity.
- 0033: Tauri child webview; separate storage and authority; README index "no agent browser automation".
- 0034: Node, pnpm, Vitest, esbuild, Vite, Tauri; LGPL in Bun runtime.

## Three decisions up close

### ADR 0005
- Problem, rejected alternatives (one contract; first provider sets boundaries;
  every exact interface; every package immediately), consequence "More explicit
  composition": `docs/adr/0005-partition-agent-platform-capabilities.md`
  (Context, Alternatives considered, Consequences).
- Policy / tools / sandbox division: capability table in Decision.
- 11 responsibilities including model inference; historical map, not 11
  implemented contracts: `ARCHITECTURE.md` lines 135-139.

### ADR 0034
- Bun compiled into host; MIT licence; LGPL JavaScriptCore/WebKit and
  LGPL-2.1 TinyCC; dependency gate inventories npm and Rust packages only:
  Context.
- 47 tests broke on import when two packages moved to `node:sqlite`: Context.
- LGPL exception priced; `make jsc` fails; never reached successful relink;
  sidecar rejected; Node-with-Bun-dev rejected: Alternatives considered.
- Toolchain list, exact pin, no compatibility layer: Decision.
- Bundle plus runtime; runtime needs licence inventory; contributors change
  toolchain: Consequences. Manual pre-release gate, no macOS runner: Evidence.
- Signature invalidated by later README edits inside bundle; process error:
  Evidence.
- ADR 0026 cost of a working MLX implementation: 0034 Alternatives ("cost a
  working MLX implementation"); 0026 Context (MLX-VLM passed isolated GPU smoke
  test; SciPy/GCC GPL-with-exception). Page wording "passed its test" reflects
  "passed an isolated GPU smoke test".

### ADR 0021
- ADR 0017 retained Temporal as evidence only; installed workbenches need a
  local provider; "Reusing Temporal avoids building another durable workflow
  engine": Context.
- Temporal guidance distinguishes development SQLite from production:
  Alternatives considered.
- Loopback, persistent SQLite, no default web UI, maintainer accepts despite
  development-only status: Decision.
- Quit/reopen restores saved work; cancellation not rollback; ambiguous effects
  remain uncertain until reconciled: Decision.
- No production-server guarantees or high availability; enterprise later:
  Decision and Consequences.

## Links checked to exist

All 34 `docs/adr/00NN-*.md` files, `docs/adr/README.md`,
`docs/adr/0000-template.md`, `ARCHITECTURE.md`, `docs/AGENTS.md`,
`knowledge/evidence/adr-0021-local-temporal.md`,
`knowledge/evidence/adr-0034-notarised-release.md`.

## Uncertain or left out

- "Building a durable workflow engine was set aside" (ADR 0021): the record
  says only that reusing Temporal avoids building one; it lists no evaluated
  alternative engine. Page wording kept to that.
- Did not claim Temporal's licence, or that any release is production-ready.
- Did not state whether the notarised build is the current download; left to
  the evidence link.
