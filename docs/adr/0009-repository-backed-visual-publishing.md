# ADR 0009: Keep visual publishing sources in the repository

- **Status:** Proposed
- **Date:** 2026-09-05
- **Decision owners:** Drawloom maintainers
- **Amends on acceptance:** ADR 0003, only for the public editorial website

## Context

Drawloom needs articles, devlogs, videos and presentations that explain the
business reasons for its existence. The opening thesis is that purpose-built
workbenches powered by agent harnesses are a useful approach to complex business
AI: generation is only part of producing inspectable, revisable, approved work.
The first real article should start with the author's video-agent lessons from
Dr Souphi, not an ADR recap. Those firsthand details still require author input.

We need one small publishing proof before adopting a publishing platform. This
decision concerns source ownership, rendering and distribution, not editorial
claims, a final visual identity, or a new Drawloom capability contract.

## Proposed decision

### Keep each piece together

Use `publishing/<piece>/` for its Markdown article, animation source, transcript,
presentation outline and assets as needed. Do not require empty files for every
format. These are authored sources, not supported product packages. Keep one
authoritative source per fact; adapt the narrative for each format rather than
trying to mechanically generate every format from one universal content schema.

Keep the first site's implementation and validation in
`spikes/adr-0009-publishing/`. Existing no-import-from-spikes enforcement remains
in force. The spike may consume publishing sources; publishing sources must not
depend on spike modules. Promotion to a maintained site is a separate explicit
step, not a consequence of a successful deployment.

### Render a static article and reusable animation

Use Astro for the editorial HTML website and Remotion/React for local animation
authoring. Export an MP4 and a still from the same composition. Embed the MP4
with native browser video controls and a static poster. Provide an adjacent
text transcript; do not autoplay. Reading requires no client-side framework.

This is a narrow exception to ADR 0003's SvelteKit UI default, not a replacement
of it. Bun remains the package manager and command entry point; external versions
stay in the root catalog and exact resolutions in `bun.lock`. Astro and Remotion
may run on their supported Node runtime at build time. No product package gains
React, Astro, browser-renderer or publishing dependencies.

### Host the proof on GitHub Pages

Publish only the built, clearly labelled example to the public repository's
Pages site. Source is committed normally; generated video/poster/build output
stays out of Git history. A manually dispatched GitHub Actions workflow installs
the frozen dependencies, checks the repository, renders the media, builds and
validates the article, then uploads a Pages artifact and deploys it.

Use GitHub's Pages artifact/deployment actions with explicit root Bun commands
because this proof has a separate Remotion rendering step. Do not add an
automatic publication trigger: pushing source is not editorial approval to
publish it. Only the default branch may deploy. No deployment-branch machinery,
custom deployment service or long-lived credential is needed.

The full visual article website is the proposed canonical public reading home.
Substack for subscribers/distribution and YouTube for video remain proposals;
this ADR does not configure accounts, syndication, analytics or automated posts.

### Keep editorial assertions separate from infrastructure proof

The example is synthetic and labelled as such, with `noindex`. It is not a
Dr Souphi customer case study or a screenshot of a production Drawloom product.
The real opening piece needs firsthand details and a separate editorial review.
Codex Security and Claude Design can illustrate convergence in product shape,
not prove undocumented backend architecture. Codex App Server and Claude Agent
SDK are distinct integration offerings, not interchangeable APIs.

## Complexity and costs

The current need is one readable article and one reusable explanatory animation.
Static HTML plus rendered video avoids a runtime service, CMS, database, custom
player, universal publishing schema and cloud rendering bill. Astro adds one
build tool; Remotion adds React and a Chromium/rendering toolchain. Their value
must be demonstrated by a real build, shared video/still source, playback and a
live deployment. Hosting and rendering are replaceable without moving editorial
sources or affecting Drawloom contracts.

GitHub Pages has bandwidth/storage limits, and video rendering consumes local
CPU, disk and time. This proof is not a promise of free unlimited video hosting.
Remotion's applicable licence must be checked before organisational production
use. Longer video distribution can move to YouTube or another host without
changing the article's ownership model.

## Alternatives considered

- **SvelteKit for everything:** consistent with product UI, but unnecessary for
  this content-first static proof; it still would not replace Remotion's React
  renderer. Reconsider if real editorial requirements favour shared UI code.
- **React application with an embedded Remotion Player:** valuable for genuinely
  interactive explanations, but adds reader-side JavaScript and playback
  integration before interaction has been shown to improve the article.
- **Hand-written HTML only:** smaller dependency surface, but duplicates article
  layout and Markdown handling as soon as the next piece arrives. The spike
  checks whether a minimal Astro layout earns that small build-time cost.
- **Substack-only or a hosted CMS:** convenient distribution, but would not prove
  the intended repo-backed visual article and reusable source workflow.
- **A universal article/video/slides content engine:** premature abstraction;
  share composition assets and facts, not an invented publishing framework.

## Acceptance evidence

The retained spike must demonstrate reproducible frozen installation, strict
source checking, a real rendered MP4 and still, project-base-path-safe HTML,
readable mobile layout, accessible static fallback and transcript, working
play/pause/seek on the deployed site, and no import-boundary regression.

Record results and limitations in
[publishing evidence](../../knowledge/evidence/adr-0009-publishing.md).
Passing the proof makes this proposal ready for review, not automatically Accepted.

## References

- [Astro deployment guidance](https://docs.astro.build/en/guides/deploy/github/)
- [GitHub Pages configuration API](https://docs.github.com/en/rest/pages/pages)
- [Remotion rendering](https://www.remotion.dev/docs/cli/render)
- [Remotion still export](https://www.remotion.dev/docs/cli/still)
- [Remotion licence](https://www.remotion.dev/license)
