---
title: What the agent remembers
description: Remember carefully, know the source, bring only what helps.
draft: false
published: '2026-09-25'
---

Every conversation with an AI agent starts from nothing. You explain the
project again. You repeat what went wrong last time. The agent is capable, but
it has no idea what you learned together yesterday.

I want an assistant that gets better at helping Souphi over time. It should
remember what worked for her audience, what failed and why. It should bring
that up when it matters, without being asked.

That sounds simple. It turns out to be three different jobs.

We gave each job its own word in Drawloom.

**Memory** is what happened. A tool ran and returned a result. A render failed
on a Saturday. Memory is a record of past work and what was observed along the
way.

**Knowledge** is what we've learned from it. It's built from memory and from
sources, such as the files in a Git repository. Each learning keeps a link to the
evidence behind it, including evidence that disputes it.

**Context** is what the agent sees in this conversation. It's a small set of
instructions and relevant material, chosen for the request in front of it.

Keeping these apart matters. If memory and knowledge blur together, a single
bad day becomes a rule. If knowledge pours into every conversation, the agent
drowns in things that don't matter.

## Remembering what happened

The first question is what to remember at all.

It's tempting to save everything. Every conversation, every tool call, every
word. We chose to remember less, on purpose.

A tool's developer can opt it in to keep a small observation from a successful
result. Our sample word-count tool keeps the count. It doesn't keep the text it counted.
Tools that haven't opted in record only whether they ran.

This is off until you switch it on. In Knowledge settings, you choose
**Remember useful tool outcomes**, then confirm what it will do. Saving the
choice alone isn't enough.

There's a second line we drew. Codex keeps its own history of each
conversation. Drawloom keeps a separate copy so you can scroll back through
your work. Neither of them is memory. Saving a conversation never turns it into
knowledge, and Drawloom never replays old transcripts to the agent.

## Learning from it, carefully

Observations are raw material. Something has to turn them into learnings.

That's Nightloom, Drawloom's background helper for knowledge. It takes a batch
of new observations and asks an assessor to review the evidence. Today that
assessor is Codex. Nightloom then saves the resulting learnings, each linked to
the observations and sources it came from.

The first time we tried this, I used a small made-up example. An agent was
asked whether to avoid Saturdays for a render job. With no memory, it said it
had nothing to go on.

Then it saw one Saturday failure. A fresh agent recalled that observation and
cited it. But it refused to call it a pattern. One failure, it said, wasn't
enough to avoid Saturdays.

Later, a Saturday success arrived. A separate agent, doing Nightloom's job in
that early experiment, revised the learning to cover both. The next agent
described mixed results, cited both observations and advised checking current
capacity.

That's the behaviour I want. An assistant that learns should also know how
little it knows.

Learnings change too. When a source changes, every learning that depends on it
is marked out of date straight away. When a source is withdrawn, Drawloom keeps
the record of where the learning came from. You can always see why the agent
believes something, and whether that reason still holds.

I wrote about where those ideas came from in
[Standing on shoulders](/articles/standing-on-shoulders/).

## Bringing in only what helps

Knowledge is only useful if it reaches the agent at the right moment. You
shouldn't have to remember which record to ask for.

When you turn on **Use knowledge in conversations**, Drawloom searches your
knowledge before each message. It adds up to eight relevant references
alongside your request. If nothing is relevant, it adds nothing.

Related isn't the same as useful. Our guide has an example I like. A record
about a museum's entrances is about the museum. It doesn't tell you who
designed it. So the agent is asked to read the evidence, use what it supports
and say when the answer isn't there.

The references go in as reference material. They're never treated as
instructions from you or from Drawloom. A **Knowledge used** note shows which
references came with each message, so you can check them yourself.

If the search is slow or unavailable, your message goes through anyway. Your
own words stay exactly as you typed them.

## Yours, on your computer

All of this lives on your own computer by default. Your knowledge sits in a
local database in your Drawloom folder. Similarity search runs on your Mac,
with a model you choose to download. Drawloom never quietly sends your text to
an online search service instead.

Each step needs your consent. Remembering tool outcomes,
curating knowledge and adding it to conversations are separate choices. Each
starts switched off. When you turn on automatic curation, Drawloom sends the
selected evidence to Codex for review. You confirm that before it happens.

Turning a choice off stops anything new. It can't pull back what was already
sent.

Knowledge belongs to you across your projects. Each learning remembers which
project it came from. Before any record reaches an agent, Drawloom checks again
that you're allowed to see it.

## An assistant that earns trust

An assistant that learns needs to remember carefully. It needs to keep track of
where every learning came from, and notice when that source changes. And in each
conversation, it should bring in only what helps.

That's what we've built into Drawloom, so every workbench gets it without
starting again.

Drawloom is free and open source.
[Try the preview for Mac](https://github.com/mafifi/drawloom/releases/tag/v0.0.0-preview.1),
or [read the decisions behind it](/decisions/).
