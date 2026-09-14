# How the systems work

These guides explain how Drawloom's components work together. Read the
[architecture overview](../../ARCHITECTURE.md) first, then choose the area you
want to understand or change.

## Agents and tools

- [Agent execution](agent-execution-contract.md): send work, follow progress and
  handle input, approval and interruption through the shared agent interface.
- [Codex integration](codex-app-server-adapter.md): how that interface connects
  to Codex App Server.
- [Tool execution](tool-execution-contract.md): define callable tools, check
  access and record their results.

## Workbenches and the desktop

- [Desktop host](desktop-host.md): connect projects, plugins, conversations
  and files without mixing their permissions or state.
- [Desktop shell](desktop-shell.md): the desktop layout and presentation design.
- [Orchestration](orchestration-contract.md): organise tasks and workflows,
  including waiting, retrying and recovering after interruption.

## Learning from work

- [Knowledge and memory](local-knowledge.md): record observations, curate
  learnings and retrieve their evidence.
- [Evaluation](evaluation.md): assess saved results or run comparisons using
  reusable checks.
- [Knowledge interactions](knowledge-interactions.md) and
  [evaluation interactions](evaluation-interactions.md): the related user journeys.

## Using a design as a reference

This directory contains both implementation guides and retained design material.
Read the linked ADR and evidence when a distinction matters: an accepted design
does not mean every proposed feature was implemented or tested.

Current exported types and package tests determine how to call the code.
The [foundation API guide](../reference/foundation-api.md) links to those
packages. Use the ADRs for decisions and alternatives, not as an installation
manual.
