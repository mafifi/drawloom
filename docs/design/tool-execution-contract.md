# Defining and running tools

A tool gives an agent a named function it can call: count words, inspect a file
or perform some workbench action. Define its inputs, outputs and handler once.
Drawloom's gateway then checks incoming arguments and permission, runs the
handler and records the outcome. The same path serves direct callers and tools
exposed through MCP.

`@drawloom/tools` defines the shared API; `@drawloom/local-tools` implements the
in-process gateway. [ADR 0008](../adr/0008-tool-execution-and-exposure.md)
explains the decision. The original experiment is retained evidence, not the
current package implementation.

## Authoring and invocation

Use `defineTool` with Zod schemas to describe valid inputs and outputs.
TypeScript infers the handler's types from those schemas.

```ts
import { z } from "zod";
import { defineTool } from "@drawloom/tools";

export const wordCount = defineTool({
  name: "text.word_count",
  description: "Count whitespace-separated words in text.",
  annotations: { readOnlyHint: true },
  input: z.object({ text: z.string() }),
  output: z.object({ count: z.number().int().nonnegative() }),
  execute: ({ text }) => ({
    count: text.trim() ? text.trim().split(/\s+/).length : 0,
  }),
});
```

This defines a tool; it does not install it or grant permission to call it.
The application supplies dependencies when registering the handler. A handler
receives validated input and a `ToolContext` containing its invocation ID,
operation ID and cancellation signal. It does not receive credentials,
provider identities or a general service locator.

Both inputs and successful outputs must be JSON-compatible. Schema conversion
to draft-07 JSON Schema must succeed when defining the tool. Tool names must
be non-empty and unique within the gateway's fixed catalogue. A provider must
explicitly map or reject names its protocol cannot support.

Input schemas describe the incoming value before defaults are applied; output
schemas describe the validated result. Runtime refinements still run locally,
but are not necessarily expressible in JSON Schema. Do not describe a projected
schema as enforcing checks that the target format cannot represent.

See the [tool contract source](../../packages/tools/tools/src/index.ts) for all
fields and validation rules.

## Register tools and call the gateway

The host creates a gateway with its tools, an asynchronous authorization binding, a record writer
and a function that issues unique invocation IDs. The gateway's `exposure`
describes its tools for the agent; it is not permission to use them.

Call `bind(operationId)` to obtain an in-process handle for one operation,
then use `invoke(binding, name, args, signal)`. Only trusted application code
should create and pass that handle. It is not an argument the model chooses.

The gateway remembers the operation before awaiting any work. It checks
permission again after writing the start record, just before entering the
handler. If the binding is unknown, revoked or no longer allowed, execution is
denied. `revoke(binding)` prevents later dispatch; it cannot undo a handler
that has already started. A delayed invocation cannot borrow a newer
operation's permission.

An unavailable decision is not ordinary denial, and neither permits execution.
If the second check fails, no handler has run: the result reports
`execution: "not_started"`. The host also checks authority generations around
awaited decisions; those checks do not replace the second policy evaluation.
See [access-decision replacement](../reference/replacing-capabilities.md#supply-access-decisions).

Call the gateway rather than `ToolDefinition.execute` directly. Calling the
handler yourself bypasses the checks and recording described here.

## Read data separately from its presentation

A successful result contains the validated JSON `value` and its rendered
`text`. Use the value in code instead of extracting fields from prose.
The default renderer uses `JSON.stringify`; an optional `render` function
can make the same result easier to read.

`renderContent` can provide standard MCP content blocks, such as images or
resource links. These are checked against the MCP content schema. Rendering
does not replace the validated result or grant permission to fetch a resource.

Output validation and rendering happen after execution. Invalid output or a
renderer failure does not mean the handler had no effects, and is not a reason
to run it again. Rendering failures have their own `render_failed` outcome.

## Understand failures and execution records

A `ToolResult` separates two questions: **what happened to the work**, and
**whether its record was saved**.

Failures identify denial, unknown tools, invalid input/output, handler or
rendering failure, cancellation, and recording failure. They also describe
what is known about execution:

| Execution value | Meaning |
| --- | --- |
| `not_started` | The handler was not entered. |
| `completed` | The handler returned; its effects may already have happened. |
| `unknown` | Execution began but its effects cannot safely be determined. |

A thrown handler error is conservatively unknown. Errors do not expose raw
exception messages. Validation failures identify the first invalid field path,
not the rejected value or a potentially sensitive validation message.

The separate `evidence` field describes recording:

- **`recorded`:** The configured `ToolEvidenceSink` acknowledged the records.
- **`start_failed`:** Recording the start failed, so the handler did not run.
- **`outcome_failed`:** Recording the outcome failed after the work. The known
  outcome is retained; do not present it as unqualified success or assume a retry
  is safe.

Acknowledgement is only as durable as the configured writer. The gateway does
not itself promise crash-proof storage. These execution records are not a
substitute for permissions, nor ordinary best-effort diagnostic logs. Keep
content-bearing records separate from
[operational telemetry](../reference/observability.md).

## Cancellation does not roll back work

The gateway enters a handler at most once per invocation and never retries it.
A call cancelled before entry does not run. Once a handler starts, the gateway
forwards cancellation and waits for it to settle.

Handlers must observe the signal or pass it to the operations they call.
In-process cancellation cannot kill uncooperative code, undo a file write or
prove that a remote operation stopped. Cancellation detected after a handler
returns is reported as cancelled with completed execution. A throw after entry
remains unknown. Process termination belongs to the selected execution
environment, not this interface.

## Match a native tool call to the right operation

The Codex integration maps provider-authored thread/turn metadata on its
host-owned connection to one Drawloom operation and gateway binding. Missing
or closed mappings deny the call. If metadata arrives before the matching turn
is registered, the adapter may wait briefly for that exact identity; it must
not fall back to the current operation.

The original live proof used `_meta.callId` and
`_meta["x-codex-turn-metadata"]`. Those names are not credentials, and ordinary
MCP callers cannot gain authority merely by supplying them. Trust came from the
isolated stdio connection owned by the test host. Other transports need their
own authentication and correlation evidence.

The [Codex guide](codex-app-server-adapter.md) describes native review.
Native approval and Drawloom tool grants are separate checks. Tool annotations
are descriptions, not permission. Form elicitation asks for information and
does not authorise execution.

## Required evidence

The [shared tool tests](../../packages/tools/tools/src/conformance.ts) and
[local gateway tests](../../packages/tools/local-tools/gateway.test.ts) cover:

- Input/output checks, duplicate names, schema conversion and rendering.
- Denied, forged, revoked and pre-cancelled calls making no handler call.
- Permission revoked while a start record is being written.
- Recording failures, overlapping calls and cancellation after effects.
- A single handler dispatch without automatic retries.

The [ADR 0008 evidence](../../knowledge/evidence/adr-0008-tool-execution.md)
records the original live MCP word-count call, explicit result correlation and
controlled delay/replay checks across operations. Those results apply to the
recorded environment, not every later provider version. Retained tests and
spikes do not establish remote transport authentication or stronger storage
guarantees.

Live verification must save its evidence and clean up the exact temporary files,
processes and Codex tasks it created. Report cleanup failures and retry cleanup
without repeating model work; never sweep user conversations by title.
