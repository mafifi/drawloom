# Agent execution contract design

- **Status:** Working design
- **Date:** 2026-09-04
- **Architecture:** [ADR 0005](../adr/0005-partition-agent-platform-capabilities.md),
  [ADR 0006](../adr/0006-evidence-led-architecture-principles.md), and
  [ADR 0007](../adr/0007-provider-neutral-agent-execution.md)

## Context

This working design refines the agent-execution capability proposed by
[ADR 0007](../adr/0007-provider-neutral-agent-execution.md). It preserves the
full integration scope explored for Codex and future providers while applying
ADR 0006's requirement that complexity earn its place.

The earlier design introduced public machinery for continuation, connection
lifecycle, capability negotiation, operation grants, approval recovery,
provider delegation, and durable event projection. Those mechanisms crossed
capability ownership or imposed coordinated state without enough demonstrated
value. This revision keeps the required behaviours while returning their
implementation details to the adapter or adjacent capability that owns them.

This remains a working design, not a supported API or authorisation to create a
production package. Codex-specific mapping and validation evidence live in the
[Codex app-server adapter design](codex-app-server-adapter.md).

## Decision inventory

The design covers:

- driver, session, and single-active-operation behaviour;
- one ordered, non-replaying, single-consumer signal stream per session;
- adapter-owned provider transcript continuity, reconnection, and resumption;
- session and operation identity without a public connection state machine;
- compiled session and operation context owned by context compilation;
- immutable session tool exposure owned by tools, with invocation authority
  left in the gateway and policy;
- optional steering and interruption declared by method presence;
- requested input distinct from execution approval;
- multiple pending interactions with deterministic terminal cleanup;
- lossless provider approval choices without a portable approval taxonomy;
- Drawloom-orchestrated children distinct from summary-only observations and
  protected evidence of provider-native delegation;
- safe transient agent signals and observability-owned durable events;
- bounded failures without adapter-authored retry policy; and
- a core conformance suite plus feature-specific cases for exposed controls.

Provider evidence remains pending for lifecycle, context and memory injection,
approvals, requested input, interruption, adapter-owned recovery, steering,
provider activity, observability, and Codex Desktop MCP compatibility. Tool
exposure, gateway grants, ambient-tool isolation, schema projection, and exact
MCP correlation have initial spike evidence.

## Proposed contract

### Use one provider-neutral driver boundary

The future contract package will live at `packages/agent/agent` and be
published as `@drawloom/agent` only after ADR 0007 is accepted and
implemented.

The public behavioural surface is:

```ts
export interface AgentDriver {
  readonly driverId: string;

  openSession(
    input: AgentSessionOpenInput,
  ): Promise<AgentResult<AgentSession>>;
}

export interface AgentSession {
  readonly sessionId: AgentSessionId;

  execute(input: AgentOperationInput): Promise<AgentResult<OperationAccepted>>;

  readonly steer?: (
    input: AgentSteeringInput,
  ) => Promise<AgentResult<void>>;

  readonly interrupt?: (
    operationId: AgentOperationId,
  ) => Promise<AgentResult<void>>;

  resolveApproval(
    input: AgentApprovalResolution,
  ): Promise<AgentResult<void>>;

  respondToInput(
    input: AgentInputResolution,
  ): Promise<AgentResult<void>>;

  close(): Promise<AgentResult<void>>;

  signals(): AsyncIterable<AgentSessionSignal>;
}
```

Method presence declares support for steering and interruption. There is no
separate capability record that can contradict the behavioural surface.
Providers that do not request approvals or input simply never emit those
signals; their resolution methods therefore have no valid pending request.

### Keep identifiers proportional

Drawloom allocates the session and operation identifiers needed across
capability boundaries. Approval, input-request, and message identifiers exist
only because callers must correlate a later resolution or streamed content.

All identifiers use one generic opaque-ID mechanism backed by the same
contract-owned non-empty-string schema:

```ts
type OpaqueId<Kind extends string> =
  string & { readonly __drawloomId: Kind };

type AgentSessionId = OpaqueId<"agent-session">;
type AgentOperationId = OpaqueId<"agent-operation">;
type AgentApprovalId = OpaqueId<"agent-approval">;
type AgentInputRequestId = OpaqueId<"agent-input-request">;
type AgentMessageId = OpaqueId<"agent-message">;
```

Provider thread, turn, message, request, and delegated-worker identifiers never
become public contract identities. Adapters keep them in private correlation
state where required.

### Consume adjacent capability values

`CompiledContext` and `ToolExposure` below are types imported from their
owning capability contracts once those contracts exist. Their exact structures
are intentionally not defined by agent execution.

```ts
type AgentSessionOpenInput = {
  sessionId: AgentSessionId;
  context: CompiledContext;
  tools: ToolExposure;
};

type AgentOperationInput = {
  operationId: AgentOperationId;
  text: string;
  additionalContext?: CompiledContext;
};

type AgentSteeringInput = {
  operationId: AgentOperationId;
  text: string;
  additionalContext?: CompiledContext;
};

type OperationAccepted = {
  operationId: AgentOperationId;
};
```

The context compiler owns source categories, trust handling, provenance, and
revision metadata. The adapter receives the compiled value and projects the
model-visible portion without independently querying memory or knowledge.

The tool capability owns exposure identity, tool schemas, endpoint or transport
configuration, and revisions. The adapter projects the resolved exposure into
MCP or another provider mechanism. Provider endpoints, credentials, and raw
configuration do not become generic agent values.

The advertised exposure is immutable for the life of an `AgentSession`.
Changing its tool catalogue or schemas requires closing and reopening the
session. Policy and gateway authority may change between and during operations
without changing the advertised exposure or reopening the provider session.

Operation grants do not cross the agent contract. Before execution,
orchestration establishes the operation's authority with policy and the tool
gateway. The gateway evaluates every invocation against the current operation;
the adapter neither receives nor duplicates that grant.

Provider availability, installation, authentication, account information,
model catalogues, and rate limits remain adjacent contracts. They do not become
methods on `AgentSession` merely because a provider exposes them beside agent
execution.

### Leave provider continuity inside the driver

`openSession` receives a Drawloom session identity, not a provider
continuation envelope. The driver privately maps that identity to provider
state and chooses whether to start, resume, reconnect, or ask the provider to
continue.

An implementation may persist its private mapping through a composed internal
store. That store, its provider identifiers, payload versions, migrations, and
connection generations are adapter implementation details. If private state is
lost, the adapter either restores coherent continuity from the supplied
context or reports provider unavailability; its provider-specific tests define
which behaviour it supports.

The returned `AgentSession` represents usable logical agent execution, not a
particular socket, process, or provider attachment. Recoverable transport
changes are hidden. If the adapter cannot preserve coherent execution, the
active operation fails with a bounded provider failure.

Calling `close` releases the session handle and is idempotent. It does not
standardise deletion of provider history. A later provider-state deletion
capability requires its own evidenced contract.

### Keep operation lifecycle explicit and small

Version one permits one active operation per session. `execute` rejects while
another operation is active.

`execute` returns after the provider accepts the operation. An accepted
operation emits `operation.started` and exactly one of
`operation.completed`, `operation.failed`, or `operation.interrupted`.
Content and interactions occur between those lifecycle signals.

The adapter prevents late provider activity from a superseded or terminal
operation from appearing as current. This is a local adapter invariant rather
than a public connection-generation model.

`steer`, when present, targets the exact active operation and augments it
without creating a second operation. `interrupt`, when present, targets the
active operation. Both reject stale or terminal operation identifiers.

### Define signal-stream delivery

`signals()` may be called exactly once and before the first `execute`. Calling
`execute` without an attached signal consumer returns `invalid_state`. This
prevents an accepted operation from racing ahead of its observer.

The stream preserves adapter delivery order and does not replay earlier
signals. It ends after `close` or an unrecoverable session failure. Closing with
an active operation produces its `operation.interrupted` terminal signal before
ending the stream. An unrecoverable failure during an operation similarly
produces `operation.failed` before ending it.

An adapter may use backpressure or bounded buffering internally, but it never
silently drops or reorders a signal. If it cannot preserve ordered delivery, it
fails the active operation and closes the stream coherently. A slow or detached
consumer does not permit the adapter to report successful completion without
the terminal signal.

### Use a small command-failure taxonomy

```ts
type AgentResult<T> =
  | { status: "ok"; value: T }
  | { status: "rejected"; failure: AgentCommandFailure };

type AgentCommandFailure = {
  code:
    | "invalid_state"
    | "invalid_interaction"
    | "provider_unavailable"
    | "provider_rejected";
  message: string;
};

type AgentOperationFailure = {
  code:
    | "provider_unavailable"
    | "provider_rejected"
    | "invalid_provider_response";
  summary: string;
};
```

Expected invalid state, stale interaction, unavailable provider, and provider
rejection cross as bounded values. An optional control that is not supported is
absent rather than callable. Unexpected defects may throw only after provider
errors and secrets have been translated out.

Retryability is not part of either failure. It depends on orchestration state,
policy, cost, idempotency, and provider conditions that the adapter alone
cannot decide.

### Keep approval useful without building an approval engine

Execution approval and requested input remain separate signal and command
families.

```ts
type AgentApprovalOption = {
  optionId: string;
  label: string;
  description?: string;
};

type AgentApprovalRequest = {
  approvalId: AgentApprovalId;
  operationId: AgentOperationId;
  summary: string;
  options: readonly AgentApprovalOption[];
};

type AgentApprovalResolution = {
  approvalId: AgentApprovalId;
  optionId: string;
};
```

The adapter allocates stable option identifiers and privately retains the exact
provider response represented by each option. It emits the provider-authored
label and description without reducing choices to allow or deny.

Policy may remove a choice or select one automatically, but cannot invent or
widen a provider option. Presentation and transport preserve the effective
option identifiers and text. Resolution returns only a pending
`approvalId` and one of its advertised `optionId` values.

Provider scope, persistent permission, consequence classification, expiry,
recovery across disconnection, and resolution provenance are not agent
contract semantics in version one. Provider-specific handling remains in the
adapter; audit and business authority remain in policy and observability.

### Keep requested input informational

```ts
type AgentInputRequest = {
  requestId: AgentInputRequestId;
  operationId: AgentOperationId;
  prompt: string;
  responseSchema?: JsonValue;
};

type AgentInputResolution =
  | {
      requestId: AgentInputRequestId;
      action: "submit";
      value: JsonValue;
    }
  | {
      requestId: AgentInputRequestId;
      action: "cancel";
    };
```

Submitted values are validated against the provider-supplied response schema
before reaching the adapter. Cancellation communicates that no response will
be supplied. A request grants no execution, filesystem, command, network,
spend, publication, or business authority.

An unknown, stale, or already-resolved interaction returns
`invalid_interaction`. The contract does not introduce a second distinction
between decline and cancel until a provider demonstrates observable behaviour
that a consumer must preserve.

An operation may have several pending approval and requested-input
interactions. Their identities, rather than arrival order, determine which
provider callback a resolution answers. The adapter owns this transient pending
state.

Completing, failing, or interrupting the operation invalidates all unresolved
interactions. Closing the session does the same. If provider reconnection cannot
preserve pending interactions, the adapter fails the operation rather than
silently discarding or recreating them. Resolution after invalidation returns
`invalid_interaction`; the contract makes no cross-connection recovery promise.

### Keep provider-native delegation observational

Drawloom-orchestrated children are ordinary independent sessions and
operations, linked by orchestration outside this contract.

Provider-native delegation remains part of the parent operation. The adapter
may summarise it through `provider.observation`, but does not allocate
delegation identifiers, reconstruct child lifecycles, attach separate grants,
or expose child controls.

Provider child identifiers, prompts, transcripts, and hidden reasoning remain
private evidence. If a future consumer needs portable delegation semantics,
that need and at least two provider mappings must justify expanding the signal
contract.

### Emit safe signals

Every serializable signal has a strict contract-owned Zod schema. Signals are
safe for ordinary observability and presentation by construction.

```ts
type AgentSessionSignal =
  | {
      kind: "operation.started";
      operationId: AgentOperationId;
    }
  | {
      kind: "operation.completed";
      operationId: AgentOperationId;
    }
  | {
      kind: "operation.failed";
      operationId: AgentOperationId;
      failure: AgentOperationFailure;
    }
  | {
      kind: "operation.interrupted";
      operationId: AgentOperationId;
    }
  | {
      kind: "message.delta";
      operationId: AgentOperationId;
      messageId: AgentMessageId;
      phase?: "commentary" | "final";
      delta: string;
    }
  | {
      kind: "message.completed";
      operationId: AgentOperationId;
      messageId: AgentMessageId;
      phase?: "commentary" | "final";
      text: string;
    }
  | {
      kind: "approval.requested";
      request: AgentApprovalRequest;
    }
  | {
      kind: "approval.resolved";
      approvalId: AgentApprovalId;
      optionId: string;
    }
  | {
      kind: "input.requested";
      request: AgentInputRequest;
    }
  | {
      kind: "input.resolved";
      requestId: AgentInputRequestId;
    }
  | {
      kind: "provider.observation";
      operationId: AgentOperationId;
      name: string;
      summary?: string;
      evidence?: ProviderEvidenceReference;
    };
```

A message may emit deltas followed by one completion containing the complete
text. It emits no delta after completion. `phase` is optional because not all
providers expose Codex-like channels.

`ProviderEvidenceReference` is an opaque reference owned by the observability
or evidence capability, not an agent-execution identifier.

`provider.observation` retains scope for provider-approved reasoning summaries,
usage, diagnostics, and provider-native delegation without claiming portable
semantics. Its bounded `name` and presentation-safe `summary` are validated by
the contract. Rich structured provider data is stored through the protected
evidence reference rather than embedded as arbitrary JSON. Consumers may
display or store the safe summary but must not branch on its name as portable
agent behaviour.

Signals exclude raw provider envelopes, private continuation state, provider
identifiers, credentials, hidden reasoning, unrestricted command output, and
raw tool arguments or results.

Tool invocation and result events originate from the authoritative tool
gateway rather than being duplicated here. Both streams carry the Drawloom
operation identity. An exact cross-reference is included only when an explicit
Drawloom correlation identifier survives the provider transport.

Provider-native command, file, and network actions that cannot be removed are
constrained by Drawloom policy and sandboxing. They remain distinct from
Drawloom tool execution and its authoritative evidence.

### Let observability wrap signals directly

Observability validates each safe signal, then owns its durable event envelope:
event identity, ordering, recorded time, storage, retention, and projections.

The agent contract does not define `AgentEvent`, duplicate signal payloads,
or prescribe a deterministic conversion. Continuation and protected provider
evidence never enter ordinary signals and therefore require no projection-time
removal.

### Require proportional conformance

The future `@drawloom/agent` package exports a provider-neutral conformance
suite. Its core cases verify:

- open, execute, single-active-operation rejection, and idempotent close;
- subscription before execution, single-consumer delivery, ordering, no replay,
  coherent closure, and terminal-signal preservation;
- required Drawloom session and operation identities;
- exactly one terminal outcome for every accepted operation;
- message delta ordering and complete-message snapshots;
- strict safe-signal validation and rejection of provider identifiers or
  forbidden raw data;
- requested-input and approval correlation, schema validation, lossless choice
  round-tripping, multiple pending interactions, terminal invalidation, and
  rejection of stale resolutions;
- context consumption without direct memory or knowledge access;
- stable tool exposure without agent-owned grant or execution authority;
- immutable advertised tools with dynamic gateway authority; and
- rejection or explicit composition of ambient provider tools.

If `steer` or `interrupt` is present, focused conformance cases verify its
targeting and lifecycle behaviour. There is no combinatorial boolean
capability matrix.

Provider packages separately test protocol negotiation, connection recovery,
private continuation storage, provider event coverage, safe
`provider.observation` schemas, exact tool correlation, and provider-specific
interaction mappings.

## Evidence required before acceptance

The contract remains Proposed until disposable Codex probes and a manual Codex
Desktop MCP smoke demonstrate:

- supported protocol or schema-version detection;
- disabled native cross-thread memory;
- compiled context supplied through `additionalContext` on execute and steer;
- one-active-operation and terminal-signal behaviour;
- ordered signal subscription, terminal preservation, and coherent stream
  closure;
- adapter-private start, resume, and recovery without exposing provider IDs;
- optional steering and interruption;
- lossless approval-choice and requested-input mappings;
- concurrent pending interactions and terminal invalidation;
- stable MCP exposure, gateway-owned operation authority, schema projection,
  ambient-tool isolation, and exact correlation when claimed;
- safe provider observations for reasoning, usage, diagnostics, and native
  delegation using summaries and protected evidence without shadow child state
  or arbitrary provider JSON;
- observability wrapping of safe signals without forbidden raw data; and
- Codex Desktop use of the same MCP boundary expected by the adapter.

Passing those probes supports an acceptance review. It does not itself accept
ADR 0007 or authorise reuse of spike code.

## Consequences

- Consumers operate agents without knowing provider thread or transport
  mechanics.
- Adapters own the continuity they can actually implement.
- Optional controls are discoverable without a separate feature matrix.
- Context, tools, policy, and observability retain their own schemas and state.
- Approval and requested input remain precise without a general approval
  lifecycle subsystem.
- Provider-native delegation remains inspectable without shadow orchestration.
- Safe signals require less redaction and projection machinery.
- Provider-specific observations preserve useful richness without promising
  cross-provider parity.
- Version one remains text-first and single-operation; media and concurrency
  require later evidenced evolution.
- The memory substrate's storage, curation, confidence, retrieval, and
  reweaving model remain the subject of a separate ADR.

## Alternatives considered

### Expose continuation envelopes

A portable envelope makes adapter state persistable by orchestration but also
exports versioning, ownership, recovery, and secrecy concerns that only the
adapter can interpret.

### Declare every feature as a boolean

This appears explicit but duplicates method availability and requires
conformance across meaningless combinations of observational features.

### Pass operation grants through agent execution

This appears to make execution atomic but duplicates the gateway's authority
and creates synchronisation state between capabilities.

### Standardise approval consequences and recovery

This would support richer automatic policy eventually, but no current policy
consumer or second provider demonstrates a stable shared semantic.

### Reconstruct provider-native delegation

Normalising observed workers into a portable lifecycle would create identities
and relationships for work Drawloom cannot control.

### Define a separate durable agent event model

This would duplicate already-safe signal payloads and make agent execution own
observability projection decisions.
