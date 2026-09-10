# ADR 0018 package and backend boundary proof

Retained public synthetic evidence, not a supported loader. Run from Drawloom:

```sh
bun install --frozen-lockfile
bun test spikes/adr-0018-plugin-standards
```

[ADR 0018](../../docs/adr/0018-plugin-standards-and-runtime-extensions.md) remains
Proposed. [Evidence](../../knowledge/evidence/adr-0018-plugin-standards.md) owns
observations and limits.

## Executable path

- `contract.ts`: host-specific inventory and backend control types.
- `loader.ts`: manifest/skill discovery with YAML parsing, contained resource
  reads and independently validated stdio entries. Discovery runs no package code.
- `runtime.ts`: explicit stdio activation, standard environment and persistent
  instance data. Each running package owns its connections and cleanup.
- `fixtures/plain`: one standard package, one intentionally missing executable,
  a skill/reference and an MCP Apps resource. The fixture assumes Node and the
  repository-installed MCP libraries; it is not a self-contained distribution.
- `app.test.ts`: the existing desktop MCP Apps host/bridge consuming that package.
  Host composition explicitly chooses the opening tool, not a new manifest field.
- `backend-control.ts`: existing trusted backend composition calling the ADR 0017
  contract. It deliberately imports that retained spike. The memory implementation
  is selected only by the test; this is not another production orchestration engine.

## Important limits

Only stdio is implemented. Remote transports are reported invalid-or-unsupported;
OAuth, redirects, installation UI, a production skill-selection adapter and full
Agent Plugins/Agent Skills conformance are not established. Skills retain paths
and supporting files; discovery does not pass those instructions to a live model.
File reads have a 1 MiB proof limit. Process activation assumes trusted packages
and is not an OS sandbox. Same-server concurrent mutation semantics remain server-owned.

The standard process and the backend control are **two distinct experiments**.
There is no cross-process Drawloom capability channel here. No new RPC methods,
reverse-domain namespace, executable extension loader or browser privileges have
been added. A same-process injected interface working is not proof that an MCP
subprocess can obtain it. That is the next maintainer boundary decision.

SDK `App` and `AppBridge` run over their real in-memory transport for protocol
checks; the package server runs over real stdio. No browser rendering, native
agent approval, paid generation or live model claim follows from these tests.
