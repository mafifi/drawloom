# ADR 0007: Define provider-neutral agent execution

- **Status:** Proposed
- **Date:** 2026-09-04
- **Decision owners:** Drawloom maintainers

## Context

[ADR 0005](0005-partition-agent-platform-capabilities.md) separates agent
execution from model inference, memory, knowledge, context compilation, tools,
policy and approval, sandboxing, observability, evaluation, and orchestration.
Drawloom now needs the first concrete capability contract through which an
orchestrator can use an interactive agent provider without adopting its SDK,
protocol, transcript, or application-service vocabulary.

The first intended implementation integrates Codex app-server, which owns an
inner agent loop and provider-native thread transcript. Other providers may
offer different continuation, streaming, approval, tool, steering, or
delegation behaviour. The portable contract therefore describes observable
agent-execution semantics and leaves protocol mechanics in adapters.

[ADR 0004](0004-standardise-capability-contracts.md) governs the eventual
TypeScript interfaces, Zod 4 boundary schemas, and shared conformance suite.
The evolving exact contract is preserved in the
[agent execution contract design](../design/agent-execution-contract.md).

## Decision

### Introduce an agent-execution capability

The future contract package is `packages/agent/agent`, published as
`@drawloom/agent` only after this ADR is accepted and implemented.

The public vocabulary is:

- an **agent driver** implements agent execution for one provider;
- an **execution session** is Drawloom's logical relationship with provider
  continuation and may outlive one provider connection;
- an **operation** is one active unit of agent work within a session;
- a **continuation envelope** is opaque provider state needed to reopen a
  session;
- a **session signal** is a transient provider-neutral observation; and
- an **agent event** is a durable Drawloom observation produced outside the
  adapter.

The behavioural boundary exposes an `AgentDriver` that reports capabilities
and opens sessions. An `AgentSession` executes operations and, where supported,
accepts steering, resolves execution approvals, responds to requested input,
interrupts work, closes its live attachment, and emits session signals.

Exact method signatures and serializable values belong to the working contract
design and ultimately to contract-owned Zod schemas and inferred TypeScript
types. They are not duplicated in this ADR.

### Preserve the capability ownership boundaries

Drawloom orchestration owns durable session and operation identities,
cross-capability sequencing, context selection, tool grants, approval routing,
and child-work lineage.

The agent driver owns provider connection, protocol negotiation, translation,
continuation encoding and validation, provider-specific projection, and signal
normalization. It does not own authoritative memory, context compilation, tool
execution, policy, sandboxing, durable event storage, evaluation, or
orchestration.

The provider may own its native thread transcript, internal compaction, and
inner agent loop. Its identifiers remain protected correlation evidence and do
not become Drawloom session, operation, run, memory, or business identities.

### Use logical sessions with one active operation

An execution session has a logical lifecycle independent of a live provider
attachment. Connection loss does not itself close the logical session. The
same session may be reopened using an opaque continuation envelope; how a
provider resumes is an adapter concern.

Version one permits one active operation per session. An accepted operation
eventually terminates as completed, failed, or interrupted. A second execute
request while an operation is active is rejected, and adapters isolate late or
superseded provider activity.

Executing an operation is asynchronous: acceptance confirms that the provider
accepted the work rather than waiting for completion. Closing and interrupting
are idempotent at the portable boundary.

### Receive context and tool authority from adjacent capabilities

Opening a session receives compiled session context and an immutable
session-scoped tool exposure. Each operation receives freshly compiled
additional context and an operation-scoped tool grant that can only narrow that
exposure.

Agent execution consumes these contract-owned values or references. It does
not compile context, retrieve memory, register authoritative tools, authorize
invocations, or execute tools. Ambient provider plugins, apps, MCP servers, and
equivalent external tools are disabled unless selected by the composition
root.

The tool gateway remains authoritative for invocation validation and evidence.
Exact tool correlation is claimed only when an explicit Drawloom correlation
identifier survives the provider transport; adapters do not infer correlation
from ordering, timing, names, arguments, or textual similarity.

### Keep continuation opaque

Drawloom persists a versioned continuation envelope while the driver owns and
validates its payload. An envelope identifies its provider, driver, and payload
version. A driver rejects another owner's envelope or an unsupported version
and never silently creates fresh provider history when requested continuation
is unavailable.

Opaque payloads and provider identifiers do not enter ordinary event or UI
projections.

### Make optional interaction semantics explicit

Capabilities declare support for continuation, interruption, steering,
execution approvals, recoverable approvals, requested input, tool observation,
provider-native delegation observation, message phases, reasoning summaries,
and usage reporting. Method presence alone does not claim support.

Steering targets the exact active operation and augments it without creating a
new operation. Requested input supplies information and remains distinct from
execution approval. Approval choices are cascaded losslessly through policy,
persistence, presentation, and resolution; consumers do not reduce a
provider's choices to invented binary controls.

Execution approval remains separate from spend authority, artifact review,
publication, business approval, and other consequential authority owned by
adjacent capabilities.

### Observe provider delegation without outsourcing orchestration

A child that Drawloom must address, resume, steer, interrupt, grant tools to,
or recover independently is a normal Drawloom-orchestrated session and
operation.

Provider-native delegation remains observable activity inside its parent
operation in version one. It does not create an independently controllable
`AgentSession` or transfer orchestration authority to the provider. Provider
child identifiers and transcripts remain protected evidence.

### Emit transient signals, not durable provider events

The driver emits a strict provider-neutral signal union in live delivery order.
Drawloom observability validates and redacts signals, allocates durable event
identity and ordering, and stores permitted projections. The adapter does not
allocate Drawloom event identifiers or expose raw provider envelopes, hidden
reasoning, credentials, continuation payloads, or unrestricted command output
as ordinary events.

Exact signal members, failure values, interaction payloads, and projection
rules remain in the working contract design until implemented as executable
schemas.

### Require shared conformance and provider evidence

The agent contract will export a provider-neutral conformance suite. Every
driver exercises the behaviours it claims, including lifecycle, continuation,
interaction controls, tool-boundary isolation, correlation, delegation
observation, signal validation, and redaction.

Codex app-server is the first proposed provider, not the definition of the
contract. Its protocol mapping, tool-exposure spike, and remaining evidence
gates live in the
[Codex app-server adapter design](../design/codex-app-server-adapter.md).

This ADR remains Proposed until the working contract is complete and disposable
Codex integration tests plus a manual Codex Desktop MCP smoke demonstrate the
semantics claimed by the adapter. Passing those probes is evidence for an
acceptance review, not acceptance by itself.

## Consequences

- Consumers can operate an interactive agent without depending on provider
  thread, turn, event, or tool vocabulary.
- Provider-native transcript management remains usable without becoming
  Drawloom memory or orchestration state.
- Context, tools, policy, sandboxing, observability, and orchestration can
  evolve behind their own contracts.
- Optional provider features are explicit and conformance-tested rather than
  approximated silently.
- Adapters perform meaningful translation and validation instead of acting as
  thin SDK wrappers.
- Exact contract design and provider evidence remain substantial follow-up work
  even though this ADR is intentionally concise.
- No production agent package or supported API exists while this ADR remains
  Proposed.

## Alternatives considered

### Mirror Codex app-server

This would minimize work for the first adapter but expose Codex thread, turn,
approval, and item semantics to every consumer and future provider.

### Expose a single blocking run callback

A blocking callback obscures streaming, steering, approvals, requested input,
interruption, connection loss, continuation, and operation identity.

### Let the adapter own adjacent capabilities

Allowing an agent adapter to retrieve memory, compile context, authorize or
execute tools, persist durable events, or orchestrate children would recreate
the monolithic boundary rejected by ADR 0005.

### Persist and replay the provider transcript

This duplicates provider transcript and compaction behaviour and conflates it
with Drawloom's authoritative memory and observations. Drawloom instead stores
its own inputs, references, events, and protected continuation evidence.
