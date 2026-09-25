---
step: 1
title: Principles
question: What we care about
summary: The ten principles behind every Drawloom design decision.
draft: false
---

Drawloom is built on 10 principles. We use them to make every design decision,
from which libraries we use to how the app asks for your approval.

## Our 10 principles

1. **Safety.** Drawloom is safe and secure by default. It protects your work,
   your data and your control over what the agent does.
2. **Familiarity.** Drawloom should feel like the AI tools you already use. It
   works with the permissions and review controls you already have.
3. **Vendor agnostic.** You shouldn't be locked in to one AI provider. Codex is
   supported today, and Drawloom is designed to work with others.
4. **Open standards.** We use established formats and protocols before inventing
   our own, such as MCP for tools and MCP Apps for plugin screens.
5. **Freedom of distribution and use.** Everything Drawloom ships uses
   permissively licensed software, so you're free to use and share it. We check
   every dependency, including the ones inside other dependencies.
6. **Local first.** You can start on your own computer, without paying for
   hosted services. We tell you about costs and downloads before you commit.
7. **Don't over-engineer.** Complexity costs time, money and ease of use. If we
   don't need it, we leave it out.
8. **Reuse.** We use proven tools wherever they fit, such as Temporal for
   long-running work. Where nothing fits, we learn from the best before building
   our own.
9. **Resilience and testing.** Every part is tested, including what happens when
   things go wrong. Every replaceable part must pass the same tests.
10. **Clear responsibility.** Each part of Drawloom has one job. Parts work
    together without taking over each other's work.

## Principles in practice

Principles only matter if they change what you build. Two examples:

- **We changed our whole toolchain for a licence.** Shortly before release, we
  found that our JavaScript runtime, Bun, shipped code under a licence that
  didn't fit our policy. We moved Drawloom to Node.js rather than make an
  exception.
- **We didn't write our own workflow engine.** Long-running work needs to
  survive crashes and restarts. Temporal already does that well, so Drawloom
  uses it.

## Keeping it simple

Before we add anything complex, we ask four questions:

1. What problem have we actually seen?
2. Why doesn't a simpler option work?
3. What will it cost?
4. How will we test it?

## Learn more

- [Architecture and principles](https://github.com/mafifi/drawloom/blob/main/ARCHITECTURE.md#decision-principles)
- [Why we moved to Node.js](https://github.com/mafifi/drawloom/blob/main/docs/adr/0034-node-toolchain.md)
- [Our dependency licence policy](https://github.com/mafifi/drawloom/blob/main/docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)
