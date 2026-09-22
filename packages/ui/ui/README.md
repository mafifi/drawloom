# @drawloom/ui

## Shared composition roles

Use `ChatMessage` (Prompt Kit) for prose and `Tool` (AI Elements) for typed tool
output. The host owns chronology and provenance; a component cannot infer them.
Use `document-page`, `document-header`, `document-tabs`, `document-copy` and
`document-section` for progressive document review. `settings-page` and the
settings group/row compositions own installation forms. `layout-stack`,
`layout-columns`, `form-stack`, `collection-record` and `facts-list` provide the
shared spacing and wrapping rules; content and commands remain in the ViewModel.

Raw palette, typography and dimensions belong in primitives, semantic roles map
their purpose, and Tailwind aliases consume those roles. Standard numeric spacing
utilities share the primitive spacing unit. Do not add arbitrary View utilities
or reproduce these rules in application CSS. Consumer CI can run the same public
policy CLI against its own root: `node scripts/check-ui-policy.ts /path/to/consumer`.
The private artifact-preparation lane builds that CLI without copying its rules.

The shared Svelte control boundary for Drawloom applications. Read this
before building a screen, adding a new control, or importing anything that
looks like a shadcn-svelte or Bits UI component directly.

Start with shadcn-svelte, including its Bits UI behaviour where applicable.
Use Prompt Kit, then AI Elements, when shadcn does not supply the required
composition. All use [DESIGN.md](../../../DESIGN.md); do not replace an existing
approved composition merely to change its library label. Native media controls
remain appropriate for playback, seeking, volume and fullscreen.
This package exposes reusable controls without workbench commands, provider
dependencies or business policy: a desktop conversation composer and a
separate settings form can compose the same controls while owning their own,
different state and commands.

## Consumer contract

Native planning uses `Plan` for the proposed approach and `Task` for the agent's
ordered checklist, not a separate editable task database. Task source was imported
from the [Svelte AI Elements registry](https://svelte-ai-elements.vercel.app/r/task.json)
on 2026-09-19 under the existing MIT notice. Adaptations are package-relative
imports, removal of an unused random ID, and reduced-motion-aware transitions.
Mode selection belongs to the composer; implementation is an explicit host action.

### AI conversation compositions

The currently adopted AI compositions use Svelte Prompt Kit: `PromptInput`,
`ChatMessage`, `ChatContainer` (including `ScrollButton`), `SystemMessage`,
`Steps`, `PromptSuggestion` and the `Markdown` facade use its source.
Svelte AI Elements supplies `Confirmation`, `Tool` and `Sources` where the
primary collection lacks the needed composition. Both reuse the existing
shadcn-svelte primitives and Drawloom theme, not separate themes or runtimes.

Imported through shadcn-svelte CLI 1.7.0 from the deployed registries on
2026-09-19: [Prompt Kit registry](https://sv-prompt-kit.vercel.app/r/index.json)
and [AI Elements registry](https://svelte-ai-elements.vercel.app/r/index.json).
Their MIT notices ship as `LICENSE.Prompt-Kit` and `LICENSE.AI-Elements`.
The prior Message/Bubble controls came from shadcn-svelte itself, not these
collections. They have been removed in the authorised consistency migration;
consumers use ChatMessage, not a parallel bubble theme.

`ChatMessage.Root` receives `speaker` (`user` or `assistant`, default assistant).
The shared composition owns alignment, message spacing and bubble geometry;
`ChatMessage.Content` inherits that role and forwards accessibility attributes
for both Markdown and snippet content. Consumer Views must not restyle these
roles with local padding, width or palette overrides.

The active four-layer migration requires OKLCH raw colours and semantic state
mapping. `text-base` and `text-body` share the reading scale; chrome and caption
remain separate roles. Settings use `settings-group`, `settings-surface`,
`settings-row`, `settings-stack` and `settings-controls`. The group responds to
its container rather than the host viewport. Desktop-local settings compositions
are retired. The strengthened policy catches raw non-OKLCH primitives and
component-local derived colours; full layout enforcement is still in progress.

Use `facts-list` on a semantic `dl` for consent, installation and other label/value
details. It owns a consistent wrapping grid and muted labels; the View supplies
`dt`/`dd` content without separate widths or responsive rules.

Deliberate adaptations: package-relative imports; semantic theme colours;
stable Svelte IDs; reactive confirmation context installed once; wrapping
approval actions; caller-provided tool outcome labels (denial is not an engine
error); controlled composer eligibility, IME/mention event ordering and toolbar
focus; shared scroll context instead of two independent scroll observers.
`PromptInput.Root` accepts `disabled`, `value`, `onValueChange` and `ref`;
`Textarea` forwards its ref and caller events. Loading is not editing eligibility.
`ChatContainer.Root` exposes `stopScroll` and `scrollToBottom`; the application
retains history pagination and search-anchor intent. Initial/resize movement
can be instant. The scroll button leaves keyboard navigation when hidden.

Markdown uses Prompt Kit's Streamdown renderer with code highlighting. The
existing `text`/`resolveFile` facade stays compatible. Raw HTML and embedded
media are disabled; link and strong snippets preserve authorized file navigation
and semantic emphasis. No remote image fetch, model transport or conversation
store is introduced. Local file callbacks still require host enforcement.

Unused external-chat export and permissive web-preview iframe components are
not activated. Importing presentation never grants execution or file access.
The unused upstream `Action` tooltip wrappers are excluded: wrapping an action
button with them produces nested buttons. Use the existing shared Tooltip child
delegation around Button/StatefulButton instead. The upstream source hovercard
also fetches third-party favicons; evidence uses AI Elements Sources without
that unsolicited request. Existing numbered in-document references retain their
approved keyboard/click-to-evidence behaviour rather than gaining hover-only UI.
Component adoption and verification progress is tracked in the
[delivery plan](../../../docs/plans/2026-09-19-ai-component-adoption.md).

Import controls through `@drawloom/ui` and its declared public exports. The
public import specifiers are `@drawloom/ui` and `@drawloom/ui/styles.css`; do
not reach into `src/` or `dist/` through package subpaths, relative paths or
absolute checkout paths, since those implementation files are not consumer
entry points. Preserve the upstream component props, bindings, events and
accessibility behaviour—consumers supply their content, state and handlers,
not a reimplementation. Add missing shadcn-svelte primitives to this package
before using them in an application, and import the shared theme at the
application composition boundary.

Maintained Svelte sources under `apps/` and `packages/` must use shared
controls for buttons, inputs (including file inputs), selects and their
options, text areas, labels, disclosures and separators, and the same rule
applies to native elements assigned interactive widget roles. Semantic page
structure, headings, lists, tables, ordinary links, images, native
audio/video playback and sandboxed document iframes remain consumer-owned
HTML. A component prop such as a Button's `role` is permitted, because the
shared component still owns the implementation underneath it.

Direct Bits UI, shadcn-svelte or local `components/ui` imports outside this
package's `src/` bypass the boundary. Standard Svelte APIs remain available
to consumers. The exact shared source directory owns native control
implementation; a similarly named sibling package is not exempt, and no
inline suppression comment can waive this policy. `pnpm run check:ui-policy`
enforces it: it parses maintained Svelte with the Svelte compiler, checks
source imports in maintained JavaScript and TypeScript, and reports file and
line with replacement advice. It fails on Svelte parse errors, excludes
dependency, generated and build directories, and treats the journal under
`publishing/` and retained `spikes/` as separately owned. It also rejects
native `data-slot` markup for Attachment, Message, Bubble and Marker roots
and parts outside the shared UI source, which catches copied primitive
markup while keeping semantic consumer HTML valid—it does not claim to catch
every CSS-only imitation. This is a focused structural check, not a full
accessibility or styling audit: computed imports, arbitrary runtime roles or
tags, injected HTML, CSS-only imitations and the behaviour of third-party
components still need review. Its tests use public synthetic examples and
require no private sources or services.

### WorkflowRun (ADR 0021 candidate)

`WorkflowRun` presents an orchestration `RunSnapshot` without executing work.
Consumers provide a title, optional cancel callback, pending/error feedback
and an optional `input` snippet for their own typed review controls. It shows
bounded step summaries and attempts supplied by the host, never task
arguments, results or media, and reports unresolved effects separately from
the workflow's terminal status—cancellation requested is not the same as
cancellation completed. Consumer ViewModels own pagination, input validation,
permissions, stale-response handling and recovery.

Optional `statusLabel` and `stepLabel(id)` let a trusted consumer supply
readable presentation for its own domain status and step names, without
changing the snapshot, cancellation eligibility or input authority. Omitted
props preserve the default engine-status and run-relative step labels. A
read-only consumer simply omits the cancel and input callbacks.

### EvaluationWorkbench (ADR 0025)

`EvaluationWorkbench` is a controlled evaluation View. It receives the
`EvaluationPresentation` and `EvaluationActions` exported by
[`@drawloom/evaluation-presentation`](../../evaluation/evaluation-presentation/README.md);
an installed consumer owns the standard MCP App adapter and supplies no
provider or scope to the View. Browsing shows bounded definition, run and
result pages without starting work. Start, cancellation and feedback use
separate controlled pending states, and a cancellation request is never
displayed as an already-cancelled run.

Combined result detail may be unavailable at the accepted size bound; the
View keeps the exact saved summary and offers one retained scorer checkpoint
at a time. Missing usage is labelled unknown rather than shown as zero.
Baseline comparison requires the ViewModel's exact case input/expected and
scorer identity/revision/configuration checks—presentation cannot bypass
them. Feedback is advisory, attributed to an exact result, and never changes
a score or accepts the underlying work.

### Composer mentions

`MentionPicker` composes the same Bits UI Popover primitive used by
shadcn-svelte with the shared Command components. It receives an anchor, text
input, controlled open/active state and typed options, and owns positioning,
outside dismissal and row presentation—not discovery, permissions or draft
mutation. The composer adapts textarea caret and mention tokens to those
controls, and links the active option with `aria-activedescendant`. This is
not a generic rich-text editor: keep one picker per composer, and keep
diagnostics or resource viewers outside its quick list.

### Input files

File inputs bind `files` and expose their element through `ref`; they do not
bind a filename string through `value`. Consumers can clear `ref.value = ""`
after capturing the selected files to allow choosing the same file again.
Non-file inputs retain their ordinary two-way `value` binding. The optional
`tests/input-browser.mjs` regression exercises file selection, clearing,
reselection and text binding against a built desktop on a disposable
authenticated host.

### StatefulButton

`StatefulButton` wraps the shared shadcn-svelte `Button` for commands whose
consumer already owns an in-progress state. It preserves Button props,
events, variants and `bind:ref`, adding `pending` (default `false`),
`pendingLabel` (default `"Working"`) and `iconOnly` (default `false`). While
pending, it disables activation, sets `aria-busy`, and displays a decorative
reduced-motion-aware spinner with the pending label; an explicit `disabled`
remains effective after pending ends. The pending label also supplies the
accessible name, including when the consumer supplies an idle `aria-label`.

Use `iconOnly` for compact icon commands: the spinner replaces the icon and
the pending label stays visually hidden, preserving the button's dimensions.
Supply an accessible idle label through `aria-label` or visually hidden child
text. For example, a composer can pass `pending={vm.busy}`,
`pendingLabel="Sending"`, `iconOnly`, and `aria-label="Send"`; a settings form
can instead show a labelled save command. Consumers own command execution,
error feedback and completion—the component does not infer success from a
resolved handler, catch errors, schedule status timers, or implement
hold-to-confirm. Those behaviours are deliberately outside this small
controlled presentation contract.

### Conversation primitives

`Attachment` and `Marker` retain upstream shadcn-svelte part names.
`ChatMessage` is the Prompt Kit message composition, with the shared speaker
contract described above.
`Spinner` is a direct component export. Consumers compose these
presentational parts and own message records, file transfer state, commands,
status text and accessibility labels:

- `Attachment.Root` accepts `state` (`idle`, `uploading`, `processing`,
  `error` or `done`), `size` and `orientation`; compose it with `Media`,
  `Content`, `Title`, `Description`, `Actions`, `Action` and optional
  `Trigger`. `Group` provides horizontal scrolling; add `tabindex={0}`,
  `role="group"` and an accessible label when the cards themselves have no
  interactive controls.
- `ChatMessage.Root` composes `Content` and `Actions`. User content receives
  the shared bubble treatment; assistant content remains unboxed. Message
  records and chronological grouping stay with the consumer's presentation.
- `Marker.Root` accepts `default`, `border` and `separator` variants and
  composes `Icon` and `Content`. Add `role="status"` for live progress;
  `Icon` is decorative. `Spinner` forwards SVG attributes and has a default
  status role and `Loading` accessible label.

Importing `@drawloom/ui/styles.css` also makes the upstream `scroll-fade*`
and `shimmer*` utility classes available. Scroll fade is a mask tied to
scroll position. Shimmer uses the element's current semantic colour, and its
upstream reduced-motion fallback removes the animation—no new theme or
motion preference is introduced.

### DropdownMenu, ContextMenu, Command and Dialog

`Command` and `Dialog` are upstream shadcn-svelte Nova compositions for
searchable keyboard selection; internal imports are relative, and
applications own selection, filtering and commands. They use the existing
Bits UI dependency and semantic theme without adding a desktop-specific
control API.

`DropdownMenu` is the corresponding upstream contextual-action composition.
It owns menu focus, keyboard navigation, dismissal and trigger focus
restoration; consumers own action labels, authority, pending state and
outcomes.

`ContextMenu` is the shared right-click, keyboard and long-press action
surface, sourced directly from the official
`registry/styles/nova/context-menu.json` registry entry. Only registry
placeholders were resolved—package-local utils imports and Lucide icons—and
no dependency versions were changed. Applications provide the same commands
used by inline actions; this component owns no pin, archive or other
persistence policy. Its trigger forwards Shift+F10 and the ContextMenu key as
a standard `contextmenu` event anchored to the focused row, for WebKit
keyboard access; it preserves caller handlers and disabled state, while Bits
UI still owns opening, focus and dismissal.

## Four-layer theme ownership

### Settings composition

The shared stylesheet provides `settings-group` (heading and surface),
`settings-surface` (one quiet boundary), `settings-row` (label/content and
control columns), and `settings-stack` (a full-width, related block).
Use semantic sections and headings; these classes own no state or commands.
Rows stack according to their container width, including inside plugin frames.
Keep feedback beside its action, consequences visible, and separate tasks 40px
apart. Do not nest surfaces or put a border around every field.

Reference: the maintainer's Codex configuration screenshot; the inspected
[Workable settings](https://mobbin.com/screens/2e0de63f-d64f-4080-9ea7-fdb3fbb02fc8)
also groups related rows under separated headings. This is shared presentation,
not a new settings protocol. Native controls, focus and pending states remain
with the existing shared components and consumer ViewModels. No motion is added.

The public stylesheet import is unchanged. Internally, `theme/primitives.css`
owns raw approved values; `theme/semantic.css` owns their meaning and system
light/dark mappings; `styles.css` and shared components supply reusable
presentation; application Views compose it. Consumers use semantic names, not
`--dl-*` primitive values. See the authoritative
[four-layer contract](../../../DESIGN.md#four-layer-theme-contract).

Use `text-body` for conversation body type, `text-chrome` for control copy,
and the existing shadcn semantic colours. Repeated typography in scoped CSS
uses `--type-*-size`, `--leading-*` and `--weight-*`. Views select shared layout
roles and Tailwind's mapped scale, never one-off measurements. Imported media
is not recoloured. The internal `cn` and configured `tv` helpers share the
same class-merging theme; use that `tv` helper when adding variant
components, since semantic text sizes must not be mistaken for foreground
colours or prevent consumer overrides.

A policy checker covers maintained CSS and statically visible Svelte
class/style attributes. It flags hex or function colour literals, named
Tailwind palettes, direct primitive consumption outside semantic mapping, and
consumer arbitrary typography/layout and component-local colour opacity. Exposed
semantic colours require explicit light/dark mappings. Shared upstream component
geometry stays with its component owner. It ignores content strings, generated
output, publishing and spikes; dynamic expressions and semantic composition
still require review. No blanket suppression or
separate lint framework is introduced.

Shared layout roles include `document-page`, `document-section`, `settings-page`,
`settings-group`, `settings-row`, `facts-list`, `form-stack`, `action-row`,
`collection-record`, and `hosted-view-frame`. The desktop shell consumes the same
`primary-view-*` and document frame roles. Responsive shell breakpoints stay in
that shared implementation because CSS media queries cannot resolve runtime
custom properties. Scroll tolerances are behavioural constants owned by the
scroll controller, not visual spacing chosen by individual messages.

## Generation and packaging

Generated controls come from the shadcn-svelte CLI's official registry,
using CLI 1.6.1, the Nova style and neutral theme; `components.json` records
the source, and generated controls retain their MIT notice in
`LICENSE.shadcn-svelte`. Local adjustments are recorded as they are made,
rather than reconstructed from generated output, and are deliberately
narrow:

- Accordion preserves the upstream Root, Item, Trigger and Content API for
  related document disclosures. It supports single or multiple open sections,
  controlled expansion and keyboard operation. Content animation respects
  reduced motion; internal imports are package-relative.
- Relative internal imports for standalone packaging, and shared
  theme/density tokens.
- Sidebar active attributes are omitted when false, so Tailwind's presence
  selector does not highlight inactive navigation rows.
- Button, label, tab and active navigation variants use normal font weight
  to match Drawloom's approved chrome rather than competing CSS overrides.
- Select items forward their display label to the underlying primitive
  metadata, and Select has a ghost variant for quiet inline controls.
- InputGroup's filled variant removes nested input chrome, and its disabled
  styling follows the input rather than disabled toolbar buttons.
- Sidebar uses its standard responsive composition rather than a parallel
  drawer.
- Attachment, ChatMessage and Marker use Drawloom's semantic body and chrome
  typography, with message geometry owned by the shared composition;
  the upstream shared Tailwind utility stylesheet
  supplies scroll-fade and shimmer without replacing Drawloom's tokens or
  base theme.
- The `DropdownMenu` source uses the same package-local `../../utils.js`
  import as the other generated components; the CLI's attempted dependency
  specifier and version rewrites were discarded so the root dependency catalog
  remains authoritative.

`StatefulButton` is a locally authored wrapper around the generated Button;
its controlled pending presentation adds no separate command lifecycle. None
of this is a new platform capability or an alternative component framework.

Upstream references: [Attachment](https://shadcn-svelte.com/docs/components/attachment),
[Marker](https://shadcn-svelte.com/docs/components/marker),
[Spinner](https://shadcn-svelte.com/docs/components/spinner),
[scroll-fade](https://shadcn-svelte.com/docs/utils/scroll-fade) and
[shimmer](https://shadcn-svelte.com/docs/utils/shimmer).

### Sonner notifications

`Toaster` and `toast` expose the official shadcn-svelte Sonner pattern
through the shared package. Applications mount one `Toaster` at their shell
composition boundary and use `toast` for transient feedback. The shared
component follows the operating-system light or dark preference and uses
Drawloom's neutral popover, foreground and border tokens. Consumers own
notification wording and action validity, and still need their own
persistent visible fallback—a toast does not introduce a command lifecycle
or replace durable status presentation.

## Adding a component

### Markdown content

`Markdown` uses the imported Prompt Kit Streamdown composition to render
semantic Svelte elements. It does not execute raw HTML or automatically load
images. Web links allow HTTP(S) only, without embedded credentials. Consumers
may supply `resolveFile(url)` for project-bound local links; the callback must
use the host's independently enforced file access. An unresolved destination
remains readable text. Rendering does not import files, approve work or send it
to a model. Both settled and streaming text use the same presentation. Set
`streaming` only for the active operation's partial assistant text to use the
library's CSS word reveal, without a stagger queue or custom typewriter timer.
Reduced motion disables the reveal; retained history defaults to static text.

This replaces the earlier local mdast renderer with the attributed upstream
composition described above, including code highlighting. Drawloom retains
the safe-link and host-authorized local-file boundary.

Interaction recipe: contextual navigation. Links retain native keyboard/focus
behaviour and open a separate browser surface without replacing the conversation.
Links do not trigger animation or automatic fetch; unavailable files retain the host's
normal error response. Repeated rendering never changes the stored message.

The root dependency catalog owns dependency versions. When adding a component, use
the Svelte CLI (not the React CLI), preserve existing sources, convert newly
added dependencies to catalog references and internal aliases to relative
imports, then run the package build/check and the root gate.

### Goals and plans

Native child activity uses the existing `Tool` process composition with truthful
status, expandable results and shared action controls. It is not a task board or
an independent child chat. The application's ViewModel owns fresh capability
checks and prepares parent-directed follow-up text; a saved child snapshot never
enables interruption. Fork belongs to the `/` and `+` Actions catalogue;
delegation is parent-agent initiated, not a user action. Use shared `Dialog` for the independent fork's shared-files warning,
not a permanent spawn button. See [Proposed ADR 0032](../../../docs/adr/0032-native-delegation-and-conversation-forks.md).

`ComposerStrip` owns attached-row geometry for composer accessories. Place strips
inside the same `composer-dock` immediately before the prompt; the shared inset
clears the prompt's rounded shoulders, and adjacent strips share square seams.
Goal content and future queued-message content must use this composition rather
than duplicate its margins or radii. It has no queue or goal execution authority.

`GoalBar` consumes presentation and actions from a ViewModel. It uses shared
shadcn controls, exposes the full objective on keyboard focus, and never runs a
local accounting timer or decides whether work should continue. Place it directly
in the composer's attached dock: its inset strip has rounded top corners and
square bottom corners. Optional `clock` input enables a CSS-only elapsed display,
anchored to native seconds and paused by the consumer on disconnect or suspension.
It is approximate, never a source of accounting. Native read/reconciliation errors must disable goal
mutations until authoritative state is available.
Do not render an empty-goal row. The desktop offers creation in its existing
composer + picker and `/` actions menu; an explicit selection opens the objective editor. Cancelling
creation removes it without a native mutation. The shared component also suppresses
an idle `mode: "create"` presentation.
The same shadcn-backed `MentionPicker` handles actions and skills. The + picker
orders Add actions before Plugins and Skills, followed by a persistent
Files and chats heading and muted search instruction. Context search does not
enumerate files or chats until a query is entered. Slash input
shows Actions then Skills, not attachment or plugin inventories. Reuse its
scroll-fade utility; do not create another command surface or inert action list.

`Plan` exposes the AI Elements Root, Header, Title, Description, Action, Trigger,
Content and Footer composition. Supply complete provider snapshots; retain earlier
updates in history and do not infer stable step identities. Plan editing belongs
in the conversation. Neither a completed plan nor a native completed goal grants
business acceptance. See [Proposed ADR 0031](../../../docs/adr/0031-native-goals-and-structured-plans.md).

`PresentationIcon` renders optional validated light/dark discovery icons as
decorative images, with the existing category icon as fallback. Picker and
catalogue consumers use declared presentation names without changing selection
identity. Icons are bounded host-provided image data, not remote fetches or inline SVG.

Consumers import `@drawloom/ui/styles.css` once and configure Tailwind v4's
Vite plugin. The stylesheet scans the packaged component source; the
consumer adds its own Tailwind source path. Theme follows
`prefers-color-scheme` live, without a local override. `svelte-package` ships
Svelte sources and declarations in `dist/`, and package export checks cover
the emitted files.

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for the reference-led process
required before changing a plugin-facing interface, and
[ADR 0012](../../../docs/adr/0012-shared-ui-components-and-guidance.md) for
the decision behind this package.
