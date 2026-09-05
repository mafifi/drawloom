# Publishing sources

- Read [EDITORIAL.md](EDITORIAL.md) before authoring or revising public-facing
  prose, scripts or captions. It owns the writing voice; `DESIGN.md` owns visuals.
- Group article, script/transcript, visuals and presentation material by piece.
- Editorial content is not an architectural decision. Link sources for factual
  claims and distinguish firsthand experience from illustrative scenarios.
- Never invent customer anecdotes or represent a spike as production Drawloom.
- Publication requires explicit authorisation. A build does not publish.
- Approved non-draft content deploys automatically after relevant changes reach
  `main`; keep unfinished pieces marked `draft: true`. Manual dispatch remains.
- Keep generated media/build output out of source history. Use root Bun catalog
  dependencies and never import retained spike modules from this directory.
- Selected, publication-approved screenshots may be retained in a piece's
  `assets/` directory with provenance. Inspect for private data first; do not
  commit an entire raw capture collection. The build copies only referenced assets.
- Approved reusable editorial artwork may be versioned under `site/public/artwork/`
  with source and prompt provenance. This exception excludes rendered video,
  posters, previews, UI mockups and site output, which remain ignored.
- Public editorial styling can differ from product UI; record visual decisions
  in the applicable `DESIGN.md`, not in architecture prose.
