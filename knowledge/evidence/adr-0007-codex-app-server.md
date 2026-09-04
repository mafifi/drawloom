---
type: evidence
id: adr-0007-codex-app-server
title: Codex app-server evidence for provider-neutral agent execution
status: active
created: 2026-09-04
updated: 2026-09-04
---

# Codex app-server evidence for provider-neutral agent execution

## Current conclusion

The retained automated spike passed one complete run on 2026-09-04. It supports
the accepted driver/session boundary, adapter-private continuity, compiled
context projection, small operation lifecycle, distinct interactions, safe
signals, MCP tool ownership, and bounded provider-native delegation described
by ADR 0007.

Fresh Codex Desktop tasks also discovered and invoked the retained stdio MCP
server, and provider-native delegation completed with an exact child sentinel.
Desktop did not, however, present MCP form elicitation to the user: both a
single request and two concurrent requests were immediately answered with
`decline`. This is a documented Desktop host limitation, not an app-server
adapter failure: the Drawloom client round-tripped the same interaction and
Desktop still discovered and invoked the MCP boundary. Provider diagnostics are
not projected by the accepted initial mapping. The evidence gate is closed and
supports acceptance of ADR 0007.

## Environment

- Bun: `1.2.23`
- Codex CLI/app-server: `0.149.0`
- Codex Desktop app: `26.901.31953` (`7868`)
- Codex Desktop bundled CLI: `0.153.1`
- App-server protocol schema SHA-256:
  `4f4a8d8f53f971b97f818639f58c8d26bb68bfcdfa2d2f20572cb97e6761ab91`
- Zod: `4.5.4`
- MCP TypeScript SDK: `1.30.0`
- Verification date: 2026-09-04

## Reproduction

The retained harness is
[`spikes/adr-0007-codex-app-server`](../../spikes/adr-0007-codex-app-server/).
From the repository root:

```sh
bun install --frozen-lockfile
bun run check:ci
bun run spike:adr-0007
```

The live command requires local Codex authentication and incurs model usage. It
prints a redacted result and does not update this record automatically. Model
tool selection receives at most three attempts; transport, lifecycle, ordering,
correlation, schema, and cleanup assertions are single-shot.

## Automated result

| Evidence gate | Result | Observation |
|---|---|---|
| Protocol detection | Passed | The generated schema contained every required method and field token and matched the recorded digest. |
| Native memory and context | Passed | A persisted thread accepted disabled memory mode, and the final content included distinct session and per-operation sentinels supplied by the adapter. |
| Operation lifecycle | Passed | A concurrent execute was rejected, including while provider acceptance was pending; pre-acceptance notifications were delivered after `operation.started`; and exactly one terminal outcome ended each accepted operation. |
| Steering | Passed | `turn/steer` targeted the active provider turn, and both steering text and steering `additionalContext` affected the final response. |
| Interruption | Passed | An operation blocked on MCP input was interrupted, emitted the provider-confirmed terminal signal, and rejected resolution of the invalidated pending input. Deterministic coverage verifies repeated interruption is idempotent. |
| Approval | Passed | Codex emitted `item/commandExecution/requestApproval`; the adapter preserved its offered choices and returned one advertised deny-capable choice. The proposed write did not occur. |
| Requested input | Passed | MCP form elicitation became `input.requested`, remained distinct from approval, and round-tripped submitted JSON. |
| Multiple pending interactions | Passed | Two concurrent MCP elicitations remained independently addressable and both resolved by Drawloom request identity. |
| Safe observations | Passed | Live usage or reasoning-summary activity became strict bounded observations. Deterministic tests separately reject unbounded signal fields and provider identifiers. |
| Provider-native delegation | Passed | A real delegated child returned an exact sentinel through app-server; the adapter emitted only its bounded delegation observation. A separate fresh Desktop task also completed native delegation with the same sentinel. |
| Adapter-private resume | Passed | A new app-server process and driver resumed the private provider thread by Drawloom session identity and recovered a transcript-only sentinel without exposing provider identity in signals. |
| MCP tool boundary | Passed | The retained ADR 0005 allow-deny-allow reproduction passed under the current root dependencies. |
| Cleanup | Passed | Every parent thread created by the complete run was archived in `finally`, nested spike cleanup fails closed, and temporary runtime artifacts were removed. Provider-native descendants follow app-server's recursive parent archival behaviour. |

## Codex Desktop result

The manual Desktop smoke ran in fresh projectless tasks against the same
retained stdio MCP server. No raw task, tool-call, provider-thread, or child
identifier is retained here.

| Desktop gate | Result | Observation |
|---|---|---|
| MCP discovery | Passed | Desktop exposed both retained probe tools to a fresh task. |
| MCP invocation | Passed | Desktop invoked the requested tool exactly once in each control. |
| Single form elicitation | Failed | The client advertised form elicitation but returned `decline` immediately; no form reached the user. |
| Concurrent form elicitation | Failed | Both requests completed without UI and the server reported that at least one value was not supplied. |
| Provider-native delegation | Passed | A delegated child completed and returned the exact requested sentinel to its parent. |

The single-request control rules out concurrency as the cause. This result does
not contradict the direct app-server requested-input evidence: it shows that
the tested Desktop composition handles the same MCP server differently from the
adapter's app-server client.

## Deterministic coverage

The offline tests in `check:ci` verify subscription before execution, a true
single-consumer stream, ordered delivery across the provider-acceptance race,
one reserved or active operation, provider-confirmed idempotent interruption,
terminal preservation, process-exit failure propagation, request timeouts,
idempotent closure, multiple interaction routing and invalidation, modern and
legacy Codex approval callbacks, strict safe signals, bounded usage and
provider-native delegation observations, and removal of provider identifiers.

Dependency-cruiser independently prevents any module outside `spikes/` from
importing this experimental adapter, including through a type-only import.

## Known limitations and later evidence

1. The tested Desktop host declines MCP form elicitation without presenting UI.
   Drawloom's accepted Codex integration targets app-server directly and does
   not depend on Desktop rendering that interaction.
2. Provider diagnostics are not part of the initial Codex signal mapping. A
   later addition requires live evidence and a demonstrated consumer need.

## Data handling

The checked-in result contains no raw model transcript, provider thread, turn,
message, child, approval, or tool-call identifier, credentials, command output,
or unredacted protocol envelope. The live runner retains only bounded signal
summaries and unique method names for failure diagnosis.
