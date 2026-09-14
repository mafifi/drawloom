# Five complete desktop journeys

Status: implementation in progress. The maintainer-approved scope is search and
organisation, deliberate project entry, Activity, working-material continuity,
and truthful completion. Changes remain uncommitted for review.

## Constraints

### Approval and project-tree refinement

Footer/settings refinement uses contextual navigation: the Local profile Avatar
opens a shared dropdown, with Settings rather than invented account actions.
Settings replaces the sidebar contents with General, Workbench, Tool permissions,
Media sources and Integrations. Existing controls retain their owners and grants.
Back to app restores the prior destination; the conversation/workspace stays
mounted and draft state is unchanged. Narrow layouts expose the settings sidebar
through the shared navigation trigger. No queue work or profile identity service
is included. Verify menu dismissal, section selection and return continuity.

Settings verification: the disposable browser host exercised the profile menu,
all five categories, and Back to app with the same conversation and unsent draft.
At 390px, the shared navigation trigger opens the category drawer and selection
returns to the panel. Dark desktop and narrow layouts were visually inspected.
The desktop build, focused navigation tests and canonical `check:ci` passed.
The existing preview was refreshed without changing user data; the disposable
host was stopped. Light-theme visual reinspection remains outstanding for this
specific refinement.

Conversation actions now use the shared shadcn ContextMenu (contextual navigation)
and inline Pin/Archive controls (bounded selection/reversible removal). Right-click,
keyboard context-menu activation and touch long-press reach the same Rename,
Pin/Unpin and Archive commands. No unsupported menu entries are copied. Pin is
optional persisted conversation metadata; absent means unpinned. Pinned active
conversations sort first within their existing project, not a new ownership scope.
Pending commands disable duplicates and use existing error feedback; archive
retains its active-work/review prohibition. Escape dismisses without mutation.
Verified right-click and Shift+F10 in the browser, menu Pin updating inline Unpin,
reload retaining the pin, and inline Archive removing the disposable active row.
Host tests verify restart persistence and failed-write rollback. Touch long-press
is retained from Bits UI but was not separately device-tested in this refinement.

Latest maintainer refinement supersedes the project-name overview action below:
clicking the folder/name now toggles the Collapsible, with its chevron next to
the label. The right-hand menu owns Open project, and + requests a new conversation
through the ViewModel (project selection precedes creation). Missing workbench
selection leaves the project overview available rather than inventing a binding.
Search is a shared Command palette within Dialog: bounded recent metadata before
typing, server-side cached message matches after typing, compact project labels,
and real quick actions. Advanced project/archive filters remain in a disclosure.
Command owns keyboard selection; no new search service or native shortcuts are
implied. Pending/error feedback and search navigation retain their prior owners.

The subsequent sidebar screenshots refine contextual navigation: workbenches
precede projects; search is an icon beside the wordmark; open/closed folders lead
project names; nested conversations have indentation but no connector lines or
chat glyphs. The right-hand disclosure and section add action reveal on hover or
focus-within, and remain visible for coarse/no-hover pointers. Existing shadcn
Sidebar and Collapsible own semantics. Collapse does not navigate; the project
name still opens its overview. No new project actions or permissions are added.
Browser verification: icon-only search opens the existing dialog and Escape
restores focus; tabbing reveals Add project, then the right-hand disclosure;
Enter collapses/reopens the project without leaving the conversation. Moving
focus back into the composer hides the project actions. The updated live preview
was inspected against the supplied sidebar screenshots.

The supplied Codex approval screenshot is the presentation reference. Use bounded
selection: a shared DropdownMenu radio group with hand/shield icons, descriptions,
and checked state. The existing reviewer command owns persistence and failure;
the trigger reports its pending state. Unsupported delegated review stays disabled.
Full access is not introduced. Escape/outside click dismiss without changing mode.

Use contextual navigation for project folders: a separate Collapsible trigger
expands nested Sidebar conversations without selecting a project or starting work.
The project-name action retains its overview destination; conversation selection
retains its fixed binding. Unassigned legacy conversations remain accessible.
Disclosure is local presentation state; keyboard Enter/Space works without motion.
Sending must preserve the conversation rather than automatically opening a narrow
result viewer. Existing explicitly opened details are preserved. Test this with
the real ViewModel and verify project expansion and reviewer dismissal in-browser.

Verified with disposable two-project data: Escape dismisses the menu; collapse
hides only that project's conversations and survives polling; Enter expands it.
A synthetic send at 390px leaves the composer/conversation visible. Checked the
menu in dark/light appearances and reduced motion. No live model invocation or
permission change was needed. The send regression failed before removing the
automatic details opening, and passes after the fix. Screen-reader behaviour
has not received a separate assistive-technology audit.

Use existing checkout and preserve data. Follow DESIGN.md, ADRs 0012–0015 and
0020–0021. No new plugin browser protocol, universal artifact lifecycle, model
calls for UI summaries, publication, downloads or automatic commits.

## Task 1: History search and conversation management backend

Amend portable history contract with bounded search of cached user/assistant text
and bounded read around stable record identity. Implement SQLite FTS with atomic
index updates, non-destructive schema migration/backfill, opaque scoped cursors
and bounded snippets. Never fetch provider history as part of search. Run shared
conformance and a 10,000-entry integration scenario including restart and updates.

Implement authenticated host title/message search with project/archive filtering,
pagination and metadata labels; read-around route; rename/archive/restore commands.
Persist manual title and archived metadata, default old conversations to active.
Archive is local organisation only; reject while active or pending approval.
Preserve manual titles against automatic naming. Never archive native threads,
delete history, retry execution or lose fixed project/workbench bindings.
Own packages/observability/{conversation-history,sqlite-conversation-history},
apps/desktop/host and corresponding tests. Coordinate any shared protocol change
with root before editing browser files. Report API shape early for UI integration.

## Task 2: Navigation and conversation UI

Search dialog via sidebar and Cmd/Ctrl+K: titles and cached messages across projects,
filters, debouncing, pagination, bounded snippets, stale-response protection. Open
exact hit with bounded history and Back to latest. Rename/archive menus and restore
view. Project selection opens overview; workbench selection opens landing, never
creates a conversation. Explicit New conversation, project/workbench selection when
missing, fixed binding in header. Activity outside Settings, project-scoped runs,
details and advanced input fallback. Keep standard authority and cancellation.

## Task 3: Working material and completion

Docked resizable/expandable workspace on wide screens, full-content on narrow;
no artifact drawer. Preserve draft, scroll, selected artifact and active MCP App
where possible without double mount. Existing viewers only, on-demand media and
cleanup. Existing optional edit/compare/selection actions, no new plugin dirty-state
bridge. Truthful durable outcomes and actual supported next actions, no fake Retry.

## Task 4: Verification and handoff

Test 10,000 history entries, concurrent updates, cache-only search, restarts,
rename/archive semantics, two projects, late navigation responses, exact anchors,
running work across navigation, drafts, media and MCP App editing. Browser journeys
in light/dark, narrow 390px, 200% zoom, keyboard and reduced motion. Run canonical
CI and UI/dependency guards. Private consumer evidence stays private. Record
limitations and before/after screenshots; no claim complete from unit tests alone.

## Interaction briefs and references

Search uses contextual navigation: modal focus, Escape returns to trigger, bounded
results and explicit cached-only coverage. Rename uses validated commit: preserve
draft on save error, no success until host acknowledgement. Archive uses reversible
organisation: Restore remains available, active work is ineligible, never deleted.
Project/workbench navigation uses bounded selection, no implicit execution. Activity
uses loading/progress with real status and no fabricated percentage. Working panes
use contextual navigation without changing source ownership. Completion uses quiet
outcome notices; errors and uncertainty remain visible after toast dismissal.
ViewModels own requests/authority; Views receive presentation/actions. Keyboard,
touch, focus, reduced motion, repeated/rapid use and failures must retain meaning.

- [ChatGPT search](https://mobbin.com/flows/1a04bbe5-7a8e-4f66-b782-7a904ceabfbf)
- [ChatGPT archive](https://mobbin.com/flows/fa08c5fd-ade7-4f4e-b080-c622803e8fd6)
- [Claude project](https://mobbin.com/flows/68a600aa-4032-45ba-a462-5459cefc6500)
- [Claude artifact](https://mobbin.com/flows/d2c1a165-d6af-4c0a-9e91-8cd0b4eff6dc)
- [Cursor agent](https://mobbin.com/flows/de3904e0-f2db-4e6c-81db-e91d90483f80)
- [v0 preview](https://mobbin.com/flows/4a7ea814-bc67-48b0-9f50-92afa96b63ad)

Reference interactions do not override Drawloom's project ownership, provider
authority, theme, plugin editing or publication boundaries.

## State and verification ledger

| Journey | States to exercise | Deliberate difference from reference |
| --- | --- | --- |
| Find conversations | Empty query, loading, no matches, title/message hit, older hit, page continuation, failed query, archived/restore, failed metadata save | Search is cached-only and reports incomplete history; archive never controls native provider sessions |
| Enter project | No selection, available folder, missing folder, workbench ready/unavailable, recent conversations, explicit creation | A project is a local folder binding, not another instructions or knowledge store |
| Activity | No project, no owners, loading, running, pending input, cancellation requested, terminal/uncertain, disconnected | Existing local orchestration is authoritative; no fabricated percentages or merged agent/workflow lifecycle |
| Working material | Closed, docked, expanded, narrow, loading/failed media, comparison, direct edit, repeated opening | MCP Apps own domain editing and unsaved state; the host cannot infer dirty state |
| Completion | Complete, partial, denied, cancelled, failed, uncertain, supported result action | Execution success is not business acceptance or publication; no generic automatic retry |

### Backend verification completed

The first reviewed slice adds cache-only SQLite FTS search, bounded snippets and
read-around-record, plus persisted rename/archive/restore. Focused conformance,
SQLite and host checks pass (18 tests, 77 assertions), including 10,000 entries,
FTS pagination, restart and indexed updates. Search cursors become stale after
search-visible metadata changes; failed metadata persistence rolls back in-memory
state. No provider payloads are fetched to index or search cached history.

### Integrated verification

The canonical `bun run check:ci` passed: 983 Bun tests, 9 explicitly skipped
opt-in tests, zero failures, plus Node conformance and 46 Node tests. It includes
package builds, desktop type/build checks, dependency, architecture, UI-policy and
design gates. Subsequent scoped presentation fixes receive targeted reruns below.

The opt-in public browser scripts use an installed Edge browser with isolated
profiles; no browser download or live model is required:

- `apps/desktop/tests/five-journeys-host.ts` and
  `five-journeys-browser.mjs`: cached search and repeated exact anchor, failed
  read-around recovery, rename/archive/restore, zero implicit creation,
  cross-project drafts, Activity navigation and retained scroll, light/dark and
  390px layouts.
- `apps/desktop/tests/orchestration-browser.mjs`: project-bound HTTP fixtures
  exercise pending input, paginated steps, input failure and cancellation without
  stale controls. This is rendered presentation evidence, not a live Temporal run.
- `apps/desktop/tests/file-delivery-browser.mjs`: independently generated
  30-second, 30,592,406-byte video; metadata, seeking, playback and release in both
  themes; unknown-file download, malformed media error, streamed upload and reload,
  project separation, approved/blocked MCP media origins and revoked scoped URLs.
  No eager project-file request occurs before opening the workspace.

The installed private video consumer uses synthetic passage content. Its unchanged
MCP App retains an unsaved edit across shared-viewer switching, pane close/reopen,
Activity navigation and expansion. Direct Save creates one candidate with zero
model-send commands and unchanged tool activity. Private screenshots and receipts
remain in the private checkout's ignored `.superpowers` directory; no private
implementation or fixture was copied into this repository.
Stopping and recreating the private host also preserves the exact saved candidate
list and selected conversation, with no active model operation on restore.

Final scoped checks after review fixes: 72 presentation/ViewModel/outcome tests,
16 SQLite/history-host tests, desktop type checking, UI policy and production
build pass. The final browser pass additionally exercises direct document Save
and revision comparison, keyboard resize, expand/restore, narrow Back,
Escape focus restoration and settled 200% CSS reflow. Independent review fixes
covered late completed effects after cancellation, revision-bound resource
overrides and narrow workspace presentation. Visual inspection corrected dock
clipping and landing-page spacing.

Public screenshots are local evidence under
`/private/tmp/drawloom-five-journeys-evidence`, not committed build artifacts.
They include search, project/workbench landing, Activity, completion and workspace
in both themes, error feedback, narrow layouts and reflow. The baseline set covers
the original conversation, project, Settings/Activity and artifact layout; a full
matched light/dark baseline of every state was not captured. No missing baseline
is represented as observed evidence.

### Screenshot-led refinement (13 September)

The first implementation met behaviour checks but did not establish visual fidelity.
The follow-up treats each screen as a composition, not a blanket spacing change.
References inspected as screenshots:

- [Claude project form](https://mobbin.com/screens/e2b418b1-1db2-4b50-ad62-8c09b81e3bfe): bounded fields, grouped explanation, trailing commit/cancel actions. Drawloom keeps its required folder binding, not Claude's project instruction form.
- [ChatGPT settings](https://mobbin.com/screens/e2ece061-5f45-4191-b26e-d43485531c18): separated settings groups and quiet hierarchy; Drawloom retains main-content navigation.
- [Qatalog integrations](https://mobbin.com/screens/bf24e755-2a66-4aa1-b64b-ad156bbd0641): compact inventory rows and secondary configuration. This is Qatalog, not Claude.
- [Claude project overview](https://mobbin.com/screens/0777ad20-3aa9-4e91-87ee-72e1af8d04aa): coherent project introduction and conversation list.

Interaction brief: Add project is a validated commit; keep pending/error feedback in
the form, Cancel available, and navigate to the saved project only on success.
Discovery is primary on Plugins; local installation is an explicit disclosure,
not an automatic action. Knowledge shows results only after a search, keeping setup
distinct from empty search space. Other routes share one scroll owner and a bounded
content column. Colours, approval, project authority and plugin protocols are unchanged.
Structural regression tests precede these changes; screenshot inspection is required
in addition to compilation, and loading frames do not count as settled evidence.

Verified the rendered Add project, populated project/workbench, conversation/result
pane, search, Settings, Plugins, Knowledge, Activity and Archived views. Checked
Add project at 390px (no horizontal overflow), keyboard field order, Cancel and an
invalid-folder response; inspected dark and light themes. The populated host uses
disposable public fixtures, not the user's installation. Before/after captures are
local at `/private/tmp/drawloom-screen-polish/`, not checked-in build artifacts.
This pass is not exhaustive coverage of every provider/error state or private MCP
App. No model calls or model downloads were made.

Verification: Svelte check has zero errors/warnings; UI policy and build pass.
The canonical gate reached tests and caught two obsolete source-wiring assertions;
after updating those for the presentation/actions boundary, the complete Bun suite
passes (988 passed, 9 skipped) and all 46 Node tests pass. The targeted layout suite
passes 14 tests. Earlier canonical architecture, dependency and type phases passed;
the entire canonical command was not rerun after that targeted correction.

### Limits retained deliberately

### Composer mention refinement

Visual authority: the maintainer's two Codex screenshots supplied on 13 September
(`@` context/plugins and `$` skills). Do not copy unsupported Codex actions or invent
plugin branding. Assisted-input recipe: typing a token or using the toolbar opens
one non-modal shared MentionPicker, composed from Bits UI Popover (the shadcn
primitive) and shared shadcn Command. It anchors to the composer; focus remains
in the textarea. Rows carry an icon, title, truncated explanation and optional
availability. Resource browsing moves to an explicit separate composer section.

The textarea adapter owns caret/token recognition, Arrow/Enter forwarding and
focus restoration. Outside dismissal is owned by Popover. Deleting the trigger,
leaving the token, Escape, Tab or selecting text closes suggestions without
submitting. Selection consumes only the token, keeps the rest of the draft and
adds an existing context/skill selection. Discovery and grants remain unchanged.
Loading and failure are short status text; empty results remain explicit. No
animation is required, and no model is called to open or choose suggestions.

Browser checks on disposable public conversations observed: trigger deletion,
outside click, keyboard context selection, skills-only filtering, and caret/focus
restoration after choosing Clear writing. Existing source/resource browsing remains
available through Browse resources. These checks are not a screen-reader audit.

- Search sees only cached text; it never imports older provider history.
- Completed tool records currently lack a tool-title association. Their generic
  “Tool activity” label is honest; unresolved starts can show the known tool name.
- A different conversation may unmount an MCP App. The standard bridge has no
  dirty-state or hidden-media pause API; the host does not invent either. Native
  shared media is released when its viewer is inactive.
- CSS 200% reflow checks are not a native macOS accessibility audit. Browser
  walkthroughs do not claim new live Codex or Temporal recovery evidence.
- No commits, publication, production data changes or provider generation form
  part of this sprint.
