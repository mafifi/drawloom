# Desktop host boundary

The public app composes providers. Its authenticated same-origin loopback HTTP
channel is the only UI command ingress; cookies are host-only, HttpOnly and
SameSite=Strict. Mutations require the exact Origin and JSON content type.
Tauri launches the same host and opens its one-use bootstrap URL. No filesystem,
shell or operator command is exposed through a frontend plugin or agent tool.

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
native result path. Optional `readHistory` projects native paginated history for
display, separate from the non-replayable signal stream. Private turn-to-operation
metadata is continuity evidence, not a copied transcript. Unknown historical
operations have no invented correlation. UI project state stores navigation,
preferences, artifacts and review metadata, not a second conversation log.
The Codex display projection reads newest turns/items first and presents up to
2000 recent entries in chronological order. An explicit visible notice marks
omitted earlier history; this flag is per conversation, not a hidden host notice.

Trusted external startup composition is an explicit local factory module selected
by the host operator. Its type is `DesktopExtensionFactory` from the supported
`@drawloom/desktop-host` package. It receives a namespaced `JsonStore` and
`AssetLibrary`, and returns public PluginInstaller values and a matching
OperatorController per workbench. AssetLibrary.put stores bytes and registers
the resulting media identity for authenticated viewing; raw AssetStore.write
does not register presentation metadata. No arbitrary path getter or HTTP route
registration is provided. This is host code execution by the operator's
configuration, never package discovery or frontend dynamic execution. No private
module is included in the public source, build or default application.

The trusted desktop AssetLibrary accepts supported media up to 256 MiB per asset.
This is a bounded whole-buffer contract, not a streaming API: producers must
materialize bytes, serialize large registrations and budget for additional host
and response copies. Reads and range responses currently load the whole asset.
Browser imports remain limited to 16 MiB decoded bytes, with a 25 MiB HTTP body
cap and a 24 MiB base64 schema cap. Native image attachment input and captured
image results have their own 16 MiB bound; a larger generated video being
registered never grants browser upload or agent-input authority.

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

One selected data directory is one project. Different project inputs use distinct
directories and factory-owned persisted configuration; no episode identity is
hardcoded in the public application. The factory store is namespaced away from
host navigation records. Native artifact intake remains host-only and idempotent
per operation-plus-asset identity; different operations may yield identical bytes.

Execution order is foundation, public desktop shell, private plugin skeleton,
private workbench/controller, then integration. ADR 0011 remains Proposed.

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
