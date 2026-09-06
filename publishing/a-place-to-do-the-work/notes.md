# Draft notes — not article copy

## Archify follow-up — 2026-09-06

The subsequent colour revision uses `diagrams/journal-theme.css` and
`diagrams/render.mjs` to apply the actual journal colour tokens before Archify
validation and delivery. The installed renderer is left untouched. The neutral
paper and green previews are in `publishing/.generated/archify-journal/`.
The author also authorised screenshots of the repaired Operator; the selected
annual-plan view is now in the article. See [capture provenance](screenshots.md).
A second selected story-detail capture is now included after the imagined episode
workbench discussion. Its caption identifies the working draft and staging test
conversation; it is not evidence that the treatment-video alternative was built.

The author rejected the real-text architecture figures described below and
requested actual Archify diagrams. Four source-backed Archify candidates now
exist for the three stack eras and Drawloom's capability boundaries. See
[previews, provenance and verification](diagrams/archify-review.md). They are
also the sources for the selected static vector artwork now embedded in the
article. The author explicitly approved the Drawloom diagram on 6 September.
Its layout and colours are unchanged. The old text-column figures are removed.
The map uses a wider desktop figure, an enlarged vector link and a native
collapsible text explanation; prose keeps its existing reading width.
No publication or commit was made during this follow-up.

## Editorial revision — 2026-09-06

The current local revision moves forward through summer 2024, spring 2025,
early 2026 and September 2026. The single co-created episode comes before the
month spent automating the series. Both timings remain the author's account;
the text explicitly distinguishes episode creation from system-building effort.
“Alongside that work” replaces the broad “Throughout 2026” retrospective.

Use workbench for the person's working surface, harness for the agent's
supporting instructions/context/tools/controls, and Drawloom for reusable
capabilities. Codex App Server and Claude Agent SDK remain distinct offerings.

The 2024 website/admin captures establish the first attempt. The public episode
shows the output; the programme view shows the fixed production path. The
current homepage capture is removed from the light-bulb section because it
shows the result, not the way of working. Its source file is preserved, but it
is no longer copied into new build output.

A real Operator screenshot is still pending. The running release application
was inspected on 2026-09-06; it showed a missing backend function and then a
fixture-labelled view. The author reported it broken and asked that article
work continue while they repair it. Do not publish either state as evidence of
a functioning workbench. No repair, business record change or agent dispatch
was attempted. A future capture should follow the explanation of a workbench,
labelled as a story-production example, not a tested treatment-video workbench
or a finished Drawloom implementation.

The old inline SVG inventories are replaced by responsive, real-text figures.
The three stacks are quiet chapter notes. The closing figure names all eleven
ADR 0005 capabilities once and explains the context, execution, authority and
evidence relationships. It keeps the workbench outside Drawloom, distinguishes
agent execution from model inference, and preserves provider-owned transcript
continuity per ADR 0007. Policy, tools and sandbox remain separate per ADRs
0005/0008. No new architecture or capability is inferred from this illustration.
Older diagram and screenshot statements below describe earlier revisions.

Verification: the revised figure assertions failed against the old SVGs, then
passed after replacement. Final `check:ci` passed 58 tests / 211 assertions,
with zero Astro errors, warnings or hints. The local draft build passed. Desktop
and 390px mobile figures were visually inspected; mobile document width stayed
390px and browser errors were empty. Local captures are in ignored
`publishing/.generated/editorial-review-2026-09-06/`. No commit or push was made.

Status: the author authorised public sharing of “Why Drawloom?” and integration
of the journal work on 2026-09-05. Article metadata now explicitly permits
publication. The selected five screenshots are retained in `assets/`; other
capture candidates remain local. Review history and limitations below describe
earlier stages and are not current publication restrictions.

The author rejected the first production-line-led draft and supplied the
personal chronology now leading the piece. Keep the spouse, business burden,
three attempts and missed lesson as the spine. The stack diagrams are quiet
chapter markers, not the thesis. The existing directory slug is retained to
avoid changing media paths while the article is still being reviewed.

## Historical evidence and diagram boundaries

- First-generation public source: `/Users/afifim/Development/DrSouphi`,
  `bfc25087aca4bd79a2a45db3f876bb176da9403c` (2025-11-18). SvelteKit with
  Cloudflare adapter in `svelte.config.js`; `src/auth.ts` also has D1-backed
  authentication. Calling the entire first stack Firebase would be misleading.
- First-generation admin: `/Users/afifim/Development/drsouphiadmin`,
  `fb51e5108b7bac79d5ec2e7d4264823149a61662` (2025-07-29). Firebase Auth,
  Firestore and Storage are wired in `src/lib/server/firebase/admin.ts`.
  The public site's D1 auth detail is omitted from the small v1 diagram; it is
  a simplified deployment summary, not an exhaustive service inventory.
- `src/lib/modules/Marketing/services/AIContentService.ts:14–39` in the old
  admin contains a sample payload and placeholder endpoint. This supports the
  article's narrow claim that parts of marketing remained unfinished, not a
  claim that every feature failed or that this code ran in production.
- The old admin dashboard `src/routes/+page.svelte:21–58` contains hardcoded
  demonstration records and counters. These are expressly labelled as sample
  data in the reconstruction and article caption, never clinic performance.
- The author corrected the second-generation repository to
  `/Users/afifim/Development/souphi-admin`: separate public/admin applications
  shared D1 data. The v2 diagram now reflects that account, not a fused app.
  The current checkout uses Workers/Convex; it does not independently confirm
  the historical D1 revision. No v2 screenshot or independent assessment that
  its code was unsalvageable is claimed.
- The v3 Workers/Convex diagram summarises the current projects monorepo. Its
  benefits are the author's assessment of the combined stack and development
  process, not a controlled benchmark proving one vendor caused the improvement.
- The closing map follows Accepted ADR 0005's eleven capability boundaries.
  Its four reader-facing groups do not add interfaces, services or sequencing.
  It is labelled intended architecture: no supported Drawloom runtime exists.
  Memory is not provider transcript management, policy is not sandboxing,
  and observability is not business authority.
- All four diagrams are authored inline SVG in `article.md`, with accessible
  titles and descriptions. No renderer, dependency, framework or public asset
  pipeline was added. They disappear with the draft route in a normal build.

## Google paper

Author-supplied source:
[The New SDLC With Vibe Coding](https://www.kaggle.com/whitepaper-the-new-SDLC-with-vibe-coding),
Addy Osmani, Shubham Saboo and Sokratis Kartakis. The embedded PDF identifies
itself as May 2026. Its directly observed viewer URL is
`https://drive.google.com/file/d/1IR7CddF_2FyQo_PdfBNTaEA50EGiVt2r/preview`.
Read pages 27–30 through the browser on 2026-09-05. Page 28 lists instructions
and rule files, tools, sandboxes/execution environments, orchestration,
guardrails/hooks and observability. The article paraphrases that list, without
adopting the illustrative 10/90 split as a measured finding.

The co-author's [companion explanation](https://addyosmani.com/blog/new-sdlc-vibe-coding/)
helped locate the relevant section. The paper itself was then inspected.
Open Design belongs to `nexu-io`; DeepSeek Harness belongs to `deepseek-ai`.
Neither is attributed to Google.

## Evidence and review boundary

- The month, twenty episodes and at-most-two-hour single episode come from the
  author's account in this conversation. Confirm whether the original episode
  was publication-ready and what work that time included. Do not silently turn
  this into an end-to-end measured production benchmark.
- The 50,000–100,000 versus at-most-10,000 lines comparison is the author's
  estimate. No scoped line count or finished alternative proves it. Keep its
  qualification beside the numbers; omit it if it distracts from the business
  story. Do not present it as a measured tenfold saving.
- Lower development effort, lower creation time and greater flexibility are
  the author's counterfactual assessment. The imagined workbench examples are
  proposals, not a tested Drawloom product or invented historical incidents.
- The market uncertainty is the author's account. Do not imply poor audience
  results, measured revenue loss or a failed campaign.
- This draft makes no clinical recommendations. Medical content review and
  approval remain necessary in either production approach.
- Provider claims were checked against the primary links in the article on
  2026-09-05. Product-level convergence is the author's interpretation. It does
  not establish that Claude Design uses Claude Agent SDK, or that a given
  Codex Security integration is publicly available through App Server.
- The original shared conversation was not needed as an additional factual
  source for this draft; the author's detailed account in this task supplies
  the opening story. Do not claim to have re-read the shared page this turn.

## Implementation evidence already inspected in this task

The read-only Treatment Episodes inventory used
`/Users/afifim/Development/projects` at `4debe2fef`. Paths below are relative to
that private source checkout, not dependencies of this public article. Recheck
before a technical appendix is published. Do not copy private code or operator
screens into the public piece without review.

- `packages/common/marketing/application/treatment-episode/TreatmentEpisodeOperatorCopy.ts`:
  canonical milestone names. Current workflow has 23 milestones. G0 is research,
  G1 the creative programme and G2 narration; M1 assembly precedes publication
  approval. The article deliberately describes the work without a code glossary.
- `packages/common/marketing/domain/treatment-episode/TreatmentEpisodeProgramme.ts`:
  capability spend reservations and episode ceiling. Reservations are not
  measured provider charges.
- `packages/convex-agentic/src/convex/capabilityAttempts/dispatch.ts`:
  persisted dispatch state, ambiguous submission handling and reconciliation.
  A timeout does not automatically authorise another paid submission.
- `packages/backend-souphi/convex/treatmentEpisode/transport.ts` and
  `transportProviders.ts`: capability routing and provider bindings.

The prior inventory found OpenAI text and image calls through Cloudflare AI
Gateway, Vertex Veo motion, Modal-hosted Higgs narration, and deterministic
FFmpeg assembly. Exact model pins belong in a reverified technical follow-up,
not this opening business argument.

## Visual story

Current screenshot candidates are indexed in [screenshots.md](screenshots.md).
Architecture candidates and code evidence are in
[diagrams/source-map.md](diagrams/source-map.md). Selection is still open; the
article does not embed those detailed system diagrams. The second draft embeds
three historical/current website screenshots and four small inline stack and
capability diagrams instead. These serve its revised chronological structure.

1. **The work:** a reviewed frame or clip from an actual episode. Confirm usage
   rights, whether people shown are synthetic, and publication approval first.
2. **What automation required:** a cropped operator screenshot beside a simple
   progression from research through scenes to master review. Use the new local
   screenshot inventory rather than the earlier temporary raw capture.
3. **Where the burden grew:** an explanatory diagram of a single paid request:
   submitted, result uncertain, check provider status before spending again.
   Label it an explanation, not an exact rendering of every production state.
4. **The alternative:** a clearly labelled proposed video workbench, showing
   sources, script, scene variants and a human choice. Do not imply it exists.

An initial animation could move from “brief → finished video” to the hidden
steps, then show the same useful tasks around a person reviewing the developing
episode. Keep automation visible in both versions. The difference is who
decides what happens next, not whether tools run at all.

The author subsequently approved screenshot capture and an infographic or
Remotion video, plus a one-off Archify subagent for architecture candidates.
Deployment and external publication remain unapproved.

## Local animation commands

Use the existing root toolchain; no additional dependencies or renderer service.
Generated output remains ignored. The still and animation share one composition.

```sh
bunx --no-install remotion studio publishing/site/remotion.tsx --no-open
bunx --no-install remotion render publishing/site/remotion.tsx EpisodeSteps publishing/.generated/media/a-place-to-do-the-work/episode-steps.mp4 --codec=h264 --concurrency=2
bunx --no-install remotion still publishing/site/remotion.tsx EpisodeSteps publishing/.generated/media/a-place-to-do-the-work/episode-steps.png --frame=840
```

## Local verification

Second-draft verification (2026-09-05): explicit draft build passed; the full
`bun run check:ci` gate passed 57 tests / 175 assertions, with zero Astro errors,
warnings or hints. Publishing tests check the revised title, four inline SVGs,
the capability-map text alternative, all three screenshot copies and exclusion
of the draft route/media from a normal build. `git diff --check` passed.

In the 1280px in-app browser, the opening, v2 stack/caption, current-site image
and full capability map were visually inspected. All three screenshot images
loaded, and there was no horizontal page overflow. Diagrams cap at 600px and
shrink with their container. A new mobile-width visual check was not completed
in this revision; do not inherit the earlier site's mobile QA as verification
of these new article figures. The existing animation was not re-rendered.

No commit, push, Pages deployment or production app mutation was performed.
At that review, v2 lacked a screenshot. The author has since resolved the
repository identity as `souphi-admin`; the historical D1 revision remains
unverified, not the identity of the project.

The superseded first draft was about 1,250 words. Its Astro check reported no errors or
warnings. The repository gate passed 57 tests after adding the new article's
copy-boundary media fixtures. A subsequent targeted publishing test verifies
the transcript anchor and both draft routes/media exclusions.

The 900-frame, 30 fps composition rendered successfully to a roughly 2 MB MP4;
the browser reports 30.059 seconds. The final still was visually inspected.
The embedded video loaded with no media error, played to the end, and paused
after restarting. The transcript link was checked against its actual target.
The existing Remotion warning about Zod 4.5.4 versus its preferred 4.4.3 remains;
no dependency versions were changed for this piece.

The architecture JSON and its source map are retained beside the article.
Generated HTML, validation receipts and screenshots remain local, outside Git.
Archify's one-off source checkout was revision
`d8e4daf2610d512821365f41b139d874b29efe81`; it was not installed as a skill or
added as a project dependency. Its checks establish diagram consistency, not
proof that the underlying business process is correct or cost-effective.
