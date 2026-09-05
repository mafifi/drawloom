# Woven hero artwork

## Current source-matched asset

The active file is `weave-hero-neutral.png` (1689×931), an Image Gen edit of
`weave-hero-faithful.png` below. The author rejected the sampled pink paper
colour. Edit prompt: replace only pink paper with neutral #F8F8F6; preserve
thread geometry, green colours, framing and dimensions. The output was visually
inspected; earlier files remain preserved. Local master:
`/Users/afifim/.codex/visualizations/2026/09/02/01a06218-f36c-7660-9fde-633b4b5b7215/weave-hero-neutral.png`.

`weave-hero-faithful.png` supersedes the shallow illustration below. Generated
on 2026-09-05 with the built-in image-generation tool, using the author's exact
reattached approved image as the reference. Dimensions: 1689×931 pixels.

Reference: `/var/folders/9r/mrvfc4ss3lb8n9r2kwm5y3bc0000gn/T/codex-clipboard-656420de-7c9d-4a0e-b5b6-86ee51972068.png`.
Local generated master:
`/Users/afifim/.codex/visualizations/2026/09/02/01a06218-f36c-7660-9fde-633b4b5b7215/weave-hero-faithful.png`.

Prompt: faithfully isolate the left-page weaving illustration; flat #F8F5F3
background, sparse fine horizontal green/linen threads entering from the left,
broad dense upright ivory warp/green weft fabric rising to the upper-right,
pale fading lower edge, empty upper-left. No text, page separators, UI, thick
yarn, knots, narrow ribbons, or tangled strands.

The output was inspected by the asset worker and main agent. Preserve its full
aspect ratio and empty upper-left; it is a standalone decorative asset, not a
crop of page UI. This is implementation work for author review, not a new
claim of approval. Render with empty alt text.

## Superseded initial illustration

`weave-hero.png` was the initial reusable decorative source artwork for the
Drawloom journal homepage. It is text-free and should be rendered with empty
alternative text (`alt=""`). It is not article content and should not be reused
as an article banner.

## Provenance

- Generated on 2026-09-05 with Codex's built-in image-generation tool.
- Approved visual reference:
  `/Users/afifim/.codex/generated_images/01a06218-f36c-7660-9fde-633b4b5b7215/exec-f79b3b69-24f1-4276-a3c3-08d9825cf164.png`
- Preserved generated master:
  `/Users/afifim/.codex/generated_images/01a070a2-38ef-7f02-b465-ff19804080f3/exec-a51d0521-191b-4609-95af-1441820a870d.png`
- Source dimensions: 2023 × 777 pixels (approximately 2.60:1), RGB PNG.

The reference image was used only to guide the standalone fine-line weaving;
no page UI, typography, or article content was cropped into this asset.

## Prompt

> Create one text-free, very wide and low-height illustration of fine
> forest-green threads flowing horizontally from the left, staying sparse and
> orderly, then bending gently upward and interlacing into a delicate airy
> woven field toward the right. Use a flat warm ivory `#FAF7F0` background and
> dominant forest green `#244D40`, with subtle lighter sage strands. Preserve
> generous negative space above and crop-safe edges. Use restrained editorial
> fine-line ink/engraving styling. Exclude words, logos, UI, borders,
> photography, thick yarn, tangled ribbons, circuits, gradients, shadows and
> repetitive high-frequency checkerboard patterns that could cause moire.

## Intended crops

- Desktop: show the complete panoramic composition where practical.
- Tablet: preserve the sparse incoming threads and the transition into the
  woven field.
- Narrow/mobile: use a centered crop or `object-fit: cover`; it is acceptable
  to lose portions of both outer edges, but keep the central transition visible.
- Do not upscale beyond the source dimensions. Reserve the rendered aspect
  ratio to avoid layout shift and inspect reduced-size rendering for shimmer.

The requested WebP could not be produced because the available `sips` and
FFmpeg installations have no WebP encoder. The lossless PNG is therefore the
canonical repository asset.
