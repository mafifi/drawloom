# Architectural spikes

This directory contains retained, reproducible experiments that support
Drawloom architecture decisions. Spikes deliberately remain outside the Bun
workspace package globs: they publish no package, promise no compatibility, and
must not be imported by production code.

Each spike separates three things:

1. deterministic tests that run in `bun run check:ci`;
2. explicit live commands that may require local provider authentication or
   incur model usage; and
3. a redacted, indexed result under [`knowledge/evidence/`](../knowledge/evidence/).

`bun run check:architecture` uses dependency-cruiser to reject every import
from outside `spikes/` into this directory. The rule includes TypeScript
type-only imports.

Current spikes:

- [`adr-0022-memory`](adr-0022-memory/): temporary JSON evidence, automatic
  observation capture and maintenance, and fresh-agent recall through existing
  Codex and tool contracts, plus an installed standard Git evidence plugin and
  bounded code-knowledge retrieval.

- [`adr-0005-tool-exposure`](adr-0005-tool-exposure/): immutable MCP exposure
  with operation-specific gateway authority.
- [`adr-0007-codex-app-server`](adr-0007-codex-app-server/): contract-shaped
  Codex app-server integration evidence.
- [`adr-0008-tool-execution`](adr-0008-tool-execution/): typed tool execution,
  evidence failure semantics, and Codex MCP origin-bound authority.
