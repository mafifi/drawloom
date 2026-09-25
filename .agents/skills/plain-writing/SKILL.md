---
name: plain-writing
description: Use when writing or revising anything users read about Drawloom (website pages, journal essays and READMEs), and when briefing another agent to write them. Not for developer or agent documents such as ARCHITECTURE.md, CONTRIBUTING.md, reference guides, AGENTS.md, plans, decision records or evidence.
---

# Plain writing

The voice, the habits to avoid and the rules for each kind of document live in
[WRITING.md](../../../WRITING.md). Read it first. This skill is the routine.

## Before you write

1. Name the reader: a business leader, a developer, or both.
2. Name the kind of document. It decides what belongs in it. A website page says
   what Drawloom is and why. A guide tells the reader what to do.
3. Write one sentence saying what the reader should know or do afterwards.

## Write

- Start with that sentence. Leave out anything that doesn't serve it.
- Put detail behind a link rather than on the page.
- Use the words in WRITING.md's "Words we use".

## Check

1. Read it aloud. Rewrite anything you wouldn't say to a person.
2. Cut every sentence that talks about the writing, its honesty or its limits.
3. Run `pnpm run check:voice` and fix what it reports.

## Briefing another agent

Give it WRITING.md, the reader, the kind of document and the one sentence.
Don't ask a writer of website or marketing pages to cite sources, list what was
tested or be candid about limits. That brief produces caveats, not copy. Check
facts yourself, separately. Edit the draft before anyone else sees it.
