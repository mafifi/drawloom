# Archify article diagrams — 6 September 2026

These are actual Archify renders, not manually styled HTML substitutes. The
author requested Archify after rejecting both the inline SVG inventories and
the responsive text-based figures. The four JSON sources alongside this record
are retained; generated HTML, screenshots and browser receipts remain ignored
under `publishing/.generated/archify-journal/`.

## Review boundary

The author approved the Drawloom diagram's layout and colours on 6 September.
Static vector renditions now replace all four article figures locally; nothing
has been published. They retain Archify's Classic geometry, with colours drawn
from the journal's actual CSS tokens: neutral paper, ink, forest green, slate and
grey rules. The palette is applied before rendering and validation. The offline
`export-static.mjs` extracts the vector and semantic styles, removes inert
interactive attributes, and includes no viewer scripts or remote resources.
This is a separate static export, not Archify's interactive export command.
Selected SVG artwork and hash provenance are under
`publishing/site/public/artwork/why-drawloom/`, using the approved editorial-artwork
exception. JSON remains authoritative; CI rejects stale source/theme/artwork.
The build needs no installed Archify or generated preview viewers. Each figure
has alt text and an enlarged vector link; Drawloom also has a text explanation.

The repaired Operator was subsequently available for a read-only overview capture,
now included in the article. A second detail capture was saved when the Mac became
available again. See [screenshot provenance](../screenshots.md). Archify's own browser-evidence
command remained available; rendered evidence was inspected with an image reader.

## Article integration verification

The local article at `http://127.0.0.1:4321/drawloom/articles/a-place-to-do-the-work/`
was checked through Computer Use's browser surface at actual 1280×900 and
390×844 viewports, plus the normal 771px app panel. All four SVGs loaded and were
visually inspected. The 1000px desktop Drawloom figure stays inside the viewport;
mobile reading has no horizontal overflow. Mobile diagram labels require the
enlarged view or the adjacent text explanation, not reading the thumbnail.

The enlarge link opened the full-resolution SVG. The native “Read the diagram”
disclosure opened and closed and exposed all eleven capability explanations.
The page title and content were correct, with no framework overlay or missing
images. A fresh isolated article tab reported no warnings/errors, including
after disclosure interaction. The older preview tab retained one unlocated
`animation` TypeError after navigating to the standalone SVG; it did not recur
on the fresh article. The article and exported SVG contain no executable scripts.

The final local build passed; the full repository gate passed 60 tests, and
the targeted publishing suite passed again after the final image-dimension edit.
Desktop/mobile review screenshots are ignored under
`publishing/.generated/article-archify-qa/`. Browser size overrides were reset.
Video playback, other browsers, tablet sizes and 200% zoom were not re-tested
in this diagram-only pass. No commit, push or deployment was performed.

## Meaning and sources

- `stack-2024.architecture.json`: public SvelteKit site hosted on Cloudflare
  Pages; separate SvelteKit administration using Firebase. This is deliberately
  not an exhaustive service inventory. In particular, public D1 authentication
  is omitted. See [historical evidence](../notes.md#historical-evidence-and-diagram-boundaries).
- `stack-2025.architecture.json`: separate public and `souphi-admin` apps,
  Cloudflare Pages and a shared D1 database accessed with Drizzle. The historical
  arrangement is the author's account, not proof from today's checkout alone.
- `stack-2026.architecture.json`: public and admin applications on Workers using
  Convex. The title refers to the development approach: the monorepo and its
  enforced checks are not invented runtime services or network hops.
- `drawloom.architecture.json`: the eleven logical capabilities accepted in
  [ADR 0005](../../../docs/adr/0005-partition-agent-platform-capabilities.md).
  The consuming workbench is outside that boundary. Model inference is distinct
  from agent execution. Policy, tools and sandbox remain separate. See also
  [ADR 0007](../../../docs/adr/0007-provider-neutral-agent-execution.md) and
  [ADR 0008](../../../docs/adr/0008-tool-execution-and-exposure.md).

The Drawloom arrows illustrate selected relationships, not a complete runtime
call graph or eleven deployable services. Orchestration coordinates work across
capabilities. Context also consumes instructions, policy and run input. Evidence
can come from every capability, not only tools. Returns are omitted. A provider
retains its transcript and inner agent loop; this is not Drawloom memory. The
application selects independently replaceable implementations. These caveats
must accompany the eventual article export, not disappear with viewer cards.

Unlabelled edges connect roles already described by their endpoint labels; they
do not imply an undocumented transport or protocol. The category icons are
Archify's generic visual vocabulary, not additional infrastructure requirements.

## Reproduce

Used the existing one-off Archify 2.17 clone at
`/tmp/drawloom-archify-YQaFgE/source/archify`, revision
`d8e4daf2610d512821365f41b139d874b29efe81`. No installation, brand fetches or new
Drawloom dependencies. The update checker reported current. The source installation
is unchanged; the local rendering helper themes a disposable copy of its template.

From the Drawloom root:

```sh
node publishing/a-place-to-do-the-work/diagrams/render.mjs /tmp/drawloom-archify-YQaFgE/source/archify --visual-check
```

## Delivery receipts

Shared results for all four final artifacts:

```text
diagram_type: architecture
validation: 9/9 showcase, 0 errors, 0 warnings
browser_evidence: passed
visual_review: passed
```

Browser evidence covers light-theme containment at 1440×900, 1600×1000,
1920×1080 and 2048×1320, plus light/dark captures at the smallest and largest
sizes. Separate perceptual review inspected all four final light captures at
1440×900 and the Drawloom dark capture at 2048×1320: labels fit, routes remain
distinct and nodes do not overlap. Dark-theme perceptual review is limited to
Drawloom; automated checks cover all four diagrams. This is not article-size,
mobile or export-interaction verification. The automated receipts correctly leave
`visualReview` pending; the visual-review claim above records the scoped image
inspection. One palette correction removed a hard-coded amber region tint; the
original geometry correction counts are recorded below.

### Drawloom

```text
output: /Users/afifim/Development/drawloom/publishing/.generated/archify-journal/drawloom.html
specification_sha256: c90727ff97e4f925d00c2eff6cbd8908e91fb46fc3d08ccb8133742ee807ed42
artifact_sha256: 23002791737e2d5387a00fba9379fd5bc8a8f732aa93e059bc9137442e6f12b1
correction_rounds: 2
```

Moved the diagnosed tool-request label, then compacted vertical spacing and
removed cards that repeated the accompanying prose to fix desktop overflow.

### 2024

```text
output: /Users/afifim/Development/drawloom/publishing/.generated/archify-journal/stack-2024.html
specification_sha256: c32f5fe539a243891064afa26e3f7545023d2b0a68c13f52e50d3fa57b6125d9
artifact_sha256: b00ab2e485afead6b3bf6adcc65da148e0c4ea7af9d72fc86c262bbc8645a493
correction_rounds: 1
```

Compacted vertical spacing to fix desktop overflow without shrinking labels.

### 2025

```text
output: /Users/afifim/Development/drawloom/publishing/.generated/archify-journal/stack-2025.html
specification_sha256: 18834e21e6e24012d76d180bf6fdb546e95ff4e2605a77d3b64fb7c9e319d54e
artifact_sha256: 146b62ff1d4caeb9048b9f99e441cde0eb1e224c6cba8d3a035d5d5a5a6b0a16
correction_rounds: 0
```

### 2026

```text
output: /Users/afifim/Development/drawloom/publishing/.generated/archify-journal/stack-2026.html
specification_sha256: 7a9613fa56a1656fa27ef9a2d63bc7f8ee9b5d2feeaf3e104b9f315ba8ff0b17
artifact_sha256: 6f2ea236d2679db5c8e42a8017b458587ba589f692b1f668695298c3a5276eb7
correction_rounds: 0
```
