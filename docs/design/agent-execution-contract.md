# Connecting to an agent

Use `@drawloom/agent` to send work to an agent, follow its progress and respond
when it needs input or approval. The same interface serves the Codex integration
and the synthetic agent used in tests. Your application does not need to know
how Codex names its threads or sends its messages.

[ADR 0007](../adr/0007-provider-neutral-agent-execution.md) records the design
decision. The [package source](../../packages/agent/agent/src/index.ts) defines
the current types and validation rules; this guide explains how to use them.
For Codex-specific setup and limits, see the
[adapter guide](codex-app-server-adapter.md).

## Start with a driver and session

An **agent driver** connects Drawloom to one agent implementation. Opening a
**session** gives you a conversation in which to submit work. Each submission
is an **operation**, with its own identity and eventual outcome.

- `AgentDriver.openSession` takes a Drawloom session ID, prepared context and
  the tools to advertise. It returns either a session or an explanation of why
  opening failed.
- `AgentSession.execute` submits one operation. Its successful return means
  the agent accepted the request, not that the work finished.
- `AgentSession.signals` provides the progress and final outcome.
- `AgentSession.close` releases the session handle. It is safe to call more
  than once; it is not a general command to delete native conversation history.

Session and operation IDs are non-empty strings checked by the package schemas.
Codex's own thread, turn and request IDs stay inside its adapter. Do not use
them in place of Drawloom IDs or infer relationships from message timing.

## Follow the result, not just the submission

Attach the signal stream **before** submitting the first operation. A session
allows one stream consumer and one starting or active operation at a time.
Trying to execute without a stream, or while another operation is active,
returns `invalid_state`.

This illustrative fragment assumes your application has already selected a
driver, opened a session and supplied a `handleSignal` function:

```ts
const signals = session.signals();
const observing = (async () => {
  for await (const signal of signals) handleSignal(signal);
})();

const submission = await session.execute({
  operationId: "draft-1",
  text: "Draft a short introduction.",
});
// Check submission.status. If accepted, follow signals for the outcome.
// Close only when the application has finished with this session.
```

Signals arrive in order and are not replayed. Every accepted operation has one
terminal outcome: `operation.completed`, `operation.failed` or
`operation.interrupted`. Closing during active work emits the interrupted
outcome before ending the stream. An unrecoverable provider failure similarly
reports failure before the stream ends. Late messages must not revive a finished
operation or appear as part of the next one.

Messages have stable IDs. `message.delta` appends text; `message.completed`
supplies the complete message. Do not append that final text a second time.
Messages can include user/assistant roles, assets and optional commentary/final
phases. `artifact.available` announces a separately available asset.

## Supply context, selections and attachments

Session context provides the starting instructions. `additionalContext` supplies
selected information for an operation or steering request. The current
`CompiledContext` is a shared data shape, not a separate context-compilation
service. The driver consumes it; it does not independently search memory or
knowledge.

Operations may also include up to 32 discovery selections and 16 asset
attachments. The host must resolve and authorise those references. Their presence
does not grant file access, tool permission or approval to execute a command.
See [discovery and resources](../reference/discovery-and-resources.md) and
[conversation history](../reference/conversation-history.md) for their handling.

The advertised tool list stays fixed for the session. Reopen the session to
change that list or its schemas. Tool permissions can change independently:
the gateway checks them when each tool is called. Do not pass duplicate grants
through operation arguments or call handlers directly to bypass that check.

## Approve actions or answer questions

These are different interactions:

- **Approval:** `approval.requested` describes an action and the choices the
  provider offers. Call `resolveApproval({ approvalId, optionId })` with one of
  those choices. Preserve their labels and meaning rather than reducing every
  request to an invented yes/no question.
- **Input:** `input.requested` asks for information, optionally with a response
  schema. Call `respondToInput` with `action: "submit"` and the value, or
  `action: "cancel"`. Supplying information does not authorise an action.

Several requests may be pending at once. Match them by ID, not arrival order.
Unknown, already answered or expired requests return `invalid_interaction`.
Finishing an operation or closing its session invalidates unresolved requests.
An adapter must not silently recreate a lost approval during recovery.

Validate submitted answers against any supplied response schema before sending
them. Policy may remove an approval choice or select one within its authority,
but must not invent a broader choice than the provider offered. Approval scope
and recovery details remain provider-specific; the shared interface does not
promise persistent permissions or approval recovery across disconnections.

The session's `reviewerModes` lists supported human or delegated review. Omitting
`reviewer` selects human review; requesting an unsupported mode rejects the
operation. Delegated review does not bypass tool grants, authorise publication
or accept the finished work. See
[ADR 0015](../adr/0015-working-material-ownership-and-edit-approval.md).

## Steering and interruption

Check whether `steer` and `interrupt` exist before offering those actions. An
absent method means the provider does not support it; there is no second feature
flag to consult. Steering adds direction to the exact active operation rather
than starting another. Interruption requests that it stop; successful submission
of that request is not proof that external effects stopped or were undone.

Stale operation IDs reject. Concurrent interruption requests share their result,
and repeating an interruption already confirmed for that operation is harmless.

## Explicit next-turn model selection

`modelSelection` selects a model and optional reasoning effort for the next
operation. Omission retains the provider default. Codex checks its native model
catalogue before starting a turn; unsupported choices reject without dispatch.
This does not create another native conversation or change its reviewer.
Steering cannot switch the active turn's model. The synthetic provider rejects
explicit model selection rather than pretending to run a real model.

## Handle failures without guessing about retries

Commands return `AgentResult`: either `status: "ok"` with a value or
`status: "rejected"` with a failure. The failure codes distinguish invalid
state, invalid interaction, unavailable provider and provider rejection.
Operation failures additionally identify invalid provider responses.

These are not retry instructions. A lost response may follow work that already
changed something. The caller or orchestration implementation must decide what
can safely be repeated using the available evidence. Provider errors are bounded
and must not expose credentials or raw exception content.

## Keep the different records separate

The provider owns its native transcript and continuation. The adapter maps
Drawloom sessions to that state and handles the recovery it supports. The
portable interface does not promise transparent recovery after every crash.
Drawloom's optional `history` reader is for display, not a replacement native
transcript or automatic model context.

Signals contain user-facing messages and interaction details. They are **not
content-free telemetry** and must not be copied wholesale into traces or logs.
[Observability](../reference/observability.md) extracts approved operational
attributes. Tool execution records come from the tool gateway, not a second
agent-owned record of the same call.

`provider.observation` carries a bounded provider-specific summary and optional
evidence reference. It may describe native delegated work, but does not make a
Codex child thread a separately controllable Drawloom session. Do not branch on
observation names as if all providers promised the same behaviour. Raw provider
envelopes, credentials, hidden reasoning and private continuation state stay out
of the public signal format.

Terminal signals may include provider-reported token usage. Missing values mean
unavailable, not zero; these counts are not a bill. Cached input and reasoning
tokens are subsets of input and output respectively, not extra totals to add.

## Tests and supporting evidence

The [shared tests](../../packages/agent/agent/src/conformance.ts) check the same
session behaviour across implementations: ordering, one active operation,
terminal outcomes, approvals, input, close, and exposed optional controls.
Provider tests cover their protocol mapping and recovery separately.

The [ADR 0007 evidence](../../knowledge/evidence/adr-0007-codex-app-server.md)
records the original 2026-09-04 live probes and their limits. Those observations
are not fresh tests of every later Codex version. In particular, the recorded
Codex Desktop form-elicitation limitation and later native-tool isolation
findings must not be replaced by a general claim that all integrations work.
Retained experiments remain evidence, not imports for product packages.
