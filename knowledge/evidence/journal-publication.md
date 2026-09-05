---
type: source
id: journal-publication
title: Journal publication and automatic deployment evidence
status: active
created: 2026-09-05
updated: 2026-09-05
---

# Journal publication

The author explicitly authorised publication, integration and commit of the
current journal, followed by automatic deployment when public-site sources
change. [ADR 0010](../../docs/adr/0010-automatically-deploy-approved-journal-content.md)
records the trigger decision without rewriting ADR 0009.

Implementation commit: `c58c33a657f8b4da1acf01d8e9f9d2af587e1238`, fast-forwarded
into `main`. [Publishing run 33973096129](https://github.com/mafifi/drawloom/actions/runs/33973096129)
was triggered by **push**, not manual dispatch; build and deployment succeeded.

Frozen installation and the full local gate passed: 58 tests, 198 assertions,
zero Astro errors/warnings/hints. The real 900-frame EpisodeSteps animation and
poster rendered locally and in CI. CI repeated the full gate before deploying.
The existing Remotion/Zod preferred-version warning and GitHub action-runtime
deprecation annotation were non-blocking; they are not claimed resolved.

## Live checks on 2026-09-05

- [Homepage](https://mafifi.github.io/drawloom/) visually inspected in the in-app
  browser at 1280×720: neutral paper, custom heading font and woven artwork loaded.
- “Read the essay” opened [Why Drawloom?](https://mafifi.github.io/drawloom/articles/a-place-to-do-the-work/),
  with a publication date and no local-draft notice.
- All five article screenshots reported loaded with nonzero natural width.
- Native video playback advanced to 17.67 seconds; pause produced `paused: true`
  at 17.68 seconds. Duration was 30.059 seconds; no media error was observed.
- “Read transcript” reached `#transcript`; “Back to journal” returned home.
- The article's document width equalled its 1280px viewport. Browser error logs
  were empty. Mobile visual QA was local, not repeated against the live site.
- The synthetic example route, its MP4, and the old proof MP4 each returned 404.
  The selected programme screenshot returned 200.

This verifies publication and the stated interactions, not editorial fact
checking, clinical validity, every browser engine or a supported Drawloom runtime.
