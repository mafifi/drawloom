---
step: 4
title: Decisions
question: What we chose and why
summary: The decisions that shape Drawloom, and why we made them.
draft: false
---

Every important choice in Drawloom is written down: the problem, the options,
what we chose and what it costs. We've made 34 so far. These are the ones that
shape Drawloom most.

## How Drawloom is built

- **[Each part has one job.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0005-partition-agent-platform-capabilities.md)**
  Drawloom is split into 10 capabilities, such as memory, tools and approval.
  Each can be improved or replaced without touching the rest.
- **[Every version of a part passes the same tests.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0004-standardise-capability-contracts.md)**
  If you replace a part with your own, you run the same tests we do, so you know
  it behaves the same way.
- **[Open source under Apache 2.0.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0002-open-core-licensing.md)**
  The core is free to use, change and share, including in commercial products.

## Working with the agent

- **[One way to talk to any agent.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0007-provider-neutral-agent-execution.md)**
  Drawloom talks to agents through one shared interface. Codex is the first
  agent behind it.
- **[You stay in control of actions.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0015-working-material-ownership-and-edit-approval.md)**
  Drawloom uses the agent's own approval controls, so you approve actions the
  way you already do in Codex.
- **[Work stays with its project.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0020-directory-backed-projects-and-file-delivery.md)**
  Every conversation belongs to one project folder, and its files always come
  from that folder.

## Plugins

- **[Plugins use open standards.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0018-plugin-standards-and-runtime-extensions.md)**
  Drawloom loads plugins in the open Agent Plugins format, and plugin screens
  use MCP Apps. A plugin in the standard format needs no Drawloom-specific
  changes.
- **[Installing isn't permission.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0013-plugin-boundaries-and-host-integration.md)**
  Adding a plugin doesn't let it do anything. You decide what it can use.

## Knowledge and memory

- **[Your knowledge stays on your computer.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0024-local-knowledge-memory-and-retrieval.md)**
  Drawloom stores what it learns locally, with a note of where each fact came
  from.
- **[Your organisation sets the rules.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0023-knowledge-memory-authorization-boundaries.md)**
  Drawloom enforces who can see what. Your organisation decides the rules.

## Reliability and release

- **[Long-running work survives a restart.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0021-local-temporal-orchestration.md)**
  Drawloom runs long jobs on Temporal, so they pick up where they left off after
  a crash or restart.
- **[Only permissive licences.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)**
  Everything Drawloom ships must be free to use and share. We check every
  dependency, including the ones inside other dependencies.
- **[Run and ship on Node.js.](https://github.com/mafifi/drawloom/blob/main/docs/adr/0034-node-toolchain.md)**
  We moved from Bun to Node.js when we found that Bun didn't fit our licence
  policy.

## Learn more

- [All 34 decisions](https://github.com/mafifi/drawloom/tree/main/docs/adr)
- [How Drawloom fits together](https://github.com/mafifi/drawloom/blob/main/ARCHITECTURE.md)
