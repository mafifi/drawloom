---
version: alpha
name: Drawloom desktop
description: A calm, capable place to do useful work with AI. Purposeful, familiar and quietly confident; work first, supporting detail on request. Journal design is maintained separately.
colors:
  primary: "#2563eb"
  ink: "#262626"
  muted: "#666666"
  surface: "#ffffff"
  sidebar: "#f5f5f5"
  rule: "#e5e5e5"
  selection: "#e5e5e5"
typography:
  heading:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: -0.02em
  body:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.65
  chrome:
    fontFamily: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
spacing:
  small: 8px
  related: 12px
  row: 16px
  gutter: 20px
  section: 28px
  task: 40px
rounded:
  control: 8px
  composer: 14px
components:
  collectionRow:
    height: 64px
    padding: "{spacing.related}"
    typography: "{typography.chrome}"
    textColor: "{colors.ink}"
  taskSection:
    padding: "{spacing.task}"
    typography: "{typography.heading}"
  shortSettingsInput:
    width: 180px
  contextualMenu:
    typography: "{typography.chrome}"
  menuIcon:
    size: 16px
  secondaryText:
    textColor: "{colors.muted}"
    typography: "{typography.chrome}"
  separator:
    backgroundColor: "{colors.rule}"
  selectedRow:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.ink}"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.ink}"
    typography: "{typography.chrome}"
  conversation:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  primaryButton:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.chrome}"
---
# Drawloom desktop design system

## Overview

Drawloom is a calm, capable place to do useful work with AI. It should feel
considered, familiar and dependable to a developer or individual professional:
a working application, never an engineering dashboard dressed as one.
Our voice is direct, helpful and quietly confident. We respect the user's
attention and judgement. We neither celebrate ordinary operations nor lecture
about our architecture.

**Every visible element must help the user understand their work, make a decision,
or take an action. Availability of data is not a reason to display it.**

Before composing every View, answer:
1. What am I informing the user?
2. What am I enabling them to do?
3. What can wait until they ask?

Write the answers and the chosen visual reference in the maintained interaction
brief. Start from an inspected Mobbin screenshot, the maintainer's screenshots,
or an already approved Drawloom composition. Copy the useful hierarchy, grouping,
spacing and interaction pattern; preserve Drawloom's colours and honest behaviour.
A link without inspecting its screenshot is not design evidence.

### Voice and naming

Use sentence case, meaningful nouns and specific action verbs: “Plugins”,
“Search knowledge”, “Restore conversation”, “Connect”. Say what happens next.
Prefer “This folder is unavailable” to “Directory binding validation failed”.
Prefer “Search by meaning” to “Embedding inference”.
Never claim completion, permission, acceptance or recovery that is not known.

No implementation prose on everyday screens: SDK names, schemas, registry
identities, dispatch, backend activation and configuration variables are not
navigation concepts. Technical information belongs at a genuine setup/consent
decision, selected evidence/provenance, or troubleshooting—not a default dump.
“Advanced” is not a storage cupboard for every unused field.

Keep consequential information clear at the point of action: model download size
and licence, provider disclosure, code trust, permissions, irreversible effects.
Do not hide these to make a screen look simpler. Do not repeat them below every
unrelated list. User content is content, not chrome: retain its original meaning.
The loom metaphor may explain knowledge connections, not rename ordinary controls.

## Colors

Preserve the approved achromatic system-following theme and blue user messages.
Light: white canvas, #f5f5f5 sidebar/composer, #262626 ink, #666666 secondary
text, #e5e5e5 borders and selection. Dark: #181818 canvas, #383838 sidebar,
#2a2a2a composer, #494949 selection, neutral-100 ink, neutral-400 secondary text.
Blue #2563eb is reserved for primary actions, focus and user bubbles; assistant
messages are unframed. Imported media keeps its own colours.

Do not use coloured panels, gradients, decorative status colours or a new palette.
Quiet badges supplement readable status; colour never carries the only meaning.
Light secondary contrast remains at least 4.56:1 on the darkest approved light
selection. Respect the OS theme; no separate preference is introduced.

### Four-layer theme contract

1. **Primitives:** `packages/ui/ui/src/theme/primitives.css` owns raw values.
2. **Semantics:** `theme/semantic.css` assigns purpose and light/dark mappings.
3. **Reusable presentation:** `styles.css` and shared components expose the roles.
4. **Composition:** Views assemble layouts, not competing control themes.

Raw colours stay in primitives. Application CSS owns layout. Use semantic type and
colour utilities; do not turn every measurement into a new token. The journal has
its own [design authority](publishing/DESIGN.md).

## Typography

Use system sans-serif: 14px normal chrome, 16px/500 restrained headings, 15px
reading content with generous line height. Hierarchy comes from placement, space,
grouping and selective emphasis—not a parade of bold headings.
Use secondary text for short context, not multiple paragraphs of required reading.
Truncate collection summaries; allow selected content to wrap fully.
Never truncate the sole explanation of a consequential action.
Internal identifiers are not titles. Show friendly supplied names first; preserve
exact identifiers only where useful for evidence or troubleshooting.

## Layout

Give content room to breathe, with deliberate proximity:
- 8px between tightly related controls; 12–16px within a functional group.
- 24–32px between groups; 40–48px between distinct tasks.
- Main reading/form column: roughly 720px; collection/detail: up to 1040px.
- Main gutters: 28–40px wide, 18px narrow.
- Compact collection rows: 48–64px, aligned icon, text, state and action columns.
- Put search and its action on one row when space permits.
- Short numeric settings use short fields; never stretch them across the page.

Space separates purposes, not every field. Use consistent alignment and avoid
nested cards, repeated rules, oversized empty containers and stacked full-width
buttons. Whitespace should make the next decision easier to see.

The 240px sidebar remains navigation, not a second dashboard. Settings replaces
its contents with categories and Back to app; returning preserves prior work.
Main destinations use a consistent header with a narrow-screen navigation trigger.
Workspaces stay docked on wide screens; narrow viewers use Back to conversation,
not a blocking artifact drawer. Preserve composer drafts, scroll and active apps.

## Elevation & Depth

The working canvas is flat. Reserve overlay elevation for shared menus, popovers
and dialogs. Use a quiet selected row or a single boundary where grouping needs
one. Do not box every fact. A visible layer must explain navigation or interaction,
not decorate content.

## Shapes

Use the shared 8px control radius and approved composer shape. Selected rows have
quiet rounded corners. Lucide outline icons are consistent, typically 16px in
controls and 20px in item identities. Use folder, plug, message, archive, search,
shield and activity symbols for their actual purposes. Do not use the same document
icon for unrelated destinations, emoji as product identity, or decorative avatars.

## Components

`@drawloom/ui` owns actual shadcn-svelte controls and their accessible behaviour
([ADR 0012](docs/adr/0012-shared-ui-components-and-guidance.md)).
Compose its Sidebar, InputGroup, Command, Tabs, Dialog, DropdownMenu, ContextMenu,
Collapsible, Field and Empty primitives. Do not hand-roll their keyboard or
dismissal behaviour. StatefulButton marks only the action actually pending.

### Approved screen compositions

| Screen | Inform | Enable | Reveal later |
| --- | --- | --- | --- |
| Conversation | What was said and what is happening | Write, attach, send, stop, inspect | Tool detail and evidence |
| Plugins | What each plugin offers and whether it is usable | Find, connect, configure | Its tools, skills, permissions and diagnostics |
| Knowledge | Relevant claims and their evidence | Search, inspect, follow evidence, export | Source collection, model setup and maintenance settings |
| Activity | What is running or needs attention | Select a run, inspect, respond, cancel | Steps, attempts and technical input |
| Project | Where work belongs and where to continue | Open a conversation or workbench | Folder path and setup detail |
| Workbench | What it helps accomplish in this project | Continue or explicitly create | Setup detail |
| Archived | Which conversations can be restored | Find and restore | No technical history inventory |
| Settings | Current choices and consequences | Change a setting deliberately | Diagnostic configuration |

Collections use an identity/icon, useful description, concise state and a real
action. Plugins and their children are not peers. Detail belongs to a selected item,
not every expanded item simultaneously. Search results lead with content, not keys.

Empty states have a small meaningful icon, a short heading, one explanatory sentence
and an available next action. Do not invent sample data. Loading preserves useful
settled content. Failures show what is affected and what the user can do, with
technical diagnostics secondary. Denial, cancellation and uncertainty stay distinct.
Success is quiet; errors are durable; toasts acknowledge small completed actions.
No generic Retry for uncertain effects.

Use Message/Bubble for conversation alignment, Attachment for file metadata,
Marker for meaningful progress, and restrained shimmer only during real work.
Keep native media controls, URL delivery, source-bound access and capture-once
history. Opening a pane neither accepts output nor starts provider work.

### Interaction and acceptance

Use the [interaction skill](.agents/skills/microinteraction-design/SKILL.md) before
changing behaviour and [Svelte presentation guidance](.agents/skills/svelte-presentation-mvvm/SKILL.md)
for state ownership. Views receive presentation and actions; execution and authority
remain with existing owners.

Every changed View needs a rendered comparison to its inspected reference and
its purpose brief. Check first-use, populated, loading, empty and error states;
keyboard/focus, Escape/back, touch, 390px, 200% zoom and reduced motion.
Inspect both system themes. Screenshots alone do not prove interaction correctness;
unit tests and a successful build do not prove visual quality. Record gaps honestly.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Design from the user's next decision | Render everything in a response object |
| Borrow a proven composition from a real screenshot | Cite Mobbin without looking at the image |
| Use generous, structured space | Scatter controls with arbitrary margins |
| Group by meaning and ownership | Mirror packages, subsystems or database tables |
| Name actions plainly | Explain implementation to justify confusing UI |
| Reveal selected detail | Put every setting below the primary task |
| Keep consent and uncertainty visible when relevant | Hide consequences or bury errors in body copy |
| Verify real interactions and reference fidelity | Call a passing build “polished” |

The format follows Google's [design.md specification](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md):
typed frontmatter tokens plus ordered brand, colour, type, layout, elevation,
shape, component and do/don't guidance. The [screen-language pass](docs/plans/2026-09-14-purposeful-views.md)
records inspected references and implementation evidence.
