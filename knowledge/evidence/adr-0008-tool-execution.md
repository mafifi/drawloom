---
type: evidence
id: adr-0008-tool-execution
title: Tool execution and Codex MCP authority-binding evidence
status: active
created: 2026-09-04
updated: 2026-09-04
---

# Tool execution and Codex MCP authority-binding evidence

## Conclusion

The focused live proof passed on 2026-09-04. A typed local word-count tool ran
through Codex app-server and MCP, preserved canonical output and invocation
correlation, and retained one MCP server across operation changes. A real A
request delayed until B was accepted, and a controlled replay of A's envelope,
were both denied while B executed using its own authority.

Together with the working contract and deterministic conformance suite, this
closes the evidence work listed in [ADR 0008](../../docs/adr/0008-tool-execution-and-exposure.md).
The maintainer subsequently accepted the ADR on 2026-09-04. No supported package,
production durability, security certification, or cross-provider compatibility
is claimed.

## Environment and reproduction

- Verification date: 2026-09-04
- Bun: `1.2.23`
- Codex CLI/app-server: `0.149.0`
- Zod: `4.5.4`
- MCP TypeScript SDK: `1.30.0`

From the repository root:

```sh
bun install --frozen-lockfile
bun run check:ci
bun run spike:adr-0008
```

The [retained runner](../../spikes/adr-0008-tool-execution/run-live.ts) requires
local Codex authentication and incurs model usage. Assertions are single-shot;
the runner does not retry model tool selection or gateway execution. Runtime
state is temporary and each created provider thread is archived in `finally`.
The command does not change this record or global Codex settings automatically.

## Live observations

| Gate | Observed result |
|---|---|
| Trusted origin | Codex's MCP request supplied a call ID and thread/turn pair matching app-server acceptance. The tool received its mapped Drawloom operation identity. |
| Canonical result | `word_count({ text: "one two three" })` returned canonical `{ count: 3 }` and default JSON text through app-server's MCP result. |
| Correlation | Result metadata retained the exact Drawloom invocation ID recorded by the gateway. |
| Stable exposure | The control, delayed A, and B used the same MCP server instance and unchanged tool catalogue. |
| Late arrival | The test held an actual A request before dispatch, revoked A, interrupted its provider turn, accepted B, then released A. A returned `denied`; B succeeded. |
| Replay | A's captured envelope was replayed through a second composition-owned test connection while B remained active. It returned `denied`, not B's result. |
| Model arguments | Adding `operationId: "operation-b"` to tool arguments returned `invalid_input`. Arguments could not change the binding. |
| Missing metadata | A request without origin metadata returned `denied`; there was no fallback to the active operation. |
| Effects | Exactly the control and B reached the handler. Neither delayed, replayed, forged, nor origin-free requests produced an effect. |
| Execution evidence | Each observed invocation had acknowledged start/finish records with the same originating operation, invocation ID, and outcome status. |
| Cleanup | The runner archived its created thread, closed clients/transports, and removed its temporary runtime directory. |

The delayed call is a genuine provider request with a test-only delay. The
replay and forged/missing metadata cases are controlled SDK calls, not claims
about an adversarial model producing those envelopes.

## Deterministic coverage

The spike has 23 passing offline tests: 17 cases in a factory-driven gateway
conformance suite, two authoring cases, three provider-binding/projection
cases, and one failure-report redaction case. The complete `bun run check:ci`
gate passed with 54 tests, zero failures,
and successful dependency-policy, architecture, design, and TypeScript checks.
The frozen install made no dependency changes. The new cases cover:

- default and custom rendering without mutation of canonical output;
- typed schema-derived handler inputs, input defaults, and rejection of empty
  names, duplicate names, and tested unprojectable schema constructs;
- input/output validation with invalid paths and no raw error/value reflection;
- start acknowledgement before execution, start failure without effects, and
  outcome acknowledgement failure preserving a known successful result;
- revocation or cancellation during acknowledgement, overlapping invocations,
  stale and forged bindings, and pre-aborted execution;
- cancellation after an effect and a timeout signal while a non-cooperative
  handler is still running, without claiming rollback or hard termination;
- no automatic retry after failure and a distinct renderer-failure outcome;
- exact provider-origin mapping that cannot be reassigned, malformed metadata
  rejection, and MCP canonical/correlation projection with evidence-failure flags.

The conformance suite imports only the candidate contract/authoring surface,
not the local gateway implementation. Only one gateway implementation is
currently tested. Dependency-cruiser includes these files in the existing rule
forbidding imports from outside `spikes/`; live/model calls remain outside CI.

## Source corroboration and limitations

The installed-version Codex source corroborates the observed metadata:

- [`mcp_tool_call.rs`](https://github.com/openai/codex/blob/rust-v0.149.0/codex-rs/core/src/mcp_tool_call.rs):
  `build_mcp_tool_call_request_meta` supplies `callId` and turn metadata to MCP calls.
- [`turn_metadata.rs`](https://github.com/openai/codex/blob/rust-v0.149.0/codex-rs/core/src/turn_metadata.rs)
  and [`responses_metadata.rs`](https://github.com/openai/codex/blob/rust-v0.149.0/codex-rs/core/src/responses_metadata.rs):
  the projected turn metadata contains `thread_id` and `turn_id`.

1. These are Codex-private fields, not a universal MCP guarantee. The binding
   stays inside the provider adapter. Upgrade or alternate-host compatibility
   requires rerunning the probe; missing metadata fails closed.
2. Trust comes from the isolated, composition-owned stdio connection, not the
   name `_meta`. A remote/shared untrusted transport needs its own authenticated
   binding; that is outside this proof.
3. Thread/turn mapping is published from provider acceptance. The adapter may
   briefly wait for that exact mapping but never reads a current-operation
   fallback. Authority revocation prevents subsequent dispatch; it cannot undo
   effects from an already-running handler.
4. The local file evidence sink acknowledges write, sync, and close; it does
   not prove crash recovery, transactional effects, exactly-once execution,
   distributed observability durability, or generic replay deduplication.
5. This run targets app-server directly. It does not repeat the separate
   [ADR 0007 Desktop interaction smoke](adr-0007-codex-app-server.md), prove this
   binding for Desktop's bundled CLI, or establish support for other providers.

## Data handling

No raw transcript, provider thread/turn/call ID, credential, captured envelope,
or runtime trace is checked in. The live runner retains such data only in its
temporary runtime directory and prints redacted gate results.
