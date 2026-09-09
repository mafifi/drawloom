---
version: alpha
name: Drawloom desktop
description: Public local workbench shell. Journal design is maintained separately.
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
  gutter: 20px
  section: 28px
rounded:
  control: 8px
  composer: 14px
components:
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

## Component authority

`@drawloom/ui` in `packages/ui/ui` is the shared shadcn-svelte component library.
Use its buttons, fields, selects, checkboxes, tabs, disclosures, badges, alerts,
empty states and Sidebar/Sheet components instead of bespoke native controls.
`packages/ui/ui/src/styles.css` owns the semantic theme tokens; application CSS
owns layout, not a competing button/input theme. Versions belong in the root
Bun catalog. `check:ui-policy` enforces the control and import boundary.
Semantic HTML, ordinary links and native media/document viewers remain valid.
See [ADR 0012](docs/adr/0012-shared-ui-components-and-guidance.md) for the decision.
ViewModels identify pending commands; provider and business contracts are unchanged.

## Overview

The public desktop uses the approved [shell direction](docs/design/desktop-shell.md)
and its linked concept. Pure white conversation and artifact surfaces sit beside
a neutral grey 240px navigation rail. An optional 360px artifact pane shares fine
rules and Tailwind neutral selection. The centre absorbs remaining width.
No gradients, decorative logo, invented studios, fake conversations or fake costs.
The wordmark is Drawloom in system sans-serif. The journal has its own independent
[design authority](publishing/DESIGN.md).

The persistent composer remains editable during work. Attachment import, selected
document context, sending, supported steering and stopping are real commands.
Tool and artifact rows use separators and disclosure, not nested card grids.
Drafts, selected candidates and accepted reviews are distinct visible states.
Edit document creates a new revision and retains the previous one for comparison.
Images retain their original colour without overlays; audio and video use native
playback controls; documents are rendered in a sandboxed viewer.

Controls and navigation use 14px normal-weight system sans-serif; restrained
headings and the wordmark use 16px/500. Grayscale font smoothing keeps light-on-dark
system text optically restrained without reducing the declared normal weight.
Conversation and document content use 15px
with generous line height. Outline icons use the shared Lucide components and
their consistent sizing. Avatar initials are deliberate original identifiers,
not a borrowed logo. Conversation rows omit decorative avatars: assistant content
stays left and user messages sit right in a quiet neutral bubble.
Focus uses the blue theme accent. Secondary text stays legible.

The user's 2026-09-08 neutral-colour amendment supersedes green in the original
concept. The later supplied Codex screenshot governs hierarchy and tonal balance;
its private content is not an app asset. Light mode uses neutral-800 foreground,
`#666666` secondary/placeholder text, white surface, neutral-100 navigation/composer and
neutral-200 rules/selection. Dark mode follows the sampled achromatic reference:
canvas `#181818`, softer sidebar `#383838`, composer `#2a2a2a`, selected row
`#494949`, neutral-100 foreground and neutral-400 secondary text. These exact
reference values intentionally sit between Tailwind neutral steps.
Light secondary text is deliberately darker than neutral-500: it provides
5.27:1 contrast on the sidebar/composer `#f5f5f5` and 4.56:1 on the darkest light
selection/status surface `#e5e5e5` (5.74:1 on white).
New conversation is a transparent navigation action. Workspace and workbench
rows remain flat; only the active conversation has a quiet filled selection,
without extra font weight. The 2026-09-09 amendment introduces restrained blue
primary actions (`#2563eb`, white foreground). User conversation bubbles also use
primary blue with primary-foreground text; assistant messages remain plain on
the neutral conversation surface. Other chrome stays neutral. Send remains
circular when idle, disabled or pending. Composer uses one filled InputGroup:
no nested textarea border or tinted fill. Utilities and provider selection stay
transparent and visually subordinate.
The CSS `prefers-color-scheme` query follows the OS
live; no saved override is introduced. Tauri uses native system appearance.
All chrome, input, document and status colours consume these tokens. Imported
media preserves its original colour; document viewers use native rendering.

Below 1050px the details pane becomes an explicit drawer. Below 768px navigation
also becomes a toggleable drawer; the conversation and composer retain the full
screen width. Reduced-motion preferences disable nonessential animation.
Views receive state and commands from the shell ViewModel. They never consume
provider messages, secrets or private business types.
