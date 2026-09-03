# ADR 0004 Contract Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed

**Goal:** Record and apply the universal capability-contract standard without
choosing or scaffolding the first concrete capability.

**Architecture:** ADR 0004 owns the durable decision. The root Bun catalog owns
the Zod 4 range, package guidance exposes concise local invariants, and current
architecture and knowledge maps link to the decision rather than duplicating
it.

**Tech Stack:** TypeScript, Zod 4.5.4, Bun workspaces and catalogs, Markdown.

**Spec:** `docs/adr/0004-standardise-capability-contracts.md`

## Global Constraints

- Keep ADR 0004 capability-agnostic.
- Use TypeScript interfaces for behaviour and Zod 4 schemas for boundary data.
- Infer TypeScript boundary types from their schemas.
- Require one shared conformance suite for every contract implementation.
- Do not create a capability package before ADR 0005 selects its semantics.
- Keep Zod's compatible range authoritative in the root Bun catalog.

---

### Task 1: Apply the accepted decision to repository policy

**Files:**

- Modify: `package.json`
- Modify: `packages/AGENTS.md`
- Modify: `ARCHITECTURE.md`
- Modify: `knowledge/index.md`

**Interfaces:**

- Consumes: ADR 0004's schema, interface, and conformance requirements.
- Produces: root catalog entry `"zod": "^4.5.4"` and discoverable repository
  guidance.

- [x] **Step 1: Add Zod 4 to the root Bun catalog**

Set `workspaces.catalog.zod` to `^4.5.4`. Do not add it to root
`devDependencies`; a future contract workspace will consume it with
`"zod": "catalog:"`.

- [x] **Step 2: Add the minimum package-local contract rules**

Require Zod-owned boundary schemas, inferred boundary types, TypeScript
behavioural interfaces, and shared conformance execution without copying the
ADR's detailed rationale.

- [x] **Step 3: Link current architecture and the knowledge index**

Add ADR 0004 to the implementation baseline and related-decision index. Update
the knowledge index date to `2026-09-03`.

### Task 2: Resolve dependencies and verify the repository

**Files:**

- Modify if resolution changes: `bun.lock`
- Modify: this plan

**Interfaces:**

- Consumes: the root package manifest and existing canonical checks.
- Produces: a completed implementation record with fresh verification evidence.

- [x] **Step 1: Resolve the root workspace**

Run: `bun install`

Expected: Bun accepts the Zod catalog entry. Because no workspace consumes Zod
yet, the lockfile may remain unchanged.

- [x] **Step 2: Run the canonical repository gate**

Run: `bun run check:ci`

Expected: dependency policy, strict TypeScript, and Bun tests pass.

- [x] **Step 3: Validate documentation and the complete diff**

Run local Markdown-link validation and `git diff --check`, then inspect every
changed file. Confirm that no capability package has been added.

- [x] **Step 4: Complete the implementation record**

Set this plan's status to `Completed`, mark every checkbox complete, and record
the verification commands actually run.

## Verification record

- `bun install --frozen-lockfile`
- `bun run check:ci`
- local Markdown-link validation
- `git diff --check`
- complete diff and workspace-topology inspection
