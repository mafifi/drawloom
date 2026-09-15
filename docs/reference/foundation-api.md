# Foundation API

Drawloom's foundation packages let you connect an agent, expose tools, store
information and coordinate work without tying your workbench to one implementation.
Use this guide to find the interface you need, then follow its detailed guide and
source types for exact inputs and results.

An **interface**, also called a contract here, describes what a component accepts,
returns and promises to do. An implementation supplies the code behind it. Choose
implementations when setting up your application; consumers use their interfaces.

## Find the right interface

The ten [capabilities](../../ARCHITECTURE.md#core-capabilities) are not ten
independent services. Memory uses knowledge interfaces; context provides shared
instruction types and a bounded reference-preparation interface, not a general
prompt compiler. Sandboxing comes from the execution environment.
Permission checks live alongside agents, tools and knowledge access. There is no
general model-inference API.

| What you want to do | Start here | Implementation or detailed guide |
| --- | --- | --- |
| Supply prepared instructions | `@drawloom/context`: `CompiledContext` | Your application prepares trusted text and source references |
| Select knowledge for a request | `@drawloom/context`: `ContextPreparer` | `@drawloom/knowledge-context`; [knowledge guide](../design/local-knowledge.md#use-knowledge-in-conversations) |
| Connect an agent | `@drawloom/agent`: `AgentDriver`, `AgentSession` | `@drawloom/codex-agent`; `@drawloom/synthetic-agent` for tests |
| Define and call tools | `@drawloom/tools`: `defineTool`, `ToolGateway` | `@drawloom/local-tools`; [tool guide](../design/tool-execution-contract.md) |
| Register plugins and inspect packages | `@drawloom/plugins`: definitions, metadata and tests | `@drawloom/startup-plugins`, `@drawloom/local-plugin-packages`; [package guide](plugin-packages.md) |
| Connect a trusted workbench backend | `@drawloom/desktop-host`: `PluginBackendFactory` | [Desktop host guide](../design/desktop-host.md) |
| Describe working material and review controls | `@drawloom/workbench`: schemas and `OperatorController` | Plugin-owned controllers; `@drawloom/synthetic-workbench` for tests |
| Read and store conversation history | `@drawloom/conversation-history`: reader and store | `@drawloom/sqlite-conversation-history`; [history guide](conversation-history.md) |
| Record observations and retrieve knowledge | `@drawloom/knowledge`: intake, retrieval, maintenance and access interfaces | `@drawloom/sqlite-knowledge`; [knowledge guide](../design/local-knowledge.md) |
| Create embeddings or assess knowledge | `KnowledgeEmbeddings`, `KnowledgeAssessment` in `@drawloom/knowledge` | `@drawloom/local-embeddings`, `@drawloom/codex-assessment`; Nightloom coordinates curation |
| Schedule tasks and workflows | `@drawloom/orchestration`: `Orchestrator`, tasks and workflows | `@drawloom/temporal-orchestration`; [orchestration guide](../design/orchestration-contract.md) |
| Assess results and compare experiments | `@drawloom/evaluation`: targets, scorers, results and feedback | SQLite storage, orchestration-backed execution and Braintrust assessment; [evaluation guide](../design/evaluation.md) |
| Store JSON or assets; connect a process | `@drawloom/host`: `JsonStore`, `AssetStore`, `AssetLibrary`, `RpcTransport` | `@drawloom/node-host` |
| Diagnose activity | Standard OpenTelemetry APIs | `@drawloom/otel-host`; [observability guide](observability.md) |

Package exports and TypeScript declarations are the exact API. This is a guide
through them, not a second exhaustive export list. The
[package overview](../../packages/README.md) explains the directory layout.

## Prepare knowledge references

`ContextPreparer` selects references for a request; it does not grant access or
turn those references into instructions. The knowledge-backed implementation
receives retrieval, authorization and trusted identity from application setup.
The application supplies the verified conversation and execution binding.

This fragment assumes those objects already exist:

```ts
const preparation = await preparer.prepare({
  request: message,
  binding: { conversationId, executionId },
  signal,
  budget: { maxRecords: 8, maxBytes: 12 * 1024 },
});
```

A ready result contains reference text, exact record revisions and its byte
count. Other results distinguish no matches, cancellation and unavailability.
The host decides the deadline and checks whether disclosure is still allowed
before handing references to the agent adapter. Do not append retrieved bodies
to `CompiledContext.text`: that field contains trusted application instructions.
See the [knowledge guide](../design/local-knowledge.md#use-knowledge-in-conversations)
for the desktop integration, large-record handling and acceptance limits.

## Tools

Use `defineTool` to give a function a name, description and input/output schemas.
A schema checks actual data as well as helping TypeScript infer its types. This
illustrative definition must be registered with a gateway before an agent can call it:

```ts
import { z } from 'zod';
import { defineTool } from '@drawloom/tools';

const countWords = defineTool({
  name: 'count_words',
  description: 'Count the words in supplied text.',
  input: z.object({ text: z.string() }),
  output: z.object({ count: z.number().int().nonnegative() }),
  execute: async ({ text }) => ({
    count: text.trim() ? text.trim().split(/\s+/u).length : 0,
  }),
});
```

Handlers also receive `invocationId`, `operationId` and an abort `signal`. Supply
other dependencies through the surrounding application code. Optional `render`
and `renderContent` turn validated results into display text or standard MCP
content; they do not replace the structured result. Rendering failure never runs
the handler again. MCP annotations such as `readOnlyHint` describe a tool, not
permission to run it. Local validation may enforce rules JSON Schema cannot express.

`createLocalToolGateway({tools, policy, evidence, nextInvocationId})` connects
tools to permission checks and execution records. Trusted application code calls
`bind(operationId)`; it must not expose binding creation as a model tool.
`revoke(binding)` closes a binding permanently. `invoke` validates arguments,
checks permission, records the start, rechecks permission and dispatches once.

Results distinguish work that never started, work known to have completed and
unknown effects. Recording failures are separately reported as `start_failed` or
`outcome_failed`. Cancellation asks the handler to stop; it does not undo changes.
The gateway never retries automatically.

`createCodexToolBridge` associates calls with the exact native thread and turn.
The application publishes and retires bindings; unresolved origins are denied,
not assigned to the currently active operation. MCP `_meta` retains operation,
invocation and execution status. A recording failure sets `isError` even when
the outcome is known. See the [tool guide](../design/tool-execution-contract.md).

## Agents and hosts

### Open a session and follow its work

`driver.openSession({sessionId, context, tools})` returns an `AgentResult` containing
the session or an error. Subscribe to `session.signals()` before `execute` so you
can follow the operation from start to its terminal result. Consume that stream
once: it is not a history API. An accepted operation emits a start and exactly one
terminal signal; closing is safe to repeat and interrupts active work.

Steering, interruption, discovery and history are optional. Check support before
using them. Discovery selections contain validated IDs and revisions, not native
paths. Attachments are managed assets; adapters reject media they cannot consume.
Viewable audio/video is not automatically valid model input.

Approval and requests for information are separate interactions. Stale responses
are rejected. `reviewerModes` reports human/delegated review support; the default
is human review. Steering cannot change an active turn's reviewer. See the
[agent guide](../design/agent-execution-contract.md) and
[Codex adapter guide](../design/codex-app-server-adapter.md).

`createCodexDriver` receives a `connect` function supplying an isolated app-server
connection per session. Its private store maps Drawloom sessions to Codex threads.
Closing preserves continuity; reopening does not replay signals or repeat work.
The application verifies the working directory against saved continuity before
resume. Prepared application context becomes trusted developer instructions;
untrusted documents must use the reference-material path instead.

### Store and stream files

`JsonStore` stores JSON; `AssetStore` stores bytes under relative keys.
`AssetLibrary` also creates managed identities for authenticated viewing. Raw
`AssetStore.write` does not register display metadata.

For large files, use `open(key)` and its `stream({start?, endExclusive?, signal?})`.
Always close the reader, including after errors. Metadata and bytes then describe
the same opened file. `writeStream` and `putStream` publish complete assets
atomically; the latter computes content identity. Small whole-buffer helpers
remain bounded alternatives.

Node storage confines paths to a trusted root and rejects existing symlink
traversal. It is not a sandbox against another local process replacing directory
entries concurrently. JSON writes sync a temporary file and rename it atomically;
directory fsync and power-loss durability are not claimed.

### Connect local processes

`RpcTransport` owns requests, notifications, subscriptions and cleanup. Adapters
still validate incoming values. `createMcpToolServer({exposure, invoke})` opens an
authenticated loopback endpoint and returns `{url, token, close}`. Give the token
only to the trusted process, never to model input, browser state or logs.

Tool inputs must be object schemas; outputs use `structuredContent: {value}`.
Requests are limited to 4 MiB. This is local infrastructure, not authentication
for a public remote service. `codexCommand()` supplies the launch command;
starting the process does not itself start a model turn.

## Plugins and presentation

Use standard [plugin packages](plugin-packages.md) for skills and MCP servers;
they do not require a Drawloom backend. For trusted application contributions,
`definePlugin` validates configuration and supplies tools, skills, workbenches
and views. `createPluginRegistry` checks identities and required dependencies.
Its catalogue is immutable, and registration neither invokes tools nor grants
permission. Listing a skill returns its summary rather than loading instructions.

### Plugin view integration

<a id="provisional-plugin-view-integration"></a>

Plugin HTML connects through standard MCP Apps. A registered view belongs to a
workbench from the same plugin; current registration permits one view per
workbench, not arbitrary layout slots. Its opening tool must identify the matching
`ui://` resource as `text/html;profile=mcp-app`.

The view uses upstream `App`; Drawloom uses `AppBridge` and `PostMessageTransport`.
Calls reach app-visible tools on the bound server. Plugins own the payloads:
an MCP App need not implement `OperatorController` or a shared snapshot format.

`ui/update-model-context` supplies temporary, untrusted reference material without
calling a model. `ui/message` asks for a reply in the current conversation; it
does not silently steer busy work, save a result or create a conversation.
Navigation clears future context selections, not earlier submissions. Stale view
callbacks are rejected. Restricted frames have no host filesystem or shell API,
but are not complete isolation from malicious code. See the
[desktop host guide](../design/desktop-host.md#provisional-plugin-view-hosting).

### Optional review controllers

`OperatorController` supports the existing declarative review UI. Its bounded
commands select/review a candidate, revise a document, configure a display-safe
field or change a named tool grant. This is a trusted host interface, not a model
tool or a mandatory MCP Apps protocol. Implementations enforce business rules.

Snapshots describe artifacts, candidates, reviews, readiness and safe configuration.
Groups aid navigation; `comparisonKey` identifies compatible alternatives.
`selectedCandidateId` is navigation, distinct from `selectedForOutput`. Editing
requires `editable: true`. Recovery labels describe an existing action, not an
executable browser-supplied command. Absent spending information means unknown,
not zero. Controllers validate changes and retain previous document revisions.

Host-only `observeArtifact({operationId, asset})` associates results with working
material. Repeating an operation/asset pair is idempotent; different operations
retain distinct origins even for identical bytes. It grants no review, spending
or generation permission. See
[review presentation](../design/desktop-host.md#declarative-review-presentation).

## Local consumption

Run `bun run build:packages` from the root, then `bun pm pack` inside each needed
package. Install the tarballs into your consumer from a local directory outside
this source checkout. Keep machine-specific paths and tarballs out of commits;
a gitignored directory with relative `file:` references is suitable.

Packed manifests resolve catalog/workspace versions. Install the matching set
together and test outside this checkout: successful workspace imports do not prove
the archive contains its dependencies. Packages provide ESM/declarations from
`dist/` and an optional Bun source condition. Portable contract tests run on Bun
and Node 22+; that does not establish every package's Cloudflare/Tauri compatibility.

## Provider conformance fixtures

**Conformance tests** are shared tests checking that implementations keep the same
promises. Relevant packages export suites through `/conformance`.

`agentConformance(factory)` requires the real driver, an observation of supplied
context and a completion producing `hello`. Providers supporting steering,
interruption, interactions or tool exposure also supply matching scenarios.
Omitting an optional scenario is not evidence it works. `AgentConformanceFixture`
defines the exact fixture shape.

Synthetic tests exercise core text/context behaviour without a model. Codex tests
use recorded protocol responses with the real gateway/bridge. Both run under Bun
and Node; these are not live-provider checks. Tool tests additionally cover invalid
output, rendering failures, cancellation after dispatch and no automatic retries.
Follow [CONTRIBUTING.md](../../CONTRIBUTING.md#test-the-behaviour-not-just-the-code)
for integration, failure and platform testing.
