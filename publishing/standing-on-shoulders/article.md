---
title: Standing on shoulders
description: Learn from the best, then build to last.
draft: true
---

When I started Drawloom, I had a long list of hard problems. How should an agent
remember what it learned? How do you decide who may see what? How do you keep a
full record of a conversation without slowing the screen down?

These felt like new questions. Most of them weren't.

Other people had already faced them, often in open-source projects anyone could
read. Some had solved them well. Some had solved them in ways that taught me
what to avoid.

So before we build anything, we look at how others did it.

<!-- ASK: Was there a moment you realised you were about to solve something another project had already solved? -->

## Read the code, then try it small

Our approach has four steps.

First, we find the best examples. We look for open-source projects that solve
the same problem, ideally in different ways. Two good answers that disagree
teach you more than one.

Second, we read their code. A project's website tells you what it hopes to do.
Its code tells you what it actually does.

Third, we try the idea in a small, separate experiment. We call it a spike. It
lives in its own corner of the repository, and nothing in Drawloom is allowed
to depend on it. If the idea doesn't work, we've lost little and learned
something useful.

Fourth, we decide what fits Drawloom best, and write the decision down.

We've published our studies of agent harnesses and workbenches, knowledge and
memory, evaluation and access control. Anyone can read them.

Agent workbenches were one of our first big studies. We looked closely at
two projects that approach the same job from opposite ends.

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) runs its own
agent, and owns everything around it. [Open Design](https://github.com/nexu-io/open-design)
builds a rich product around agents it doesn't own. We wanted to learn from
both without copying either whole.

That habit stuck. When we change how plugins connect to Drawloom, we first
compare how two reference projects handle the same thing. If they disagree, or
we want to go our own way, we stop and think again before writing any code.

Memory was another big study. Several projects had already worked out ideas we
needed.

[Graphiti](https://github.com/getzep/graphiti) showed us how to mark a fact as
out of date without erasing it. [HippoRAG](https://github.com/OSU-NLP-Group/HippoRAG)
showed how to remove a source along with everything learned from it.
[Hindsight](https://github.com/vectorize-io/hindsight) keeps the original
evidence separate from the summaries built on it.

None of those ideas came from me. They came from reading other people's work
carefully.

<!-- ASK: Which project's code surprised you most when you read it? -->

## Interfaces built to last

Learning from others shaped what we built. It also shaped how we built it.

I want Drawloom to be something you can build on for years. That means the
parts you depend on shouldn't change every time we change our minds about what
sits underneath.

So each capability in Drawloom has two halves. The first is an interface: a
clear description of what you can ask the capability to do and what you'll get
back. The second is an implementation that does the work.

Your workbench talks to the interface. It never needs to know which
implementation is behind it. The app chooses the implementation when it starts
up, in one place.

Codex is the agent Drawloom works with today. Because of this split, it doesn't
have to be the only one.

The same goes for memory and knowledge. Drawloom ships with storage on your own
computer. A developer can supply a different learning service, and the
conversation and knowledge screens stay exactly the same.

## Two engines behind one question

An interface is only as good as the second implementation behind it. With just
one, it's easy to shape the interface around that one without noticing.

Access control is a good example. Every time an agent reaches for some
knowledge, Drawloom has to ask a simple question. Who is asking, what do they
want to do, and to what?

That question already has a standard shape, from a group called OpenID. We
didn't invent our own.

To answer it, we tried two quite different policy engines.
[Cedar](https://github.com/cedar-policy/cedar) has its own policy language.
[Casbin](https://github.com/apache/casbin-node-casbin) uses a flexible matcher
you configure yourself. We ran both behind the same question, side by side.

Both could answer it. That told us the question was shaped around the problem,
and could outlive either engine. A small business can start with something
simple on one computer. A larger organisation can bring its own rules through
the same door.

## One set of tests for everyone

There's one more piece that holds this together.

Every interface in Drawloom comes with its own shared set of tests. They
describe how any implementation must behave, including what it should do when
things go wrong.

Every implementation runs the same tests. The one we ship does. So would one
you write yourself.

We could have let each implementation write its own tests. But then two
implementations could both pass and still behave differently. With one shared
set, "it works with Drawloom" means the same thing for everyone.

That's what lets you swap a part and trust the rest to carry on working.

<!-- ASK: Has a shared test ever caught a difference between two implementations that you'd otherwise have missed? -->

## Thank you

Drawloom is built on work that other people chose to share. I'm grateful for
every one of them.

Thank you to [Temporal](https://temporal.io/), which keeps long-running work
going through crashes and restarts. Thank you to [Tauri](https://tauri.app/),
which runs the Mac app, and to [Svelte](https://svelte.dev/), behind every
screen.

Thank you to [SQLite](https://sqlite.org/), which keeps your work on your own
computer. And to the [Model Context Protocol](https://modelcontextprotocol.io/),
which connects agents to tools.

Thank you to DeepSeek Harness, Open Design, Graphiti, Hindsight, Cedar and
Casbin, whose code taught us so much. And to
[OpenTelemetry](https://opentelemetry.io/), which helps us see what the agent
did.

Many more projects helped, and each one made Drawloom better. You'll find them
all on our [Investigations page](/research/).

<!-- ASK: Is there one project you'd like to thank personally, and why? -->

If you'd like to see where all this learning led,
[try the preview for Mac](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1).
