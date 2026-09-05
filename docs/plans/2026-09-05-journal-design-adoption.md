# Journal Design Adoption Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this
> plan task-by-task after approval. Steps use checkboxes for tracking.

**Lifecycle:** On 2026-09-05 the author explicitly authorised publication for
sharing and integration/commit of all journal work. Tasks 1–2 are implemented;
Task 3 is executing. Earlier local-only constraints below record the staged
adoption boundary, superseded only by this explicit publication approval.
The author then requested automatic publication for public-site changes. Accepted
ADR 0010 replaces the manual-only trigger with relevant pushes to `main` while
retaining draft exclusion and optional manual dispatch.

**Execution:** One site implementer owns code/configuration, one artwork worker
owns only the illustration/provenance, and a verification worker owns read-only
review and browser checks. The parent works with the author on article content.
Use the existing checkout on a feature branch; preserve the uncommitted design
and plan. Do not create additional workspaces or branches in child agents.

**Preflight ruling:** The existing placeholder test requires that `publishing/site/`
contain only `index.html`, which conflicts with creating the Astro source there.
Preserve the stronger invariant: the deployable placeholder artifact must contain
only that unchanged HTML file. If necessary, stage it explicitly in a separate
ignored directory and update the test/manual workflow's artifact path together.
This does not authorise deploying or switching the workflow to the new journal.

**Goal:** Adopt the selected editorial direction as a small, reusable Drawloom
journal, preserving comfortable reading and deliberate publication.

**Architecture:** Keep piece-owned Markdown and Remotion sources in `publishing/`
and implement the maintained static Astro site in `publishing/site/`. Retain the
ADR 0009 experiment as evidence, not an imported implementation. Keep the existing
coming-soon deployment until the journal and its first article are approved.

**Tech stack:** Existing root-catalog Astro, Bun and TypeScript; Remotion renders
video and posters at build time. No new reader-side framework or service.
Svelte is not needed for the current journal and is deferred, not installed.

**Spec:** [Publishing DESIGN.md](../../publishing/DESIGN.md), constrained by
[ADR 0009](../adr/0009-repository-backed-visual-publishing.md) and
[publishing guidance](../../publishing/AGENTS.md).

## Visual brief

The approved appearance, reference provenance, tokens, typography, imagery,
responsive guidance and accessibility requirements have one authoritative home:
[publishing/DESIGN.md](../../publishing/DESIGN.md). Read that document before
implementing this plan; do not maintain a second token list here.

## Global constraints

- No production module imports from `spikes/`.
- External dependency versions remain in the root Bun catalog.
- GitHub Pages base is `/drawloom`; publishing remains manual and main-only.
- Keep `publishing/site/index.html` and its existing deployment unchanged during
  local adoption work. Build the future site to ignored `dist/`.
- Sample content is local-only and labelled illustrative. Real publication
  requires approved article text; do not invent Dr Souphi experiences.
- No autoplay. Use native video controls, poster, captions where speech requires
  them, and a visible text transcript. Decorative weaving remains static.
- No CMS, subscriptions, analytics, custom player, new design framework or new
  architectural ADR is needed for this visual adoption.

## Task 1: Establish the design system and reusable artwork

**Files:** Update `publishing/DESIGN.md` and `publishing/AGENTS.md`; create
`publishing/site/public/artwork/weave-hero.png` and
`publishing/site/public/artwork/README.md` after visual approval.

**Consumes:** The approved fused reference. **Produces:** One documented visual
system and one text-free homepage illustration.

- [x] Review the fused concept with the author before implementation (approved
  2026-09-05, with plain masthead separators and the fine-line homepage weaving).
- [x] Record the selected tokens, typography, responsive behaviour, horizontal
  imagery placement and anti-patterns in `publishing/DESIGN.md`.
- [x] Generate one standalone text-free wide fine-line woven hero illustration
  from the approved reference, not a screenshot crop containing UI. Inspect it
  at desktop and mobile size. Masthead separators use ordinary CSS borders;
  no banner asset is needed.
- [x] As part of adoption approval, narrow the generated-media rule explicitly:
  approved reusable editorial artwork may be versioned as source assets with
  provenance; rendered MP4s, posters, previews and site output remain ignored.
  Do not silently treat all generated media as a new source-asset exception.
- [x] Document the artwork's source, prompt, approved reference and intended
  crops. Keep decorative assets free of words and supply empty HTML alt text.
- [x] Run `bun run check:design` and inspect the artwork for moire, visible seams
  and illegibility at reduced sizes before proposing the design commit.

## Task 2: Build and verify the journal locally

**Files:** Create `publishing/site/astro.config.mjs`, `tsconfig.json`,
`src/layouts/Journal.astro`, `src/pages/index.astro`,
`src/pages/articles/[slug].astro`, `src/styles/journal.css`,
`src/content.config.ts`, and `scripts/publishing-site.test.ts`.
Update root `package.json` commands and publishing typechecks without removing
the spike's verification.

**Consumes:** Task 1's visual system and piece-owned Markdown.
**Produces:** A static home and article page with correct project-base URLs.

- [x] Define and validate the small article metadata boundary before rendering:
  title, description and explicit `draft` status (default true); publication date
  is required for published entries. Use directory slugs and an optional pair
  of video/poster paths only when a piece has media. Do not introduce a universal
  article/video/slides schema or require empty files.
- [x] Add failing output checks for the core publication boundary:

  ```ts
  expect(productionHtml).not.toContain('workbench-example');
  expect(productionFiles).not.toContain('articles/workbench-example/index.html');
  expect(previewHtml).toContain('Illustrative example');
  expect(articleHtml).not.toMatch(/\bautoplay\b|<script[^>]+react/i);
  expect(articleHtml).toContain('Read transcript');
  ```

  Build separate temporary production and explicitly enabled preview artifacts
  in the test setup. Test both absence from navigation and absence of draft files;
  an unlinked page is still public. Generated draft media must also be absent.
- [x] Implement the two templates and one stylesheet, with actual HTML text and
  real links. Omit mock-only notebook entries and About until real destinations
  exist. Use Astro's Markdown/content facilities, not custom Markdown parsing.
- [x] Configure static output with `site: 'https://mafifi.github.io'` and
  `base: '/drawloom'`. Build base-safe article, artwork and media URLs.
- [x] Add root `journal:build`, `journal:preview`, `journal:check` and
  `journal:render` commands. Preview changes directory before launching Astro,
  following the proven spike's relative-root lesson. Keep rendering output
  ignored and stage only media referenced by publishable pieces for production.
- [x] Run frozen installation, `bun run check:ci`, `bun run journal:check`, and
  local render/build tests. Verify that draft preview mode is never the deployment
  default and that the placeholder-content invariant still passes. The test's
  artifact-path expectation changed under the preflight ruling above.
- [x] Compare the local home and article against the fused reference at desktop,
  tablet and 390px mobile widths. Test 200% CSS zoom/reflow, keyboard focus, navigation,
  text contrast, no horizontal overflow, video play/pause/seek and transcript.
  Check that fine woven lines do not shimmer at small sizes and that the site
  remains readable with decorative images or JavaScript unavailable.
- [x] Record visual and interaction evidence; propose the implementation commit
  only after these checks pass. Keep the public deployment unchanged.

**Local result:** [design-qa.md](../../design-qa.md) records the independent
verification and limits. Native browser-menu zoom, physical mobile devices,
Safari/Firefox and screen-reader speech were not tested. The reusable artwork
uses PNG because the available encoders did not support WebP. The root catalog
adds `@astrojs/check` so `.astro` files are checked rather than silently skipped.
The Remotion/Zod compatibility warning remains; real render output was verified.
No commit or public deployment has been made.

## Task 3: Publish only after editorial approval

**Files:** Update `.github/workflows/publishing.yml`, replace
`scripts/publishing-placeholder.test.ts` with the approved journal publication
assertions, update `README.md` and `ARCHITECTURE.md` current-state descriptions.
Add a focused evidence record under `knowledge/evidence/` using its area guide.

**Consumes:** Verified templates and explicitly approved article sources.
**Produces:** The real journal deployment, excluding all drafts and proof media.

- [x] Obtain the author's real Dr Souphi lessons and review the first article.
  Keep its business thesis primary; do not substitute the synthetic proof.
- [x] Obtain explicit approval to replace the coming-soon site. Alternatively,
  stop after Task 2 with a fully reviewed local journal.
- [x] Change the manual workflow to check, render approved media, build and
  validate production output, then upload `publishing/site/dist`. Keep the
  main-only guard and existing Pages deployment permissions.
- [x] Run the complete repository and journal gates at final head. Commit and
  push only when requested, then trigger the manual deployment when authorised.
- [ ] Verify the live homepage and article, artwork and media under `/drawloom/`,
  working navigation/video, and 404s for retired proof and draft URLs. Confirm
  that public output matches the tested build and record the workflow run.
- [ ] Update current-state documentation without rewriting Accepted ADR 0009.
  Mark this plan complete and retain durable design facts in `publishing/DESIGN.md`.

## Approval boundary

The fused visual and local implementation scope, including the narrow
source-artwork policy, are approved. Article approval and public deployment
remain later, separate decisions. Svelte is deferred until a concrete
component need justifies it; the current scope uses Astro without that integration.
