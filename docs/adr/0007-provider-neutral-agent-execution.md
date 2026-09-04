# ADR 0007: Define provider-neutral agent execution

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decision owners:** Drawloom maintainers

## Context

[ADR 0005](0005-partition-agent-platform-capabilities.md) separates agent
execution from model inference, memory, knowledge, context compilation, tools,
policy and approval, sandboxing, observability, evaluation, and orchestration.
Drawloom needs a contract through which an orchestrator can use an interactive
agent provider without adopting its SDK, protocol, transcript, or
application-service vocabulary.

The first intended implementation integrates Codex app-server, which owns an
inner agent loop and provider-native thread transcript. Other providers may
offer different continuation, streaming, approval, tool, steering, or
delegation behaviour. The portable contract must preserve the boundaries that
make those providers replaceable without manufacturing parity between them.

[ADR 0004](0004-standardise-capability-contracts.md) governs the eventual
TypeScript interfaces, Zod 4 boundary schemas, and shared conformance suite.
[ADR 0006](0006-evidence-led-architecture-principles.md) requires every
mechanism to earn its engineering and maintenance cost. The evolving exact
contract is preserved in the
[agent execution contract design](../design/agent-execution-contract.md).

## Decision

### Introduce one agent-execution boundary

The future contract package is `packages/agent/agent`, published as
`@drawloom/agent` only after this ADR is accepted and implemented.

An `AgentDriver` opens an `AgentSession` for one provider implementation. A
session accepts one active operation at a time, emits safe provider-neutral
signals, and exposes only the optional controls the driver actually supports.

Drawloom allocates session and operation identities. Provider thread, turn,
message, and request identifiers remain adapter-private correlation evidence.
The contract does not introduce separate public identities for every observed
provider object.

### Preserve capability ownership

Drawloom orchestration owns durable session and operation identities,
cross-capability sequencing, context selection, tool and policy coordination,
approval routing, and child-work lineage.

The agent driver owns provider connection, protocol negotiation, translation,
context and tool projection, native transcript continuity, reconnection,
resumption, and safe signal normalization. It does not own authoritative
memory, context compilation, tool execution, policy, sandboxing, durable event
storage, evaluation, or orchestration.

The provider may own its native transcript, internal compaction, and inner
agent loop. These remain implementation state rather than Drawloom memory or
orchestration state.

### Hide provider continuity inside the adapter

Drawloom identifies the logical execution session; the adapter decides how that
session maps to provider state. Starting, resuming, reconnecting, or asking the
provider to continue are adapter mechanics.

The portable contract does not expose a continuation envelope, provider thread
identifier, connection lifecycle, or resumption state machine. An adapter may
persist private provider state keyed by the Drawloom session identity. If that
state becomes unavailable, the adapter either restores coherent continuity
from the supplied context or reports a bounded provider failure; the choice and
its verification remain provider-specific.

### Keep the operation lifecycle small

Version one permits one starting or active operation per session. A second
execute request while provider acceptance is pending or work is active is
rejected.

An accepted operation emits zero or more safe signals and exactly one terminal
outcome: completed, failed, or interrupted. The adapter absorbs connection
recovery where possible and isolates late provider activity. It exposes a
provider disconnection only when that disconnection prevents the operation
from completing coherently.

Version-one input is text. Media input remains in scope for later compatible
evolution when a provider and consumer demonstrate its required semantics.

Closing and interrupting are idempotent. Concurrent interruption requests share
one provider decision, and interruption becomes terminal only when the provider
reports the outcome. Steering and interruption are optional session methods;
method presence is the capability declaration. The contract does not maintain
a parallel boolean capability matrix.

Each session exposes one ordered, single-consumer signal stream. The consumer
subscribes before the first operation. Signals are not replayed, and the stream
ends only after session closure or unrecoverable failure. An adapter never
silently drops or reorders signals; every accepted operation emits its terminal
signal before the stream ends.

### Consume context without redefining it

Opening a session receives context compiled for that session. Each operation
and steering input may receive freshly compiled additional context.

The context-compilation capability owns the compiled value, including its
trust handling and provenance. Agent execution consumes that value and projects
only what the provider needs; it does not define memory, knowledge, policy, or
provenance categories of its own.

### Expose tools once and leave grants with their owners

Opening a session receives a resolved tool exposure owned by the tool
capability. The adapter projects that exposure through MCP or another supported
provider mechanism. Version one keeps the advertised exposure immutable for
the life of the session. Changing the advertised tool catalogue requires
closing and reopening the session; changing gateway authority does not.

Operation-specific permission remains authoritative in policy and the tool
gateway. The agent-operation input carries its operation identity, not a
duplicate grant or policy snapshot. The gateway evaluates each invocation
against the current operation and records authoritative tool evidence.

Exact agent-to-tool correlation is claimed only when a Drawloom correlation
identifier survives the provider transport. Adapters do not infer exact links
from timing, ordering, names, arguments, or textual similarity.

Ambient provider plugins, apps, MCP servers, and equivalent external tools are
disabled unless selected by the composition root.

Provider-native command, file, or network actions that cannot be removed remain
subject to Drawloom policy and sandbox enforcement. They do not become
Drawloom tool executions merely because the provider exposes them.

### Keep requested input and approval distinct

Supplying information is not the same as granting execution authority. The
contract therefore keeps requested input and execution approval as separate
interactions.

An execution-approval request carries a safe summary and the choices the
adapter can currently honour. Each choice has a stable Drawloom identifier and
provider-authored presentation text. Resolution sends only the selected choice
identifier; the adapter privately retains the provider response it represents.
Choices are passed through losslessly rather than reduced to invented binary
controls.

The agent contract does not standardise provider approval scope, consequence
taxonomies, recovery, expiry, or policy provenance before a policy consumer
demonstrates a portable need. Policy remains free to reject or hide choices,
but it does not invent or widen them.

A requested-input interaction carries a safe prompt and, when supplied by the
provider, a response schema. It resolves with submitted data or cancellation
and grants no tool, filesystem, network, spend, publication, or business
authority.

One operation may have multiple pending approval and requested-input
interactions. The adapter owns their provider callbacks and correlates them by
request identity. Terminal operation outcome or session closure invalidates all
unresolved interactions. If adapter recovery cannot preserve pending
interactions, the operation fails rather than silently losing them.

Execution approval also remains distinct from spend authority, artifact
review, publication, and other business decisions owned by adjacent
capabilities.

### Observe provider activity without shadow orchestration

A child that Drawloom must address, resume, steer, interrupt, grant tools to,
or recover independently is a normal Drawloom-orchestrated session and
operation.

Provider-native delegation remains activity inside its parent operation. The
adapter may emit a bounded, presentation-safe provider observation containing
only a name, safe summary, and optional protected-evidence reference. Rich
provider data stays in adapter-owned evidence. Version one does not assign
portable delegation identities, reconstruct a child lifecycle, inherit grants
in the agent contract, or expose the child as an independently controllable
session.

### Emit safe signals and let observability own events

The driver emits a small strict union covering operation lifecycle, streamed
content, requested input, approval, and bounded provider observations. Signals
are safe for ordinary consumption by construction: they exclude raw provider
envelopes, credentials, hidden reasoning, unrestricted command output, private
continuation state, and provider identifiers.

The observability capability validates a signal and adds durable event
identity, ordering, time, storage, redaction policy, and projections. The agent
contract does not define a second `AgentEvent` payload model or a deterministic
signal-to-event transformation.

Content may carry stable message identity for stream assembly and an optional
provider-supported phase. Absence of a phase is represented by absence rather
than an invented `unknown` value. Reasoning summaries, usage, and
provider-native delegation use the bounded provider-observation summary and
protected-evidence path until evidence justifies a portable semantic. The
portable signal contains no arbitrary provider JSON.

Authoritative tool invocation and result events come from the tool gateway and
are correlated with agent signals through Drawloom operation identity. Agent
execution does not emit a second copy of tool evidence.

### Keep failures and conformance proportional

Expected command failures use a small portable taxonomy: invalid state or
interaction, provider unavailable, and provider rejected. Unsupported optional
controls are absent from the session interface. Retry policy belongs to
orchestration rather than a driver-authored `retryable` flag. Unexpected
defects may throw only after provider errors and secrets have been translated
out.

Provider availability, installation, authentication, account information,
model catalogues, and rate limits remain adjacent contracts rather than agent
session methods.

The shared conformance suite verifies the core session and operation invariants,
safe signal validation, tool-authority isolation, and each optional control
that an implementation exposes. Provider protocol mapping, connection recovery,
and observational richness remain provider-specific tests rather than
combinations in a portable capability matrix.

### Retain provider evidence supporting acceptance

Codex app-server is the first evidenced provider, not the definition of the
contract. Its protocol mapping, tool-exposure spike, and evidence gates live in
the
[Codex app-server adapter design](../design/codex-app-server-adapter.md).

Retained non-production Codex integration tests and a manual Codex Desktop MCP
smoke demonstrated the semantics claimed by the adapter. Desktop discovered and
invoked the same MCP boundary but declined MCP form elicitation without showing
UI; that host behaviour does not constrain Drawloom's app-server client, which
successfully round-tripped the interaction. The retained spike is evidence for
this decision, not production adapter code.

## Consequences

- Consumers can operate an interactive agent without provider protocol
  vocabulary.
- Adapters retain responsibility for their own transcript continuity and
  recovery rather than exporting it as Drawloom lifecycle machinery.
- Context, tools, policy, sandboxing, observability, and orchestration retain
  their own authority and public types.
- The contract has fewer coordinated state machines and no capability-flag
  combinations to keep consistent.
- Approval choices and requested input remain useful without introducing a
  general approval engine inside agent execution.
- Provider-native delegation remains observable without becoming shadow
  orchestration.
- Provider-specific richness may remain a bounded observation until another
  provider or consumer earns a portable abstraction.
- Accepting this ADR does not create a production agent package or supported
  API; those require separate implementation and conformance work.

## Alternatives considered

### Mirror Codex app-server

This would minimise work for the first adapter but expose Codex thread, turn,
approval, and item semantics to every consumer and future provider.

### Export provider continuation state

A versioned portable envelope would let orchestration persist provider state,
but would also make it coordinate provider recovery it cannot interpret.
Continuation instead remains private adapter state keyed by Drawloom identity.

### Declare every optional provider capability

An exhaustive feature record appears explicit but duplicates method presence
and creates a large conformance matrix. Version one declares callable controls
through optional methods and treats observational richness as optional data.

### Put operation grants in agent inputs

Passing grants through the adapter appears atomic but duplicates policy and
tool-gateway state. The gateway instead remains authoritative at invocation
time.

### Normalise provider delegation as child sessions

This would provide a uniform child model but claim control Drawloom does not
possess. Only Drawloom-orchestrated work becomes an addressable child session.

### Forward raw provider events

Raw events preserve every vendor feature but make providers non-substitutable,
leak sensitive data, and force every consumer to implement provider parsing.

### Expose a single blocking run callback

A blocking callback is simple for one-shot generation but obscures streamed
content, steering, approval, requested input, interruption, and the terminal
operation invariant.

### Let the adapter own adjacent capabilities

Allowing an adapter to retrieve memory, compile context, authorise or execute
tools, persist durable events, or orchestrate children would recreate the
monolithic boundary rejected by ADR 0005.

### Persist and replay the provider transcript

This would duplicate provider transcript and compaction behaviour and conflate
it with Drawloom's authoritative memory. The provider retains its transcript;
Drawloom supplies compiled context.

### Treat requested input as approval

Both can pause an operation, but supplying information does not grant
execution or business authority.

### Reduce approval to allow or deny

Providers may offer several meaningful choices. Binary controls would discard
those choices or force provider-specific escape hatches.

### Omit steering

Steering prevents consumers from interrupting and restarting long-running work
merely to correct its direction. It remains an optional method rather than a
mandatory provider capability.

### Use provider-native memory alongside Drawloom memory

Two retrieval authorities can inject conflicting and non-reproducible context.
The provider may keep its session transcript, but Drawloom remains the only
cross-session memory authority.
