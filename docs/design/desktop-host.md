# How the desktop connects Drawloom

The desktop host connects the UI to agents, plugins, projects and stored results.
It chooses the implementations, checks incoming requests and keeps each action
attached to the right conversation and project. The browser presents that work;
it does not receive filesystem, process or credential access.

Read this guide when integrating a workbench or changing how the desktop uses a
capability. For setup, start with the [desktop README](../../apps/desktop/README.md).
For the interfaces themselves, use the [foundation guide](../reference/foundation-api.md).

## Where to read the host code

Start with [application.ts](../../apps/desktop/host/application.ts) to see how the
desktop chooses implementations and handles commands. Follow these smaller
modules when you want to understand a particular responsibility:

- [Application lifecycle](../../apps/desktop/host/application-lifecycle.ts)
  stops new requests when shutdown begins and waits for admitted work before
  releasing its dependencies. The HTTP server also rejects commands still waiting
  in its queue.
- [Desktop sessions](../../apps/desktop/host/desktop-sessions.ts)
  owns pending connections, live sessions and background readers. Concurrent
  connections share startup; failed or interrupted startup releases resources
  already acquired. [Session signals](../../apps/desktop/host/session-signals.ts)
  turns provider events into display history, approval state and artifact intake.
- [Turn preparation](../../apps/desktop/host/turn-preparation.ts)
  resolves selected skills, references and attachments and prepares context.
  The application retains execution identities, permission rechecks and the
  decision to send a new turn or steer an existing one.
- [Conversation resources](../../apps/desktop/host/conversation-resources.ts)
  coordinates history writes, captured tool results and recovery after a failed
  write. Recovery uses retained evidence; it does not rerun the tool.
- [Project plugin runtimes](../../apps/desktop/host/project-plugin-runtimes.ts)
  keeps one runtime per project, shares concurrent startup, and retires created
  runtimes. The application still selects and assembles their implementations.
- [Project tool access](../../apps/desktop/host/project-tool-gateway.ts)
  checks which conversation owns a foreground tool operation, its project and
  workbench grants, and where its evidence is recorded. Workflow authority
  remains separate.

Each module has a neighbouring test file. Application-level tests check that
these responsibilities still work together across navigation, restart and shutdown.

## Starting and stopping safely

The host alone selects the installation directory (explicit override,
existing legacy directory, or `~/.drawloom`). In managed native startup its first
stdout line is a JSON readiness record: `{ "url": <one-use loopback bootstrap
URL>, "dataDirectory": <absolute selected directory> }`. The shell validates
both fields and uses that same directory for browser state; it must not select
a second Tauri application-data directory. This private parent/child handshake
is not telemetry or a frontend API. Unmanaged CLI startup prints only the URL.
An invalid readiness record fails startup and drains the owned host.

Shutdown first stops new work and cancels supported preparation and local setup.
Already admitted work must settle before its dependencies close. Closing the
application more than once joins the same shutdown; it does not repeat cleanup.

Each resource has one closing owner. In particular, orchestration composition
closes the shared manager after its consumers release it. Session and project
startup cannot publish a new connection after their owner has stopped.

A failed close does not prevent the remaining cleanup steps from running. The
host reports the combined failures, including failure results returned by an
agent, rather than claiming successful shutdown. The process still attempts to
flush telemetry and exits unsuccessfully if cleanup fails. Closing a connection
is not evidence that an external action was cancelled, and never authorizes a
retry.

## Follow the project, not the selected screen

Each conversation has a fixed project identity and working directory. Switching
the selected project does not change where that conversation's tools or file reads
operate. The Drawloom data directory holds application data; it is not the user's
working project.

Installation, trust, configuration and credentials are shared globally. Controllers,
connections and backend storage are activated per project. A trusted backend gets
`project: {id, directory}` and installation/project-scoped JSON storage, separate
from host navigation records. Headless consumers may omit project context; the
desktop supplies it.

A missing directory prevents starting installed code. Cached history remains useful,
and already-running Stop and pending responses remain reachable if the folder
vanishes. Activation can resume when the original folder returns.
[ADR 0020](../adr/0020-directory-backed-projects-and-file-delivery.md) explains this
separation.

## Transport

The browser sends commands over an authenticated, same-origin loopback HTTP
connection. Cookies are host-only, HttpOnly and SameSite=Strict. Mutations require
the exact Origin and JSON content type, except the bounded binary-upload endpoint.
Tauri starts the same host and opens its one-use bootstrap URL; it does not add a
frontend filesystem or shell API.

Trusted backends implement `PluginBackendFactory`. They receive explicitly
requested capabilities and return contributions, controllers, named MCP connections
and cleanup. Loading them executes trusted host code, not browser code. Inspection
never imports them. Use [plugin packages](../reference/plugin-packages.md) for the
accepted ADR 0018 installation path, permissions and authentication ownership.

## Keep history separate from agent execution

`apps/desktop/host/history-application.ts` owns the desktop-facing history page,
change, around and conversation-search operations. It depends on the durable
history store and narrow callbacks for recovery, synchronization and cache
instrumentation; it does not receive the lifecycle-proxied application object.

`apps/desktop/host/desktop-snapshot.ts` owns snapshot projection and its
unavailable operator fallback. It reads only snapshot-specific state through
narrow callbacks; application lifecycle ownership remains in the composition
root.

`apps/desktop/host/discovery-application.ts` owns desktop catalogue discovery,
native integration authentication and source-bound discovered-resource reads.
Its native discovery cache is scoped by conversation; the composition root
supplies runtime, project, connection and capture operations.

Codex owns its native transcript and session. Drawloom stores a display record in
`history.sqlite`, not a replacement transcript to replay into the model. The host
stores normalised records and private import checkpoints atomically. Unknown
historical operations are not assigned an invented Drawloom operation ID.

The UI initially reads 50 entries, loading older pages as requested. Its 200-entry
rendered window is not a limit on stored history. Cached pages work offline.
History failures do not repeat or rewrite an agent's outcome. Project JSON holds
navigation, assets and review metadata rather than conversation text. See
[conversation history](../reference/conversation-history.md).

Opening or refreshing a conversation starts at its latest loaded message. The
view follows new content and delayed media layout only while the reader remains
at the bottom. Scrolling back, loading earlier entries or opening a search match
keeps that reading position instead.

The left-edge conversation rail marks user turns in the loaded window. Hover or
keyboard focus reveals a bounded prompt/response preview and enlarges nearby
marks; activating a mark scrolls to and focuses that message. It does not load
the entire transcript: use **Load earlier** for older pages. The rail and
conversation use the shared scroll-fade utility; reduced motion removes animated
jumps and marker transitions. These are local presentation states, not changes
to history, agent context or the workbench viewer.

This follows the contextual-navigation and contextual-emphasis interaction
patterns. There is no pending network operation for a loaded-message jump.
DeepSeek's `TurnNavigator` and bounded turn previews were inspected at
`c291e7961a515f6d7af9304e7fd1d257929aef26` as a behavior reference, not imported
as a dependency or taken as evidence of Drawloom's tests.

The desktop collapses navigation by default below 1024px. A split workspace
protects 400px for the conversation and 300px for the document; when the actual
available space cannot fit both, the document uses the workspace with a **Back
to conversation** action. This accounts for open navigation, not just window
width. Explicitly reopening navigation does not change its wider-window default.

Tool results are collapsed into summaries beside the last loaded message with
the same operation ID. Denied, failed, cancelled and uncertain counts remain
visible. Results without a matching loaded operation appear separately as
other activity; the UI does not invent a turn association. Expanding a summary
reveals recorded tool names and outcomes, with raw details one level further in.

When a workbench supplies a view, the conversation opens that view rather than
promoting whichever artifact happens to be selected into the main workspace.
Explicit file/resource inspection remains available. Project names can be
changed through the project menu without moving folders or rebinding conversations.

Tool starts and finishes are recorded in an ordered write queue. Outcomes become
visible after storage acknowledges them. `start_failed` and `outcome_failed`
identify recording failures separately from what the tool did; notices may remain
session-local when storage is unavailable. An unfinished saved start remains
unresolved after restart. It is neither success nor permission to repeat the action.

## Explicit conversation context

Users can share selected conversation excerpts as context without switching
conversations. The authenticated `send` command accepts `conversationContextIds`
(default empty, maximum four). It rejects the destination itself and unavailable
sources, then reads at most twelve latest cached entries per source.

Only completed user/assistant text is included, up to 8,000 text characters per
source, with conversation and entry identities. Empty usable excerpts fail visibly.
This is untrusted reference material, not developer instructions.

Sharing does not resume another native session, import older history, attach source
assets or grant its tools/files. The current local-owner host permits explicit
cross-project selection; this is not an enterprise information-sharing policy.

## Read files without importing everything

The host binds file delivery to the conversation's project. Managed assets use
authenticated identities; a filename from model output is not permission to read
that path. `AssetLibrary.put` registers media for viewing, while raw
`AssetStore.write` does not.

File imports accept supported media up to 256 MiB per asset and check bytes actually
received. Browser uploads send file bytes, not base64 JSON. Large-file delivery
uses opened readers with at most 64 KiB per storage read. GET, HEAD and single or
suffix byte ranges use the same validated file handle. Unknown formats can be
downloaded; active content is not executed in the application's origin.

Trusted components may also retain managed JSON documents. These keep their exact
bytes and are served as authenticated downloads, not inline application content.
This does not add JSON to browser uploads or native image input.

Native image input and captured image results have a separate 16 MiB limit. Codex
image results are captured from supplied bytes and matched to the originating
turn, never fetched from a returned native path. A playable video is not therefore
supported model input. Adapters reject unsupported attachments.

Native RPC frames are limited to 32 MiB, allowing one 16 MiB base64 image plus a
bounded envelope. Native history requests one item per page to avoid aggregating
large images. Oversized frames fail the connection without replay. MOV exports
use `video/quicktime` with download/open guidance rather than a playback guarantee.

## Plugin view hosting

<a id="provisional-plugin-view-hosting"></a>

Plugins supply separately built HTML through standard MCP Apps. The host serves
registered HTML only to the appropriate conversation/workbench. It discovers the
opening tool and resource through MCP, not a second UI protocol. The accepted
[ADR 0013](../adr/0013-plugin-boundaries-and-host-integration.md) describes this
integration; it is not arbitrary layout-slot or host-API access.

### Calls and selected context

Upstream `AppBridge` forwards calls only to app-visible tools on the bound server.
Their payloads belong to the plugin: a shared `OperatorSnapshot` is not required.
The plugin decides how to validate and save its material. A direct human Save is
not a model request or business acceptance. AI editing remains a separate tool
subject to native review and independent Drawloom grants.

Standard model-context messages replace temporary, untrusted reference material
without invoking an agent. An explicit UI message requests a reply in the current
conversation, not a new task or silent steering of a busy turn. Neither operation
saves or accepts the reply automatically. Unsupported or stale requests fail
without retry.

The host validates captured view/conversation ownership. An internal mount identity
rejects delayed callbacks and prevents old cleanup from clearing a replacement
view's context. This is internal routing, not a new plugin protocol. Clearing
context affects future submissions, not earlier material already sent to Codex.

### Browser restrictions and media

The frame allows scripts but has no same-origin privilege. Its content security
policy blocks general network connections, nested frames and forms. It grants no
Tauri, filesystem or process APIs. `PostMessageTransport` checks the source window.

One host-owned policy supplies allowed image/audio/video origins. A UI's declared
`resourceDomains` also supply its fonts/styles, never additional scripts. A
mount-scoped URL permits relative project media, not command authentication or
another project's files; navigation or closure invalidates it. See the
[package guide](../reference/plugin-packages.md#open-the-workbench-ui) for shared
media declarations and explicit reopening when the policy changes.

These controls do not fully isolate malicious code. A frame can navigate itself
to an external URL and could transmit data in that URL; CPU use is not bounded.
Moving to another origin loses bridge access but does not undo that transmission.
Stronger isolation needs a separate enforcement decision, not a claim that browser
restrictions already provide it.

### Closing a view

Normal close allows a 300 ms visual outro and a 250 ms standard resource-teardown
timeout before transport closure. New tool requests are aborted during cleanup.
Abrupt navigation disconnects immediately. Browser termination cannot guarantee
graceful cleanup or undo an already dispatched action.

The parent sends a mount-scoped release on cleanup. If delivery fails, a new mount,
conversation navigation or host restart also clears temporary context. Theme
information uses standard MCP Apps host context.

## Declarative review presentation

Some workbenches use `OperatorController` and snapshots for the existing shared
review UI. Others use their own MCP App. A controller owns validation and business
transitions; the host must not infer them from a display flag.

- **Commands:** Select/review a candidate, revise a document, configure safe fields
  or explicitly change a named tool grant. These are trusted host commands, not
  agent tools. Configuration does not implicitly grant tool access.
- **Revisions:** A document revision names its source candidate/artifact and leaves
  previous content available for comparison. Mutations and native artifact intake
  are ordered so overlapping changes cannot overwrite one another. Failure must
  not prevent later valid changes.
- **Groups and comparison:** Groups organise artifacts/candidates, including documents
  without candidates. Matching `comparisonKey` values identify comparable outputs;
  navigation selection is separate from output selection. Groups neither schedule
  work nor authorise bulk approval.
- **Editing and recovery:** Text editing requires `editable: true`. Recovery labels
  describe supported review actions rather than introduce arbitrary commands.
  Spending text is plugin-owned; estimates are not proof of actual charges.
- **Intake:** User imports capture the destination before asynchronous storage and
  receive a fresh `import-` operation identity. Native intake uses actual turn
  identity. Repeated operation/asset pairs are idempotent; intake never guesses an
  output role or grants review authority.

Public controller tests exercise contrasting document and media shapes through
the shared conformance suite. Plugins must add tests for their own business rules;
the shared presentation does not define those rules.

## Knowledge in a conversation

Automatic knowledge sharing is an explicit choice in Knowledge settings, separate
from retaining tool outcomes and running curation. The host prepares references
for the message being dispatched, with that conversation's fixed binding. It
does not use whichever project is currently selected in the sidebar.

The provider receives permitted reference material alongside user content.
Drawloom saves the original display text separately so reopening native history
does not turn references into words the user typed. A compact disclosure links
to evidence inspection; it is not permission to read a record again.

Settings changes and revoked grants invalidate pending disclosure before sending.
Failure or a deadline stops preparation, not the user's message. See
[local knowledge](local-knowledge.md#use-knowledge-in-conversations) for the
limits, controls and current acceptance status.

The application also owns the serial background curation timer and stops it
before closing its services. New automatic assessments require the separate,
saved curation choice; default model settings and opening a conversation are
not consent. Read-only status requests do not start maintenance.

## Model selection and download presentation

Authenticated `GET /api/models` returns bounded Codex model metadata without
sessions or credentials. Listing starts no conversation and calls no model.
`set_model` saves the conversation's optional model/effort choice, rejects unavailable
choices or changes during execution, and preserves project, reviewer and native
session identity.

The composer and Settings share the selector: effort first, then a searchable
model list. Fixed-effort assessment and embeddings use the list directly.
Integrations remain separate. Local embedding setup uses llama.cpp and GGUF under
[ADR 0026](../adr/0026-permissive-dependencies-and-local-gguf-embeddings.md).
Download progress shows the current file's received/expected bytes, not an invented
overall installation percentage. Installation and verification are separate stages,
with explicit cancellation. See [local knowledge](local-knowledge.md).
