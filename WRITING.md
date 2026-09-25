# Writing guide

This is how we write everything users read: the website, the journal and every
README. Write for a person, not for another agent.

Developer and agent documents can keep the detail they need. That includes
ARCHITECTURE.md, CONTRIBUTING.md, the developer reference guides, `AGENTS.md`
files, plans, decision records, evidence, research notes and skills.

## The voice

- **Clear and simple.** Short sentences. Everyday words. One idea per paragraph.
- **Confident.** Say what Drawloom is and does. Don't hedge.
- **Personal.** Use "we" for the project and "you" for the reader.
- **Focused.** Say what matters to the reader, then stop. Detail belongs behind
  a link.
- **Explain, then name.** Describe an idea in plain words before you use its
  technical term. Only use the term if it earns its place.

Read it aloud. If you wouldn't say it to someone across the table, rewrite it.

## What to avoid

These are the habits that make writing sound machine-made. `pnpm run
check:voice` catches the most common ones.

- **Talking about honesty.** "To be honest", "we say so plainly", "the record is
  honest about its limits". Just say the thing.
- **Commentary about the writing itself.** "This page marks where the edge is",
  "a guard in the other direction", "that is the point of this section".
- **"Not X, but Y" by reflex.** "It is not a chat tool, but a workbench." Say
  what it is: "It's a workbench."
- **Stacked caveats.** "It does not prove…", "this is not a claim that…", "tests
  read are not tests run". Keep limits for the documents whose job is limits.
- **Inflated words.** Delve, leverage, seamless, robust, unlock, empower,
  cutting-edge, testament, tapestry, ever-evolving, crucially, furthermore.
- **Internal labels in reader-facing text.** Record numbers, statuses and
  internal code names don't belong on the website.
- **Clever phrasing.** "Providers are allowed to differ honestly." If it needs a
  second read, rewrite it.

## By kind of document

- **Website and marketing pages.** What Drawloom is, what it does for you and
  why it's built that way. No test results, limits, caveats or record numbers.
- **READMEs.** Practical and short. Tell the reader what to do and where to go
  next. The [README](README.md) is the model.
- **Journal essays.** The author's own voice and story, told simply. Keep
  firsthand accounts true. [publishing/EDITORIAL.md](publishing/EDITORIAL.md)
  covers essays in more detail.
- **Words in the app.** Button labels, messages and screen text follow the
  voice and naming rules in [DESIGN.md](DESIGN.md#voice-and-naming).

## Before and after

| Before | After |
| --- | --- |
| Every project has an edge where what we know runs out. This page marks where that edge is for Drawloom today. | Drawloom is just getting started. These are the questions shaping what comes next. |
| Providers are allowed to differ honestly; Drawloom does not pretend they all behave the same. | Codex is the first agent Drawloom works with, not the only one it's built for. |
| Our release record is honest about its limits. Some steps have not yet been run there from a normal desktop session. | This is our first preview, and we'd love to hear what you think. |
| A contract-first harness for controlled, portable and inspectable agent work. | A free, open-source toolkit for building AI workbenches: apps where you and an AI agent work on something together. |

## Words we use

- **Drawloom:** a free, open-source toolkit for building AI workbenches, and a
  desktop app for Mac.
- **Workbench:** where you work with an AI agent: the result taking shape, the
  material you need and the controls to direct the work.
- **Harness:** the instructions, context, tools and controls an agent works
  with.
- **The 10 capabilities**, named as in the [README](README.md#core-capabilities):
  Context, Tools, Memory, Knowledge, Evaluation, Orchestration, Sandbox,
  Observability, Agent integration, and Policy and approval.

Use British spelling.
