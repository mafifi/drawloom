# @drawloom/ui

The shared Svelte control boundary for Drawloom applications. Read this
before building a screen, adding a new control, or importing anything that
looks like a shadcn-svelte or Bits UI component directly.

Components come from shadcn-svelte, including its Bits UI behaviour where
applicable, and follow the visual rules in [DESIGN.md](../../../DESIGN.md).
This package exposes reusable controls without workbench commands, provider
dependencies or business policy: a desktop conversation composer and a
separate settings form can compose the same controls while owning their own,
different state and commands.

## Consumer contract

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
inline suppression comment can waive this policy. `bun run check:ui-policy`
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

`Attachment`, `Message`, `Bubble` and `Marker` are namespace exports that
retain the upstream shadcn-svelte part names and prop-forwarding contract.
`Spinner` is a direct component export. Consumers compose these
presentational parts and own message records, file transfer state, commands,
status text and accessibility labels:

- `Attachment.Root` accepts `state` (`idle`, `uploading`, `processing`,
  `error` or `done`), `size` and `orientation`; compose it with `Media`,
  `Content`, `Title`, `Description`, `Actions`, `Action` and optional
  `Trigger`. `Group` provides horizontal scrolling; add `tabindex={0}`,
  `role="group"` and an accessible label when the cards themselves have no
  interactive controls.
- `Message.Root` accepts `align="start" | "end"` and composes `Avatar`,
  `Content`, `Header`, `Footer` and `Group`. It is a layout primitive and
  does not assign conversation semantics to its children.
- `Bubble.Root` accepts the upstream semantic variants and alignment,
  composing `Content`, `Reactions` and `Group`. Its 15px body type, 18px
  radius, 10px by 16px padding and 85% maximum width preserve Drawloom
  conversation typography and density; `ghost` remains the unboxed
  assistant-content treatment.
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

The public stylesheet import is unchanged. Internally, `theme/primitives.css`
owns raw approved values; `theme/semantic.css` owns their meaning and system
light/dark mappings; `styles.css` and shared components supply reusable
presentation; application Views compose it. Consumers use semantic names, not
`--dl-*` primitive values. See the authoritative
[four-layer contract](../../../DESIGN.md#four-layer-theme-contract).

Use `text-body` for conversation body type, `text-chrome` for control copy,
and the existing shadcn semantic colours. Repeated typography in scoped CSS
uses `--type-*-size`, `--leading-*` and `--weight-*`. Layout may still use
Tailwind's standard scale and narrow one-off measurements, and imported media
is not recoloured. The internal `cn` and configured `tv` helpers share the
same class-merging theme; use that `tv` helper when adding variant
components, since semantic text sizes must not be mistaken for foreground
colours or prevent consumer overrides.

A policy checker covers maintained CSS and statically visible Svelte
class/style attributes. It flags hex or function colour literals, named
Tailwind palettes, direct primitive consumption outside semantic mapping, and
consumer arbitrary typography, while shared upstream component geometry
stays valid. It ignores content strings, generated output, publishing and
spikes, and it does not evaluate computed classes, script-built style
strings, every CSS named colour, or prove that every repeated pattern has
been extracted—semantic review remains necessary. No blanket suppression or
separate lint framework is introduced.

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
- Attachment, Message, Bubble and Marker preserve Drawloom's 15px
  conversation body, 14px normal-weight chrome and the existing bubble
  radius, padding and width; the upstream shared Tailwind utility stylesheet
  supplies scroll-fade and shimmer without replacing Drawloom's tokens or
  base theme.
- The `DropdownMenu` source uses the same package-local `../../utils.js`
  import as the other generated components; the CLI's attempted dependency
  specifier and version rewrites were discarded so the root Bun catalog
  remains authoritative.

`StatefulButton` is a locally authored wrapper around the generated Button;
its controlled pending presentation adds no separate command lifecycle. None
of this is a new platform capability or an alternative component framework.

Upstream references: [Attachment](https://shadcn-svelte.com/docs/components/attachment),
[Message](https://shadcn-svelte.com/docs/components/message),
[Bubble](https://shadcn-svelte.com/docs/components/bubble),
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

The root Bun catalog owns dependency versions. When adding a component, use
the Svelte CLI (not the React CLI), preserve existing sources, convert newly
added dependencies to catalog references and internal aliases to relative
imports, then run the package build/check and the root gate.

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
