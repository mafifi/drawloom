# ADR 0006 Decision Principles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkboxes (`- [ ]`) for tracking.

**Goal:** Adopt five evidence-led architecture principles, correct document
ownership, and mechanically validate the repository's visual `DESIGN.md`
against Google's design.md specification.

**Architecture:** `ARCHITECTURE.md` becomes the authoritative current statement
of architecture principles, non-goals, and naming. `DESIGN.md` becomes the
visual design-system document governed by Google's design.md format. The
existing Proposed agent-execution decision moves from ADR 0006 to ADR 0007 so
the principles can guide it without changing its substance.

**Tech Stack:** Markdown, Bun 1.2.23, `@google/design.md` 0.4.0, root Bun
dependency catalog.

**Spec:** [ADR 0006](../adr/0006-evidence-led-architecture-principles.md)

**Status:** Completed

---

### Task 1: Preserve and renumber the Proposed capability decision

**Files:**
- Move: `docs/adr/0006-provider-neutral-agent-execution.md` to
  `docs/adr/0007-provider-neutral-agent-execution.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/adr/0005-partition-agent-platform-capabilities.md`
- Modify: `docs/design/agent-execution-contract.md`
- Modify: `docs/design/codex-app-server-adapter.md`
- Modify: `knowledge/index.md`

- [x] Renumber the Proposed ADR and every repository-local reference from 0006
  to 0007 without changing its decision content.
- [x] Search for stale references to the old number and path.

### Task 2: Record and apply the architecture principles

**Files:**
- Create: `docs/adr/0006-evidence-led-architecture-principles.md`
- Modify: `ARCHITECTURE.md`
- Modify: `docs/adr/0001-repository-foundations.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/README.md`
- Modify: `knowledge/index.md`

- [x] Author ADR 0006 as Accepted with the governing rule that complexity must
  earn its place and the five approved principles: type safety, multi-provider
  support, replaceable boundaries, accessible free/local paths, and
  proportional efficiency.
- [x] Make the principles operational with an explicit decision test and
  document their narrow supersession of ADR 0001's `DESIGN.md` ownership rule.
- [x] Move the current principles, non-goals, and naming vocabulary into
  `ARCHITECTURE.md`; update repository maps and agent reading guidance.

### Task 3: Adopt and enforce Google's design.md format

**Files:**
- Replace: `DESIGN.md`
- Modify: `package.json`
- Modify: `bun.lock`

- [x] Replace architectural content in `DESIGN.md` with a minimal visual design
  system that explicitly omits undecided tokens instead of inventing them.
- [x] Add `@google/design.md` to the root catalog and consume it from the root
  development dependencies through `catalog:`.
- [x] Add `check:design` using `designmd lint DESIGN.md` and include it in
  `check:ci`.
- [x] Run `bun install` and `bun run check:design`; correct errors without
  selecting an unapproved visual palette or typography system.

### Task 4: Verify and commit the cohesive decision

**Files:**
- Verify all changed files above.

- [x] Run `bun install --frozen-lockfile`.
- [x] Run `bun run check:ci`.
- [x] Verify repository-local Markdown links and search for stale ADR/document
  ownership references.
- [x] Review the final diff and ensure unrelated working-tree work was only
  renumbered, not substantively changed.
- [x] Commit the accepted decision and its enforcement together with DCO
  sign-off.

## Verification record

- `bun install --frozen-lockfile`
- `bun run check:ci`
- `designmd lint DESIGN.md` through the canonical gate: zero errors and zero
  warnings
- local Markdown-link validation across all repository Markdown files
- stale ADR-reference search
- `git diff --check`
- complete diff and working-tree inspection
