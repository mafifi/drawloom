# Codex app-server adapter design

- **Status:** Accepted design with retained spike evidence
- **Date:** 2026-09-04
- **Capability:** [ADR 0007](../adr/0007-provider-neutral-agent-execution.md)
- **Contract design:** [Agent execution contract](agent-execution-contract.md)

## Purpose

This document records how Codex app-server may implement Drawloom's accepted
agent-execution capability. It is provider-specific design and evidence, not a
portable contract or supported integration.

The adapter uses Codex app-server rather than `codex exec`. It owns app-server
transport, negotiation, translation, private continuity and recovery, context
and tool projection, and normalization into the contract's signal vocabulary.
It does not own Drawloom memory, tool execution, policy, sandboxing,
orchestration, durable events, or evaluation.

## Accepted mapping

| Drawloom concept | Codex projection |
|---|---|
| Open session | Adapter-private `thread/start` or `thread/resume` |
| Execute operation | `turn/start` |
| Steer operation | `turn/steer` with `expectedTurnId` |
| Interrupt operation | `turn/interrupt` |
| Additional context | per-turn `additionalContext` |
| Session tool exposure | isolated MCP server configuration |
| Operation authority | authoritative MCP gateway state keyed by operation |
| Tool correlation | gateway identifier preserved through MCP result `_meta` |
| Execution approval | app-server command, file, network, or permission request |
| Requested input | app-server user-input or MCP elicitation request |
| Provider delegation | `collabAgentToolCall` and `subAgentActivity` observation |
| Operation correlation | Drawloom operation ID mapped privately to Codex turn ID |
| Provider continuity | adapter-private Codex thread ID and recovery |
| Terminal outcome | `turn/completed` status |

### Native review addition (ADR 0015)

The supported adapter adds `human` / `delegated` operation review, mapped to
`approvalsReviewer: user` / `auto_review`. Session `reviewerModes` reports support;
omission means human, and unsupported selection rejects. Codex 0.153.4 is the
verified minimum for this integration. Thread startup confirms the effective
human reviewer, then each turn supplies its selected reviewer. No global config,
sandbox, approval policy or organisation requirement is changed.

Drawloom MCP configuration sets `default_tools_approval_mode: prompt` and explicit
per-tool `prompt`, except trusted `readOnlyHint: true` tools use `approve`.
Annotations are behavioural hints, not permissions; the gateway still checks the
current grant at invocation. Native MCP approval is identified only by
`_meta.codex_approval_kind: mcp_tool_call`; ordinary elicitation remains input.
The existing approval interaction carries bounded action details and provider
decisions privately mapped to opaque options. Its identity is scoped to the
session, originating turn and request and is invalidated by resolution or end.

Native `item/autoApprovalReview/started|completed` notifications surface bounded
`approval-review` observations only for delegated turns. Progress is distinct
from approved, denied, timed-out and cancelled outcomes. No raw envelope or
second tool-evidence store is introduced. These native notification fields remain
upstream-unstable; incompatible responses fail explicitly. A plugin preview is
not required. See [ADR 0015](../adr/0015-working-material-ownership-and-edit-approval.md)
for ownership, proof and exclusions.

Codex native cross-thread memory is disabled for Drawloom-managed sessions.
Codex continues to own its thread transcript and internal compaction. Drawloom
injects freshly compiled memory and other context for every execute or steer
command. It does not persist compiled memory into the Codex transcript through
`thread/inject_items`.

The adapter hides recoverable app-server connection changes and maps operation,
content, interaction, and bounded provider activity into the safe signal
vocabulary. Drawloom persists streamed observations as they arrive because
app-server history can reconstruct completed items but cannot guarantee replay
of lost deltas.

The adapter exposes one ordered signal stream. The consumer attaches before the
first `turn/start`; the adapter does not replay earlier notifications or drop a
terminal outcome. Closing or unrecoverable app-server failure ends the stream
only after any active operation receives its terminal signal.

MCP is the stable initial tool-exposure boundary. App-server dynamic tools
remain experimental adapter functionality and are not required for portable
conformance. Configured Codex plugins, apps, MCP servers, and equivalent
ambient integrations must be disabled unless the Drawloom composition root
included them in the resolved exposure.

The [ADR 0015 live run](../reference/adr-0015-native-edit-review.md#boundaries-and-follow-up)
found that the existing empty-map launch overrides did not achieve this on the
installed 0.153.4 runtime: ambient integrations still appeared in thread-scoped
inventory. Treat complete ambient isolation as an unresolved implementation
follow-up, not as a guarantee established by the current native-review proof.

The advertised MCP tool catalogue is immutable for one session. Gateway allow
and deny decisions remain dynamic and do not require rebuilding the Codex
thread. A changed advertised catalogue requires reopening the Drawloom session.

Provider-native delegated workers remain bounded observations inside the parent
Drawloom operation. The ordinary signal carries only a bounded name, safe
summary, and optional protected-evidence reference. The adapter does not
reconstruct portable child identities or lifecycle. Codex child-thread
identifiers are protected evidence and do not become independently controllable
Drawloom sessions.

## Initial tool-boundary evidence

A retained, explicitly non-production Bun and TypeScript spike on 2026-09-04
exercised
Codex app-server 0.149.0 with protocol schema SHA-256
`4f4a8d8f53f971b97f818639f58c8d26bb68bfcdfa2d2f20572cb97e6761ab91`.

One MCP server instance remained attached across three sequential operations
while the authoritative gateway applied allow, deny, and allow decisions. A
Drawloom-owned Zod 4 schema appeared as strict draft-07 JSON Schema. Codex
preserved the gateway-allocated tool invocation identifier and Drawloom
operation identifier in result `_meta`, including for the denied invocation,
and represented the denial as a failed MCP tool item. This demonstrates that
operation authority need not cross the agent contract as a separate grant.

The spike also demonstrated that configured Codex plugins and apps remain
ambient unless launch configuration disables them. This evidence closes only
the tool exposure, gateway-authority, isolation, schema-projection, and
exact-correlation questions. The harness and authoritative result are retained
in the [ADR 0005 tool-exposure spike](../../spikes/adr-0005-tool-exposure/) and
its [evidence record](../../knowledge/evidence/adr-0005-tool-exposure.md).
Retention makes the evidence reproducible; the spike remains outside product
packages and does not become production adapter code.

## Current evidence boundary

The retained [ADR 0007 Codex spike](../../spikes/adr-0007-codex-app-server/)
produced a complete passing automated run on 2026-09-04. Its indexed
[evidence record](../../knowledge/evidence/adr-0007-codex-app-server.md)
records the exact environment, scoped results, and remaining gaps without raw
provider traces.

The retained non-production probes and manual Codex Desktop MCP smoke cover:

- supported app-server protocol version or schema digest detection;
- disabled native Codex cross-thread memory;
- sentinel memory and context supplied through `additionalContext` on execute
  and steer;
- one-active-operation and terminal-signal mapping;
- ordered single-consumer signal delivery and coherent stream closure;
- lossless approval choices and resolution;
- requested-input mapping distinct from approval;
- multiple pending interactions and invalidation on terminal outcome;
- interruption and adapter-private start, resume, and recovery behaviour;
- optional steering semantics;
- bounded provider observations for reasoning, usage, and native
  delegation using summaries and protected evidence without reconstructed child
  lineage or arbitrary provider JSON;
- durable observation with required Drawloom identities and without forbidden
  raw data; and
- Codex Desktop use of the same MCP boundary expected by the adapter.

The automated run closes the protocol, context, memory-mode, lifecycle,
steering, interruption, approval, requested-input, concurrent-interaction,
private-resume, bounded usage/reasoning observation, provider-native
delegation, and MCP tool-boundary items. Fresh Desktop tasks discovered and
invoked the same retained MCP server and completed provider-native delegation.
Desktop nevertheless returned `decline` immediately for both single and
concurrent MCP form elicitation without presenting UI. This is retained as a
Desktop host limitation rather than a requirement of Drawloom's app-server
client. The initial Codex mapping does not project provider diagnostics into
ordinary signals; that can be added later only with evidence and a consumer.

This evidence supported acceptance of ADR 0007. Acceptance does not create a
supported package or authorize reuse of the spike code.

## Compared integrations

The boundary was informed by a Codex app-server integration that models thread
start and resume, turns, approvals, interruption, MCP configuration, and
ViewModel projection, and by Open Design's multi-provider runtime registry with
shared launch, transport, parsing, continuation, and event normalization.

Both show that provider adapters require substantial anti-corruption logic.
Neither justifies moving orchestration, presentation, durable event identity,
memory, or business authority into the adapter.
