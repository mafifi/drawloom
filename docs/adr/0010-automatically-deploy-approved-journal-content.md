# ADR 0010: Automatically deploy approved journal content

- **Status:** Accepted
- **Date:** 2026-09-05
- **Decision owners:** Drawloom maintainers
- **Amends:** ADR 0009, publication trigger only

## Context

The author approved publishing the maintained journal and "Why Drawloom?" for
sharing, then explicitly requested deployment when public-site content changes.
ADR 0009's manual-only trigger was appropriate while the public site was a
placeholder. It is no longer the requested operating model.

## Decision

Run the existing GitHub Pages workflow on pushes to `main` affecting
`publishing/**`, `scripts/build-journal.ts`, root dependency files or the
workflow itself. Keep manual dispatch and the main-only guard. Unrelated product
changes do not trigger publication.

### What counts as approval

Publication approval is encoded in article metadata: `draft: false` plus a
quoted ISO publication date. Omitted draft status remains private. The production
build ignores inherited preview flags and excludes draft routes and media.

**Changing approved content on `main` is itself a publication action.**
Maintainers must review those changes accordingly.

### What the workflow does

Check out the repository, render the article's animation from source, build the
production artifact, and deploy it using the existing Pages actions. Selected,
reviewed screenshots may be retained beside the piece; rendered video and posters
stay out of Git. The synthetic proof and local design comparison are not
published.

## Alternatives considered

**A new hosting service or deployment branch.** Neither is needed. The existing
Pages workflow already does the work, and adding either would introduce a second
place where publication state lives.

**Incremental rendering infrastructure.** Rendering consumes CI resources on
every qualifying push, but the current small article does not justify
incremental rendering infrastructure.

## Evidence

Publishing tests cover the real article's inclusion and the synthetic draft's
exclusion from production pages and media. The workflow contract test covers
path filtering, the branch guard, renderer and build steps, and the artifact
destination.

Full checks and live deployment verification accompany the implementation rather
than this decision.

## Consequences

- Publication no longer needs a separate manual click.
- Changes to draft sources can trigger a rebuild but do not expose the drafts.
- Rendering uses CI resources on every qualifying push.
- Review discipline on `main` now carries publication consequences, because a
  content change reaching `main` publishes.
