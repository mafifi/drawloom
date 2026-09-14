# Developer reference

Use these guides when building with Drawloom or investigating how it behaves.
For the bigger picture, start with [Architecture](../../ARCHITECTURE.md).

## Build and connect

- [Foundation APIs](foundation-api.md): the shared interfaces and implementations.
- [Plugin packages](plugin-packages.md): package and install skills, tools,
  workbenches and Drawloom extensions.
- [Discovery and resources](discovery-and-resources.md): find available
  contributions and supply selected context.
- [Desktop host](../design/desktop-host.md): connect plugins to the application.
- [Dependency policy](dependency-policy.md): package roles, versions and checks.

## Follow and assess work

- [Conversation history](conversation-history.md): save, search and page through
  messages without replaying agent execution.
- [Orchestration](../design/orchestration-contract.md): define and run workflows.
- [Knowledge and memory](../design/local-knowledge.md): store and curate learnings.
- [Evaluation](../design/evaluation.md): run checks and compare results.
- [Observability](observability.md): inspect activity through traces and metrics.

## Explore the implementation and its evidence

The [repository walkthrough](repository-audit/README.md) links the code maps
and reading route. The [evidence guide](evidence/README.md) explains where
retained publication evidence and newly generated reports live.

Research surveys explain what we learned from other implementations:

- [Harnesses and workbenches](harness-workbench-survey/README.md)
- [Knowledge and memory](knowledge-memory-survey/README.md)
- [Evaluation](evaluation-survey/README.md)
- [Authorization](authorization-survey/README.md)

Surveys record the source versions inspected and the limits of their findings.
They do not, by themselves, approve a new interface or prove that Drawloom
implements the same behaviour.
