# Organising work with workflows

Use orchestration when work has several steps, needs to wait for input or should
continue independently of the conversation that started it. A workflow can run
tasks in sequence or parallel, start child workflows and revisit its own agent
conversations.

`@drawloom/orchestration` defines the shared interface.
`@drawloom/temporal-orchestration` provides the local implementation.
[ADR 0017](../adr/0017-orchestration-interfaces.md) records the interface decision;
[ADR 0021](../adr/0021-local-temporal-orchestration.md) adopts local Temporal.
Temporal's development server is not a production service or a high-availability
guarantee.

## Who defines, runs and controls the work?

There are four parts to understand:

- **Workflow definitions** describe the order of work and valid inputs/outputs.
- **Task handlers** do the actual work: call tools, read files or submit work to
  an agent through existing authorised services.
- **Run management** lets the host start, inspect, answer and cancel a workflow.
- **Host bridges** connect tasks to existing Drawloom capabilities and preserve
  the records needed to recover safely after interruption.

A workflow does not create another agent loop, permission system or general
file store. The workbench still decides what its results mean and when a person
has accepted them.

## Authoring signatures

A `Workflow<I, O>` has an ID, version, input/output schemas and an async `run`
function. Its `WorkflowContext` offers four ways to coordinate work:

| Method | Use it to |
| --- | --- |
| `task(step, task, input, retry?)` | Perform a declared task, optionally with bounded retries. |
| `child(step, workflow, input)` | Start and await a child workflow. |
| `input(step, schema)` | Wait for an answer matching the supplied schema. |
| `sleep(step, milliseconds)` | Wait without keeping an ordinary process timer alive. |

The following definition fragment runs two branches, then asks for an
adjustment. It assumes `branch` is an existing number-in/number-out workflow
and `context` and `input` come from the surrounding `run` function.

```ts
const [left, right] = await Promise.all([
  context.child("left", branch, input),
  context.child("right", branch, input + 1),
]);
const adjustment = await context.input("confirm", z.number());
return left + right + adjustment;
```

Use ordinary TypeScript loops, conditions and `Promise.all`; there is no
Drawloom workflow language to learn. Give each logical step a stable name so
records and recovery refer to the same work. A step and each attempt to perform
it have different identities.

The [contract source](../../packages/orchestration/orchestration/src/index.ts)
defines the complete interfaces and validation rules.

## Authoring expectations

Workflow code must make the same coordination decisions when the engine
replays its recorded history. Put file access, network calls, tool execution and
agent work in task handlers—not directly in the workflow function. Use
`context.sleep` rather than an ordinary timer for a workflow wait.

Keep workflow data as validated JSON and authorised references. Do not place
live sessions, credentials, media bytes or duplicate transcripts in workflow
state. TypeScript types help authors, but do not make arbitrary code safe or
deterministic. Workflow modules are trusted code, not a sandbox.

Versions identify definitions and their saved work. The tested recovery path
uses the same code throughout. Changing code while work is unfinished is not a
supported workflow upgrade; the local implementation blocks incompatible
replacement rather than silently replaying with different code.

## Package definitions separately from handlers

A plugin's prebuilt workflow module exports a default `Registry` containing
workflow and task definitions. Its backend separately returns matching
`RegisteredTaskHandler` values. This lets the engine load coordination code
without loading the backend's file, network or provider operations.

Declare the module in `extensions["org.drawloom"].workflows.entrypoint`, using
a prebuilt `.js` or `.mjs` file under `./org.drawloom/`. Backend and workflow
files must remain inside that directory after symlink resolution. Inspection
checks files without executing the module. Activation loads trusted definitions
and requires exactly one handler with the same ID/version for each task.
Missing, extra or duplicate handlers reject activation.

Use `defineWorkflowModule` or `parseWorkflowModule` to validate definitions.
Workflow code can import portable schemas and definitions, not Temporal,
Node.js, Cloudflare or Tauri APIs, or backend task handlers.
See [plugin packaging](../reference/plugin-packages.md) for the full manifest and
trust checks.

## Backend handlers and interrupted dispatch

`registerTaskHandler(task, { run, recover? })` connects a task definition to its
implementation while preserving the input/output types. `matchTaskHandlers`
checks the complete set of handlers and validates values using the definitions'
schemas.

The handler receives a `TaskContext` with its task version, run, step, attempt
and cancellation signal. Use those identities to distinguish repeated delivery
from new work. The local provider records intended dispatch before calling a
handler and records its result before acknowledging completion.

If the process stops between those events, `recover` may inspect existing
receipts to determine what happened. It **must not perform the action again**.
It returns one of:

- `{ status: "completed", output }`: the earlier work finished and its output
  passes validation.
- `{ status: "retryable" }`: evidence establishes that repeating the task is safe.
- `{ status: "unknown" }`: the outcome cannot safely be determined.

An absent recovery handler or unknown result does not permit another dispatch.
A recorded result can be reused without running the effect again.

## Manage a run

The host receives an `Orchestrator` scoped to the installation and project;
host-owned capabilities have their own separate scope. Run IDs and pagination
cursors are checked within that scope. A model-supplied owner ID must not become
permission to read someone else's work.

- `start` uses a caller request identity, workflow definition and input. Reusing
  the same identity and input returns the existing run; conflicting reuse rejects.
- `get` reads a snapshot; `getSteps` and `list` provide bounded pages.
- `result` waits for generic JSON output. Use `workflowResult` to also check
  the expected workflow ID/version and validate its output type.
- `respond` answers one pending input request by run and request ID. Repeating
  the same response is harmless; stale, conflicting or cross-run answers reject.
- `cancel` requests cancellation of unfinished owned work.

A running snapshot with `pendingInputs` is waiting for information.
`cancellationRequested` is separate from terminal status.
`unresolvedEffects` records work whose external outcome remains uncertain.
The summary includes at most 100 steps; use `getSteps` for the rest.

The backend's separate `orchestrationReadiness` reports `ready`,
`configuration_required` or `unavailable`. An installed dependency being
present does not mean its service is ready. Provider startup state is not added
to the portable run-management API.

## Lifecycle and failure meaning

A run can outlive its initiating turn and client connection. Leaving a page or
stopping a local result wait does not cancel it.

| Situation | Expected behaviour |
| --- | --- |
| The user explicitly cancels | Request cancellation of unfinished owned work; do not claim rollback. |
| A branch fails terminally | Request cancellation of unfinished siblings and preserve completed results. |
| A task fails | Use one attempt unless the author explicitly allowed safe retries. |
| An effect may have happened without a saved acknowledgement | Investigate existing records; report unknown rather than blindly repeat. |
| The host or worker restarts | Restore engine state, then separately check uncertain external work. |
| The engine reports a terminal result | Do not assume every external process has stopped. |

Retries are capped at `MAX_TASK_ATTEMPTS` (10). They do not override denial,
invalid input or uncertainty. A task's optional `startToCloseTimeoutMs` is
between 1 millisecond and 24 hours; omission uses 30 seconds. The shared context
limits each run to 100 children and 100 simultaneous input waits. Reusing an
input step with a different schema rejects rather than reinterpreting an old
answer.

## Agent conversations

The [owned-agent helpers](../../packages/orchestration/orchestration/src/owned-agent.ts)
provide named tasks for creating a conversation, submitting work, inspecting or
awaiting it, interrupting, steering where supported and answering existing
approval/input requests.

They use `AgentDriver` and `AgentSession`; they do not take over unrelated
user conversations or allow concurrent turns within one conversation. Codex
still owns its native transcript and reviewer. Tool grants remain independent,
and a workflow input answer is not permission to edit a file.

If the host loses an active submission and cannot reconcile it through existing
records, the result is unknown. Saving a session ID alone does not prove that a
live Codex operation can be reattached after a crash.

## Temporal mapping and supported local implementation

The local provider maps workflows to Temporal workflows, tasks to activities,
children to child workflows, sleeps to durable timers and input responses to
durable messages. It explicitly limits activity retries instead of inheriting
the engine's defaults.

Closing Drawloom stops its local dispatch and owned processes without issuing
workflow cancellation. Timers and task deadlines still follow wall-clock time,
so reopening is not an unconditional pause/resume promise. Unfinished runs
prevent incompatible package updates; completed inspection also requires the
matching code. Cross-engine replay and hot workflow migration are not promised.

See the [local provider guide](../../packages/orchestration/temporal-orchestration/README.md)
for prerequisites, stored records and runtime-specific limits, and the
[ADR 0021 evidence](../../knowledge/evidence/adr-0021-local-temporal.md) for
recorded verification.

## Relationship to accepted contracts

Orchestration coordinates existing capabilities rather than replacing them:

- [Agent execution](agent-execution-contract.md) owns native session calls and
  their outcomes.
- [Tools](tool-execution-contract.md) own invocation checks and execution records.
- [Conversation history](../reference/conversation-history.md) owns display
  records, not workflow receipts.
- [Plugin boundaries](../adr/0013-plugin-boundaries-and-host-integration.md) and
  [working material](../adr/0015-working-material-ownership-and-edit-approval.md)
  keep UI integration, native review and business acceptance with their owners.

## Tests and supporting evidence

The [ADR 0017 proof record](../../knowledge/evidence/adr-0017-orchestration.md)
retains the original comparison with DeepSeek Harness and Temporal, and
separates scripted-agent tests from live-provider assumptions. Drawloom's
independent run management is an intentional difference from DeepSeek's
process-local live handles, not a claim of equivalent APIs.

Current shared tests exercise workflows, retries, input, cancellation and run
management; provider tests separately exercise receipts and actual local-service
recovery. Passing the TypeScript interface is not proof that another engine
offers the same behaviour. In particular, scripted agent recovery does not
establish live-model crash recovery or production Temporal guarantees.
