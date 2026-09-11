# Desktop host boundary

The public app composes providers. Its authenticated same-origin loopback HTTP
channel is the only UI command ingress; cookies are host-only, HttpOnly and
SameSite=Strict. Mutations require the exact Origin and JSON content type, except
the bounded octet-stream file-upload endpoint.
Tauri launches the same host and opens its one-use bootstrap URL. No filesystem
or shell API is exposed through a frontend plugin. Operator commands are not
agent tools. The private plugin's MCP App exposes narrow reading, navigation and
direct passage-save tools, not the broader trusted operator command union.

`OperatorController` owns workbench presentation snapshots and bounded commands:
select a candidate, record a review decision, configure non-secret fields, and
change a named tool grant explicitly. Text revision review and media candidate
inspection are contrasting consumers; the implementation owns validation and
business transitions. Configuration never implicitly changes grants. Snapshot
configuration must contain only fields declared safe for display, never secrets.
Commands are not idempotently retried. Expected failures are bounded results.
All controller mutations, including native artifact intake, share one ordered
commit boundary. Overlapping accepted commands and intake cannot overwrite each
other; rejection or persistence failure must not poison subsequent mutations.
Document revision names the immutable candidate/artifact being revised, returns
a new draft, and leaves previous content available for comparison.
The public synthetic controller runs the exported conformance suite; private
controllers must run the same suite plus their own scenario evidence.

Agent attachments reference assets already imported by an authoritative user
file selection. Adapters reject unsupported media. The Codex adapter resolves
image inputs privately and captures native base64 image results into confined
storage, correlating against the originating native turn. It never follows a
native result path. Optional `AgentSession.history` reads native history separately
from the non-replayable signal stream. The host stores normalized display records
and private ingestion checkpoints atomically through the observability history
contract. Unknown historical operations have no invented correlation. Project
JSON still stores navigation, assets and review metadata, not conversation text.
History lives in `history.sqlite`; Codex owns its transcript and execution state.
The UI starts with 50 entries and loads older pages, with a 200-entry rendered
window rather than a permanent history ceiling. Cached pages remain readable
offline, and history errors do not retry or rewrite provider outcomes. See
[ADR 0014](../adr/0014-persistent-paginated-conversation-history.md) and the
[history reference](../reference/conversation-history.md).

Trusted package backends use `PluginBackendFactory` from `@drawloom/desktop-host`.
The operator explicitly activates and trusts each installed package. A backend
receives its declared public capabilities, including an installation/project-scoped
`JsonStore` and `AssetLibrary` when requested, and returns contributions,
controllers, named MCP connections and cleanup. AssetLibrary.put stores bytes and registers
the resulting media identity for authenticated viewing; raw AssetStore.write
does not register presentation metadata. No arbitrary path getter or HTTP route
registration is provided. This is host code execution by the operator's
configuration, never package discovery or frontend dynamic execution. No private
module is included in the public source, build or default application.

Accepted [ADR 0018](../adr/0018-plugin-standards-and-runtime-extensions.md) adds
standard local Agent Plugins loading and a trusted prebuilt backend entrypoint.
The previous startup factory route has been removed without a compatibility path. See the
[package reference](../reference/plugin-packages.md) for installation, native versus
host OAuth ownership, independent permissions and standard MCP Apps placement.
This implementation does not imply the migration or ADR has been accepted.

Under Accepted [ADR 0020](../adr/0020-directory-backed-projects-and-file-delivery.md),
the implemented AssetLibrary supports streamed writes and opened, ranged reads.
The desktop and browser imports accept supported media up to 256 MiB per asset;
actual received bytes are checked. Browser uploads send File bytes rather than
JSON/base64. Whole-buffer helpers remain bounded compatibility APIs; large-file
delivery uses at most 64 KiB per storage read. GET, HEAD and single/suffix ranges
share the validated file handle. Unknown working-file formats are downloadable;
active content is not executed in the application origin.
Native image attachment input and captured image results retain their separate
16 MiB bound. A viewable video does not become a supported native model input.

Desktop native RPC frames are bounded to 32 MiB, covering one 16 MiB image
encoded as base64 plus a bounded envelope. Native history requests one item per
page so a page does not aggregate many full-size images. Oversized frames fail
the connection without replay. MOV managed exports use `video/quicktime` and
authenticated attachment downloads; the viewer offers download/open guidance
instead of promising browser playback. Browser import types remain separate.

Tool evidence retains typed starts and finishes per conversation in an ordered
acknowledged write queue. Committed outcomes become visible only after storage
acknowledges them. Start/finish write failures are visible as `start_failed` or
`outcome_failed`, preserving execution knowledge; these failure notices are
session-local if storage is unavailable. Unfinished persisted starts remain
unresolved after restart and confer no success or retry authority. This uses the
JSON store's existing durability boundary, not a transcript or logging service.

The selected Drawloom data directory stores global installation records, assets,
history and project bindings. It is not a working project. Each project binds a
validated working directory; conversations retain that project identity across
navigation. Global installs, trust, configuration and credentials are shared;
controllers, connections and backend storage are activated per project. The
backend receives its fixed `project: {id, directory}` context. Headless consumers
may omit that context; the desktop supplies it. A temporarily absent directory
does not start installed code; it can activate once the original folder returns.
Already-running Stop and pending responses remain reachable when a folder vanishes.
Each backend store is namespaced by installation/project, away from host navigation
records. Native artifact intake remains host-only and idempotent
per operation-plus-asset identity; different operations may yield identical bytes.

Execution order is foundation, public desktop shell, private plugin skeleton,
private workbench/controller, then integration. ADR 0011 remains Proposed;
[ADR 0013](../adr/0013-plugin-boundaries-and-host-integration.md) owns the cohesive
plugin-boundary proposal and its first integrated view proof.

## Provisional plugin view hosting

The public desktop hosts a separately built HTML view registered by a startup
plugin. This extends the original declarative-only foundation; it is an
unreleased implementation under accepted ADR 0013, not arbitrary third-party
code execution authorised by ADR 0011. Private consumers own only their plugin
contributions and build pipeline, not another shell or bridge implementation.

The existing authenticated loopback host serves only registered, composition-
supplied HTML to the selected conversation's workbench. The frame runs with
scripts allowed but no same-origin privilege. Its resource CSP denies general
network connections, nested frames and forms. One host-owned declared-media
policy supplies shared image/audio/video origins. Standard `resourceDomains`
also supply the declaring UI's fonts/styles, never additional scripts.
The host supplies a mount-scoped base URL for relative project-file media; it
grants neither command authentication nor access to another project. Closing or
navigating invalidates it. See ADR 0020 for the deliberately narrow CSP profile
and global declaration/reopen rules. It does not
grant Tauri, filesystem or process APIs. Upstream `PostMessageTransport` checks
the message source window; the backend validates captured view/conversation
ownership in the same queue as navigation. Assistance callbacks additionally use
an internal host-issued mount identity; navigation invalidates it and old cleanup
cannot erase replacement context. It is not part of the plugin protocol.
UI support is advertised during MCP initialization; tools and resources
are obtained through the MCP client, not a second discovery protocol.

`AppBridge` forwards standard tool calls only to app-visible tools on the bound
server. Payloads are plugin-owned; the host imposes no shared snapshot shape.
The private server validates reading, candidate inspection and direct passage
Save through its existing controller. Inspection persists a navigation bookmark;
Save creates an unaccepted working draft. Neither changes business approval or
output selection. Review, settings, grants and the whole operator command union
are not exposed by this server. Unsupported or stale requests fail without retry.
The parent supports standard text messaging and text/structured model context.
Context replaces ephemeral selected reference material without agent invocation;
explicit messaging requests a reply in the current conversation. It does not
grant acceptance, automatically save the reply, start a new task or silently
steer a busy turn. The agent may invoke installed editing tools subject to native
review and independent Drawloom grants; direct human Save invokes no model.
The private view clears hidden passage context when changing review groups.
Theme uses standard host context. Closing keeps the iframe mounted for a 300ms
outro window while standard resource teardown has a 250ms timeout, then closes
the transport. New tool requests are aborted during cleanup. Abrupt navigation
disconnects immediately; browser/page termination cannot guarantee graceful
cleanup or rollback of an already dispatched operation.
Parent cleanup sends a mount-scoped release, including on component destruction.
A failed browser delivery cannot guarantee immediate server cleanup; a new mount,
conversation navigation or host restart clears the ephemeral context as well.

These controls do not establish complete isolation from malicious code. Browser
restrictions do not reliably prevent a frame navigating its own location to an
external URL, and do not bound CPU use. Navigation to another origin loses bridge
access but could still transmit data in a URL. Only explicitly trusted local
plugin packages with synthetic proof data are exercised here. Stronger network
or execution confinement would require a separate enforcement decision and the
maintainer escalation required by ADR 0013.

## Declarative review presentation

User file import also uses optional host-only artifact intake. The host captures
the destination workbench before asynchronous byte registration and assigns a
fresh `import-` operation identity. Intake does not guess an output role or grant
review authority. Native turn correlation remains separate.

Snapshots may group artifact and candidate identities into named review groups.
An artifact can therefore be discovered before a candidate exists. Groups are
navigation only: they neither schedule operations nor introduce bulk approval.
Candidates may declare a comparison key, an output-selection flag, stale state,
and an exact recovery action label/description. Comparison requires equal declared
keys; navigation selection and accepted output selection remain separate. Text
editing requires an explicit artifact `editable` declaration; controller checks
remain authoritative. Optional spending text reports plugin-owned accounting
without equating estimates/reservations with actual billing or native charges.

The infrastructure need is discoverability of non-candidate documents and honest
review controls. Existing candidate membership cannot express overview documents,
compatible revision sets or a local reconciliation action. These are presentation
facts, not a workflow engine. A text editor with independent document families and
a media inspector with output alternatives challenge the same contract. Their
approval rules, group membership, accounting and recovery transitions stay with
their controllers. Public conformance validates references and comparison/review
presentation for both shapes; the UI never interprets product operation IDs.
