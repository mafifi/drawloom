# Orchestration interface — ADR 0017 candidate

This is the demonstrated interface design, not a supported API.
[ADR 0017](../adr/0017-orchestration-interfaces.md) is Accepted.
Executable definitions and conformance live only in the
retained orchestration spike. The [proof record](../../knowledge/evidence/adr-0017-orchestration.md)
separates actual execution from assumptions.

## Three surfaces, one ownership boundary

| Surface | Caller | Responsibility |
| --- | --- | --- |
| Definitions and workflow context | Trusted plugin author | Typed tasks, child runs, input waits, sleeps and owned conversations |
| Run management | Authorised host caller | Start, inspect, list, await, answer input, request cancellation |
| Host bridges | Selected implementation/composition | Invoke existing agent/tool capabilities, enforce authority, retain reconciliation receipts |

There is no plugin-specific service protocol. Task definitions describe callable
work, while their host implementations are registered separately. Workflow code
may import portable schemas and definition references, but not task handlers or
Temporal/Node/Bun APIs. Context methods are the explicit boundary for durable work.

## Candidate signatures

The [executable contract](../../spikes/adr-0017-orchestration/contract.ts) is
authoritative. Its authoring surface is deliberately short:

```ts
interface Workflow<I, O> extends Definition<I, O> {
  run(context: WorkflowContext, input: I): Promise<O>;
}

interface WorkflowContext {
  readonly runId: string;
  task<I, O>(step: string, task: Task<I, O>, input: I,
    retry?: { maxAttempts: number }): Promise<O>;
  child<I, O>(step: string, workflow: Workflow<I, O>, input: I): Promise<O>;
  input<T>(step: string, schema: z.ZodType<T>): Promise<T>;
  sleep(step: string, milliseconds: number): Promise<void>;
}
```

Definitions carry `id`, `version`, `input` and `output` schemas. For example,
the synthetic spine joins two branches and then waits for a typed number:

```ts
const [left, right] = await Promise.all([
  context.child("left", branch, input),
  context.child("right", branch, input + 1),
]);
const adjustment = await context.input("confirm", z.number());
```

The [owned-agent helper](../../spikes/adr-0017-orchestration/owned-agent.ts)
adds named, schema-backed tasks for conversation creation, submission, inspection,
awaiting, interruption, optional steering and existing approval/input responses.
It does not pass live sessions into workflow state or invent another agent loop.
The host supplies each task's handler and authority separately.

Management uses `start`, `get`, `getSteps`, `list`, `result`, `respond` and
`cancel`. `workflowResult` validates both definition identity and the typed final
output. `result` is the generic JSON management read, not a claim about a caller's
specific workflow output type. A running snapshot with nonempty `pendingInputs`
indicates an input wait; `cancellationRequested` is independent of terminal status.
Step summaries are capped at 100 and have a separate paginated read.
The candidate `MAX_TASK_ATTEMPTS` is 10; both providers reject larger limits.
Reusing an input key with a different schema rejects rather than reinterpreting a
previous answer under a different TypeScript type.
The proof also caps children and concurrent input waits at 100 per run; excessive
fan-out rejects before creating more children. These are explicit proof limits,
not a claim that every production workflow engine shares them.

## Authoring expectations

A workflow is an async TypeScript function with schema-backed input and output.
Its version is part of definition identity. Ordinary loops, conditionals and
Promise.all express orchestration; the adapter does not interpret a graph DSL.
Authors give logical steps stable keys so retries, observations and recovery refer
to the same work. Actual attempts have separate identities for execution evidence.

This is not permission to run arbitrary TypeScript effects inside a workflow.
Coordination must replay deterministically. File access, network requests, tools
and agent execution cross host task/bridge boundaries. A task's output is recorded
by the workflow engine; it is not proof that an unrecorded effect never happened.
The same workflow version is retained throughout the restart proof. Hot code
upgrades and cross-engine replay are deliberately not promised.

## Identity and data

Keep workflow run, logical step, step attempt, child run, agent conversation and
agent operation identities separate. Native Temporal and Codex identifiers stay
adapter-private. Bind management access to an authorised host scope; ownership is
not a model-controlled argument that can be changed to read another run.

Schema-validate inputs and outputs. Workflow state contains bounded JSON data and
references; managed assets and authoritative tool evidence retain their existing
owners. No duplicate transcript, memory substrate or general event store is added.

## Lifecycle and failure meaning

| Event | Required meaning |
| --- | --- |
| Initiating turn finishes or client disconnects | Workflow remains independent |
| Client stops awaiting a result | Only that local wait ends |
| Explicit workflow cancellation | Request cancellation of owned unfinished work; no rollback claim |
| A branch fails terminally | Request cancellation of unfinished siblings; preserve completed results |
| A step fails | One attempt by default; only explicit bounded retries may repeat it |
| Effect occurred but acknowledgement is missing | Preserve uncertainty and reconcile; do not infer safe resubmission |
| Human input is pending | Address its stable run/request identity; response is not a tool grant |
| Backend worker/service restarts | Recover engine state; reconcile external work separately |

A management snapshot must not conflate the workflow engine finishing with every
external process stopping. Provider limitations remain explicit. An exhausted
retry is failure, not a new workflow. Resume is reconnect/answer, not reset.

## Agent conversations

The orchestration bridge uses the existing AgentDriver/AgentSession contract.
It creates owned conversations and submits sequential operations, collects their
safe outcomes and forwards existing approval/input resolution. Unsupported
steering or interruption stays unsupported; opening a session does not imply
those operations exist.

Existing grants still govern tools. A workflow choosing to wait for a human does
not replace Codex's native reviewer. Native session continuity and display-history
capture keep their accepted responsibilities. If a process dies after submission
but before recording a response, a receipt prevents blind repetition. Where the
existing provider contract cannot reconcile the operation, report unknown rather
than invent another execution or claim live-provider crash recovery.

## Temporal mapping to prove

DeepSeek's inspected `WorkflowStartRequest` accepts a script, JSON arguments,
metadata, a live parent agent and optional cancellation signal. Its live run handle
has a result, cancel and dispose. Drawloom's proposed management surface instead
addresses a durable run independently of the caller. These are approved differences
in the implementation plan, not claims of interface equivalence:

| Inspected DeepSeek seam | Candidate Drawloom seam |
| --- | --- |
| Script supplied at start | Registered workflow identity/version; trusted implementation selected at composition |
| Live parent Agent supplied to script runtime | Owned conversations created through the existing provider-neutral bridge |
| Holder-owned live result/cancel/dispose handle | Start/get/list/result/respond/cancel by run identity; leaving a result wait does not cancel work |
| Process-local job and worker-thread lifetime | Durable engine proof; external agent continuity remains a separate limitation |

Source: [revision-bound workflow runtime types](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/packages/workflow/workflow/src/runtime-types.ts),
also linked in the [capability survey](../reference/harness-workbench-survey/deepseek.md).

| Drawloom concept | Temporal proof mechanism |
| --- | --- |
| Registered async workflow | Bundled native workflow running a supplied Drawloom context |
| External task | Activity with maximum attempts explicitly set |
| Child run | Native child workflow with stable identity and parent cancellation |
| Durable sleep | Native workflow timer |
| Input response | Native durable message with application validation and duplicate handling |
| Inspection/result | Native query/result plus bounded validated projection |
| Agent operation | Host bridge outside deterministic coordination |

Temporal is not concealed as a universal promise: the proof must establish each
mapping. A matching TypeScript interface alone does not prove another engine can
implement the same semantics. Changes to the selected boundary require explicit
maintainer review before implementation.

## Relationship to accepted contracts

| Decision | What orchestration reuses; what it does not own |
| --- | --- |
| [ADR 0005](../adr/0005-partition-agent-platform-capabilities.md) | Cross-capability coordination and child lineage; no domain recipe in public core |
| [ADR 0007](../adr/0007-provider-neutral-agent-execution.md) | Agent session, operation, outcome and resolution contracts; no replacement agent loop |
| [ADR 0008](../adr/0008-tool-execution-and-exposure.md) | Tool grants and execution evidence; workflow start conveys neither |
| [ADR 0013](../adr/0013-plugin-boundaries-and-host-integration.md) | Trusted explicit composition; no new UI bridge or dynamic service registry |
| [ADR 0014](../adr/0014-persistent-paginated-conversation-history.md) | Display history remains separate; orchestration receipts are not transcripts or memory |
| [ADR 0015](../adr/0015-working-material-ownership-and-edit-approval.md) | Native review and plugin-owned material; a workflow input answer is not edit approval |
| [ADR 0016](../adr/0016-discoverable-contributions-and-resources.md) | Discovery does not grant execution; this spike adds no desktop catalogue or management UI |
