---
name: svelte-presentation-mvvm
description: Use when creating or refactoring Drawloom Svelte Views, route shells, or static publishing components whose text, links, commands, or reactive state need a clear owner.
---

# Svelte Presentation MVVM

Keep route composition, presentation data, commands, and rendering distinct without inventing state machinery.

## Read first

Read `ARCHITECTURE.md`, Accepted ADR 0012, the applicable `DESIGN.md`, and the nearest `AGENTS.md`. For the static journal, also read Accepted ADR 0009.

## Choose the smallest state owner

- For a static page, create typed presentation and action objects in the Astro or Svelte composition shell. Do not introduce a ViewModel class merely to hold constants.
- Add a ViewModel class only when the surface owns reactive operation state, derived state, or commands whose lifecycle benefits from one.
- Keep provider selection, data loading, and trust-boundary parsing outside presentation Views.

## Shape the View boundary

1. Define the presentation and action types before refactoring the components.
2. Let the route or composition shell build the concrete presentation and actions.
3. Give the top-level `*View.svelte` `{presentation, actions}` props.
4. Pass each section View only its narrow presentation slice and command or link slice.
5. Keep user-facing copy, asset metadata, accessibility labels, and destinations out of leaf Views. A View may own semantic structure and genuinely local layout.
6. Do not pass a concrete ViewModel to leaf Views. Project its public state and commands first.

Action objects may contain callbacks for application commands or `href` values for static navigation. Keep labels in presentation data and destinations in actions so either can change independently.

## Verify the contract

- Write the failing test first.
- Render or build with non-default fixture values when practical, proving that text and destinations are injected rather than hidden in leaf components.
- Verify semantic headings, keyboard focus, narrow layouts, and no accidental client hydration for static publishing.
- Run the nearest targeted checks, then the repository's canonical gate before claiming completion.

Private repositories may inform the pattern, but never copy their code, fixtures, copy, or assets into Drawloom. Re-express only the approved public convention.
