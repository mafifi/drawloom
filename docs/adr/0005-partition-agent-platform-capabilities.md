# ADR 0005: Partition the agent platform into explicit capabilities

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decision owners:** Drawloom maintainers

## Context

Drawloom must make an AI workload controlled, portable, inspectable, and
reproducible without turning one model SDK, agent service, transcript store,
tool protocol, sandbox, or application host into the architecture.

[ADR 0004](0004-standardise-capability-contracts.md) defines how an individual
capability contract is expressed and verified. Before applying that standard to
agent execution, Drawloom needs to decide which concerns are independent
capabilities, which one owns each fact or decision, and how they may interact.
Without that map, a first provider integration can easily absorb memory,
context, tools, policy, orchestration, and observability into one oversized
contract.

This ADR defines the platform partition. It deliberately does not define exact
TypeScript interfaces, Zod schemas, provider protocol mappings, or conformance
fixtures for each capability. Those belong to the applicable capability ADR,
contract design and package, or provider design.

## Decision

### Separate the core capabilities

Drawloom uses the following logical capability boundaries. A capability does
not imply a separate process, service, deployment, or package until its own ADR
and implementation require one.

| Capability | Owns | Does not own |
|---|---|---|
| Model inference | A bounded model request and response | Agent loops, memory, tools, or orchestration |
| Agent execution | A provider-neutral interactive agent session and its operations | Authoritative memory, tool execution, policy, durable events, or orchestration |
| Memory | Retained experience and curated retrieval from that experience | Provider transcripts or final context assembly |
| Knowledge | Provenance-bearing sources and claims | Session history or retrieval policy |
| Context compilation | A deterministic, versioned context assembled for execution | Source memory, knowledge, policy, or provider transcripts |
| Tools | Tool definitions, input validation, invocation, results, and execution evidence | Permission to invoke or host isolation |
| Policy and approval | Authority decisions, grants, and approval resolution | Tool implementation or sandbox enforcement |
| Sandbox | Enforcement of filesystem, process, network, and resource constraints | Business policy or permission decisions |
| Observability | Durable events, traces, redaction, ordering, and projections | Provider control or business authority |
| Evaluation | Assessment of executions and artifacts against declared criteria | Execution control unless policy explicitly consumes an evaluation |
| Orchestration | Cross-capability workflow, durable run identity, sequencing, and child-work lineage | Provider protocol translation or another capability's internal state |

Memory storage, curation, confidence, retrieval, and reweaving require their own
ADR. This document establishes only that memory is authoritative independently
of provider transcript management and that context compilation, rather than
the provider adapter, selects what enters an execution.

### Make orchestration the coordinator, not the owner of everything

The intended interaction is:

```text
instructions   memory   knowledge   policy   run input
      \           |         |          |        /
                  context compilation
                           |
orchestration ------ agent execution ------ provider adapter
       |                   |
       |              tool request
       |                   |
       +------ policy -> tool gateway -> sandbox
                           |
                    execution evidence

normalized observations -> observability -> evaluation
```

Orchestration allocates durable workflow identities and coordinates calls, but
it does not absorb the contracts it coordinates. Each capability remains
usable and testable through its own public contract. Composition roots select
implementations and wire their dependencies.

### Keep authority distinct from mechanism

Policy decides whether an action is allowed. The tool capability validates and
performs an allowed invocation. The sandbox enforces host constraints. Agent
execution exposes allowed tools to a provider and reports interaction, but it
does not become the authority, executor, or sandbox.

These boundaries remain distinct even when one local implementation performs
several roles in the same process. A combined deployment does not justify a
combined public contract.

### Compile context instead of sharing ambient state

Context compilation receives explicit revisions or references from its source
capabilities and produces a bounded, versioned execution input. Agent execution
receives that compiled result. It does not query memory or knowledge directly,
and a provider's transcript does not become Drawloom memory.

Provider-native transcript management may preserve conversational continuity
inside an agent implementation. Provider continuation is opaque evidence used
by the agent-execution capability, not a memory, run, or orchestration identity.

### Cross boundaries through owned values and references

The capability authoritative for a fact owns its boundary schema. Another
capability consumes that public value or a stable reference to it; it does not
copy the schema, import package internals, or manufacture provider
configuration.

Large, sensitive, or separately governed values cross by bounded reference
where practical. Provider identifiers, credentials, raw transcripts, hidden
reasoning, unrestricted command output, and opaque continuation payloads do not
become general cross-capability values.

### Keep providers behind anti-corruption adapters

A provider package implements one capability contract and translates provider
concepts into its vocabulary. It may contain transports, parsers, codecs, and
projection logic, but it does not redefine adjacent capability boundaries.

Provider selection occurs only in a composition root. Consumers depend on
contracts, and every provider executes the conformance suite owned by the
contract it implements.

### Decide and implement capabilities incrementally

Each capability receives a focused ADR when it has a consequential decision to
make. That ADR records ownership, observable semantics, dependencies,
alternatives, and consequences. Exact TypeScript interfaces, Zod schemas, and
conformance cases belong in the capability's working contract design and
eventually its contract package.

Provider mappings and protocol evidence live in provider designs and spike
records linked from the relevant ADR. They do not expand the portable contract
unless the capability requires the observed semantic.

A follow-up ADR applies this partition first to the agent-execution capability.
Its working contract design preserves the detailed interface exploration that
informed these boundaries.

## Implementation

The repository architecture map records the capability partition and
dependency direction. Documentation distinguishes durable ADRs from detailed
working designs so exact interfaces, schemas, provider mappings, and spike
evidence can evolve without expanding an overview ADR.

No capability package is created by this ADR. Each package remains gated by its
focused capability ADR, contract design, conformance requirements, and cohesive
implementation.

## Consequences

- Capability ADRs can be reviewed in dependency order without requiring one
  document to settle the whole platform.
- Memory, context, tools, policy, sandbox, observability, evaluation, and
  orchestration remain replaceable independently of the first agent provider.
- Exact contract work remains valuable but is published as contract design and
  executable schemas rather than embedded wholesale in an overview ADR.
- More explicit composition is required because no provider or orchestration
  package may reach into adjacent implementations.
- Some deployments will contain several capabilities in one process while
  preserving their logical and testable boundaries.
- No new capability package is authorized by this ADR alone.

## Alternatives considered

### Define one agent-platform contract

A single contract would reduce initial wiring but would couple memory,
context, tools, sandboxing, policy, orchestration, and observability to one
implementation lifecycle and make independent replacement largely nominal.

### Let the first provider establish the boundaries

Starting from a provider protocol is fast for one integration but promotes its
thread, tool, approval, and event model into every consumer. Provider concepts
remain adapter implementation details instead.

### Put every exact interface in this ADR

This preserves design discussion in one place but makes the architectural map
depend on low-level contract evolution and provider evidence. Exact schemas and
interfaces instead live with the capability they specify.

### Create every package immediately

Pre-creating the complete capability graph would imply semantics that have not
yet been decided. Packages are created only with an accepted capability ADR and
its cohesive implementation.
