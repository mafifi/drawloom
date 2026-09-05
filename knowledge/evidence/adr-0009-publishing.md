---
type: evidence
id: adr-0009-publishing
title: Repository-backed visual publishing proof
status: active
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

## Live evidence — 2026-09-05

- Source commit `e60a435` was pushed to `main`, including the two previously
  unpushed commits, with explicit maintainer authorisation.
- [Repository CI](https://github.com/mafifi/drawloom/actions/runs/33943241206)
  passed on that source revision.
- [Publishing run](https://github.com/mafifi/drawloom/actions/runs/33943244194)
  independently installed the frozen graph on Ubuntu, ran the gate, rendered
  video/still, built and verified the article, uploaded the Pages artifact and
  deployed successfully. Build took 70 seconds; deployment took 10 seconds.
- [Public article](https://mafifi.github.io/drawloom/) returned HTTP 200.
  MP4 and PNG returned 200 with `video/mp4` and `image/png` respectively. A GET
  with `Range: bytes=0-1023` returned 206 and exactly 1024 bytes.
- The deployed MP4 is 943,707 bytes; the still is 60,294 bytes. The local macOS
  render is 936,186 bytes. This is source/build reproducibility, not byte-identical
  cross-platform rendering: system-font fallbacks and encoding can differ.
- Live browser playback decoded at 1280×720 with a reported container duration
  of 18.048 seconds. Playback reached the end, replay restarted at zero, pause
  held at 8.357 seconds, native backward/forward seeking changed position and
  End sought to 18.048 seconds. Distinct intermediate and complete-loop frames
  were inspected. No page console errors were observed.
- Edge responsive checks covered 1536×1024 desktop and 390×844 mobile. At 390px,
  document width remained 390px and the video was 350px wide; no horizontal
  overflow. The live transcript link navigated to `#transcript`. Text remains
  readable without playback, and the default video state does not autoplay.
- The Codex in-app browser was used for Studio and initial article testing;
  responsive screenshot inconsistencies prompted an Edge cross-check. Final
  viewport overrides were reset. Initial-state screenshots are retained as
  [desktop](adr-0009-publishing-desktop.png) and
  [mobile](adr-0009-publishing-mobile.png) evidence.

## Limits and outcome

The publishing boundary is demonstrated end to end. ADR 0009 remains Proposed;
maintainer acceptance and any promotion to a maintained application are separate.
No real Dr Souphi case-study content, Substack/YouTube publishing, subscriber
store, custom domain, analytics, interactive Remotion Player or cloud renderer
was added. Real-device and assistive-technology audits were not performed.

The workflow succeeded with an advisory that the existing-generation GitHub
actions were run under Node 24 instead of their deprecated Node 20 action host.
The Remotion/Zod advisory remains documented in the spike. Neither advisory is
a failed check or evidence of compatibility beyond this tested composition.
