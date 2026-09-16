# Drawloom publishing site

This is the reference for anyone building or maintaining the Drawloom
publishing site — the journal and the Synaptic Shuttle landing page.

Production uses `https://drawloom.org/`, with root-relative assets and navigation.
The build emits `/schemas/1.0.0/plugin-extension.schema.json` directly from the
plugin contract, alongside `/oauth/client.json`. Loading plugins uses local
validation, not network schema retrieval. GitHub Actions owns deployment; no
`CNAME` file is needed in the artifact.

The site root is the Synaptic Shuttle product landing page. It is composed from
Svelte components that Astro renders into static HTML; no component uses a
`client:*` hydration directive, so the landing and its navigation need no client
JavaScript. Article pages remain Astro editorial templates and retain the journal
design system.

The Astro route is the landing composition root. It builds typed presentation
data and navigation actions, then passes them to `LandingPageView.svelte`; section
Views receive only the slice they render. Static copy and links therefore remain
replaceable without a stateful ViewModel class. Use the repository
`svelte-presentation-mvvm` skill when extending this boundary.

The decision map is a transparent raster artwork inside a semantic SVG. SVG text
anchors share its 1672×941 coordinate system, scale with the artwork, and expose
real links with CSS hover, focus and active states. A compact HTML list replaces
the overlaid labels on narrow screens.

Maintained article templates consume `publishing/<slug>/article.md` and an
optional `transcript.md`. The metadata boundary is defined in
[`src/article-metadata.ts`](src/article-metadata.ts); omitted `draft` means true.
Published entries require `draft: false` and a `published: YYYY-MM-DD` date.
Publication still requires editorial approval, independent of a successful build.

From the repository root:

```sh
bun install --frozen-lockfile
bun run journal:check
bun run journal:render
bun run journal:preview
```

The local preview includes drafts at `http://127.0.0.1:4321/`. Its example
is synthetic, visibly labelled and marked `noindex`. Reading requires no client
JavaScript. The current animation is silent; its visible transcript provides the
complete explanation. Spoken material must add captions before publication.

`bun run journal:build` produces production HTML in ignored `dist/`, excluding
draft pages and links even if `JOURNAL_DRAFTS` is inherited in the environment.
`journal:preview` explicitly enables draft output. Both builds copy only media
referenced by emitted HTML from ignored `publishing/.generated/media/<slug>/`.
The MP4/poster pair in metadata uses filenames relative to that directory; a
media-bearing piece must also have a transcript. The current `journal:render`
command renders the existing Workbench composition; add an explicit composition
and command when another piece needs a render.

Place a standalone `<!-- animation -->` between complete Markdown blocks to
render the metadata's video at that point in the story. At most one marker is
allowed, and it requires media metadata. With no marker the video follows the
article as before. The visible transcript remains at the end in both cases.
Articles are trusted repository-authored Markdown; the template splits the
glob loader's rendered HTML at this marker, not arbitrary remote HTML.

Production and preview output tests use isolated temporary artifacts and media
copy fixtures. Actual rendering and browser playback are separate checks.

The author authorised the journal and “Why Drawloom?” for publication on
2026-09-05. CI runs the canonical checks once. After success, it calls the
same-commit, main-only Pages workflow to run `bun run journal:render:article`
and `bun run journal:build`, then deploy
`publishing/site/dist`. The illustrative example remains a draft and is excluded.
Selected screenshots are retained in the piece's `assets/`; the build copies
only referenced files, preferring those sources to generated media.

`bun run publishing:placeholder` remains available to stage the original fallback
page. Pushes to `main` touching `publishing/**`, the build script, root dependency
files, the plugin contract sources or either workflow trigger deployment after CI
succeeds. Unrelated changes skip publication. Manual dispatch of **CI** on `main`
also publishes after its checks pass; the publication workflow cannot be dispatched
independently. Feature-branch pushes and local builds do not publish.
Only articles explicitly marked `draft: false` with a quoted ISO publication date
are emitted. New content stays private by default.
