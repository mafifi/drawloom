# Writing guide

Drawloom has three voices, one for each kind of reader.

| Voice | For | Where |
| --- | --- | --- |
| **Publishing** | Visitors and users | The website and the journal |
| **Developer** | People building with or on Drawloom | READMEs, ARCHITECTURE.md, CONTRIBUTING.md and developer guides |
| **Agent** | Coding agents | `AGENTS.md` files, plans, working notes and skills |

Whichever you're writing, write for your reader.

## Publishing voice

For the website and the journal. This is where people meet Drawloom.

- **Clear and simple.** Short sentences. Everyday words. One idea per paragraph.
- **Confident.** Say what Drawloom is, what it does for you and why it's built
  that way. Don't hedge.
- **Personal.** Use "we" for the project and "you" for the reader.
- **Focused.** Say what matters, then stop. Put detail behind a link.
- **Explain, then name.** Describe an idea in plain words before you use its
  technical term.
- **No test results, limits, caveats or record numbers.** Save those for the
  developer and agent documents.

Journal essays are the author's own story, told the same way.
[publishing/EDITORIAL.md](publishing/EDITORIAL.md) covers essays in more detail.

Read it aloud. If you wouldn't say it to someone across the table, rewrite it.

## Developer voice

For READMEs, ARCHITECTURE.md, CONTRIBUTING.md and the guides developers use. The
[README](README.md), [ARCHITECTURE.md](ARCHITECTURE.md) and
[CONTRIBUTING.md](CONTRIBUTING.md) are the models.

- **Condensed and purposeful.** Length is fine when the reader needs it. Every
  sentence should earn its place.
- **Practical.** Tell the reader what something does, how to use it and where to
  go next.
- **Precise.** Use the right technical terms, and define them once.
- **Plain statements.** Say how things work. Leave test evidence and caveats to
  the decision and evidence records, and link to them when a reader needs them.

## Agent voice

For `AGENTS.md` files, plans, working notes, decision and evidence records,
research and skills. Write whatever the agents need: detailed context, hard-won
deductions, limits and open questions. These documents keep context from being
lost and stop work being rederived. No style rules apply.

## What to avoid

In the publishing and developer voices, avoid the habits that make writing sound
machine-made. `pnpm run check:voice` catches the most common ones: it fails on
the website and journal, and warns on developer documents.

- **Talking about honesty.** "To be honest", "we say so plainly", "the record is
  honest about its limits". Just say the thing.
- **Commentary about the writing itself.** "This page marks where the edge is",
  "a guard in the other direction", "that is the point of this section".
- **"Not X, but Y" by reflex.** "It is not a chat tool, but a workbench", "at
  her best as a doctor, not a salesperson", "not just the stack". Say what it
  is: "It's a workbench."
- **Stacked caveats.** "It does not prove…", "this is not a claim that…", "tests
  read are not tests run".
- **Hedges and test status.** "Deliberately", "genuinely", "my estimate, not a
  measured comparison", "not yet tested". State an estimate once, simply.
- **Inflated words.** Delve, leverage, seamless, robust, unlock, empower,
  cutting-edge, testament, tapestry, ever-evolving, crucially, furthermore.
- **On the website: record talk, em dashes, semicolons and long sentences.**
  No record numbers, code names, "claims" or "evidence records". Use full stops
  and commas, and keep sentences under 30 words.
- **Clever phrasing.** "Providers are allowed to differ honestly." If it needs a
  second read, rewrite it.

Words inside the app, such as button labels and messages, follow the rules in
[DESIGN.md](DESIGN.md#voice-and-naming).

## Before and after

| Before | After |
| --- | --- |
| Every project has an edge where what we know runs out. This page marks where that edge is for Drawloom today. | Drawloom is just getting started. These are the questions shaping what comes next. |
| Providers are allowed to differ honestly; Drawloom does not pretend they all behave the same. | Codex is the first agent Drawloom works with. More can follow. |
| Our release record is honest about its limits. Some steps have not yet been run there from a normal desktop session. | This is our first preview, and we'd love to hear what you think. |
| A contract-first harness for controlled, portable and inspectable agent work. | A free, open-source toolkit for building AI workbenches: apps where you and an AI agent work on something together. |
| That is my estimate, not a measured comparison with a finished alternative. | I think a workbench could have done the job in 10,000. |

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
