# ADR 0003 Toolchain Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed

**Goal:** Implement the accepted TypeScript, Bun, portability, dependency, and
release foundation described by ADR 0003 without inventing product capability
packages.

**Architecture:** The root Bun workspace owns tool versions, dependency catalogs,
and canonical checks. Workspace manifests declare external dependencies through
the root catalog and internal dependencies through workspace references. A pure
manifest validator and its CLI enforce the policy before product packages exist.

**Tech Stack:** Bun 1.2.23, TypeScript 5.9, Bun workspaces and catalogs,
`bun:test`, GitHub Actions.

**Spec:** `docs/adr/0003-typescript-bun-and-portable-packages.md`

## Global Constraints

- Keep TypeScript and ESM as the product implementation baseline.
- Use Bun as the only repository package manager and primary test runner.
- Keep external dependency ranges authoritative at the root.
- Use `catalog:` for workspace external dependencies and `workspace:*` for
  internal dependencies.
- Do not create capability packages before their contracts are accepted.
- Preserve one cohesive signed-off commit for ADR 0003 and its implementation,
  as explicitly requested by the maintainer.

---

### Task 1: Initialise the root workspace

**Files:**

- Create: `package.json`
- Create: `bun.lock`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Inspect: `.gitignore`

**Interfaces:**

- Produces: root scripts `check`, `check:ci`, `check:types`,
  `check:dependency-policy`, and `test`.
- Produces: workspace globs `apps/*` and `packages/*/*` plus the default Bun
  dependency catalog.

- [x] **Step 1: Add the private ESM root manifest**

```json
{
  "name": "drawloom",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "packageManager": "bun@1.2.23",
  "engines": { "node": ">=22" },
  "workspaces": {
    "packages": ["apps/*", "packages/*/*"],
    "catalog": {}
  }
}
```

- [x] **Step 2: Add strict portable and repository TypeScript configurations**

`tsconfig.base.json` excludes ambient runtime types and enables strictness;
`tsconfig.json` adds Bun and Node types only for repository automation under
`scripts/`.

- [x] **Step 3: Install root development dependencies**

Run: `bun install`

Expected: `bun.lock` is created with the pinned root toolchain dependencies.

### Task 2: Define and test the dependency-policy validator

**Files:**

- Create: `scripts/dependency-policy.ts`
- Create: `scripts/dependency-policy.test.ts`
- Create: `scripts/check-dependency-policy.ts`

**Interfaces:**

- Produces: `validateDependencyPolicy(root, workspaces): PolicyViolation[]`.
- Produces: `check-dependency-policy.ts` with a zero exit status only when every
  discovered workspace manifest follows ADR 0003.

- [x] **Step 1: Write failing policy tests**

Cover valid catalog/workspace references, direct external ranges, external
`*`, missing catalog entries, incorrect internal references, missing Drawloom
metadata, and divergent publishable versions.

- [x] **Step 2: Run the tests and confirm the validator is absent**

Run: `bun test scripts/dependency-policy.test.ts`

Expected: failure because `validateDependencyPolicy` is not implemented.

- [x] **Step 3: Implement the pure validator and filesystem CLI**

The validator returns structured violations with workspace, field, and message.
The CLI discovers the `apps/*/package.json` and
`packages/*/*/package.json` manifests declared by the root workspace.

- [x] **Step 4: Run focused tests**

Run: `bun test scripts/dependency-policy.test.ts`

Expected: all dependency-policy tests pass.

### Task 3: Add progressive guidance and current reference

**Files:**

- Modify: `AGENTS.md`
- Modify: `packages/AGENTS.md`
- Create: `apps/AGENTS.md`
- Create: `apps/README.md`
- Create: `docs/reference/dependency-policy.md`
- Modify: `scripts/README.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: root commands and manifest policy from Tasks 1 and 2.
- Produces: concise repository-wide rules with detailed policy linked from one
  authoritative reference document.

- [x] **Step 1: Add root and local agent invariants**

State root version authority, catalog/workspace protocols, host-boundary rules,
and the required dependency-policy check without copying the detailed reference.

- [x] **Step 2: Document applications and dependency exceptions**

Document SvelteKit/Cloudflare and Tauri boundaries, Drawloom package metadata,
the explicit exception process, and canonical commands.

### Task 4: Wire CI and verify the cohesive change

**Files:**

- Create: `.github/workflows/ci.yml`
- Modify: `docs/adr/0003-typescript-bun-and-portable-packages.md`
- Modify: this plan

**Interfaces:**

- Consumes: root `check:ci` command.
- Produces: a GitHub Actions quality gate using the pinned Bun version and a
  frozen lockfile install.

- [x] **Step 1: Add the CI workflow**

Run `bun install --frozen-lockfile` followed by `bun run check:ci` on pushes and
pull requests.

- [x] **Step 2: Run all canonical checks**

Run: `bun run check:ci`

Expected: dependency policy, strict type checking, and Bun tests all pass.

- [x] **Step 3: Verify documentation, package metadata, and Git diff**

Run the Markdown link check, `git diff --check`, and inspect the complete staged
diff.

- [x] **Step 4: Mark this plan completed and make one signed-off commit**

```sh
git commit --signoff -m "build: implement ADR 0003 toolchain foundation"
```

## Verification record

- `bun install --frozen-lockfile`
- `bun run check:ci`
- local Markdown-link validation
- `git diff --check`
