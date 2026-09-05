# Publishing proof implementation plan

**Goal:** Draft ADR 0009 and validate a public example article with one animation.

**Architecture:** Piece-owned Markdown and Remotion sources feed an isolated
Astro spike. Only generated website output is deployed as a Pages artifact.

**Tech stack:** Bun catalog, Astro, React, Remotion, static GitHub Pages.

**Spec:** [ADR 0009](../adr/0009-repository-backed-visual-publishing.md).

## Constraints

- Non-production evidence only; no invented customer anecdote.
- No outside imports of spike code; no change to product UI conventions.
- User subsequently authorised the full source push. No ADR acceptance,
  subscribers, analytics or automatic publishing.
- Root catalog and lockfile own all external dependency versions.

## Steps

- [x] Draft the decision before implementation; confirm public repo and Pages state.
- [x] Add a built-output check and observe it reject the absent article/media.
- [x] Implement one Markdown article, one 18-second composition, Astro layout,
  native player/poster/transcript; add root build/render/verify scripts.
- [x] Run frozen install, source checks, render, build and output validation.
- [x] Preview Studio and article; check desktop/mobile and video controls.
- [x] Commit and push source; manually dispatch Pages build/deployment and enable Pages.
- [x] Verify public page/media and live playback; record evidence and limitations.

Completed proof results live in
[the evidence record](../../knowledge/evidence/adr-0009-publishing.md).
The maintainer subsequently accepted ADR 0009 and requested replacement of the
public example with a coming-soon placeholder; the completed proof is retained.

## Design inventory

The generated concept selects a white editorial page, black Georgia headings,
sans-serif body, cobalt rules/links, open 900–1000px reading layout and one media
frame. Copy: Drawloom / GitHub; “From generated output to finished work”; “Why
complex business AI needs a workbench, not just a conversation.”; explicit proof
notice below the heading; “Generation is one step”; “Keep the work visible”.

The implementation uses native video controls, not the concept's decorative
time/progress widgets. The diagram is deliberately code-native for deterministic
Remotion animation. This is provisional editorial styling, not product branding.
The transcript and media-download links are functional accessibility/reuse
additions below the fold. Mobile stacks naturally without separate components.
