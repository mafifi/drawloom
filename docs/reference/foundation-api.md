# Foundation API

Implementation reference for ADR 0011 and the integrated plugin proof under
[ADR 0013](../adr/0013-plugin-boundaries-and-host-integration.md)
(review pending, version 0.0.0; no release).
Every package exports standard ESM and declarations from `dist/`, plus bundled
source through its optional Bun condition. `bun run
build:packages` builds them. Portable contracts support Bun and Node 22+;
Cloudflare and Tauri compatibility are not claimed.

| Package | Public surface |
| --- | --- |
| `@drawloom/context` | `CompiledContextSchema`, `CompiledContext` (text and source references) |
| `@drawloom/host` | `JsonValueSchema`, `JsonValue`, `RpcTransport`, `RpcMessage`, `RpcRequestError`, `JsonStore`, `AssetStore`, `AssetLibrary`, `AssetReader`, `AssetReadOptions`, `AssetSchema`, `Asset`; `/conformance`: `hostConformance` |
| `@drawloom/tools` | `defineTool`, `ToolDefinition`, `ToolContext`, `ToolExposureSchema`, `ToolExposure`, `ToolResultSchema`, `ToolResult`, `ToolBinding`, `ToolGateway`, `ToolEvidenceSink`, `ToolEvidence`, `ToolPolicy`; `/conformance`: `toolConformance` |
| `@drawloom/local-tools` | `createLocalToolGateway` |
| `@drawloom/agent` | schemas and types for `AgentDriver`, `AgentSession`, session open, operation, steering, approval/input resolutions, safe signals and results; `/conformance`: `agentConformance` |
| `@drawloom/synthetic-agent` | `createSyntheticDriver` (a supplied text responder; no model loop) |
| `@drawloom/codex-agent` | `createCodexDriver`, `createCodexToolBridge`, `CodexDriverOptions` |
| `@drawloom/plugins` | `definePlugin`, `PluginDefinition`, `PluginContributions`, `SkillSchema`, `Skill`, `PluginRequirementSchema`, `PluginRequirement`, `PluginRegistry`, `PluginInstaller`; `/conformance`: `pluginConformance` |
| `@drawloom/startup-plugins` | `createPluginRegistry` |
| `@drawloom/local-plugin-packages` | Bun-hosted `inspectPackage`, `readSkill`, `readSupportingFile`, `activatePackage`; standard stdio/Streamable HTTP connections |
| `@drawloom/workbench` | `WorkbenchSchema`, `ArtifactSchema`, `CandidateSchema`, `ReviewSchema` and inferred types |
| `@drawloom/desktop-host` | `DesktopCompositionContext`, `PluginBackendContext`, `PluginBackendCapabilities`, `PluginBackend`, `PluginBackendFactory` for trusted installed-package backends |
| `@drawloom/node-host` | `createNodeJsonStore`, `createNodeAssetStore`, `createStdioTransport`, `codexCommand`, `createMcpToolServer` |
| `@drawloom/synthetic-workbench` | `createSyntheticWorkbench` |
| `@drawloom/conversation-history` | Portable history records, pages, changes, checkpoints, store and reader contracts; `/conformance`: `conversationHistoryConformance` |
| `@drawloom/sqlite-conversation-history` | `createSqliteConversationHistory` (Bun only) |
| `@drawloom/orchestration` | Accepted ADR 0017 workflow/task, management and owned-conversation contracts and shared conformance; no bundled workflow engine |

Accepted ADR 0018 also adds portable package metadata to `@drawloom/plugins` and
`PluginBackendFactory`, context, capabilities and cleanup types to
`@drawloom/desktop-host`. See the [package reference](plugin-packages.md) for the
standard/enhanced split and current evidence. This is not a Temporal desktop
integration or an accepted migration claim.

## Tools

`defineTool({name, description, input, output, execute, render?, renderContent?, annotations?})` infers handler
types from Zod. Registration projects input and output JSON Schema; canonical
values must be JSON. Runtime refinements still run locally and are not claimed
as equivalent external schema constraints. Handler context contains only
`invocationId`, `operationId`, and `signal`. Inject dependencies by closure.

Optional `ToolAnnotationsSchema` / `ToolAnnotations` carry standard MCP hints:
`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`.
Supplied annotations are strictly validated and preserved through exposure and
MCP discovery. They never grant invocation authority.

ADR 0016 adds optional `renderContent(value)` and `ToolContentSchema`, preserving
standard MCP content blocks alongside canonical `value` and compatible `text`.
Rich rendering runs after output validation. Its failure does not repeat a
settled handler. See [discovery and resources](discovery-and-resources.md).

`createLocalToolGateway({tools, policy, evidence, nextInvocationId})` snapshots
the catalogue. `gateway.bind(operationId)` produces an opaque object;
`gateway.revoke(binding)` permanently closes it. Binding is trusted composition
API and must never be exposed as a model tool. `invoke(binding,name,args,signal)`
checks live policy, validates arguments, acknowledges start evidence, rechecks
authority, and dispatches once. No retry occurs. Expected failure codes and
execution knowledge are validated by `ToolResultSchema`; evidence is separately
`recorded`, `start_failed`, or `outcome_failed`. Pre-dispatch failure is
`not_started`; handler rejection is `unknown`; output/render validation after
settlement is `completed`. Cancellation is cooperative and never proves rollback.

`exposure` is immutable catalogue/schema data. MCP projection is provider-owned.
`createCodexToolBridge(gateway)` exposes `publish(threadId,turnId,binding)`,
`retire(threadId,turnId)` and `call(metadata,name,args,signal)`. Use only metadata
from a composition-owned trusted channel. Exact origin is required; unresolved
origins deny immediately rather than guessing the current operation. Results
carry Drawloom invocation and operation correlation in `_meta`.
Failure projection also preserves `execution` knowledge in `_meta`; evidence
failure always sets MCP `isError`, even when the canonical outcome is known.

## Agents and hosts

Accepted [ADR 0020](../adr/0020-directory-backed-projects-and-file-delivery.md)
adds implemented byte-stream APIs: `AssetStore.open(key)` and
`AssetLibrary.open(key)` return `{size, stream({start?, endExclusive?, signal?}),
close()}`. The caller must close the reader, including on error. Storage reads
are confined and bounded; metadata and bytes describe the same opened handle.
`AssetStore.writeStream(key, chunks, {maxBytes, signal?})` publishes atomically.
`AssetLibrary.putStream(chunks, mediaType, {signal?})` hashes and publishes a
complete managed asset, retaining existing content identities. `read`, `write`
and `put` remain bounded helpers, not large-file delivery paths. Host-specific
implementations remain outside the portable contract.

The desktop backend context includes a fixed optional `project: {id,directory}`;
the desktop supplies it, while headless consumers need not. Installation is
global, activation and backend JSON storage are per project. The Codex adapter's
optional `workingDirectory` verifies existing native continuity before resume,
then supplies the same directory for start/resume. It is host configuration, not
a browser-supplied native continuation credential.

`driver.openSession({sessionId,context,tools})` returns `AgentResult<AgentSession>`.
Call `signals()` once before `execute({operationId,text,additionalContext?,reviewer?})`.
One accepted operation emits started then exactly one terminal signal. Close is
idempotent and emits interrupted for active work. Optional `steer` and `interrupt`
methods declare their own support. Resolution of stale interactions is rejected.
Approval options retain provider text and adapter-private response values. Input
is informational. Invalid provider data and failures are bounded, not raw errors.

Optional `session.discovery` lists metadata snapshots and can read discovered
resources. `execute` and supported `steer` accept `selections: [{id, revision}]`;
these are validated discovery identities, never native paths or arbitrary
provider input objects. `agentDiscoveryConformance` covers the optional boundary.

`AgentReviewerSchema` / `AgentReviewer` are `human | delegated`.
`session.reviewerModes` reports supported modes explicitly; missing operation
selection defaults to human and unsupported selections reject. An active turn
cannot change reviewer through steering. Approval requests may include bounded
`details`; `approval.resolved.optionId` is absent when the provider retires a
request without a user choice. No second reviewer or preview contract is added.
Codex native mapping and automatic-review observations are described in the
[adapter reference](../design/codex-app-server-adapter.md#native-review-addition-adr-0015).

`createCodexDriver({connect,store,projection?,onTurnAccepted?,onTurnFinished?})`
uses one owned `RpcTransport` per session. `connect` must return an isolated
app-server transport. `projection(exposure)` returns provider-specific MCP
configuration; nonempty exposures without projection are rejected. Composition
uses turn callbacks to publish and retire bridge bindings. The private store
maps session IDs to provider thread IDs; session close preserves continuity.
Transport failure ends the stream and active operation; reopening resumes stored
threads but does not replay signals or automatically retry work.
The compiler supplies trusted, already-processed application context. Initial
context projects to developer instructions; fresh text projects to Codex
`additionalContext.drawloom = {kind:'application',value:text}`. Do not pass raw
untrusted documents as compiled application instructions. Source references stay
with the context owner rather than being sent as provider context fields.

`RpcTransport` accepts unknown wire values, provides request/notification/response
and subscription cleanup, and owns close. `JsonStore.get/set` stores JSON values.
`AssetStore.read/write` addresses relative asset keys and bytes. Node stores
confine keys to their configured root and reject symbolic-link traversal. These
local providers are not a sandbox for arbitrary native provider actions.
The asset root must be controlled by the trusted host. Checks reject existing
symlink traversal, but do not claim protection against another local process
concurrently replacing directory entries. JSON writes sync a temporary file and
atomically rename it; directory fsync and power-loss durability are not claimed.

`createMcpToolServer({exposure,invoke})` opens an authenticated, stateless loopback
HTTP MCP endpoint and returns `{url,token,close}`. Only the trusted Codex process
receives the bearer token; never put it in model input, frontend state, or logs.
The `invoke` callback normally calls a composed Codex tool bridge. Tool input
schemas must be object schemas at this MCP boundary; scalar input schemas are
rejected rather than silently misrepresented. Canonical outputs are projected as
`structuredContent: {value}` with the corresponding wrapper schema. The HTTP
request body is bounded to 4 MiB. The endpoint is local infrastructure, not a
remotely authenticated service. Process launch uses `codexCommand()` and a
composition-selected working directory. It starts no model turn by itself.

## Plugins and presentation

`definePlugin({id,version,config,requires?,contribute})` parses configuration and
returns tools, skills, workbenches and optional views. `createPluginRegistry(installs,capabilities)`
validates every install, rejects duplicate plugin/tool/skill/workbench IDs and
unsatisfied `{kind:'capability'|'tool'|'skill',id}` requirements, and returns an
immutable registry. Capabilities are public identities supplied by composition.
Contributions confer no permission. Tool dependencies are closures; the registry
does not invoke handlers. Skills are text instructions and confer no authority.
Workbench/artifact/candidate/review schemas describe presentation only.

`registry.contributions` retains each flattened contribution's owning `pluginId`,
kind and identity. Optional skill descriptions are discovery summaries; listing
does not expose skill bodies or load their instructions into the model.

### Provisional plugin view integration

`@drawloom/plugins` additionally exports `WorkbenchViewSchema` and
`RegisteredWorkbenchViewSchema` with their inferred types. A view declares an
identity, title, workbench identity and `ui://` HTML entrypoint. Registration
derives the contributing plugin identity and validates ownership; the view must
belong to a workbench contributed by that plugin. This initial implementation
permits one view per workbench. It is not an arbitrary layout-slot registry.

Package extension placement identifies a named MCP server and opening tool.
Backends may supply named `{name, transport}` connections using the MCP SDK
transport contract; standard servers remain declared in `mcp.json`.
The host advertises MCP Apps support, discovers tools and reads the opening
tool's `_meta.ui.resourceUri` as `text/html;profile=mcp-app`. It rejects missing
registrations, mismatched resources and requests for unsupported origins or
permissions. Plugins may compile Svelte and `@drawloom/ui` into that HTML.

The embedded resource uses the upstream `App`; the public parent uses upstream
`AppBridge` and source-bound `PostMessageTransport`. Initialization, host theme,
`tools/call`, results and teardown use MCP Apps, replacing the custom proof
envelope. Only app-visible tools on the bound server can be called. Tool payloads
belong to the plugin; neither `OperatorSnapshot` nor `OperatorController` is a
requirement of this bridge. Public counter tests exercise a different data shape.
The video server exposes narrow app-only read/inspect/direct-save tools. Direct
Save invokes no model and creates an unaccepted draft. It does not expose business
review, grants, generation or the complete operator command union. Agent editing
is a separately registered typed tool subject to native review and Drawloom grants.
The parent additionally handles standard `ui/update-model-context` and
`ui/message`: text/structured selection replaces ephemeral untrusted reference
material without running a model; an explicit user message asks the existing
agent for a reply in the current conversation. No automatic save/acceptance,
new task, steering or retry is introduced. Busy/unsupported requests may fail.
Captured routing and an internal host-issued mount identity reject stale
assistance callbacks and prevent delayed cleanup clearing a replacement view.
Navigation/closure clears context. This verifies the accepted ADR 0013 subset,
not all MCP Apps features; general placement remains provisional.
Clearing removes context from future submissions, not from prior Codex turns.
The read-only native history projection currently displays that earlier input,
including its reference material, when restoring a conversation.

HTML executes with frame restrictions rather than access to the host component
tree. This proof blocks network subresources and privileged host API access,
not all possible network activity: a frame may navigate itself away. Do not
treat it as an adversarial-code isolation guarantee. The
[desktop boundary](../design/desktop-host.md) owns exact enforcement and limits.

`@drawloom/workbench` additionally exports `OperatorCommandSchema`,
`OperatorSnapshotSchema`, `OperatorResultSchema`, `ArtifactIntakeSchema` and their
inferred types, plus `OperatorController`. Its `/conformance` export provides
`operatorConformance(factory)` for public and private implementations.
`dispatch` accepts only `select_candidate(candidateId)`,
`review_candidate(candidateId,decision,summary)`,
`revise_document(candidateId,artifactId,text)`, `configure(key,value)` and
`set_tool_grant(toolName,allowed)`. Configuration values are display-safe string,
number or boolean fields. Controllers reject unknown keys and own domain rules;
selection does not imply acceptance or permission. Document revision refers to
an immutable source artifact and creates a new candidate in the text example.
Snapshots expose artifacts, candidates, reviews, selection, readiness, safe
configuration and explicit grants. No arbitrary UI code or secret values belong
in them. The trusted host validates results and never advertises these commands
to agents. Authority derives from the authenticated source channel, never an
`origin`, role or other caller-supplied field.

Optional snapshot `groups` reference artifact/candidate IDs, including documents
without candidates; references must resolve and identities must be unique.
Candidate `comparisonKey` restricts comparison to an output family;
`selectedForOutput` and `stale` are controller-owned presentation independent of
the navigation bookmark `selectedCandidateId`. Optional `reviewAction` carries
`kind: 'recovery'`, an exact button label and description. It does not introduce
an executable action or change the existing review command. Artifact `editable`
must be explicitly true to offer text revision. Optional `spending.summary`
reports safe plugin-owned accounting text; omission means unknown, not zero.
See the [presentation admission rationale](../design/desktop-host.md#declarative-review-presentation).

Optional `observeArtifact({operationId,asset})` is host-only intake of a validated
native artifact signal. Repeated operation-plus-asset delivery is idempotent;
identical bytes from different operations preserve distinct provenance through
`Artifact.operationId`. Intake cannot confer review, generation or spend authority.
Private implementations may retain unassigned candidates instead of guessing a
recipe role from arrival order.

Agent operation/steering inputs now accept optional `attachments: Asset[]`.
Adapters reject media they cannot consume; synthetic remains text-only and Codex
projects host-imported images through its private `imageInput(asset)` resolver.
`captureImage(result)` receives native image result data, never a path, and returns
a confined `Asset`. Exact native turn correlation yields `artifact.available`
with Drawloom operation identity. Unknown/late turns cannot borrow current work.
Native result paths are ignored. Media capture completes before a terminal signal.

Optional `AgentSession.history` exposes `ConversationHistoryReader`, replacing
the eager `readHistory()` projection in this unreleased API. The adapter reads
native metadata and bounded payload pages; the host atomically stores normalized
records and its private checkpoint updates. It never replays signals or injects
stored history into the model. Provider IDs remain private. Unknown historical
operations receive no invented correlation. Native message IDs are projected to
stable public identities used by both live signals and stored history. Completed
message signals may carry a user role and managed attachment references; artifact
signals may correlate with the same display identity. A new unmaterialized thread
has empty history. See [conversation history](conversation-history.md) for the
contract, local storage, data selection and paginated browser transport.

`@drawloom/host` also exports `AssetLibrary.put(bytes,mediaType)/read(key)` and
`assetLibraryConformance` from `/conformance`. This host-managed boundary creates
asset identity rather than accepting a path; the desktop implementation registers
each `put` for authenticated viewing, which differs from raw `AssetStore.write`.
The supported package backend receives these through its explicitly requested
host capability, with JSON storage scoped by installation. See the [desktop host boundary](../design/desktop-host.md) and
[desktop instructions](../../apps/desktop/README.md).

## Local consumption

From this public root run `bun run build:packages`, then `bun pm pack` within each
needed package. Install those tarballs into a consumer using a caller-selected
local path. Do not commit machine-specific absolute paths or copy source. A
consumer may keep tarballs in a gitignored local dependency directory and use
relative `file:` references there. Packed manifests resolve catalog/workspace
versions; install all needed lockstep artifacts together until registry releases
exist. Public tests and builds require no consumer checkout.

## Provider conformance fixtures

`agentConformance(factory)` requires each fixture to expose its real driver,
`contextText()` observed at the provider boundary, and `complete()` to produce
the text `hello` (deltas when supported) followed by a terminal completion.
The suite checks ordered content, context consumption, exact terminal delivery,
and that a returned iterable cannot create competing waiters. A fixture for a
driver exposing steering or interruption must provide `controls` observations
and provider-confirmed interruption. Providers implementing interactions or
agent-mediated tool exposure must also supply the corresponding `interactions`
and `tools` scenarios; omitting them is not evidence of those features conforming.
Their exact typed fixture surface is exported as `AgentConformanceFixture`.

The Codex fixture drives all these scenarios through its private recorded wire
transport and the actual gateway/bridge. The synthetic responder has no optional
controls, interactions or external tool transport and runs the shared core,
content and context cases. Both fixtures run unchanged under Bun and Node.
Provider-specific wire construction lives in a repository test fixture, outside
the portable contract suite. `toolConformance` additionally verifies invalid
output after one execution, canonical renderer isolation, renderer/handler failure
knowledge, and cancellation after handler entry without early settlement or retry.
