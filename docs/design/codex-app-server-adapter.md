# Codex app-server adapter design

- **Status:** Working design with partial spike evidence
- **Date:** 2026-09-04
- **Capability:** [ADR 0007](../adr/0007-provider-neutral-agent-execution.md)
- **Contract design:** [Agent execution contract](agent-execution-contract.md)

## Purpose

This document records how Codex app-server may implement Drawloom's proposed
agent-execution capability. It is provider-specific design and evidence, not a
portable contract or supported integration.

The adapter uses Codex app-server rather than `codex exec`. It owns app-server
transport, negotiation, translation, continuation encoding, context and tool
projection, and normalization into the contract's signal vocabulary. It does
not own Drawloom memory, tool execution, policy, sandboxing, orchestration,
durable events, or evaluation.

## Proposed mapping

| Drawloom concept | Codex projection |
|---|---|
| Open new session | `thread/start` |
| Open from continuation | `thread/resume` with the validated thread ID |
| Execute operation | `turn/start` |
| Steer operation | `turn/steer` with `expectedTurnId` |
| Interrupt operation | `turn/interrupt` |
| Additional context | per-turn `additionalContext` |
| Session tool exposure | isolated MCP server configuration |
| Operation tool grant | authoritative MCP gateway grant |
| Tool correlation | gateway identifier preserved through MCP result `_meta` |
| Execution approval | app-server command, file, network, or permission request |
| Requested input | app-server user-input or MCP elicitation request |
| Provider delegation | `collabAgentToolCall` and `subAgentActivity` observation |
| Operation correlation | Drawloom operation ID mapped privately to Codex turn ID |
| Continuation payload | Codex thread ID inside the opaque envelope |
| Terminal outcome | `turn/completed` status |

Codex native cross-thread memory is disabled for Drawloom-managed sessions.
Codex continues to own its thread transcript and internal compaction. Drawloom
injects freshly compiled memory and other context for every execute or steer
command. It does not persist compiled memory into the Codex transcript through
`thread/inject_items`.

The adapter maps app-server events into the canonical vocabulary, synthesizing
connection-level signals where app-server has no matching notification.
Drawloom persists streamed observations as they arrive because app-server
history can reconstruct completed items but cannot guarantee replay of lost
deltas.

MCP is the stable initial tool-exposure boundary. App-server dynamic tools
remain experimental adapter functionality and are not required for portable
conformance. Configured Codex plugins, apps, MCP servers, and equivalent
ambient integrations must be disabled unless the Drawloom composition root
included them in the resolved exposure.

Provider-native delegated workers remain observations inside the parent
Drawloom operation. Codex child-thread identifiers are protected evidence and
do not become independently controllable Drawloom sessions.

## Initial tool-boundary evidence

A deliberately throwaway Bun and TypeScript spike on 2026-09-04 exercised
Codex app-server 0.149.0 with protocol schema SHA-256
`4f4a8d8f53f971b97f818639f58c8d26bb68bfcdfa2d2f20572cb97e6761ab91`.

One MCP server instance remained attached across three sequential operations
with allow, deny, and allow grants. A Drawloom-owned Zod 4 schema appeared as
strict draft-07 JSON Schema. Codex preserved the gateway-allocated tool
invocation identifier and Drawloom operation identifier in result `_meta`,
including for the denied invocation, and represented the denial as a failed MCP
tool item.

The spike also demonstrated that configured Codex plugins and apps remain
ambient unless launch configuration disables them. This evidence closes only
the tool exposure, grant, isolation, schema-projection, and exact-correlation
questions. The spike remains throwaway and does not become production adapter
code.

## Evidence still required

Before ADR 0007 can be reviewed for acceptance, disposable automated probes
and a manual Codex Desktop MCP smoke must demonstrate:

- supported app-server protocol version or schema digest detection;
- disabled native Codex cross-thread memory;
- sentinel memory and context supplied through `additionalContext` on execute
  and steer;
- lifecycle and terminal-signal mapping;
- lossless approval choices and resolution;
- requested-input mapping distinct from approval;
- interruption and continuation behaviour, including missing threads;
- optional steering semantics;
- provider-native delegation observation and lineage;
- durable observation with required Drawloom identities and without forbidden
  raw data; and
- Codex Desktop use of the same MCP boundary expected by the adapter.

Passing this evidence gate supports an acceptance review; it does not accept
ADR 0007, create a supported package, or authorize reuse of the spike code.

## Compared integrations

The boundary was informed by a Codex app-server integration that models thread
start and resume, turns, approvals, interruption, MCP configuration, and
ViewModel projection, and by Open Design's multi-provider runtime registry with
shared launch, transport, parsing, continuation, and event normalization.

Both show that provider adapters require substantial anti-corruption logic.
Neither justifies moving orchestration, presentation, durable event identity,
memory, or business authority into the adapter.
