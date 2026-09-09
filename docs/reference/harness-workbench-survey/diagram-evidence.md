# Diagram delivery evidence

Generated on 9 September 2026 with Archify 2.17 from the adjacent authored architecture specifications. No reference application or provider was run.

| Artifact | Deterministic validation | Browser evidence | Perceptual review |
| --- | --- | --- | --- |
| [DeepSeek](deepseek.html) | 9/9 checks; 0 errors, 0 warnings | Passed | Passed |
| [Open Design](open-design.html) | 9/9 checks; 0 errors, 0 warnings | Passed | Passed |

- Profile: `showcase`; static READ view.
- Source references: verified against the local, clean checkouts at the revisions recorded in the specifications.
- Automated containment: 1440×900, 1600×1000, 1920×1080 and 2048×1320.
- Browser captures: light and dark at 1440×900 and 2048×1320.
- Perceptual review: all eight captured images inspected. No visible clipping, label collisions or crossing confusion. The main path remains readable in both themes; comparison notes occupy the lower band.
- `browser_evidence: passed`
- `visual_review: passed`
- `correction_rounds: 0` after deterministic delivery. Before delivery, source validation required three revision passes: label placement/routing, simplification, and reduced horizontal spacing. These were authoring validation, not edits to a delivered artifact.
- Deterministic receipts and automated evidence are separate from this perceptual judgment. The automated JSON correctly retains `visualReview: pending`; it cannot make a perceptual claim.

## Byte-bound receipts

- [DeepSeek delivery receipt](deepseek.delivery.json) · [browser receipt](deepseek.visual-check.json) · [capture contact sheet](deepseek.visual-check.html).
- [Open Design delivery receipt](open-design.delivery.json) · [browser receipt](open-design.visual-check.json) · [capture contact sheet](open-design.visual-check.html).

The delivery receipts contain specification and artifact SHA-256 hashes, byte counts, composition status and source revision. Browser receipts bind their measurements to the same artifact hashes.

## Reproduce

Use the Archify 2.17 package rather than editing the generated HTML. For each specification:

1. Run `archify.mjs validate architecture <spec> --quality showcase --json --repo-root <reference-checkout>`.
2. Run `archify.mjs deliver architecture <spec> <html> --quality showcase --json --repo-root <reference-checkout>`.
3. Only after successful delivery, run `archify.mjs visual-check <html> --json`.
4. Inspect the generated images and record the new perceptual result separately.
5. Replace receipts together with changed artifacts. Do not retain old visual evidence for a new hash.

The local tool used was the existing MIT-licensed Archify package at `/tmp/drawloom-archify-YQaFgE/source/archify`, from [tt-a1i/archify](https://github.com/tt-a1i/archify). That temporary path is provenance, not a Drawloom dependency or a guaranteed installation location. The standalone HTML embeds its viewer; the repository does not depend on Archify at runtime.
