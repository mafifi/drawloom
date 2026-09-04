# ADR 0008 tool execution proof

Retained, non-production evidence for the
[tool execution contract](../../docs/design/tool-execution-contract.md).
No code here is a supported API or a production starting point.

```sh
bun test spikes/adr-0008-tool-execution
bun run spike:adr-0008
```

The first command runs offline and is included in `check:ci`. The second needs
a locally authenticated `codex`, launches app-server and an isolated stdio MCP
server, and incurs model usage. It does not alter global Codex configuration.
It prints a redacted pass/fail summary, archives its created thread, closes its
processes, and deletes temporary runtime files. Cleanup failure fails the run.

## Contents

- `contract.ts`, `authoring.ts`: candidate schemas, behavioural port, and typed
  definition helper; neither imports the gateway or a provider SDK.
- `conformance.ts`, `gateway.test.ts`: one factory-driven behavioural suite,
  currently exercised against the one local gateway in `gateway.ts`.
- `authoring.test.ts`: input defaults, type inference, names, and projection.
- `codex-binding.ts`, `codex-binding.test.ts`: private origin mapping and MCP
  result translation, including failure and correlation.
- `mcp-server.ts`, `runtime-state.ts`, `run-live.ts`: test-only composition,
  synchronized runtime files, controlled delay/replay, and live assertions.

The runner explicitly reuses `StdioCodexTransport` from the
[`ADR 0007 spike`](../adr-0007-codex-app-server/). The fixed `word_count` catalogue
does not change between operations. Trusted thread/turn acceptance mappings
drive live authority checks; model arguments cannot select an operation.

The injected delay holds a genuine Codex A request before gateway dispatch,
revokes A, accepts B, then releases A. A second controlled MCP connection replays
the captured A envelope, attempts an operation-ID argument, and omits metadata.
Only the control and B may reach the handler. This is not generic deduplication:
replaying an authorized invocation may execute again, and callers own retries.

The files and delay hooks are proof fixtures, not proposed storage, orchestration,
or networking infrastructure. The metadata is trusted only over composition-owned
stdio; arbitrary remote MCP clients cannot claim authority by supplying `_meta`.

Authoritative results and limitations:
[`knowledge/evidence/adr-0008-tool-execution.md`](../../knowledge/evidence/adr-0008-tool-execution.md).
