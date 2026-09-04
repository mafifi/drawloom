---
type: evidence
id: adr-0005-tool-exposure
title: Codex session tool exposure and operation authority
status: active
created: 2026-09-04
updated: 2026-09-04
---

# Codex session tool exposure and operation authority

## Outcome

The scoped hypothesis passed on 2026-09-04: Codex app-server retained one
session-scoped MCP exposure while an external Drawloom-owned authority changed
the permission applied to each sequential operation.

This supports ADR 0005's capability ownership and ADR 0007's accepted agent
boundary. It is not production implementation guidance and does not by itself
accept either ADR.

## Environment

- Codex CLI/app-server: `0.149.0`
- App-server protocol schema SHA-256:
  `4f4a8d8f53f971b97f818639f58c8d26bb68bfcdfa2d2f20572cb97e6761ab91`
- Bun: `1.2.23`
- MCP TypeScript SDK: `1.26.0`
- Zod: the projects-monorepo root Zod 4 installation used by the original run

These values describe the verified run, not current dependency requirements.
The retained reproduction now resolves dependencies from Drawloom's root Bun
catalog.

## Method

The retained harness is
[`spikes/adr-0005-tool-exposure`](../../spikes/adr-0005-tool-exposure/).
From the repository root:

```sh
bun test spikes/adr-0005-tool-exposure/tool-authority.test.ts
bun run spike:adr-0005
```

The live runner generates and hashes the installed app-server schema, creates a
persisted test thread, disables native memory, executes an allow-deny-allow
sequence, checks gateway/provider correlation, archives the thread, and exits
non-zero when an invariant fails.

## Observed evidence

- One MCP server instance exposed one `drawloom_probe` tool for all three
  operations. Its generated draft-07 JSON Schema retained `minLength: 1` and
  `additionalProperties: false` from the Drawloom-owned Zod schema.
- Operation 1 used grant 1 and executed successfully.
- Operation 2 used grant 2, which exposed the same catalogue but omitted the
  tool from the executable allowlist. The gateway denied the invocation and
  Codex emitted the corresponding MCP tool item with `status: "failed"`.
- Operation 3 used grant 3 and executed successfully without reopening the
  thread or MCP server.
- All gateway records carried the same server-instance and exposure identity.
- The gateway allocated a distinct `toolInvocationId` for each call. Codex
  preserved that identifier and the Drawloom `operationId` in result `_meta`,
  including for the denied invocation, providing exact correlation without
  inference from names, arguments, order, or timing.
- All three Codex turns completed and the persisted spike thread was archived.

## Findings

1. A session exposure with operation-specific gateway authority works for
   sequential Codex turns. Authority belongs to tools and policy, not the agent
   adapter or model input.
2. MCP result `_meta` is an exact-correlation carrier for the verified Codex
   version. Agent observation may retain bounded correlation references while
   the tool subsystem remains authoritative for arguments and results.
3. Launch isolation is part of projection. Emptying only `mcp_servers` did not
   suppress installed Codex plugins and apps. Emptying `plugins`, `apps`, and
   `mcp_servers`, then adding only the selected exposure, made the run
   deterministic.
4. `thread/memoryMode/set` is rejected for ephemeral Codex threads. A
   memory-disabled integration must use a persisted thread and clean it up, or
   rely on a future start-time memory-mode option.
5. The high-level MCP SDK helper encountered a TypeScript conflict when two Zod
   4 instances were resolved. A lower-level MCP handler kept the advertised JSON
   Schema and contract-owned parsing explicit.

## Limits

This run did not prove revocation during an in-flight invocation, concurrent
tool calls or operations, exposure expiry, credential rotation, remote HTTP MCP
transport, reconnect/resume, approvals, requested input, steering,
interruption, provider delegation, or durable observation. Those questions
belong to the ADR 0007 evidence spike.
