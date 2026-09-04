# ADR 0007 Codex Evidence Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkboxes (`- [ ]`) for tracking.

**Goal:** Retain Drawloom's architectural spikes, enforce that production code
cannot import them, and add a reproducible Codex app-server spike covering ADR
0007's remaining provider-evidence gates.

**Architecture:** `spikes/` is a repository-owned, non-production verification
surface outside the Bun workspace package globs. Dependency-cruiser enforces
that modules outside `spikes/` cannot import spike modules, including type-only
imports. Deterministic tests exercise a contract-shaped spike adapter against a
fake transport; an explicit live command exercises Codex app-server and records
redacted conclusions under `knowledge/evidence/`.

**Tech Stack:** Bun 1.2.23, TypeScript 5.9.3, Zod 4.5.4,
dependency-cruiser 18.2.0, MCP TypeScript SDK 1.30.0, Codex app-server 0.149.0.

**Spec:** [ADR 0007](../adr/0007-provider-neutral-agent-execution.md) and the
[Codex app-server adapter design](../design/codex-app-server-adapter.md)

**Status:** Complete

## Global constraints

- Spike code is non-production and must not be imported outside `spikes/`.
- Spikes are not Bun workspace packages and expose no supported Drawloom API.
- Root Bun catalog entries remain the only external dependency version source.
- Offline tests belong in `check:ci`; authenticated or model-dependent runs do
  not.
- Checked-in evidence is redacted and contains no raw transcripts, provider
  identifiers, credentials, or personal data.
- ADR 0007 acceptance does not promote spike code into a supported package.

---

### Task 1: Establish and enforce the retained spike surface

**Files:**
- Create: `spikes/AGENTS.md`
- Create: `spikes/README.md`
- Create: `.dependency-cruiser.mjs`
- Modify: `package.json`
- Modify: `bun.lock`
- Modify: `tsconfig.json`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `scripts/README.md`

**Interfaces:**
- Consumes: repository paths and TypeScript import resolution from
  `tsconfig.json`.
- Produces: `bun run check:architecture`, which exits non-zero whenever a module
  outside `spikes/` imports a module beneath `spikes/`.

- [x] Add dependency-cruiser 18.2.0 to the root catalog and consume it from the
  root development dependencies through `catalog:`.
- [x] Add a `no-import-from-spikes` forbidden rule whose source excludes
  `^spikes/` and whose target matches `^spikes/`, with pre-compilation TypeScript
  dependency discovery enabled so `import type` is also checked.
- [x] Add `check:architecture` to `check:ci` and include `spikes/**/*.ts` in the
  strict root TypeScript project.
- [x] Create a temporary module outside `spikes/` that imports a spike fixture,
  run `bun run check:architecture`, and verify it fails specifically with
  `no-import-from-spikes`; remove the temporary module and verify the command
  passes.
- [x] Document the retained but unsupported spike surface and its import rule in
  the repository maps and local agent guide.

### Task 2: Retain the existing tool-authority spike and evidence

**Files:**
- Create: `spikes/adr-0005-tool-exposure/README.md`
- Create: `spikes/adr-0005-tool-exposure/tool-authority.ts`
- Create: `spikes/adr-0005-tool-exposure/tool-authority.test.ts`
- Create: `spikes/adr-0005-tool-exposure/mcp-server.ts`
- Create: `spikes/adr-0005-tool-exposure/run-live-spike.ts`
- Create: `knowledge/evidence/adr-0005-tool-exposure.md`
- Modify: `knowledge/index.md`
- Modify: `docs/design/codex-app-server-adapter.md`
- Remove after repository verification:
  `/Users/afifim/Development/projects/spikes/drawloom-adr-0005-tool-exposure/`

**Interfaces:**
- Consumes: root Zod and MCP SDK development dependencies.
- Produces: the existing deterministic authority tests, explicit live probe,
  and an indexed OKF evidence record preserving the observed 2026-09-04 result.

- [x] Copy the existing Drawloom spike into the retained surface without
  changing its demonstrated allow-deny-allow semantics.
- [x] Convert `RESULTS.md` into an active OKF evidence record and link the spike
  README, Codex adapter design, and knowledge index to that record.
- [x] Run the migrated unit test and strict typecheck before removing the old
  external copy.
- [x] Remove only the migrated Drawloom spike from the central disposable-spike
  directory; leave unrelated project spikes untouched.

### Task 3: Define the contract-shaped spike adapter with deterministic tests

**Files:**
- Create: `spikes/adr-0007-codex-app-server/README.md`
- Create: `spikes/adr-0007-codex-app-server/contract.ts`
- Create: `spikes/adr-0007-codex-app-server/app-server-client.ts`
- Create: `spikes/adr-0007-codex-app-server/app-server-client.test.ts`
- Create: `spikes/adr-0007-codex-app-server/adapter.ts`
- Create: `spikes/adr-0007-codex-app-server/adapter.test.ts`

**Interfaces:**
- Consumes: a narrow JSON-RPC transport with `request`, `respond`,
  `notifications`, `requests`, failure notification, request timeout, and
  `close` operations.
- Produces: a non-production `CodexSpikeDriver` matching the accepted
  `AgentDriver`/`AgentSession` behaviour and strict Zod schemas for its safe
  signal union.

- [x] Write failing tests for subscription-before-execute, one starting or
  active operation, ordered lifecycle/content signals, transport death and
  timeout, exactly one terminal outcome, idempotent close and interrupt, and
  terminal invalidation of pending interactions.
- [x] Implement the smallest adapter state machine that makes those tests pass.
- [x] Write failing tests for approval-choice preservation, requested-input
  separation, identity-based resolution, bounded provider observations, and
  rejection of raw provider data.
- [x] Implement request normalization and safe observation projection, then run
  the focused test suite and strict typecheck.

### Task 4: Add reproducible Codex app-server live scenarios

**Files:**
- Create: `spikes/adr-0007-codex-app-server/protocol.ts`
- Create: `spikes/adr-0007-codex-app-server/run-live.ts`
- Create: `spikes/adr-0007-codex-app-server/desktop-smoke.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the installed `codex app-server --stdio`, local Codex
  authentication, and the retained ADR 0005 MCP probe.
- Produces: `bun run spike:adr-0007`, a non-CI command returning a structured
  pass/fail result for every automated ADR evidence gate and archiving created
  Codex threads in `finally` cleanup.

- [x] Detect the installed Codex version and generated protocol schema digest,
  and fail before model execution when required methods or fields are absent.
- [x] Launch app-server with memories, plugins, apps, and ambient MCP servers
  disabled; open a persisted thread and disable native memory.
- [x] Exercise session and per-operation `additionalContext`, ordered signals,
  single-active-operation rejection, terminal mapping, steering, interruption,
  and adapter-private resume using structural assertions rather than exact model
  prose.
- [x] Exercise approval and requested-input callbacks while preserving choices,
  keeping the interaction families distinct, correlating multiple pending
  requests by identity, and invalidating unresolved requests at terminal state.
- [x] Exercise bounded reasoning, usage, and provider-delegation observations
  without emitting provider identifiers or arbitrary JSON.
- [x] Remove unevidenced diagnostic mapping from the initial Codex claim and
  retain diagnostics as possible later work requiring evidence and a consumer.
- [x] Re-run the retained MCP allow-deny-allow scenario through the same live
  command and assert ambient isolation, immutable exposure, dynamic authority,
  strict schema projection, and exact explicit correlation.
- [x] Archive every created thread, remove temporary runtime artifacts, fail
  closed when nested cleanup fails, and emit redacted structured results
  without persisting raw protocol traffic.

### Task 5: Record evidence and verify the repository

**Files:**
- Create: `knowledge/evidence/adr-0007-codex-app-server.md`
- Modify: `knowledge/index.md`
- Modify: `docs/design/agent-execution-contract.md`
- Modify: `docs/design/codex-app-server-adapter.md`
- Modify: this plan

**Interfaces:**
- Consumes: deterministic and live run outcomes plus the manual Desktop MCP
  checklist.
- Produces: an indexed, redacted evidence record that identifies each ADR 0007
  evidence gate as passed, failed, or not yet run.

- [x] Run `bun install --frozen-lockfile`, `bun run check:ci`, and
  `bun run spike:adr-0007`; record exact versions, schema digest, commands, and
  gate outcomes.
- [x] Execute the manual Codex Desktop MCP checklist against the same retained
  probe and record its mixed result separately from automated app-server
  evidence.
- [x] Update working design prose from disposable/throwaway evidence to retained
  non-production evidence and link the authoritative records rather than
  duplicating results.
- [x] Run `git diff --check`, inspect the complete diff and repository status,
  and mark ADR 0007 Accepted after its evidence review.
