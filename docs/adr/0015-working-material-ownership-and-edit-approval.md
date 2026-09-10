# ADR 0015: Keep working material with its owner and approve AI tool invocations

- **Status:** Accepted
- **Date:** 2026-09-09
- **Decision owners:** Drawloom maintainers
- **Related:** [ADR 0008](0008-tool-execution-and-exposure.md),
  [ADR 0013](0013-plugin-boundaries-and-host-integration.md),
  [ADR 0014](0014-persistent-paginated-conversation-history.md)

## Context

Drawloom must support ordinary agent workspace files and specialist working
material, such as a musical score or video composition. The distinction is who
owns the editing model, not the file extension. A video workbench can use native
image editing for a portrait and plugin tools for its composition. Even a text
or JSON document can be plugin-owned. Here, provider-owned means managed through
the agent runtime's native workspace and tools, not ownership by a model vendor.

Earlier discussion considered a shared artifact/revision system, mandatory
previews and a prepare/apply lifecycle. Those would make plugins adopt Drawloom's
editing model before demonstrating a need. The maintainer instead selected
lightweight provider files, plugin-owned domain behaviour and approval of
specific AI tool invocations. This ADR records those responsibilities and
exclusions together so consumers do not assume guarantees the host cannot give.

### Principles driving the decision

[ARCHITECTURE.md](../../ARCHITECTURE.md#decision-principles) owns the current
principles; [ADR 0006](0006-evidence-led-architecture-principles.md) records the
original complexity test.

- **Clean, replaceable boundaries (3):** the owner of the working model owns
  its edits, validation and lifecycle. This need not introduce a new service.
- **Proportional efficiency (5):** reuse native project folders, tools and
  existing plugin contracts. Do not wrap every edit in copying, snapshots or
  proposal persistence.
- **Proven boundaries before invention (6)** and **evidence-led multi-provider
  support (2):** follow inspected live-file presentation and optional approval
  details. Keep standard MCP Apps. A rich consumer does not establish a universal
  editing API.
- **Safe and secure by default (7)** and **market readiness and familiar user
  control (8):** support human and delegated review of AI actions without
  pretending the host understands every domain or guarantees recovery.
- **Useful type safety (1):** validate real tool inputs and results;
  plugin-specific representations remain plugin-owned.
- **An accessible free or local path (4):** local iteration must not require
  cloud storage or synchronisation infrastructure.

Safety requires a trustworthy invocation boundary, not a host-owned document
framework. Complexity must earn its place on both sides of that distinction.

## Decision

### Responsibility map

| Concern | Responsible owner | Drawloom boundary |
| --- | --- | --- |
| Provider-owned working files | Provider/runtime works in its project workspace using native tools | Reference and present current files through authorised access; no automatic import or revision system |
| Plugin-owned working material | Plugin defines structure, identity, edits and lifecycle | Invoke typed tools and host its MCP App without interpreting domain state |
| Model-facing representation | Plugin chooses representations, tools and skills suited to the model and task | Existing tool exposure and context contracts; no universal editing language |
| Useful output preservation | Consuming plugin decides what to save, when and where | Existing configured persistence/assets may be used; no automatic promotion or cross-machine guarantee |
| AI action approval | The selected agent provider routes the invocation through its native human or delegated reviewer | Select supported modes and present native interactions; retain independent gateway authority and execution evidence |
| Stale edits, undo and recovery | Plugin for its working material; provider facilities where available for native files | No universal revision, lock, undo stack or rollback guarantee |
| Direct editing inside plugin UI | Plugin owns the interaction and its domain safeguards | No AI approval interception; existing host authentication, routing and permissions remain enforced |
| Conversation history and captured media | Drawloom under ADR 0014; provider retains native transcript continuity | Reuse captured content/assets without treating history as a workspace backup |

These are ownership rules, not a requirement to introduce an `owner` field,
artifact class hierarchy or separate package for each row.

### Provider-owned files remain ordinary workspace files

Use the provider's project folder for quick local iteration. Drawloom may list,
reference and preview accessible files using shared viewers. Presentation points
to the current file; it does not promise historical bytes, import, acceptance,
publication or continued availability after the file is changed or removed.

Do not create automatic snapshots, versions, uploads, acceptance transitions or
cross-machine synchronisation for every generated file. A plugin may explicitly
preserve useful output as part of its workflow, but every file need not pass
through that workflow. Copying bytes does not itself select a new editing model.

The plugin is responsible for saving the material its workflow needs and for
making any promised preservation or cross-machine access work. It can reuse
configured host storage rather than implement storage mechanics again. This ADR
adds neither a remote storage provider nor a portable native-session guarantee.
Drawloom is not responsible for recovering working files that were never saved
by that workflow. Provider-native history/restore can be used when supported;
it must not be advertised as universally available.

### Conversation capture is not workbench acceptance

The lightweight file decision does not weaken ADR 0014. Its durable display
records, ingestion checkpoints, captured media references and reuse of already
stored image bytes remain authoritative. Reopening or paginating cached history
must not repeatedly fetch, decode or register unchanged historical images.

A captured conversation image and a live workspace path have different
semantics. Capturing the former does not accept it into the plugin's workflow;
presenting the latter does not make it an immutable conversation snapshot.
History is not a backup of all workspace files, a plugin revision store or
automatic model context. No history implementation changes are authorised here.

### Plugins own their working model and model interaction

A plugin is responsible for:

- Choosing useful representations for the agent to inspect and manipulate,
  informed by model capabilities, pre-training, skills and its task harness.
- Defining meaningful typed read/edit tools through ADR 0008, including domain
  validation, constraints and understandable results or failures.
- Owning composition, document identity and any revisions it actually needs.
- Deciding what outputs to preserve, their acceptance/selection rules and any
  relationships to downstream material. Preservation is not automatic publication.
- Handling concurrent or stale edits in its own way. A modal decision, revision
  check, lock or another domain-appropriate approach is a plugin choice, not a
  required Drawloom protocol. Preconditions can be ordinary tool arguments.
- Providing undo, recovery, backup or rework where its product requires them,
  and being honest about unsupported or partially completed operations.
- Owning specialist editors and optional previews through its MCP App. Existing
  shared UI components remain reusable; no in-process editor extension is added.

Drawloom does not prescribe a common score, timeline, composition graph,
document model, command language, change set or revision identifier. Tools and
skills remain contributions, not alternative proprietary capability contracts.
The workbench harness composes these with the selected agent runtime; it does
not need another agent loop.

### Approve the AI invocation, not a mandatory preview

When policy requires approval, pause before executing the proposed AI tool
invocation. Support both **ask me** and **approve for me**. Delegated approval is
an assessment within the user's authority, not unconditional permission.

Use the selected provider's native review path. For Codex, map human review to
`approvalsReviewer: user` and delegated review to `approvalsReviewer: auto_review`.
The adapter reports supported modes and rejects unsupported selections, rather
than silently downgrading or building another reviewer. Existing callers and
older saved conversations default to human review. The desktop stores this
choice per conversation; changes while idle apply to the next turn.

Preserve the existing sandbox and approval policy. Do not modify global Codex
configuration, the automatic reviewer's policy or organisation requirements.
Mutating and unclassified Drawloom MCP tools require native review; only tools
explicitly identified as read-only bypass that review. Optional standard MCP
annotations pass through the existing tool definition/exposure boundary. They
describe behaviour, never grant permission. Drawloom's current tool grants,
revocation checks and authoritative execution evidence remain independently
necessary after native approval. A synchronous gateway policy is an authority
check, not a second pending-review service.

The review concerns the tool and its actual arguments, with understandable
presentation of the intended action. Reuse the existing invocation rather than
copying its arguments into a second proposal authority. A plugin may enrich the
review with a diff, score, audio or scene preview. None is mandatory. There is
no required preview field, dry run, separate prepare/apply tools or durable
proposal store. Preparing an approval request must not execute the gated edit.

Approval applies only to the requested invocation and unchanged arguments. The
host must not retarget a late decision to another call or silently substitute
arguments. Existing gateway authority, revocation, cancellation, validation and
evidence guarantees remain in force. These routing guarantees are distinct from
detecting changed domain state: the latter is the plugin's responsibility.

The host does not resolve stale edits or manufacture rollback. ADR 0008's
execution-uncertainty and no-automatic-retry rules remain unchanged. An execution
approval is not business acceptance, a general spending grant or publication
authority. Provider-native approval choices remain adapter-owned; this decision
does not require replacing them with a new artifact protocol or changing sandbox
access.

The adapter retains provider response values privately and binds each response
to its originating session, turn and request. Stop, cancellation, completion,
restart or native resolution invalidates pending controls. Ordinary MCP
elicitation is input, not an execution approval; classification uses the native
protocol discriminator, not the wording of a form. Native automatic-review
progress and surfaced outcomes/rationale use existing safe activity/history
summaries, not raw envelopes, hidden reasoning or another evidence store.
Unavailable or incompatible native review is reported explicitly; it must not
lead to bypass or a replacement reviewer.

### Direct plugin editing is outside the AI approval flow

An explicit direct edit in a plugin's UI is a plugin interaction, not an AI
proposal that Drawloom must review. The plugin owns its confirmation UX, state
changes and domain protections. Drawloom does not intercept every keystroke,
gesture or editor command, nor require a second AI approval for it.

This does not exempt calls into host services from their existing controls.
An MCP App still has only its bound, authorised access. Calls through the tool
gateway retain ADR 0008's checks; user-facing UI is not permission to invoke an
unchecked handler, claim a trusted origin or gain filesystem access. Requesting
AI assistance from the UI remains an AI request, not a direct-edit exemption.

## Reference evidence and deliberate choices

The [repository survey](../reference/harness-workbench-survey/README.md) records
the wider evidence and limitations. Revisions below identify inspected source,
not dependencies or claims of runtime compatibility. No upstream application or
test suite was run for this decision.

| Reference | Observed behaviour | Choice for Drawloom |
| --- | --- | --- |
| DeepSeek Harness `b2e3b2a` | [`present`](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/packages/fs/tool-present/src/index.ts) records existing files; opening them uses current source bytes without copying | Adopt this lightweight meaning for provider-owned working files, not a universal import lifecycle |
| DeepSeek attachments | A separate [local attachment store](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/packages/attachment/attachment-local/src/file-store.ts) preserves content-addressed bytes | Keep conversation capture separate from presenting working files; this is not evidence of cross-machine sync |
| DeepSeek approval | [Requests](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/packages/interaction/user-approval/src/index.ts) name the tool, optionally correlate a call and give a reason; [rich details](https://github.com/deepseek-ai/deepseek-harness/blob/b2e3b2a0125854567a4a5fcba75782e42fe84901/packages/client/ui-approval/src/client/contract/slots.ts) are optional | Review invocations without requiring previews; do not import its Cordis UI mechanism |
| Open Design `81044a0` | [Artifact policy](https://github.com/nexu-io/open-design/blob/81044a03ca717f77a5bde38947903a8ef222da8c/apps/daemon/src/chat-artifacts/policy.ts) distinguishes live files from original-image snapshots and static covers; audio/video originals are excluded from snapshot capture | Useful ownership contrast, but do not adopt its per-kind snapshot policy or mistake automatic capture for human acceptance |
| Open Design permissions | Its [Claude CLI path](https://github.com/nexu-io/open-design/blob/81044a03ca717f77a5bde38947903a8ef222da8c/apps/daemon/src/runtimes/defs/claude.ts) bypasses permission prompts; its [ACP path](https://github.com/nexu-io/open-design/blob/81044a03ca717f77a5bde38947903a8ef222da8c/apps/daemon/src/agent-protocol/acp/rpc.ts) selects an available allow outcome | Not evidence for mandatory pre-edit previews or our delegated reviewer; do not adopt automatic permission bypass |
| Codex | [Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review) separates review from execution authority; [configuration](https://learn.chatgpt.com/docs/config-file/config-reference) provides MCP per-tool approval settings; installed 0.153.4 exposes reviewer selection | Use native human/automatic review, not a Drawloom reviewer; the linked implementation evidence records observed consumer outcomes |
| Rosalind | The [inspected distribution](../reference/mcp-apps-host-evidence.md) demonstrates rich app hosting with some first-party extensions | Retain ADR 0013's standard MCP Apps choice; neither a compulsory preview nor a general editing/undo contract was established |

The maintainer explicitly chose DeepSeek's working-file approach rather than
adopting Open Design's automatic, kind-dependent snapshot policy. The agreed
human/delegated review requirement differs from Open Design's permissive paths;
it is justified by principles 7 and 8, not claimed as matching their implementation.
No additional MCP Apps bridge method or first-party extension is selected.

## Contrasting workbenches considered

These examples explain the boundaries, not a public business schema or a claim
of completed end-to-end integration. Private code, prompts, data and fixtures
remain outside this repository.

- **Video production:** native tools can iterate on an image in the workspace;
  the plugin decides whether to preserve and select it for a composition. The
  plugin owns timing, transitions and renders. An AI-requested transition change
  can be reviewed as a tool action without generating a preview first. Direct
  timeline editing, invalidation and useful-output retention stay plugin-owned.
- **Music DAW (Symphonist):** the plugin chooses how to describe a score to the
  model and exposes musical operations. A request to transpose a passage need
  not supply a rendered score or audio preview. Validation, pending-edit UX,
  score revisions and undo belong to the plugin. Direct note editing and
  playback do not pass through an AI approval loop. The inspected workbench is
  design evidence, not proof of live Drawloom/MCP Apps integration or audio-engine
  performance through the bridge.
- **Existing operator workbench:** preserving generated media in an asset store
  illustrates a consumer's explicit preservation need. It does not establish a
  mandatory import requirement for every Drawloom workspace file.
- **Public contrasting fixture:** a simple plugin-owned text record can expose
  a typed edit without a preview, score, timeline or version field. It must be
  possible to test public invocation guarantees without private consumers.

## Implementation status and verification

The agreed native-review implementation was verified and accepted on 2026-09-09.
The [implementation evidence](../reference/adr-0015-native-edit-review.md) records
the public/private gates, live Codex outcomes, real editor/restart checks and
limitations separately from simulated transport evidence.
ADRs 0008, 0013 and 0014 retain their existing guarantees.
The [current tool policy](../../packages/tools/tools/src/index.ts) remains a
synchronous Boolean decision on operation and tool. Native review happens before
provider dispatch to this independently authorised gateway; no asynchronous
review mechanism is added to the gateway. The bounded
[implementation plan](../plans/0015-native-edit-review.md) integrates the existing
desktop and private video plugin, not a separate demo. Existing generic
candidate/controller examples must not become mandatory plugin contracts.

Public additions are limited to optional reviewer selection, supported-mode
reporting, optional MCP annotations and necessary native approval presentation.
The private video plugin exposes a typed passage revision tool and a narrow
app-only direct Save over its existing revision logic. Both create unaccepted
working candidates: saving neither selects finished output nor approves business
content, generates media or publishes. Pending edit UX and stale targets remain
private responsibilities. Neither requires a preview or new bridge method.

If native review or MCP Apps proves insufficient, stop with concrete evidence
for a maintainer decision before implementing a different boundary.

Acceptance covers:

- A plugin with no preview, prepare/apply pair or revision field can request an
  AI edit; denial causes no dispatch, and approval uses the unchanged invocation.
- Human and delegated decisions retain the same scope; late/cancelled decisions
  cannot authorise another call. Existing evidence and failure semantics hold.
- Automatic review actually runs. Transport tests cover approve/deny, timeout
  and cancellation; recorded live outcomes are distinguished from simulations.
- Native approval does not override missing or revoked Drawloom tool grants.
- Provider working-file presentation introduces no implicit copy or acceptance,
  while ADR 0014 still reuses already captured historical media.
- Plugin-owned direct UI edits need no AI approval; host service access checks
  and the standard MCP Apps boundary remain enforced.
- A real passage edit survives restart as an unaccepted candidate. Direct Save
  invokes no model. Exercise the existing app in both light and dark modes.
- Optional plugin protections and rich previews remain possible without public
  domain types. Video and music scenarios challenge these boundaries privately;
  public conformance works without either product.

Both canonical `bun run check:ci` gates and the scoped live/browser checks passed.
This acceptance does not authorise private production changes, live paid media
generation or publication. The evidence explicitly retains an existing ambient
tool-isolation follow-up; this ADR does not relax that separate requirement.

## Consequences

The host stays small and plugins can fit their models and users without an
imposed editing framework. Plugin authors have real responsibility for useful
representation, safe domain changes, preservation and recovery; installing a
plugin does not mean Drawloom supplies those behaviours for it.

Capabilities such as undo, previews and cross-machine use will differ between
plugins and providers. The UI must not promise unsupported behaviour. The cost
of this flexibility is plugin-specific implementation and evidence, rather than
a misleading universal guarantee from the core.

## Alternatives considered

- **One artifact/revision framework for all material:** rejected because file
  type does not determine ownership and the host need not interpret domain edits.
- **Snapshot or import every provider output:** rejected as unnecessary copying
  and lifecycle work. Conversation capture is already covered by ADR 0014.
- **Mandatory preview, dry run or durable proposal:** rejected; the references
  support simpler invocation approval and rendering may be costly or unsuitable.
- **Host-owned staleness, locks, undo or rollback:** rejected; the plugin knows
  its state and can choose appropriate protections without universal contracts.
- **Route direct human edits through AI review:** rejected; plugin UI editing
  is outside that flow, without bypassing existing host security controls.
- **Bypass all approvals to reduce complexity:** rejected by principles 7 and 8.
  Simplicity cannot substitute unconditional permission for delegated assessment.
- **Build a Drawloom pending-review service or reviewer agent:** rejected for
  this integration. Codex provides the selected behaviour natively; another
  reviewer would duplicate lifecycle, policy and authority without evidence.
