# @drawloom/ui

The shared Svelte control boundary for Drawloom applications. Components come
from shadcn-svelte, including its Bits UI behaviour where applicable, and use
the visual rules in [DESIGN.md](../../../DESIGN.md). This package exposes reusable
controls without workbench commands, provider dependencies or business policy.
A desktop conversation composer and a separate settings form can compose the
same controls while owning their different state and commands.

## Consumer contract

Import controls through `@drawloom/ui` and its declared public exports. Preserve
the upstream component props, bindings, events and accessibility behaviour;
consumers supply their content, state and handlers. Add missing shadcn-svelte
primitives to this package before using them in an application. Import the
shared theme at the application composition boundary.

The public import specifiers are `@drawloom/ui` and `@drawloom/ui/styles.css`.
Do not reach into `src/` or `dist/` through package subpaths, relative paths or
absolute checkout paths; those implementation files are not consumer entry points.

Maintained Svelte sources under `apps/` and `packages/` must use shared controls
for buttons, inputs (including file inputs), selects and their options, text
areas, labels, disclosures and separators. The same boundary applies to native
elements assigned interactive widget roles. Semantic page structure, headings,
lists, tables, ordinary links, images, native audio/video playback and sandboxed
document iframes remain consumer-owned HTML. Component props such as a Button's
`role` are permitted because the shared component still owns the implementation.

Direct Bits UI, shadcn-svelte or local `components/ui` imports outside this
package's `src/` bypass the boundary. Standard Svelte APIs remain available to
consumers. The exact shared source directory owns native control implementation;
a similarly named sibling package is not exempt. No inline suppression comment
can waive this policy.

### Input files

File inputs bind `files` and expose their element through `ref`; they do not bind
a filename string through `value`. Consumers can clear `ref.value = ""` after
capturing the selected files to allow choosing the same file again. Non-file
inputs retain their two-way `value` binding. The optional `tests/input-browser.mjs`
regression exercises file selection, clearing, reselection and text binding
against a built desktop on a disposable authenticated host.

### StatefulButton

`StatefulButton` wraps the shared shadcn-svelte `Button` for commands whose
consumer already owns an in-progress state. It preserves Button props, events,
variants and `bind:ref`, adding `pending` (default `false`), `pendingLabel`
(default `"Working"`) and `iconOnly` (default `false`). While pending, it disables
activation, sets `aria-busy`, and displays a decorative reduced-motion-aware
spinner with the pending label. An explicit `disabled` remains effective after
pending ends. Pending label also supplies the accessible name, including when
the consumer supplies an idle `aria-label`.

Use `iconOnly` for compact icon commands: the spinner replaces the icon and the
pending label stays visually hidden, preserving the button's dimensions. Supply
an accessible idle label through `aria-label` or visually hidden child text.
For example, a composer can pass `pending={vm.busy}`, `pendingLabel="Sending"`,
`iconOnly`, and `aria-label="Send"`; a settings form can instead show a labelled
save command. Consumers own command execution, error feedback and completion.
The component does not infer success from a resolved handler, catch errors,
schedule status timers, or implement hold-to-confirm. Those behaviours are
deliberately outside this small controlled presentation contract.

### Conversation primitives

`Attachment`, `Message`, `Bubble` and `Marker` are namespace exports that retain
the upstream shadcn-svelte part names and prop-forwarding contract. `Spinner` is
a direct component export. Consumers compose these presentational parts and own
message records, file transfer state, commands, status text and accessibility
labels:

- `Attachment.Root` accepts `state` (`idle`, `uploading`, `processing`, `error`
  or `done`), `size` and `orientation`; compose it with `Media`, `Content`,
  `Title`, `Description`, `Actions`, `Action` and optional `Trigger`. `Group`
  provides horizontal scrolling; add `tabindex={0}`, `role="group"` and an
  accessible label when the cards themselves have no interactive controls.
- `Message.Root` accepts `align="start" | "end"` and composes `Avatar`,
  `Content`, `Header`, `Footer` and `Group`. It is a layout primitive and does
  not assign conversation semantics to its children.
- `Bubble.Root` accepts the upstream semantic variants and alignment, composing
  `Content`, `Reactions` and `Group`. Its 15px body type, 18px radius, 10px by
  16px padding and 85% maximum width preserve Drawloom conversation typography
  and density; `ghost` remains the unboxed assistant-content treatment.
- `Marker.Root` accepts `default`, `border` and `separator` variants and
  composes `Icon` and `Content`. Add `role="status"` for live progress; `Icon`
  is decorative. `Spinner` forwards SVG attributes and has a default status
  role and `Loading` accessible label.

Importing `@drawloom/ui/styles.css` also makes the upstream `scroll-fade*` and
`shimmer*` utility classes available. Scroll fade is a mask tied to scroll
position. Shimmer uses the element's current semantic colour and its upstream
reduced-motion fallback removes the animation. No new theme or motion preference
is introduced.

## Four-layer theme ownership

The public stylesheet import is unchanged. Internally, `theme/primitives.css`
owns raw approved values; `theme/semantic.css` owns their meaning and system
light/dark mappings; `styles.css` and shared components supply reusable
presentation; application Views compose it. Consumers use semantic names, not
`--dl-*` primitive values. See the authoritative
[four-layer contract](../../../DESIGN.md#four-layer-theme-contract).

Use `text-body` for conversation body type, `text-chrome` for control copy, and
the existing shadcn semantic colours. Repeated typography in scoped CSS uses
`--type-*-size`, `--leading-*` and `--weight-*`. Layout may still use Tailwind's
standard scale and narrow one-off measurements. Imported media is not recoloured.
The internal `cn` and configured `tv` helpers share the same class-merging theme.
Use that `tv` helper when adding variant components: semantic text sizes must
not be mistaken for foreground colours or prevent consumer overrides.

The existing policy checker now includes maintained CSS and statically visible
Svelte class/style attributes. It flags hex/function colour literals, named
Tailwind palettes, direct primitive consumption outside semantic mapping, and
consumer arbitrary typography. Shared upstream component geometry stays valid.
It ignores content strings, generated output, publishing and spikes. It does not
evaluate computed classes, script-built style strings, every CSS named colour,
or prove that all repeated patterns have been extracted. Semantic review remains
necessary. No blanket suppression or separate lint framework is introduced.

## Verification scope

Command and Dialog are upstream shadcn-svelte 1.6.1 Nova compositions added on
2026-09-10 for searchable keyboard selection. Internal imports are relative;
applications own selection, filtering and commands. They use the existing Bits UI
dependency and semantic theme without adding a desktop-specific control API.

`bun run check:ui-policy` parses maintained Svelte with the Svelte compiler and
checks source imports in maintained JavaScript and TypeScript. It reports file
and line with replacement advice and fails on Svelte parse errors. Dependency,
generated and build directories are excluded. The journal under `publishing/`
and retained `spikes/` have separate ownership and are outside this check.

Native `data-slot` markup for Attachment, Message, Bubble and Marker roots and
parts outside the shared UI source is also rejected with replacement guidance.
This catches copied primitive markup while keeping semantic consumer HTML valid;
it does not claim to detect every CSS-only imitation.

This is a focused structural check, not a full accessibility or styling audit.
Computed imports, arbitrary runtime roles or tags, injected HTML, CSS-only
imitations and the behaviour of third-party components still require review.
Tests use public synthetic examples and require no private sources or services.

## Generation and packaging

Generated with shadcn-svelte CLI 1.6.1 on 2026-09-09 from its official registry,
using the Nova style and neutral theme. `components.json` records the source.
Generated controls retain their MIT notice in `LICENSE.shadcn-svelte`.
Local adjustments are relative internal imports for standalone packaging and
shared theme/density tokens. Sidebar active attributes are omitted when false
so Tailwind's presence selector does not highlight inactive navigation rows.
Button, label, tab and active navigation variants use normal font weight to
match Drawloom's approved chrome rather than competing CSS overrides.
Select items forward their display label to the underlying primitive metadata.
InputGroup is generated from the same registry; its filled variant removes
nested input chrome, and disabled styling follows the input rather than disabled
toolbar buttons. Select has a ghost variant for quiet inline controls.
Sidebar uses its standard responsive composition rather than a parallel drawer.
`StatefulButton` is a locally authored wrapper around the generated Button;
its controlled pending presentation adds no separate command lifecycle.
This is not a new platform capability or an alternative component framework.

Attachment, Message, Bubble, Marker and Spinner were generated on 2026-09-11
with the same shadcn-svelte CLI 1.6.1 official registry. Their generated source
is retained with relative package-internal imports. Deliberate local adjustments
preserve Drawloom's 15px conversation body, 14px normal-weight chrome and the
existing bubble radius, padding and width. The upstream shared Tailwind utility
stylesheet supplies scroll-fade and shimmer without replacing Drawloom's tokens
or base theme.

Upstream references: [Attachment](https://shadcn-svelte.com/docs/components/attachment),
[Message](https://shadcn-svelte.com/docs/components/message),
[Bubble](https://shadcn-svelte.com/docs/components/bubble),
[Marker](https://shadcn-svelte.com/docs/components/marker),
[Spinner](https://shadcn-svelte.com/docs/components/spinner),
[scroll-fade](https://shadcn-svelte.com/docs/utils/scroll-fade) and
[shimmer](https://shadcn-svelte.com/docs/utils/shimmer).

### Sonner notifications

`Toaster` and `toast` expose the official shadcn-svelte Sonner pattern through
the shared package. Applications mount one `Toaster` at their shell composition
boundary and use `toast` for transient feedback. The shared component follows
the operating-system light or dark preference and uses Drawloom's neutral
popover, foreground and border tokens. Consumers own notification wording,
action validity and any persistent visible fallback; a toast does not introduce
a command lifecycle or replace durable status presentation.

The root Bun catalog owns dependency versions. When adding a component, use
the Svelte CLI (not the React CLI), preserve existing sources, convert newly
added dependencies to catalog references and internal aliases to relative
imports, then run the package build/check and the root gate.

Consumers import `@drawloom/ui/styles.css` once and configure Tailwind v4's Vite
plugin. The stylesheet scans the packaged component source; the consumer adds
its own Tailwind source path. Theme follows `prefers-color-scheme` live without
a local override. `svelte-package` ships Svelte sources and declarations in
`dist/`; package export checks cover the emitted files.
