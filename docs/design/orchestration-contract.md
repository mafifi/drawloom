# Orchestration contract

`@drawloom/orchestration` is the supported portable authoring and run-management
contract accepted by [ADR 0017](../adr/0017-orchestration-interfaces.md).
[Accepted ADR 0021](../adr/0021-local-temporal-orchestration.md) adds the workflow
module and backend-handler packaging seam described here without selecting a
provider in portable code. The [ADR 0017 proof record](../../knowledge/evidence/adr-0017-orchestration.md)
still separates demonstrated behavior from provider assumptions.

## Four surfaces, one ownership boundary

| Surface | Caller | Responsibility |
| --- | --- | --- |
| Workflow module and workflow context | Trusted plugin author | Typed definitions, child runs, input waits, sleeps and owned conversations |
| Run management | Authorised host caller | Start, inspect, list, await, answer input, request cancellation |
| Backend task handlers | Trusted plugin backend | Implement declared tasks and reconcile interrupted dispatch from existing receipts |
| Host bridges | Selected implementation/composition | Invoke existing capabilities, enforce authority, retain reconciliation receipts |

There is no plugin-specific service protocol. A package's prebuilt workflow
entrypoint has a default `Registry` export containing definitions only. Its
trusted backend returns matching `RegisteredTaskHandler` values separately.
Workflow code may import portable schemas and definition references, but not task
handlers or Temporal, Node.js, Bun, Cloudflare or Tauri APIs. Context methods are
the explicit boundary for durable work.

Enhanced package metadata may declare `workflows.entrypoint`, a package-relative
prebuilt `.js` or `.mjs` file. It may list the existing `orchestration` capability
as optional. Inspection validates the package-relative metadata syntax but does not
import or execute the workflow module. The host verifies resolved containment when
it loads the declared file. Composition validates the module before
starting the backend, then requires exactly one handler with the same task ID and
version for every registered task. Missing, extra and duplicate handler identities
reject activation. Module-owned schemas and limits remain authoritative.

## Authoring signatures

The package export is authoritative. Its workflow surface remains deliberately
short:

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

The [owned-agent helper](../../packages/orchestration/orchestration/src/owned-agent.ts)
adds named, schema-backed tasks for conversation creation, submission, inspection,
awaiting, interruption, optional steering and existing approval/input responses.
It does not pass live sessions into workflow state or invent another agent loop.
The host supplies each task's handler and authority separately.

`defineWorkflowModule` and `parseWorkflowModule` strictly validate definition
fields and reject duplicate workflow or task `(id, version)` identities without
running workflow code. A task may add strict execution limits:

```ts
interface Task<I, O> extends Definition<I, O> {
  readonly limits?: { startToCloseTimeoutMs: number };
}
```

The timeout must be an integer from 1 millisecond through 24 hours. Definitions
without limits retain the 30-second local-v1 default, preserving existing callers.
Retries remain a separate, explicit per-step choice capped by
`MAX_TASK_ATTEMPTS`.

Management uses `start`, `get`, `getSteps`, `list`, `result`, `respond` and
`cancel`. `workflowResult` validates both definition identity and the typed final
output. `result` is the generic JSON management read, not a claim about a caller's
specific workflow output type. A running snapshot with nonempty `pendingInputs`
indicates an input wait; `cancellationRequested` is independent of terminal status.
Step summaries are capped at 100 and have a separate paginated read.
`MAX_TASK_ATTEMPTS` is 10; conforming providers reject larger limits.
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

## Backend handlers and interrupted dispatch

`registerTaskHandler(task, {run, recover?})` preserves the task's input and output
types for backend authors. `matchTaskHandlers` binds the returned handlers to the
validated workflow module. It validates inputs and outputs with the module-owned
schemas and rejects missing, extra or duplicate identities before execution.

The optional `recover(input, context)` hook is reconciliation-only. It inspects
existing provider or tool receipts after an interrupted prior dispatch; it must
not submit the effect again. It returns exactly one of:

- `{status: "completed", output}` after the module output schema accepts the
  already-settled result;
- `{status: "retryable"}` only when evidence establishes that repeating the task
  is safe;
- `{status: "unknown"}` when completion cannot be determined safely.

`TaskContext` keeps its existing task version, run, step, attempt and cancellation
identities. Recovery adds no generic event surface and uncertainty never becomes
permission to redispatch.

`PluginBackend.taskHandlers` carries these handlers. The desktop context reports
optional orchestration dependency presence separately from actual readiness.
`PluginBackendCapabilities.orchestrationReadiness` returns a strict bounded
`ready`, `configuration_required` or `unavailable` report; provider lifecycle
state is not added to the portable `Orchestrator` interface.

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

## Temporal mapping and supported local implementation

The mappings below were established by the ADR 0017 proof. Accepted ADR 0021
promotes a separate supported implementation in `@drawloom/temporal-orchestration`,
with installed workflow registration, local process ownership and durable receipts.
See its [API and local limitations](../../packages/orchestration/temporal-orchestration/README.md)
and [current evidence](../../knowledge/evidence/adr-0021-local-temporal.md).

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

Temporal is not concealed as a universal promise. A matching TypeScript interface alone does not prove another engine can
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
| [ADR 0016](../adr/0016-discoverable-contributions-and-resources.md) | Discovery does not grant execution; installed orchestration readiness follows the existing contribution model |
