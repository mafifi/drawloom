---
type: evidence
id: adr-0009-publishing
title: Repository-backed visual publishing proof
status: draft
created: 2026-09-05
updated: 2026-09-05
---
# Repository-backed visual publishing proof

Evidence for Proposed [ADR 0009](../../docs/adr/0009-repository-backed-visual-publishing.md).
The [retained spike](../../spikes/adr-0009-publishing/README.md) owns reproduction
commands and toolchain limitations. This is an illustrative example, not a
customer case study or proof of a production Drawloom runtime.

## Local observations — 2026-09-05

- Frozen Bun installation succeeded; the canonical gate passed all 54 tests,
  strict TypeScript checks, dependency isolation and both visual-design lints.
- The built-artifact verifier first failed for the absent article. It later
  caught a duplicate transcript anchor; after repair it passed the real build.
- Astro generated one static HTML article with no client scripts. Its native
  video has a poster, manual playback, transcript, download links and noindex.
- Remotion rendered a real H.264 MP4 and a PNG still from one 540-frame,
  30fps, 1280×720 composition. Studio opened successfully and seeking to frame
  450 showed the complete revision loop.
- Astro's relative-root background-preview issue was reproduced and resolved by
  starting the preview in its actual project directory. Remotion's Bun Timer
  declaration and Zod warning are documented in the spike, not hidden by
  weakening library type checking or downgrading product contract dependencies.

## Visual comparison

The concept was generated with the built-in ImageGen tool for layout exploration;
no generated mockup is embedded in the article. Comparison checks: white/cobalt
palette, serif/sans hierarchy, open reading column, title/proof-notice order,
one 16:9 diagram and downstream article sections. Native video controls replace
decorative mockup controls. The transcript and downloads are intentional
accessibility/reuse additions. The headline was reduced to prevent an orphaned
desktop word; the animation takeaway moved up to clear native playback controls.

## Live evidence

Public deployment and browser playback validation are pending. No acceptance
claim should be inferred from local build success.
