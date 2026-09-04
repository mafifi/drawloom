# Agent execution contract design

- **Status:** Working design
- **Date:** 2026-09-04
- **Architecture:** [ADR 0005](../adr/0005-partition-agent-platform-capabilities.md)
  and [ADR 0007](../adr/0007-provider-neutral-agent-execution.md)

## Context

This working design refines the agent-execution capability proposed by
[ADR 0007](../adr/0007-provider-neutral-agent-execution.md) within the platform
partition proposed by
[ADR 0005](../adr/0005-partition-agent-platform-capabilities.md). It applies the
contract standard from
[ADR 0004](../adr/0004-standardise-capability-contracts.md).

It preserves exact interface and schema decisions while they are still being
worked through. It is not an ADR, supported API, or authorization to create the
production package. Codex-specific translation and validation evidence live in
the [Codex app-server adapter design](codex-app-server-adapter.md).

## Decision inventory

Agreed contract areas:

- driver and live-session behavioural split;
- logical session and single-active-operation lifecycles;
- opaque continuation ownership;
- compiled context inputs without direct memory access;
- immutable session tool exposure and operation-scoped grants;
- optional steering;
- distinct requested-input and execution-approval paths;
- lossless provider approval choices;
- Drawloom-orchestrated children versus provider-native delegation
  observation;
- transient provider-neutral signals and Drawloom-owned durable events;
- strict lifecycle signal members;
- one shared, bounded failure detail for connection and operation signals; and
- stable message identity with optional deltas, a complete text snapshot, and
  provider-approved reasoning summaries.

Open contract areas, in intended order:

1. tool observation signals and correlation references;
2. approval and requested-input signal members and resolution unions;
3. delegation lifecycle signal payloads; and
4. usage, diagnostics, the complete `AgentSessionSignal` union, and final event
   projection rules.

Provider evidence remains separately pending for lifecycle, context and memory
injection, approvals, requested input, interruption, continuation, steering,
delegation, observability, and Codex Desktop MCP compatibility. Tool exposure,
operation grants, ambient-tool isolation, schema projection, and exact MCP
correlation have initial spike evidence.

## Proposed contract

### Make agent execution the first capability contract

The capability is named **agent execution**. Its future contract package will
live at `packages/agent/agent` and will be published as `@drawloom/agent` only
after ADR 0007 is accepted and implemented.

The public contract is provider-neutral. It uses the following vocabulary:

- an **agent driver** opens execution sessions for one provider implementation;
- an **execution session** is Drawloom's logical relationship with a provider
  continuation and can outlive one provider connection;
- an **operation** is one active agent turn within an execution session;
- a **continuation envelope** is opaque, versioned provider state needed to
  reopen an execution session;
- a **session signal** is a transient, normalized observation emitted by a
  driver; and
- an **agent event** is the durable Drawloom-owned record produced from a
  session signal.

Provider packages may internally compose a declarative provider description,
transport, parser, context and tool projector, and continuation codec. Those
pieces are implementation details rather than separate public capabilities.

### Separate ownership explicitly

Drawloom owns:

- durable execution-session and operation identities;
- compilation of run and per-turn context;
- authoritative memory and knowledge retrieval;
- tool registration, validation, execution, and evidence;
- policy, approval routing, orchestration, delegation, and evaluation;
- durable event identity, ordering, redaction, storage, and projections; and
- provider selection in a composition root.

The agent driver owns:

- provider connection and protocol negotiation;
- translating session open into provider start or resume operations;
- translating execute, steer, input, approval, interrupt, and close commands;
- provider-specific context and tool projection;
- decoding and validating continuation payloads; and
- translating provider-native messages into normalized session signals.

The provider may own its thread transcript, internal compaction, and inner
agent loop. Its thread or session identifier is execution evidence, not a
Drawloom session, task, run, memory, or business identity.

### Use two lifecycle levels

An execution session moves through `opening`, `idle`, and `closed`, with
recoverable connection loss represented separately. An operation moves through
`running`, may wait for execution approval or requested input, and terminates as
exactly one of `completed`, `failed`, or `interrupted`.

Version one permits one active operation per execution session. A second
`execute` command while an operation is active is rejected. Provider adapters
must prevent late signals from a superseded operation or connection from being
projected as current activity.

The lifecycle is represented by these behavioural interfaces. The concrete
contract will infer all serializable input, failure, signal, and event types
from contract-owned Zod schemas.

```ts
export interface AgentDriver {
  readonly driverId: string;

  capabilities(): Promise<AgentCapabilities>;

  openSession(
    input: AgentSessionOpenInput,
  ): Promise<AgentResult<AgentSession>>;
}

export interface AgentSession {
  readonly sessionId: AgentSessionId;

  execute(input: AgentOperationInput): Promise<AgentResult<OperationAccepted>>;

  steer(input: AgentSteeringInput): Promise<AgentResult<SteeringAccepted>>;

  resolveApproval(
    input: AgentApprovalResolution,
  ): Promise<AgentResult<void>>;

  respondToInput(
    input: AgentInputResolution,
  ): Promise<AgentResult<void>>;

  interrupt(operationId: AgentOperationId): Promise<AgentResult<void>>;

  close(): Promise<AgentResult<void>>;

  signals(): AsyncIterable<AgentSessionSignal>;
}
```

The version-one contract data is shaped as follows. Each named serializable
type has a strict Zod schema; the TypeScript type is inferred from that schema.
Identifier schemas are separately branded non-empty strings so session,
operation, input, approval, and requested-input identities cannot be exchanged
accidentally.

```ts
type AgentCapabilities = {
  continuation: boolean;
  interruption: boolean;
  steering: boolean;
  approvals: boolean;
  recoverableApprovals: boolean;
  inputRequests: boolean;
  toolObservation: boolean;
  delegationObservation: boolean;
  messagePhases: boolean;
  reasoningSummaries: boolean;
  usageReporting: boolean;
};

type CompiledAgentContext = {
  revision: string;
  entries: readonly {
    key: string;
    source: "instructions" | "memory" | "knowledge" | "policy" | "run";
    handling: "instruction" | "context" | "untrusted";
    value: string;
    provenance: readonly string[];
  }[];
};

type AgentToolExposureReference = {
  exposureId: string;
  toolSetId: string;
  revision: string;
};

type AgentToolGrantReference = {
  grantId: string;
  revision: string;
};

type AgentSessionOpenInput = {
  sessionId: AgentSessionId;
  continuation?: ContinuationEnvelope;
  sessionContext: CompiledAgentContext;
  toolExposure: AgentToolExposureReference;
};

type AgentOperationInput = {
  operationId: AgentOperationId;
  inputId: AgentInputId;
  text: string;
  additionalContext: CompiledAgentContext;
  toolGrant: AgentToolGrantReference;
};

type AgentSteeringInput = {
  operationId: AgentOperationId;
  inputId: AgentInputId;
  text: string;
  additionalContext: CompiledAgentContext;
};

type OperationAccepted = {
  operationId: AgentOperationId;
};

type SteeringAccepted = {
  operationId: AgentOperationId;
  inputId: AgentInputId;
};

type AgentResult<T> =
  | { status: "ok"; value: T }
  | { status: "rejected"; failure: AgentCommandFailure };

type AgentCommandFailure = {
  code:
    | "unsupported_capability"
    | "session_closed"
    | "operation_already_active"
    | "operation_not_active"
    | "approval_not_pending"
    | "approval_option_unavailable"
    | "input_not_pending"
    | "input_invalid"
    | "continuation_unavailable"
    | "provider_unavailable"
    | "provider_rejected";
  message: string;
  retryable: boolean;
};

type AgentFailureDetail = {
  category:
    | "provider"
    | "protocol"
    | "policy"
    | "resource"
    | "unknown";
  summary: string;
};
```

Drawloom allocates `operationId` before calling `execute`. The adapter retains
any provider turn identifier as protected correlation evidence; a provider
identifier never becomes the Drawloom operation identity.

`AgentResult<T>` is a discriminated union of `{ status: "ok", value: T }` and
`{ status: "rejected", failure: AgentCommandFailure }`. Expected invalid
state, unsupported capability, missing continuation, stale interaction, and
provider rejection outcomes cross the contract as values. Unexpected defects
may throw only after provider errors and secrets have been translated out.

`execute` confirms that the provider accepted a new operation; it does not wait
for completion. Every accepted operation must subsequently emit exactly one
terminal signal. `interrupt` and `close` are idempotent. A provider process
disconnect does not itself close the logical execution session.

`AgentSession` is the live attachment to that logical session. A
`session.disconnected` signal makes the attachment unavailable and completes
its signal stream. The orchestrator may call `openSession` again with the same
Drawloom session identity and latest continuation envelope. `close` disposes
the attachment; it does not delete provider history or the durable Drawloom
session. All commands other than repeated `close` reject after close.

### Define portable session and turn inputs

`AgentSessionOpenInput` contains:

- the Drawloom-owned `sessionId`;
- an optional `ContinuationEnvelope`;
- a compiled session-context revision and its ordered context entries; and
- an immutable, session-scoped tool-exposure identity and exact tool-set
  revision resolved by the composed tool subsystem.

Each compiled context entry has a stable key, source category, trust
classification, textual value, and provenance reference. The agent contract
does not define how memory, knowledge, or instructions are curated. It accepts
the context compiler's already-selected output and preserves entry boundaries
for providers that support structured context injection.

`AgentOperationInput` contains a Drawloom-owned input identifier, version-one
text content, freshly compiled additional context, and the operation-scoped
tool grant that narrows the session exposure. Later media input kinds must be
added explicitly and advertised through capabilities; paths or ambient host
APIs are not smuggled through the portable contract.

`AgentSteeringInput` contains the exact active operation identifier, a new input
identifier, version-one text content, and freshly compiled additional context.
Steering augments the active operation and never creates another one.

The tool-exposure and grant references do not carry provider configuration,
endpoints, or credentials. The tool subsystem resolves an exposure before the
session opens. The provider package is composed with a tool projector that
projects that immutable exposure into the provider's supported mechanism. The
adapter exposes tools; it does not register them as an authority or decide
whether an invocation may execute.

The session exposure is the maximum Drawloom tool catalogue visible to that
provider attachment. Every operation names a narrower grant. Before accepting
an operation, orchestration verifies that the grant belongs to the exposure
and activates it in the authoritative tool gateway. The gateway checks the
active operation and grant on every invocation. Changing grants does not
require rebuilding the provider session or its visible catalogue.

Provider projection must start from an isolated external-tool environment.
Ambient MCP servers, plugins, apps, or equivalent provider integrations are
disabled unless the composition root included them in the resolved exposure.
Provider-native command, file, and network actions that cannot be removed are
constrained by Drawloom sandbox and approval policy and remain distinct from
Drawloom tool execution.

The tool gateway allocates the authoritative `toolInvocationId`. When the
provider transport supports result metadata, it returns a bounded correlation
record containing that identifier and the Drawloom `operationId`. The adapter
preserves those references in `tool.requested` and `tool.completed` signals,
while arguments and results remain in the tool capability's evidence path. An
adapter must never infer an exact link from tool name, arguments, order, or
timestamps. If the transport cannot preserve a correlation token, it reports
the provider observation without claiming an exact invocation link.

### Persist opaque continuation envelopes in Drawloom

Drawloom persists the continuation envelope; the selected driver owns its
meaning. The serialized envelope has this contract shape:

```ts
type ContinuationEnvelope = {
  schemaVersion: 1;
  providerId: string;
  driverId: string;
  payloadVersion: number;
  payload: JsonValue;
};
```

The generic schema proves that an envelope is bounded JSON with the correct
owner and versions. The provider adapter applies its own Zod schema to
`payload` before use. Provider payloads never appear in general event or UI
projections.

A driver must reject an envelope for another provider, driver, or unsupported
payload version. If the provider continuation is missing or unusable, it
returns `continuation_unavailable`; it must not silently create fresh provider
history. The orchestrator decides whether to create a successor execution
session.

### Make steering optional and precise

`AgentCapabilities.steering` declares whether a driver supports steering.
When supported, `steer`:

- targets the exact active operation;
- may carry newly compiled per-turn context;
- returns only after the provider acknowledges the steering input;
- emits `operation.steered` with the Drawloom input identifier;
- returns `operation_not_active` for a terminal or superseded operation; and
- does not create a new operation or terminal obligation.

When unsupported, it returns `unsupported_capability`. Consumers must not infer
support from the presence of the method.

### Separate requested input from approval

An agent or tool may request operator input while an operation remains active.
This is not an execution approval. The contract therefore defines distinct
`input.requested` and `input.resolved` signals and a `respondToInput` command.

An input request includes a stable request identifier, optional operation
identifier, whether it blocks progress, a presentation-safe prompt, and an
optional JSON Schema for a structured response. A resolution is one of
`submit`, `decline`, or `cancel`; submitted content is validated against the
request schema before it reaches the adapter.

```ts
type AgentInputRequest = {
  requestId: AgentInputRequestId;
  operationId?: AgentOperationId;
  blocking: boolean;
  prompt: string;
  responseSchema?: JsonValue;
};

type AgentInputResolution = {
  requestId: AgentInputRequestId;
  action: "submit" | "decline" | "cancel";
  value?: JsonValue;
};
```

This boundary covers direct model questions and MCP elicitation without
granting filesystem, command, network, spend, publication, or business
authority.

### Cascade provider approval choices without loss

An approval request describes a provider execution permission. It includes its
approval and operation identities, category, safe summary, and the choices the
adapter can currently honor.

```ts
type AgentApprovalOption = {
  optionId: string;
  label: string;
  disposition: "allow" | "deny" | "cancel";
  scope: "action" | "operation" | "session";
  consequences: readonly AgentApprovalConsequence[];
};

type AgentApprovalConsequence = {
  kind:
    | "expanded-access"
    | "persistent-permission"
    | "provider-policy-change"
    | "other";
  summary: string;
};

type AgentApprovalRequest = {
  approvalId: AgentApprovalId;
  operationId: AgentOperationId;
  category: "command" | "file-change" | "network" | "permission";
  summary: string;
  options: readonly AgentApprovalOption[];
};

type AgentApprovalResolution = {
  approvalId: string;
  optionId: string;
};
```

The adapter normalizes provider choices into stable option identifiers and
privately retains the provider response needed for each option. Its transient
`approval.requested` signal contains that advertised set. Drawloom policy may
remove unsafe choices or select one automatically, but cannot invent or widen
a provider choice. The resulting effective option set in the durable
`approval.requested` event is immutable and is carried without reinterpretation
through persistence, transport, ViewModel, View, resolution command, and
adapter.

Views render the effective labels, scopes, and consequences. They do not
recreate binary allow/deny buttons. Resolution carries only `approvalId` and
`optionId`, never a client-authored provider payload. The orchestrator verifies
that the approval is pending, belongs to the active operation, and contains the
selected option before the adapter maps it back to the provider.

Resolution is exactly once. Unknown, stale, expired, and duplicate selections
fail closed. Provider disconnection expires pending approvals unless the
provider explicitly declares and proves recoverable approvals. A resolution
records the semantic option, consequences, actor, and whether it came from the
operator, Drawloom policy, or provider policy, while excluding sensitive
provider tokens.

Execution approval remains separate from business approval, spend authority,
artifact review, publication, and other consequential authority.

### Separate Drawloom orchestration from provider-native delegation

Drawloom-orchestrated children and provider-native delegation are different
things. A child that Drawloom must address, resume, steer, interrupt, grant
tools to, or recover independently is a normal Drawloom execution session and
operation. Its parent-child relationship belongs to the orchestration layer;
the child has its own continuation, context, tool exposure and grant, policy,
and event stream.

Provider-native delegation remains activity inside the parent's active
operation in version one. The adapter may observe a provider spawning or
communicating with an internal worker, but it does not promote that worker to
an `AgentSession` or imply independent portable control. Each observed
delegation receives a Drawloom-owned `delegationId`, the parent
`operationId`, an optional parent `delegationId`, a bounded presentation-safe
role or summary, and normalized lifecycle state. Provider thread, agent, or
item identifiers are protected correlation evidence; raw delegated prompts,
transcripts, and hidden reasoning do not enter ordinary events.

A provider-native delegation inherits the parent operation's active tool grant
and execution policy. Tool calls remain correlated to the parent operation and
may also name a delegation only when the provider preserves an explicit
delegation correlation token. The adapter must not infer delegation ownership
from timing, ordering, tool name, arguments, or textual similarity.

Approval and requested-input signals raised during delegated activity still
use the parent operation's resolution paths and include the `delegationId`
when exact correlation is available. A delegated worker becoming terminal does
not terminate the parent operation. Provider-native workers cannot be resumed,
steered, interrupted, or closed through `AgentSession` in version one; work
requiring those controls must be represented as a Drawloom-orchestrated child.

`AgentCapabilities.delegationObservation` therefore promises observation of
provider-native delegation, not orchestration authority. Provider-native spawn,
message, wait, and close activity is evidence of the parent operation, while
provider child identifiers remain protected.

### Separate transient signals from durable events

Drivers emit normalized `AgentSessionSignal` values in live delivery order.
The session signal stream has one consumer: Drawloom orchestration. Drawloom's
orchestrator validates and redacts each signal, then constructs a distinct
durable event envelope:

`AgentSessionSignal` is a closed, strict discriminated union assembled from
strict signal-family unions. The lifecycle family is:

```ts
type AgentLifecycleSignal =
  | {
      kind: "session.opened";
      mode: "new" | "resumed";
    }
  | {
      kind: "session.continuation_updated";
      continuation: ContinuationEnvelope;
    }
  | {
      kind: "session.disconnected";
      failure: AgentFailureDetail;
    }
  | {
      kind: "session.closed";
      source: "drawloom" | "provider";
    }
  | {
      kind: "operation.started";
      operationId: AgentOperationId;
      inputId: AgentInputId;
    }
  | {
      kind: "operation.steered";
      operationId: AgentOperationId;
      inputId: AgentInputId;
    }
  | {
      kind: "operation.completed";
      operationId: AgentOperationId;
    }
  | {
      kind: "operation.failed";
      operationId: AgentOperationId;
      failure: AgentFailureDetail;
    }
  | {
      kind: "operation.interrupted";
      operationId: AgentOperationId;
      source: "drawloom" | "provider";
    };
```

Lifecycle signals omit `sessionId` because the stream belongs to one
`AgentSession`. They also omit durable event identity, sequence, recorded time,
and provider identifiers. Every operation-scoped member carries the
Drawloom-owned `operationId`; signals for accepted inputs also carry the
Drawloom-owned `inputId`. `operation.completed` does not duplicate generated
content because messages and artifacts cross their own contracts. The signal
kind distinguishes a lost attachment from operation failure, so both use one
bounded, presentation-safe `AgentFailureDetail`. Provider codes and raw errors
remain protected evidence. Failure detail does not carry retry authority;
adapter recovery and orchestration decisions remain outside this diagnostic
value.

The content family is:

```ts
type AgentContentSignal =
  | {
      kind: "message.delta";
      operationId: AgentOperationId;
      messageId: AgentMessageId;
      phase: "commentary" | "final" | "unknown";
      delta: string;
    }
  | {
      kind: "message.completed";
      operationId: AgentOperationId;
      messageId: AgentMessageId;
      phase: "commentary" | "final" | "unknown";
      text: string;
    }
  | {
      kind: "reasoning.summary";
      operationId: AgentOperationId;
      text: string;
    };
```

The adapter allocates a contract-level `messageId` when it first observes a
provider message and privately maps any provider item identifier. A message may
emit zero or more deltas followed by exactly one completion containing the full
authoritative text; it emits no delta after completion. `phase` is required,
and adapters use `unknown` rather than inventing a distinction their provider
does not supply.

Reasoning summaries are standalone provider-approved text. They are neither
hidden reasoning nor a reconstructable reasoning stream. Version one content
signals carry text only; media requires explicit contract evolution.

```ts
type AgentEvent = {
  schemaVersion: 1;
  eventId: AgentEventId;
  sessionId: AgentSessionId;
  operationId?: AgentOperationId;
  sequence: number;
  recordedAt: string;
  kind: AgentSessionSignal["kind"];
  payload: JsonValue;
};
```

Drawloom assigns the durable event identifier, monotonic per-session sequence,
and recorded timestamp. Providers are not asked to resume Drawloom sequence
allocation. Provider timestamps may be retained as optional evidence but never
replace Drawloom ordering.

Signal-to-event projection is deliberately not object inheritance. Protected
continuation payloads, raw tool arguments or results, provider identifiers, and
other sensitive signal fields are stored through their owning evidence path or
replaced by bounded references and hashes before an ordinary event is written.
For example, `session.continuation_updated` persists the envelope owner,
versions, and protected-record reference, not the envelope payload.

The initial signal vocabulary is:

- `session.opened`, `session.continuation_updated`,
  `session.disconnected`, and `session.closed`;
- `operation.started`, `operation.steered`, `operation.completed`,
  `operation.failed`, and `operation.interrupted`;
- `message.delta` and `message.completed`, with a required `commentary`,
  `final`, or `unknown` phase;
- `reasoning.summary`, containing only provider-approved summaries and never
  hidden reasoning;
- `tool.requested` and `tool.completed`, which observe agent interaction while
  the tool capability remains authoritative for execution and results and an
  exact tool-invocation reference is included only when explicitly preserved;
- `approval.requested` and `approval.resolved`;
- `input.requested` and `input.resolved`;
- `delegation.started`, `delegation.updated`, and `delegation.completed`, which
  observe provider-internal delegation without transferring Drawloom
  orchestration authority;
- `usage.reported`; and
- `diagnostic`, for bounded, redacted warnings and unsupported provider events.

Raw provider envelopes, hidden reasoning, credentials, unrestricted command
output, and opaque continuation payloads do not enter ordinary durable events.
Provider-specific diagnostic evidence may be retained separately only under an
explicit bounded and redacted policy.

### Declare capabilities rather than assuming parity

`AgentCapabilities` declares support for continuation, interruption, steering,
approval requests, recoverable approvals, requested input, tool observation,
delegation observation, message phases, reasoning summaries, and usage
reporting. A method's presence does not constitute support.

Capabilities describe observable semantics, not vendor features. Providers
must return `unsupported_capability` rather than approximating a declared
unsupported operation. Every positive declaration is exercised by the shared
conformance suite in a runtime that the provider claims to support.

Provider availability, installation, authentication, account information,
model catalogues, and rate limits are adjacent contracts. They do not become
methods on `AgentSession` merely because one provider API exposes them beside
execution.

Codex mapping and evidence are maintained in the separate
[Codex app-server adapter design](codex-app-server-adapter.md). No
provider-specific method, identifier, event, or protocol version is part of
this contract design.

### Require provider-neutral conformance

The future `@drawloom/agent` package will export a provider-neutral conformance
suite. Every driver must run it against its claimed capability set. At minimum,
the suite verifies:

- open, execute, exactly-one-terminal, and idempotent close behaviour;
- single-active-operation rejection;
- strict lifecycle-signal discrimination, required Drawloom identities, and
  rejection of unknown fields and provider identifiers;
- interruption of the exact active operation;
- continuation ownership, validation, resume, and explicit loss;
- stale and late signal isolation;
- steering acceptance, exact operation targeting, context projection, and
  unsupported behaviour;
- message identity, delta ordering, exactly-one completion with full text,
  required phase handling, and reasoning-summary safety;
- requested-input correlation, schema validation, resolution, and distinction
  from approval;
- lossless multi-option approval cascading, policy narrowing, exactly-once
  resolution, expiry, and rejection of unknown or stale options;
- capability claims against observed signals;
- immutable session tool exposure, operation-grant enforcement, exact
  correlation when claimed, and tool observation without authority leakage;
- rejection or explicit governance of ambient external provider tools;
- delegation observation without orchestration-authority leakage, protected
  provider identifiers, and no independently controllable child session;
- inheritance of the parent operation's policy and tool grant, exact optional
  delegation correlation, and parent lifecycle independence;
- redaction of continuation payloads, provider envelopes, credentials, hidden
  reasoning, and unrestricted command output; and
- deterministic conversion from session signals to ordered durable events.

Provider-specific conformance evidence is maintained with each provider design
and implementation. The contract design remains incomplete while any item in
its decision inventory is open.

## Consequences

- Consumers can operate an agent without knowing whether the provider calls its
  continuation a thread, session, profile, or file.
- Provider-native transcript management remains usable without granting the
  provider memory, tool, policy, or durable-event authority.
- Steering, approvals, requested input, interruption, and continuation have
  explicit observable semantics rather than callback conventions.
- Drawloom can reconstruct UI projections, evaluations, and traces from its own
  event log while retaining provider evidence separately.
- Provider adapters must perform more translation and validation than a thin
  SDK wrapper.
- Capability negotiation and conformance fixtures add work but prevent false
  portability claims.
- Version one intentionally permits only one active operation per session and
  only text input. Later concurrency or media additions require explicit
  compatible contract evolution.
- The memory substrate's storage, curation, confidence, retrieval, and
  reweaving model remain the subject of a separate ADR.
- No production agent package or supported API exists while ADR 0007 remains
  Proposed.

## Alternatives considered

### Mirror Codex app-server methods in the public contract

This would reduce the first adapter's translation work but would expose Codex
thread and turn mechanics to every consumer and future provider.

### Expose a single blocking `run` callback

A blocking callback is simple for one-shot generation but obscures steering,
approvals, requested input, interruption, streaming, reconnection, and exactly
one terminal outcome.

### Let each adapter persist its continuation privately

This hides vendor data but prevents the orchestrator from providing
deterministic recovery, invalidation, migration, and correlated observability.
Drawloom therefore persists an opaque envelope while the adapter owns its
meaning.

### Persist and replay the provider's exact transcript

This duplicates provider transcript and compaction behaviour and incorrectly
couples it to Drawloom's authoritative memory. Drawloom stores its own inputs,
events, context revisions, and continuation evidence instead.

### Forward raw provider events to consumers

Raw events preserve every vendor feature but make providers non-substitutable,
leak sensitive data, and force every consumer to implement provider parsing.

### Treat requested input as approval

Both may pause an operation, but supplying information does not grant execution
or business authority. Combining them would make audit and policy ambiguous.

### Standardize approval as accept or decline

Providers may offer allow-once, session-scoped access, cancellation, or policy
amendments. A binary contract would either discard useful choices or encourage
provider-specific escape hatches.

### Omit steering from the portable contract

Consumers would need to interrupt and restart long-running work to correct it.
Steering is therefore an optional but fully specified capability.

### Use provider-native memory alongside Drawloom memory

Two independent retrieval authorities can inject conflicting or
non-reproducible context. Provider cross-thread memory is disabled when
Drawloom manages the session; the provider retains only its own thread
transcript.
