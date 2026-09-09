# Desktop appearance verification

Scope: the owner's 2026-09-08 colour, navigation-emphasis and typography
correction. This is not approval of the entire application or workbench plan.
The journal is outside this change.

## Source and state

- Source visual truth: `/var/folders/9r/mrvfc4ss3lb8n9r2kwm5y3bc0000gn/T/codex-clipboard-b161f6e6-8d5d-4f24-83b4-cfcbaa6faeae.png`.
  Use the Codex region on the left for colours and hierarchy; the Drawloom region
  on its right demonstrates the rejected appearance. The source contains private
  UI content, stays outside this repository and is not a distributable asset.
- Source dimensions: 2032 × 1064 pixels. It includes application chrome and two
  different products, so this is a surface/type comparison, not pixel-level
  equivalence of their content or navigation structure.
- Implementation: `http://127.0.0.1:4381/`, public synthetic text workbench,
  existing selected document revision, details closed, composer context open.
- Before capture: `/tmp/drawloom-theme-proof.yOw91W/before-softening.png`.
  Browser viewport was being resized; this initial capture is clipped and only
  supports the visible sidebar/type findings, not viewport-resilience claims.

## Comparison history

Initial comparison opened both source and rendered implementation in the same
image input. Findings:

1. [P1] Near-black navigation and unraised composer diverge from the reference.
   Source samples: sidebar #393939, canvas #181818, composer #2a2a2a,
   selected conversation #494949. Use these neutral surfaces in dark mode.
2. [P2] Bright New conversation CTA and three selected navigation cards compete
   for attention. Use an ordinary transparent navigation action, unfilled
   workspace/workbench rows and one restrained selected conversation.
3. [P2] 23px wordmark, 24px bold welcome heading and 20px bold conversation title
   create excessive hierarchy. Use normal 14px controls, 15px conversation text,
   and restrained 16px medium-weight headings.

Second comparison: all three corrections were visible, but light-on-dark text
still appeared optically too heavy. Added grayscale font smoothing without
reducing normal text below weight 400. Final source and implementation images
were opened together in the same comparison input; the softer surfaces, quiet
action, single selection and restrained typography have no remaining actionable
P0/P1/P2 mismatch within this correction.

## Final evidence

- Dark: `/tmp/drawloom-theme-proof.yOw91W/final-soft-dark.png`.
- Light: `/tmp/drawloom-theme-proof.yOw91W/final-soft-light.png`.
- Compact light: `/tmp/drawloom-theme-proof.yOw91W/final-narrow-light.png`.
- Compact dark navigation: `/tmp/drawloom-theme-proof.yOw91W/final-narrow-dark-nav.png`.
- Main visible viewport: 771 × 866 CSS pixels, devicePixelRatio 1; final dark
  screenshot is 771 × 866 pixels, with no density scaling. Narrow layout was
  390 × 844 CSS pixels. Source app regions are compared at their supplied pixel
  scale, excluding native frames; no resizing of source content was performed.
- The full-view source and final dark evidence were displayed in one comparison
  input. Sidebar rows, composer and headings were readable at native scale, so a
  separate crop was not needed for this scoped palette/type change.
- Computed dark colours match all four sampled values. New conversation has
  transparent background. Exactly one navigation row is selected. Navigation is
  14px/400; headings are 16px/500; conversation body is 15px/400.
- Light uses white canvas, #f5f5f5 sidebar/composer and #262626 text. Both live
  appearance changes retain the unsent draft and selected context state.
- Main and narrow document scroll widths equal viewport widths (771 and 390).
  Compact navigation opens and closes; context toggles; candidate preview and
  artifact pane controls remain functional. Browser warning/error log is empty.
- Browser viewport and colour-preference overrides were restored. This proves
  browser preference response, not an actual macOS appearance-setting change.

## Required fidelity surfaces

- Fonts/typography: initial hierarchy findings corrected; final font smoothing
  visibly removes optical over-weight. Existing older draft title remains
  truncated at its originally saved text; this is not caused by theme styling.
- Spacing/layout: existing public shell and responsive drawers retained;
  navigation, composer and details remain usable after changing text sizes.
- Colours/tokens: sampled source matched; light counterpart and live preference
  changes checked as recorded above.
- Image quality: no raster imagery is added or replaced by this scoped change.
  Existing media must not be inverted. Supplied private content is not copied.
- Copy/content: retain Drawloom identity and honest synthetic-mode messaging;
  do not copy the source application's conversation or project names.

## Implementation checklist

- Three findings corrected across desktop tokens and components.
- Revised dark state compared alongside the supplied source.
- Light/dark preference switching, narrow layout and main controls checked.
- Final screenshots, console results and limitations recorded above.

## Post-comparison accessibility check

[P2] Light secondary text #737373 on the #f5f5f5 sidebar is 4.35:1, below the
4.5:1 requirement for normal-sized text. Dark secondary text is 4.58:1 on its
sidebar and selected text is 8.26:1. Darken the light secondary token slightly,
recheck the contrast and capture the corrected light appearance.

Corrected: light secondary/placeholder text now uses #666666. Independently
checked the rendered sidebar token; contrast is 5.27:1 on #f5f5f5 and 4.56:1
on the darker #e5e5e5 selection/status surface. Before/after light captures were
opened together; hierarchy and spacing are unchanged. Corrected light evidence:
`/tmp/drawloom-theme-proof.yOw91W/final-contrast-light.png` (771 × 866 pixels).
The supplied source is dark-only; this light adjustment is an accessibility
counterpart, not an assertion of exact light-source fidelity. Dark source tones
remain unchanged. The preview again follows the actual system setting.

Keyboard follow-up at 390 × 844: the closed navigation has `visibility: hidden`
and is absent from the accessibility tree. Tab from Open navigation reaches the
visible artifact toggle, not an offscreen control. Enter opens navigation and
focuses Close navigation; Tab reaches New conversation; Escape closes the drawer
and returns focus to Open navigation. Width and scrollWidth are both 390. The
updated host was restarted against the same isolated data; draft, candidates and
selection remain. Browser errors/warnings were empty and viewport was restored.

final result: passed
