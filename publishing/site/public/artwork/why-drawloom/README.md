# Why Drawloom? — architecture artwork

These four script-free SVGs are the selected editorial artwork for the article.
The author approved the Drawloom diagram's layout and colours on 6 September
2026 and requested integration. This uses the approved reusable editorial
artwork exception in `publishing/AGENTS.md`; no generated viewers, screenshots of
diagrams, or browser runtime are retained here. This public artwork directory is
not suitable for private draft assets.

Authoritative specifications, journal theme and reproduction commands live in
`publishing/a-place-to-do-the-work/diagrams/`. Run `render.mjs` against the existing
Archify 2.17 installation, then `node publishing/a-place-to-do-the-work/diagrams/export-static.mjs`.
The latter extracts the validated SVG and semantic CSS offline, removes inert
viewer controls, and fixes the article rendition to the light journal theme.
It does not redraw nodes or routes and is not Archify's interactive export UI.

The original HTML receipts cover the viewer, not this separate static export.
`provenance.json` binds these SVGs to their JSON source, theme, palette and
delivered HTML. The repository test rejects stale source or artwork hashes.
The article provides alt text, a full-size SVG link, and a text explanation of
all eleven Drawloom capabilities. Its wide desktop figure does not widen prose.

Archify: https://github.com/tt-a1i/archify
Revision: d8e4daf2610d512821365f41b139d874b29efe81 (MIT).
The accompanying licence covers the retained renderer-derived vector/CSS.
