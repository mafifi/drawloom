# ADR 0005 tool-exposure spike

This retained, non-production spike asks two questions first raised while
partitioning capabilities in ADR 0005 and carried into ADR 0007's agent
boundary:

1. Can one immutable session tool exposure enforce different authority for
   sequential operations while retaining authoritative operation correlation?
2. Can Codex app-server discover that exposure once through MCP and observe an
   allow, denial, and later allow without rebuilding its thread or MCP server?

Run the deterministic test from the repository root:

```sh
bun test spikes/adr-0005-tool-exposure/tool-authority.test.ts
```

The authenticated live reproduction is deliberately outside `check:ci`:

```sh
bun run spike:adr-0005
```

The authoritative verified result is the indexed
[tool-exposure evidence record](../../knowledge/evidence/adr-0005-tool-exposure.md).
This code is evidence, not a Drawloom implementation, and cannot be imported by
production modules.
