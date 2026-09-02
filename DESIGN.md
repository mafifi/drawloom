# Design

## Purpose

Drawloom provides the infrastructure around a model that makes an AI workload
controlled, portable, inspectable, and reproducible.

Its architectural metaphor is a programmable loom: durable constraints and
run-specific inputs are composed into a traceable execution. The metaphor may
guide product language and visual identity, but public APIs use direct technical
names.

## Product principles

### Contracts before providers

Every capability begins as a provider-independent contract with a shared
conformance suite. Implementations may differ without changing consumers.

### Context is compiled

Instructions, knowledge, memory, tools, policy, and run inputs are assembled
into an explicit, versioned execution context. Hidden ambient state is treated
as a defect.

### Control is part of execution

Sandboxing, permissions, guardrails, evaluation, traces, and human approval are
not optional wrappers around orchestration. They are part of the harness.

### Local and hosted implementations are peers

The architecture does not make a particular cloud, model provider, database,
or sandbox its centre. Deployment-specific choices live behind contracts.

### Legibility is a feature

The repository should make architectural intent discoverable through short
maps, progressive documentation, mechanical boundary checks, and generated
views where appropriate.

## Non-goals for the foundation

- Building the user interface before the runtime contracts are understood.
- Mirroring the structure of a consuming monorepo.
- Introducing microservices or multiple implementation languages prematurely.
- Treating one provider implementation as the architecture.
- Creating generic `utils`, `shared`, or `tools` dumping grounds.

## Naming vocabulary

The product name is Drawloom. `Draft`, `weave`, `pattern`, and `thread` may be
used where they make the product easier to understand, but they do not replace
precise domain terms such as contract, provider, policy, sandbox, or trace.
