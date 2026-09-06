---
version: alpha
name: Drawloom journal
description: Approved editorial direction for the public journal, separate from product UI branding.
colors:
  primary: "#064C40"
  ink: "#111111"
  muted: "#344155"
  paper: "#F8F8F6"
  rule: "#D4D4D4"
typography:
  heading:
    fontFamily: Libre Caslon Display, Times New Roman, serif
    fontSize: 58px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: -0.025em
  body:
    fontFamily: Times New Roman, Times, serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontFamily: Arial, Helvetica, sans-serif
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.55
spacing:
  small: 12px
  gutter: 24px
  section: 48px
rounded:
  media: 0px
components:
  separator:
    backgroundColor: "{colors.rule}"
  article:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  link:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
  caption:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
---
# Drawloom journal design system

## Overview

A welcoming practitioner's journal for business readers and technical builders:
clear, attractive and a pleasure to read. Lead with human problems and business
meaning, then make technical depth available through examples and explanations.
Generous space should create rhythm, not needless scrolling.

Writing voice and editorial standards live in [EDITORIAL.md](EDITORIAL.md).

The author approved this visual direction on 2026-09-05: warm ivory, forest-green
accents, editorial serif typography, fine separators and a delicate woven
homepage illustration. This file is authoritative for the publishing section,
including `publishing/site/`, not Drawloom's product interfaces.

The maintained journal uses this direction. The retained coming-soon fallback
and ADR 0009 proof preserve their earlier white/cobalt styling.
Local revisions are not publication approval. Execution and publication
follow the [adoption plan](../docs/plans/2026-09-05-journal-design-adoption.md);
local visual and interaction checks are recorded in [design-qa.md](../design-qa.md).

### Approved reference

The final mockup combines the fine woven illustration from the third refinement
with the second refinement's layout, then removes all photographic header bands.
The two views in the mockup are separate home and article pages, not a two-column
reading interface.

[Approved visual, local preview](/Users/afifim/.codex/generated_images/01a06218-f36c-7660-9fde-633b4b5b7215/exec-f79b3b69-24f1-4276-a3c3-08d9825cf164.png).
This machine-local preview is not a deployable asset or repository dependency.
The rules here preserve its intent without depending on that file's availability.
Exact token values are implementation starting points to validate against the
approved appearance, not asserted measurements of an image-generated font.

## Colors

Warm ivory paper, near-black reading text and dark forest-green links and accents.
Muted text remains legible. Warm-grey 1px rules separate sections without becoming
focal elements. Do not use the rule colour for text or as the sole focus indicator.
No cobalt theme, saturated multicolour ribbons, decorative gradients or dark
panels around the prose.

## Typography

Both earlier system-font-only approximations were rejected by the author.
Use self-hosted Libre Caslon Display Regular for the wordmark, headings and
deck. Its unmodified font and SIL licence are in `site/public/fonts/`. The
choice is a close visual match, not an assertion that the generated mockup
used an identifiable font. Do not substitute a system font during QA without
checking which font the browser actually rendered.

Article titles are 58px/1; home titles 60px/1.03, both reduced to 44px on
mobile. Balance headline wrapping. Section headings are 35px/1.12. Decks use
25px/1.24 in slate. Reading prose is Times New Roman at 16px/1.5 on desktop,
18px/1.5 on mobile. Navigation, metadata and captions use Arial/Helvetica at
13px/1.55. These three specific roles replace the earlier two-family shortcut.
Use regular weight, restrained negative headline tracking and normal body
tracking. Preserve semantic heading order.

## Layout

One open page surface, not a floating card. Start the masthead and wide-media
container at a maximum of 1040px including 40px gutters. The article wrapper is
at most 736px, with 20px internal gutters. At the 736px reference viewport this
places reading content 60px from the edge and gives figures 616px. Paragraphs
stop at 490px. Use 24px outer gutters and no extra article gutters on mobile.
Section spacing starts at 30px; media sits directly beside its explanation.

Home: compact masthead, short editorial introduction, featured essay title/deck,
clear reading link, wide woven illustration, and simple ruled lists when real
additional articles exist. Do not invent content to fill the mockup's rows.

Article: masthead, a closely grouped title/deck, one quiet metadata row (including
the draft notice), then a fine separator and a comfortable reading column.
Explanatory media may be wider than the prose. Do not repeat the homepage's large
decorative illustration on every article. No sticky side rail, side thread trails
or ornamental corners. Mastheads use the same clean thin line as other separators;
there are no image banners.

The approved mockup's home and article panels are the comparison targets at
approximately 750px each. Do not judge fidelity only at a much wider viewport,
or treat matching token names as proof that the composition matches.

## Elevation & Depth

Hierarchy comes first from type, alignment, grouping and whitespace, then thin
rules. No page-container shadow, card grid or nested cards. The illustration may
suggest fabric through fine linework, without making the UI itself textured.

## Shapes

Straight-edged editorial sections and media. No rounded border around the page.
Rounded nodes inside explanatory diagrams are content, not a site-wide card style.

## Imagery

One distinctive decorative language: fine forest-green threads flowing
horizontally from the left into a broad, upright ivory/green woven field that
rises at the right. Use `weave-hero-neutral.png`, regenerated from the exact
approved attachment. The former shallow wave asset was rejected. Preserve the
new 1689×931 aspect ratio; don't flatten it into a low banner. It reaches through
the home gutters and its empty upper-left lets it tuck beneath the introduction.
Do not overlay article copy on imagery.

The author rejected the first regenerated asset's pinkish paper. Its neutral
edit retains the weave and matches the corrected off-white page background.

Do not substitute thick yarn photography, full-page linen textures, mechanical
circuit grids, tangled ribbons or generic AI imagery. Generate a standalone,
text-free asset rather than using the raster mockup as a website or cropping UI
into a background. Inspect responsive crops for moire, shimmer and seams. Reserve
image dimensions to avoid layout shifts. Decorative images have empty alt text;
meaningful diagrams have text alternatives explaining their content.

## Components

Masthead: text wordmark and only useful, working navigation. Links are forest green
with a visible underline or another non-colour cue. Use a clear focus ring, such
as a 3px forest-green outline with sufficient offset; do not rely on subtle rules.

Article rows: text and optional summaries separated by simple rules, not cards.
Omit empty navigation destinations and unapproved example titles.

Media: responsive 16:9 video with an exported poster and native browser controls
for play/pause, seeking and fullscreen. Actual browser controls need not match the
mockup's drawn controls. Provide a caption and a visible text transcript; a
transcript link may jump to that section. Add captions for spoken material.

Explanatory animation should teach the idea, not decorate the page. Keep decorative
weaving static. No autoplay, parallax, scroll hijacking or mandatory animation.
Honour reduced-motion preferences for any later UI transitions. Reuse editorial
colours and type across diagrams, videos and presentations without compromising
the legibility of labels at the intended viewing size.

Editorial callouts: use a small green label, ordinary readable text and thin
rules above and below. No shaded card or ornamental side stripe. Use them for
definitions, caveats or a decision worth pausing over. A pullquote may use larger
green serif text between rules; it should replace repetition, not add it.

Place screenshots and animations beside the passage they explain. Give wide
screenshots the full article width, a concise caption and a full-resolution
link. Stack diagrams are quieter supporting figures, capped at 490px, with the
lesson in the caption. Do not imitate Dr Souphi's alternating clinical page
sections: that reference informs pacing, not Drawloom's visual identity.

### Source measurements, not inherited guesses

The exact approved attachment was sampled on 2026-09-05. The initial sample
suggested `#F8F5F3`, but the author explicitly rejected its pink cast in the
working site. That correction takes precedence: use neutral off-white
`#F8F8F6`, not pink, peach or yellow cream. The divider's
dominant sampled grey is RGB 212/212/212. Green and slate are inferred from
anti-aliased text, using deeper forest green and blue-grey rather than muted
olive. The source contains slight raster variation; do not invent a patterned
reading background to imitate that noise. The small JOURNAL/ARTICLE labels
above the two mockup panels are presentation framing, not site navigation.

## Accessibility and verification

### Editorial architecture figures

Use Archify for architecture diagrams; the author rejected the real-text
column approximations. Keep typed diagram sources with the piece. Apply the
journal's neutral paper, ink, forest green and slate colours through a shared
template stylesheet before rendering and validation. Do not carry Archify's
default cyan, purple, orange and pink palette into the article. Preserve labels,
geometry and semantic boundaries when changing colours; colour must not be the
only way to distinguish responsibilities. Keep text alternatives and an enlarged
view available when a diagram cannot remain legible at mobile reading width.
No new decorative artwork or site redesign is implied by this revision.

Keep the consuming workbench outside Drawloom's capability boundary. Show what
context feeds, who authorises a tool, and who enforces constraints. Distinguish
provider-owned transcripts from Drawloom memory; orchestration coordinates the
capabilities rather than owning their internals. Grouping is editorial, not a
new architectural layer. Link the applicable ADRs from the figure caption.


Check real text contrast, keyboard navigation and visible focus. Test desktop,
tablet, 390px mobile and 200% zoom without horizontal reading overflow. Reading
must remain possible with decorative images or JavaScript unavailable. Compare
real screenshots to the approved reference, then test links and actual video
play/pause/seek; a matching screenshot alone is not interaction evidence.

## Do's and Don'ts

- Keep the business story approachable and allow technical depth without cramming.
- Keep sample/proof notices visible in local previews; they are not real articles.
- Keep the approved visual separate from approval to publish editorial content.
- Use semantic HTML text and real controls, never a full-page raster mockup.
- Prefer the small reusable system over bespoke styling for every piece.
