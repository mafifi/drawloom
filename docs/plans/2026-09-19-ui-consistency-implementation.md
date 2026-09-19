# UI consistency implementation

Status: in progress. Implements the maintainer-approved UI consistency plan;
ADR 0030 remains Proposed. No commits or installation migration yet.

## Delivery sequence

1. Theme contract, OKLCH and policy regression tests.
2. Shared conversation and settings compositions; remove competing defaults.
3. Typed history provenance, projection and explicit one-time conversion.
4. Remaining public and private Views and executable browser coverage.
5. Both repository gates and review of the existing installation at port 4488.

## Constraints and dependencies

Theme roles precede composition migration; retained provenance precedes replacement
of heuristic history rendering. Public UI and history contracts own generic facts;
private workbenches consume their built packages. Preserve all pre-existing edits.
No new install, model calls, generated media, automatic commits or ADR acceptance.
The approved workbench document and its business state remain unchanged.

## Interaction brief

Conversation review uses contextual navigation: expand completed process detail,
inspect delivered documents, or navigate to an earlier turn without losing reading
position. Existing native approval requests remain guarded commitments owned by
the host; collapsing detail never resolves them. Pending, failed and interrupted
states retain text and available Stop/recovery actions, never fabricated success.
Keyboard and touch use the same controls; focus is restored on closing a surface.
Reduced motion preserves immediate state changes without scroll animation.
The ViewModel owns ordered presentation and commands; shared components own local
disclosure and layout. Test repeat activation, late content growth, interrupted
operations, both themes, narrow widths and 200% zoom.

## Execution record

- Preflight: both repositories contain existing work; preserve it. The public
  theme has centralized hex primitives and component-local derived colours.
- Preflight: the history store is schema version 4; no migration has run.
- Ruling: implement in the existing feature checkout, as requested, rather than
  creating another worktree/installation. Keep this durable execution record in
  the approved documentation surface; create no review-diff artifacts.
- Verification pending. The prior audit's authorization-test timeout remains open.

### First implementation slice

- Added proposed ADR 0030 and updated the active design policy without rewriting
  accepted records. Converted the palette and shadow to OKLCH. The contrast test
  exposed dark secondary-on-selection at 3.57:1; its neutral semantic mapping now
  meets 4.5:1. No creative content colours were changed.
- Derived colours now live in semantic mappings, including sidebar transparency
  and preview elevation. The policy rejects component-local derived expressions,
  including variant strings in Svelte scripts, and non-OKLCH raw primitives.
- ChatMessage owns speaker alignment, bubble geometry and spacing. Its rendered
  test exposed missing accessibility attribute forwarding on Markdown content;
  that path now forwards attributes. The desktop consumes the shared composition.
- Removed the duplicate desktop settings CSS and migrated its consumers to shared
  settings roles. Retired-class negative fixtures prevent reintroduction. Removed
  a source-text test that required the retired class; browser acceptance remains
  required, not replaced by a new class-count assertion.
- Executed red then green: palette contrast, derived-colour and retired-settings
  policy, public message rendering. Latest targeted runs: 57 policy/theme tests
  and 14 public rendered-component tests pass. Shared Svelte check: zero errors
  or warnings. Desktop build and UI policy pass.
- Existing installation refreshed at 4488, not replaced. Shared message styles
  verified from rendered DOM: blue user bubbles, unframed assistant messages;
  undocked width 930/930 and docked width 450/450. This is a narrow dark-theme
  inspection, not the full responsive/theme acceptance matrix.
- The previously failing authorization test passes alone (149 ms). Its original
  canonical-suite timeout is not diagnosed or claimed fixed.
- Still pending: remaining View/token inventory, history contract and conversion,
  process projection, private consumer migration,
  enforced browser matrix, full gates and final installed review.
- Removed the obsolete Message/Bubble exports and twelve source files after a
  failing public-API regression. The Prompt Kit component build and all 14
  rendered conversation tests pass; Git retains the removed implementation.
- Broad public Bun suite before that removal: 1,465 passed, 8 skipped, 0 failed.
  This is not the canonical gate or model/Temporal acceptance. The authorization
  regression also passed in that run (128 ms); no timeout suppression was added.
- Consolidated consent/model facts into the shared `facts-list` composition,
  removing their competing grid measurements. Added a failing-then-passing
  retired-layout policy fixture. Policy/theme tests: 58 passed. UI policy scans
  787 maintained sources after obsolete components were removed.
- Rebuilt the existing installation again. Rendered Knowledge model facts wrap
  without overflow (674/674); returning to the retained episode with the approved
  workbench open gives conversation width 360/360 and pane width 329/329.
  These remain targeted dark-theme checks, not completed browser acceptance.

### History and broader layout migration (in progress)

- Added required typed content origin and tool correlation to the history contract;
  native/host capture now records it instead of classifying JSON-looking prose.
  Text-only native MCP results retain their own failure status. Ordered presentation
  groups adjacent tool records without moving interleaved answers; correlated live
  activity is not duplicated. The renderer uses Prompt Kit ChatMessage and AI
  Elements Tool, not a replacement message primitive.
- SQLite v5 has an explicit, atomic, idempotent provenance conversion and exclusive
  backup creation. Normal startup does not run a dual reader or infer old origins.
  Conversion tests cover incomplete provenance and interrupted schema work. A
  serialized WAL snapshot needs standalone SQLite header flags for reopening;
  the backup-only adjustment follows SQLite's deserialize documentation.
- Read-only audit of the existing installation: all 33 entries across its two
  conversations match native completed-item records or gateway execution receipts.
  No reset is required. **The live store remains v4 and has not been converted or
  restarted with this code.** Scripts, candidates, recordings and bindings are intact.
- Broad intermediate Bun run: 1,464 passed, eight skipped, eight failed. Two failures
  were the text-only capture regressions under development; six were pager fixtures
  missing the now-required origin. All 13 affected tests pass after the fixes.
  Projection/outcome tests: seven pass; desktop Svelte check: zero errors/warnings.
  This is not a final whole-suite claim.
- Extended policy with failing-then-passing layout fixtures: raw View spacing,
  dimensions and arbitrary layout utilities are rejected. Public scan is green
  after replacing the desktop's literal measurements with a small shared scale.
  All Tailwind type aliases now map through semantic roles; contrast and alias
  tests pass. Remaining media/container breakpoints are responsive implementation
  thresholds, not per-message measurements; their central ownership still needs
  final inventory review.
- Added shared document/page/form/collection roles. Private settings and the
  approved episode document now consume them; tabs, accordion ordering, commands
  and direct audio playback are unchanged. Private code remains private. Packed
  consumer rebuilding, final guards and rendered checks are still pending.
- Ruling: normalize off-scale spacing to the small approved shared rhythm rather
  than preserve every literal as a token. This deliberately removes ad hoc density;
  rendered review must catch undesirable changes before installation.

### Verification and review pass

- Shared page, form, collection and viewer rules now have one implementation in
  the UI package. Component-local translucent colours moved to explicit semantic
  states; negative fixtures cover colour opacity and missing dark mappings.
  Public policy scans 793 maintained files; the same built checker scans 152
  private files. The private canonical gate passed 260 tests, with two explicit
  runtime/model-installation skips, against its separately packed public snapshot.
- Public browser acceptance runs in CI against synthetic data, with no private
  installation or provider credentials. Both themes, narrow/docked layouts,
  expanded JSON, chronology, initial/reload tail, paging, 200% zoom and narrow
  pending/dismissed/failed approval surfaces passed. Additional search and late
  content growth regressions are being run after review corrections.
- All 33 installed entries have verified provenance; an installation-local
  manifest is prepared. No conversion, reset or installation restart yet.
- Captured text no longer truncates structured JSON into invalid data. The viewer
  bounds diagnostics while stored execution text stays intact (red/green test).
- Fresh read-only review found completed-tool search hidden inside disclosures,
  and unretained outcomes anchored to an unrendered process slot. Both now have
  red/green regressions. Rail previews also use assistant provenance instead of
  replacing the answer with tool diagnostics. No second renderer was introduced.
- The first canonical run reached the broad suite but caught a new red rail test
  while that fix was being made. It is not a passing final gate; rerun required.
  The original authorization timeout has not recurred; no timeout was increased.
- Final inventory also moved static sizes in eighteen adopted controls onto the
  mapped scale, including prompt minimum height, notice radius, focus rings,
  compact inputs, menus and tooltips. Navigation dimensions now originate in
  primitives. A shared-control raw-size negative fixture passes; behavioural
  positioning uses mapped geometry rather than literal pixel offsets.
- Completed-tool search now opens both disclosures and focuses its exact record.
  Browser tests also append and enlarge retained content through SQLite: the tail
  follows new content, while earlier reading remains anchored. These tests pass
  with the final shared-control build and without a model connection.
- Authorization timeout investigation: the final broad run passed the affected
  test in 125.56 ms. Twenty fresh targeted processes during the broad gate all
  passed (147.38–166.56 ms). No timeout, retry or authorization behaviour changed.
  The historical failure lacks a retained causal trace; its cause remains
  unproven, not a demonstrated policy fix. Repeated current runs do not establish
  that an intermittent environment/resource stall is impossible.
- Build sequencing: concurrent public preparation and canonical packaging raced
  over Svelte's temporary declaration output. This was an invocation conflict,
  not an accepted package failure. Final public/private builds are sequential.

## Maintained View dispositions

### Final verification and installed delivery

- Final public canonical gate passed: 1,488 Bun tests, eight explicit skips,
  plus Node and packed-consumer lanes. The separate enforced synthetic browser
  suite passed against that final build, including search disclosure, late
  content growth, theme, narrow layout, zoom and approval-state regressions.
- Final private canonical gate passed against the freshly packed public build:
  260 tests, two explicit live/render/model-setup skips. No model or paid calls
  were made; skipped lanes are not acceptance evidence.
- The existing installation at 4488 was updated in place. All 33 original
  history entries were converted using verified retained provenance, after an
  installation-local standalone SQLite backup. Original fields remain identical;
  SQLite integrity passes. No conversation reset or project data deletion occurred.
- Rendered installed review preserved the approved document, progressive
  accordions and direct narration controls. All six recordings loaded with
  readyState 4 and their retained durations. Light/dark and 390/970-pixel layouts
  were checked; document and conversation widths did not overflow. Conversation
  reopening positioned at the tail. Temporary browser overrides were restored.
- Existing provider-history synchronization and narration-job availability
  warnings remain explicit. This UI delivery neither repairs those independent
  runtime conditions nor retries their work. The historical authorization-test
  timeout remains causally unproven, as described above.
- Earlier progress entries are historical checkpoints. This section supersedes
  their pending-conversion/deployment status. Changes remain uncommitted and the
  ADR remains Proposed.

These are ownership dispositions, not a claim that every state has a screenshot.
Public files below are under `apps/desktop/src/lib/`.

| Views | Authoritative presentation |
| --- | --- |
| Conversation, ToolActivity, ApprovalView | Prompt Kit message/container; AI Elements Tool/Confirmation; shared process and notice roles |
| Composer, ComposerResources, CodexModelSelector | Adopted prompt/model primitives and semantic controls; composer owns input composition |
| ConversationRail, ConversationSearch, ConversationNavItem | Shared sidebar/dialog/command/tooltip primitives; scroll controller owns behavioural thresholds |
| PrimaryView, Sidebar, NavigationLanding, Projects, ArchivedConversations | Shared page, collection, form and navigation compositions |
| Knowledge, KnowledgeView, KnowledgeDisclosure, KnowledgeDisclosureView, LocalKnowledgeSetupView | Shared settings, facts, field, status and disclosure compositions; local setup remains separate |
| PackageInstallations, DiscoveryInventory, DiscoveryPicker | Shared collection, form and empty/status compositions |
| ArtifactViewer, FileViewer, WorkspaceResourceViewer, AttachmentCard, ResourceCard | Shared document/media frames and adopted attachment/file primitives; source-bound access unchanged |
| DetailsPane, PluginView, PluginViewFrame, PluginSettingsFrame | Shared panel/hosted-frame geometry; existing mount ownership unchanged |
| ProjectActivitySummary, WorkflowRuns, ElicitationForm | Shared workflow/status/field compositions; no alternate approval authority |

Private dispositions are kept in the private repository. The publishing journal,
retained experiments and creative-media compositions retain their independent
designs and are explicitly outside this migration.
