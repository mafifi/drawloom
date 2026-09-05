# Local journal design and browser QA

## Publication preparation — 2026-09-05

The author explicitly authorised publication and integration of the full journal,
then requested an automatic publishing trigger. ADR 0010 records the change.
The latest production build emits the homepage and “Why Drawloom?” only, with
five selected screenshots and the regenerated EpisodeSteps MP4/poster. The
synthetic example remains excluded. Full checks pass: 58 tests, 198 assertions,
zero Astro errors/warnings/hints. An unquoted YAML date initially failed schema
validation; quoting the ISO date corrected it before publication. The real
Remotion render passed with the existing Zod version-preference warning.

Visual evidence below remains applicable; its local-only publication statements
describe that earlier review stage. [Live deployment verification](knowledge/evidence/journal-publication.md)
records the successful push-triggered deployment and browser checks.

## Current revision: image-to-code rebuild and neutral paper correction

2026-09-05. Local author-review draft only.

final result: passed

This is a technical visual-QA result, not renewed author approval. It supersedes
the rejected assessments retained below. The author's latest instruction removes
the pink cast: neutral `#F8F8F6` deliberately overrides the initial raw reference
sample `#F8F5F3`. The woven image background was also corrected, not just the CSS.

Source: `/var/folders/9r/mrvfc4ss3lb8n9r2kwm5y3bc0000gn/T/codex-clipboard-656420de-7c9d-4a0e-b5b6-86ee51972068.png`,
1493×1053. The presentation labels occupy the first 52px and are excluded.
Home and article are separate reference panels, not a two-column site.

Live comparison: `http://127.0.0.1:4393/`. This ignored local QA page places the
source beside the actual site in an iframe. It is not a journal route or a
published artifact. Final post-correction combined screenshots are in
`/Users/afifim/.codex/visualizations/2026/09/02/01a06218-f36c-7660-9fde-633b4b5b7215/journal-qa/`:

- `neutral-home-comparison.png`: 1560×1133 full-page capture; each panel is
  756×1001 CSS pixels, top-of-page state, one image pixel per CSS pixel.
- `neutral-article-comparison.png`: 1520×1133 full-page capture; each panel is
  736×1001 CSS pixels, top-of-page state, one image pixel per CSS pixel.

Both combined inputs were opened and inspected after the final rebuild. Text,
rules and artwork are readable at this scale; earlier focused browser checks
also confirmed the actual heading font through the browser font inspector.

### Findings, fixes and fidelity surfaces

- **P1 resolved: typography.** Self-hosted Libre Caslon Display replaces the
  rejected system-serif headline approximation. The browser confirms it is the
  rendered custom font. Prose uses Times New Roman; controls and captions use
  Arial. Matching-title comparison verifies wrapping, deck size and hierarchy.
- **P1 resolved: pink paper.** Page and generated artwork now use neutral
  off-white. The refreshed home comparison shows no pink image rectangle.
  Ink, deep green, slate secondary text and fine grey rules remain distinct.
- **P2 resolved: layout rhythm.** Measured panel gutters, headline spacing,
  490px reading measure and ruled entries replace the earlier broad/dense
  approximation. The separator previously hidden by the weave overlap is
  visible in the final capture.
- **P2 resolved: artwork.** A newly generated, tall woven field replaces the
  shallow wave. It is an image asset, not a CSS or SVG approximation. Real
  licensed Phosphor arrows replace text-glyph icons. Font/icon licences and
  image provenance are retained beside their assets.
- **Content boundary:** the real article remains “Why Drawloom?”; its short
  title and longer opening naturally differ from the mock. The illustrative
  example provides the matching title/deck comparison, but its body is not the
  mock's copy. Existing native 16:9 videos are retained instead of inventing the
  mock's player. No fake About page or notebook articles were added.

No actionable P0/P1/P2 remains in the inspected styling/assets. P3 differences:
generated weave threads and font details are not pixel-identical; library arrows
are black rather than the reference's green. This is not a pixel-perfect claim.

### Verification and limits

Fresh full `bun run check:ci`: 57 tests passed, 179 assertions; Astro reported
zero errors, warnings or hints. The final neutral-asset draft build passed.
During this rebuild, desktop (1280px), source-width and mobile (390px) views were
inspected; mobile home/article had no horizontal overflow. Read the essay,
Back to journal, native video playback and Read transcript were exercised.
The desktop browser error query was empty. The final colour-only change was
recaptured on desktop and in both source-width comparisons; mobile screenshots
from earlier in this rebuild precede that colour change.

No fresh screen-reader, no-JavaScript, native zoom or alternate browser-engine
claim is made. Nothing was committed, pushed or published. The public placeholder
is unchanged. The author can review the neutral background before any further
visual refinements.

## Rejected revision: approved-reference correction

2026-09-05. Local author-review draft, not publication approval.

final result: blocked

The author rejected this second assessment as well. The reimplementation now
in progress must supersede it with measured source colours, matched content at
the reference width, and actual asset/font fidelity. The historical assertions
below are not current acceptance evidence.

This supersedes the earlier fidelity assessment below. The author rejected the
subsequent article's drift from the approved visual. Matching the original
starting tokens was not sufficient evidence of a faithful composition.

Source visual truth: the author's reattached 1493×1053 image,
`/var/folders/9r/mrvfc4ss3lb8n9r2kwm5y3bc0000gn/T/codex-clipboard-656420de-7c9d-4a0e-b5b6-86ee51972068.png`.
It is the same two-page visual described in publishing/DESIGN.md. Compare the
separate home/article panels, not a two-column website. Panel labels and the
mock's different essay copy are excluded from positional comparisons.

Implementation: `/drawloom/` and `/drawloom/articles/a-place-to-do-the-work/`
on the local preview at `http://127.0.0.1:4321`.

Evidence in the existing `journal-qa/` directory documented below:

- `home-reference-width-revised.png`: 756×1053 CSS and image pixels.
- `why-drawloom-reference-width.png`: 736×1053 CSS and image pixels.
- `why-drawloom-desktop-revised.png`: 1280×900.
- `why-drawloom-mobile-revised.png`, `home-mobile-revised.png`: 390×844.
- `episode-section-revised.png`, `spend-callout-revised.png`: 736×1053.
- `capabilities-mobile-revised.png`: 390×844.

Source and revised home/article captures were opened together in one comparison
input, at source-panel widths and the same top-of-page state. No density
rescaling was needed. The actual article has a short title and a much longer
personal opening than the mock, so its first figure is naturally farther down.
Focused browser views inspected the inline animation, programme screenshot,
spend callout and mobile capability map. No unreadable detail was judged solely
from a scaled full-page capture.

### Findings and fixes

1. **P1, resolved — typography and density.** Georgia rendered too wide/heavy;
   the former 20px/65ch column exaggerated that effect. Times New Roman with
   Times/serif fallback gives a finer, narrower baseline. Reading text is 18px,
   1.55 line-height and at most 60ch; captions are 14px. Headings remain regular.
2. **P2, resolved — heading separation.** The draft notice occupied another row
   and added excessive vertical bulk. It now shares the metadata row; title,
   deck and separator are grouped more tightly.
3. **P2, resolved — media detached from its explanation.** A single author marker
   now places the existing animation inside the episode section. The transcript
   stays visible at the end. Production and public episode screenshots are
   embedded where discussed, with full-resolution links.
4. **P2, resolved — homepage list hierarchy.** Ruled entries now have smaller
   black serif titles rather than oversized green underlined headings. The
   existing real woven artwork reaches through the horizontal gutters.

The five fidelity surfaces were checked: finer type/hierarchy; compact grouping
with open reading space; near-white ivory/forest green/slate palette and fine
rules; the supplied standalone woven asset plus real screenshots; and meaningful
draft copy without invented navigation or notebook entries. Callouts use rules
and a small label, not shaded cards. Dr Souphi's clinical page is not copied.
Existing factual SVG diagrams remain article content, not substitutes for the
mock's decorative artwork; the v2 diagram now shows separate apps sharing D1.

No actionable P0/P1/P2 remains in these inspected states. P3: the standalone
weave's curve and generated-font details are not pixel-identical to the mock.
This is a revised implementation for author review, not a claim of new approval.

### Fresh checks and limits

The full repository gate passed: 57 tests, 179 assertions; Astro reported zero
errors, warnings or hints. After the final documentation/CSS edits, the draft
build, design-spec lint and diff whitespace check passed. The new media-placement
test was observed failing before the implementation and passing afterwards.
Preview images all loaded; draft routes/media remain absent from production.

Browser checks: no horizontal overflow at 736, 390 or 1280px; mobile figures
remain within the viewport. Native play advanced the 30.059-second animation
to 12.77s; pause and the transcript link were exercised. Read the essay and Back
to journal worked. The final desktop browser error query was empty.
The small labels in full-interface screenshots require opening their linked
originals; captions explain the point without requiring that detail.

Earlier no-JavaScript, keyboard and zoom checks below are historical, not fresh
claims for this revision. Physical devices, screen-reader speech and other
browser engines were not retested. Nothing was committed, pushed or deployed.
The new deliverable preview was restored to its default 1280×720 viewport.
The older comparison tab still reports 736×1053 after reset; its retained
comparison size does not affect the new preview or the site CSS.

## Earlier implementation review (historical)

Date: 2026-09-05. Scope: local `feature/journal-design` implementation only.

final result: passed

No actionable P0/P1/P2 findings remain in the inspected local home/article.
This is not editorial approval, permission to publish, or verification of a live
deployment. No application files were changed by the verification worker.

## Comparison evidence

Source visual truth:
`/Users/afifim/.codex/generated_images/01a06218-f36c-7660-9fde-633b4b5b7215/exec-f79b3b69-24f1-4276-a3c3-08d9825cf164.png`
(1493 × 1053 pixels). Its home/article panels are separate views. Panel labels,
About, notebook rows and sample prose are not required website content; the
approved publishing DESIGN.md explicitly excludes invented destinations/rows.

Implementation: `http://127.0.0.1:4321/drawloom/` and
`http://127.0.0.1:4321/drawloom/articles/workbench-example/`.

Evidence directory:
`/Users/afifim/.codex/visualizations/2026/09/02/01a06218-f36c-7660-9fde-633b4b5b7215/journal-qa/`

- `home-desktop-final.png`: 1440 CSS px wide; 1440 × 1058 full-page pixels.
- `article-desktop-final.png`: 1440 × 1000 CSS viewport, full-page capture.
- `home-mobile-final.png`, `article-mobile-final.png`: 390 × 844 CSS viewport,
  full-page captures at 1 pixel per CSS pixel.
- `home-tablet.png`, `article-tablet-final.png`: 768 × 1024 CSS viewport.
- `video-poster-final.png`: final green/ivory poster and visible caption,
  1440 × 1000 viewport; focused media/typography evidence.
- `video-seek.png`, `video-fullscreen.png`: native media interaction evidence.
- `keyboard-focus.png`: visible keyboard skip-link focus.
- `home-no-js-no-artwork.png`, `article-no-js-transcript.png`: static fallback.
- `home-css-zoom-200.png`, `article-css-zoom-200.png`: 200% CSS zoom checks.

The source and rendered captures were opened together in the same comparison
input for home composition, full article and focused final media. Comparisons
are at design-intent level, not pixel overlays: the source contains two panels
of approximately 750px width and different article text, while the maintained
site uses the specified 1120px shell. The tablet capture provides a comparable
single-page width. Full-page captures may be scaled by the tool for display;
original image files retain their CSS-pixel dimensions. No density mismatch was
treated as a design defect.

## Required fidelity surfaces

| Surface | Assessment |
| --- | --- |
| Fonts and typography | Georgia serif headings/prose, Arial controls/metadata; regular headings, 56px desktop/36px mobile h1, 20px/18px prose and 1.65 prose line-height match the approved starting tokens. Natural wrapping remains readable. Generated mock font differences are accepted under the explicit Georgia baseline. |
| Spacing and layout | Open paper surface, ruled masthead, 1120px shell, 24px mobile gutters and no more than 65ch prose. No cards, side rail or image banners. Additional source mock rows omitted because no approved additional essays exist. |
| Colors and tokens | Computed paper #FAF7F0, ink #111111, green #244D40 and muted #535650. Contrast against paper: ink 17.65:1, green 8.88:1, muted 6.97:1. Final media uses the editorial palette. |
| Image quality | Standalone 2023 × 777 fine-line PNG, empty alt, reserved dimensions; restrained woven transition fits the source direction. No visible seam or moire at inspected desktop/tablet/mobile scales. Static screenshots cannot prove absence of temporal shimmer on every display. |
| Copy and content | Local illustrative notice and noindex remain; no invented customer story, notebook rows or About destination. The retained explanatory animation/prose differs intentionally from the mock; this is not first-article approval. |

## Checks and interaction evidence

| Check | Result |
| --- | --- |
| Page identity and meaningful content | Home and article URL/title correct; real semantic HTML text present. |
| Framework overlay | None observed. |
| Console health | Final warning/error query returned an empty list. |
| Desktop/tablet/mobile overflow | documentElement.scrollWidth equals innerWidth at 1440, 768 and 390px. Mobile article had no right-overflowing elements. |
| Keyboard | Tab reveals skip link with a 3px forest-green outline; Enter reaches #main. |
| Navigation | Read the essay opens the article; Back to journal returns home; Read transcript reaches the visible #transcript heading. Masthead and GitHub hrefs inspected. |
| Video | No autoplay; controls enabled; duration 18.048s, readyState 4, initially paused. Native play advanced from 0.01s to 10.96s; native pause set paused=true; timeline click sought backward to 3.16s. Native fullscreen entered and exited using its control. |
| Static fallback | Browser script execution disabled and artwork requests blocked: homepage remained readable; native article link and transcript anchor still worked. Missing artwork shows a broken-image indicator but does not hide prose/navigation. |
| 200% zoom resilience | 200% CSS zoom on a 1440px viewport retained readable reflow and scrollWidth 1440. A separate 720px CSS-width/DPR2 reflow check also had no overflow. Native browser menu zoom was not available through the current in-app API; do not describe this as native browser zoom verification. |

All temporary JavaScript, network-blocking, device metrics, CSS zoom and viewport
overrides were restored. The verification tab is retained at the local home;
the user's live Edge tabs were untouched.

## Review history and resolved findings

1. Preflight: the maintained renderer inherited the proof's white/cobalt palette.
   Builder added optional palette props and selected ivory/green in the maintained
   composition, preserving the historical spike defaults. Final rendered poster
   and playback inspected; `video-poster-final.png` records the fix.
2. Preflight: journal typechecking omitted Remotion and did not semantically check
   Astro templates. Builder added root-catalog @astrojs/check, actual Astro
   diagnostics and Remotion inclusion. Builder reported zero Astro diagnostics.
3. Final targeted check: served output briefly lacked the source's caption span.
   Builder rebuilt; browser DOM and `video-poster-final.png` confirm the visible
   Explanatory animation caption plus Read transcript link.

One scoped spec/quality review was performed, with targeted post-fix checks;
the complete test suite was not redundantly rerun by this worker.

## Build and publication boundary

Reviewed the metadata schema, draft filtering, media staging, output tests,
placeholder staging and manual main-only workflow. Production build ignores an
inherited draft environment unless the explicit --drafts flag is provided; draft
routes and their generated media are excluded. Generated media is staged only
from emitted HTML references and does not live in Astro public/.

Builder reported frozen installation, full check:ci (57 tests), real 18-second
render/poster, Astro diagnostics, and subsequent targeted publication/placeholder
tests passing. These are builder execution results; this worker independently
reviewed their test/source boundaries and exercised the browser. The placeholder
source HTML is unchanged; the workflow stages only that file into an isolated
artifact. No deploy, commit or push was performed by this worker.

## Remaining limits and next step

Native menu zoom, Safari/Firefox, physical mobile devices and screen-reader speech
were not exercised. Video takeaway text is small in the narrow inline player;
native fullscreen and the complete adjacent transcript provide larger readable
alternatives. Real article approval and public publication remain separate work.
Use the retained local preview for the author's review.
