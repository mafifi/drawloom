# Tool execution contract

- **Status:** Working contract design supporting Accepted ADR 0008; not a supported API
- **Decision:** [ADR 0008](../adr/0008-tool-execution-and-exposure.md)
- **Evidence:** [Verified proof and limitations](../../knowledge/evidence/adr-0008-tool-execution.md)

## Proof scope

The retained implementation under `spikes/adr-0008-tool-execution/` exercises
the agreed tool behaviour. It is not a supported package. It uses the root
Zod and MCP dependencies and reuses only ADR 0007's app-server transport.

## Authoring and invocation

`defineTool({ name, description, input, output, execute, render? })` infers
handler input and output from Zod schemas. A handler receives validated input
and `{ invocationId, operationId, signal }`; provider identities, policy grants,
and unrestricted service locators are absent. Dependencies are closures supplied
by composition. Names are nonempty and unique within a fixed catalogue; a
provider adapter must reject or map unsupported wire names explicitly.

Both input and successful output must be JSON-representable. JSON Schema
projection must succeed when the tool is registered. Default rendering is
`JSON.stringify(value)`; an optional renderer returns text from the validated
value. It cannot change that value. A renderer failure is distinguishable from
handler failure. The executable proof contract owns exact schemas and types.
Input projection describes values before defaults; output projection describes
the validated result. JSON Schema does not advertise runtime-only refinements
as equivalent validation.

The gateway exposes `invoke(binding, name, arguments, signal)`. `binding` is an
opaque in-process handle obtained through the trusted composition, never a
model argument. Policy supplies a live decision for that binding and tool.
The invocation captures its binding before awaiting any work and rechecks it
after acknowledging the start record, immediately before handler dispatch.
An inactive or unknown binding denies execution. Closing a binding never
retargets existing calls to another operation.

Results carry an invocation ID, an outcome, and a separate evidence state.
Successful outcomes retain a canonical JSON value and rendered text. Failure
outcomes carry a bounded code and execution knowledge: `not_started`,
`completed`, or `unknown`. `completed` describes handler settlement and does
not mean no side effects occurred. A throw after handler entry is conservatively
`unknown`; raw exception messages do not cross the boundary.
Validation failures include the first invalid path, not the rejected value or
raw validation message, following ADR 0004.

Evidence state distinguishes `recorded`, `start_failed`, and `outcome_failed`.
A start failure prevents handler dispatch. An outcome-recording failure retains
the known outcome and sets `outcome_failed`; adapters must not present the
overall invocation as an unqualified success. The proof sink acknowledges
records in memory or by writing, syncing, and closing a temporary file; it makes
no production crash-durability claim. Observability will own stronger
acknowledgement semantics.

The gateway dispatches a handler at most once per invocation. It never retries.
Pre-aborted calls do not enter the handler. After entry, it forwards cancellation
and waits for handler settlement; it cannot kill in-process code or promise
rollback. Cancellation observed before successful settlement yields a cancelled
outcome with honest execution knowledge. Non-cooperative code remains a sandbox
concern.

## Provider-private authority binding

The Codex adapter projects only `_meta.callId` and the `thread_id` / `turn_id`
fields of `_meta["x-codex-turn-metadata"]` from its isolated stdio connection.
The live probe verified their presence and relation to app-server turn IDs on
the version recorded in the evidence; upgrades must rerun that compatibility gate.
These fields are provider-authored transport metadata, not tool arguments.
They are not authenticated merely because they are named `_meta`: the proof
trusts only the stdio pipe launched and owned by its composition.

Composition maps the exact provider thread/turn pair to one Drawloom operation
and its policy binding. Binding is published from `turn/start` acceptance.
If a call arrives first, the adapter may wait briefly for that exact key; it
never falls back to a mutable current-operation pointer. A missing, expired,
or closed mapping fails closed. Entries are not reused for another operation.
The same catalogue and MCP server remain available across operations.

The proof delays a real operation-A request across the transition to operation
B, replays a saved A envelope over a controlled test connection, and verifies
neither can borrow B's authority. Raw metadata stays in temporary runtime files
and is removed after the run. Public results carry Drawloom correlation only.

## Required evidence

- Direct invocation and MCP projection produce the same canonical value.
- Invalid input never calls the handler; invalid output is reported after one
  handler execution; duplicate names and unprojectable schemas are rejected.
- Default and custom rendering preserve canonical data; renderer failure does
  not masquerade as a handler failure.
- Denied, forged, stale, and pre-aborted bindings do not execute. Revocation
  during start acknowledgement prevents dispatch. Overlapping calls remain
  attached to their original operation.
- Start-record failure prevents effects. Outcome-record failure preserves known
  effects and never retries. Cancellation after an effect does not claim rollback.
- A live Codex call supplies usable metadata, executes the word-count tool,
  preserves explicit result correlation, and retains one exposure while policy
  changes. Controlled delay/replay verifies cross-operation isolation.
- All temporary files, MCP processes, and created Codex threads are cleaned up;
  cleanup failure makes the live command fail.
