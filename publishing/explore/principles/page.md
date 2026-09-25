---
step: 1
title: Principles
question: What we care about
summary: The ten design principles behind Drawloom, what each means in practice, and a real decision each one shaped.
draft: false
---

Every design choice in Drawloom starts from the same ten principles. They say
what we care about before any code is written, so later choices can be checked
against them. This page explains each one in plain terms and shows a real
decision it shaped.

## The ten principles

The principles are listed in
[ARCHITECTURE.md](https://github.com/mafifi/drawloom/blob/main/ARCHITECTURE.md#decision-principles),
in the order below. An earlier decision record set out five; the ten are the
maintainer's current grouping and priorities.

### 1. Safety

Drawloom should protect your work, your data and your control over what the
agent does, by default. For knowledge and memory, Drawloom enforces who may read
what, but the rules themselves belong to you or your organisation. An agent or
plugin cannot give itself access by describing its own request favourably, and
missing information never quietly becomes permission
([ADR 0023](https://github.com/mafifi/drawloom/blob/main/docs/adr/0023-knowledge-memory-authorization-boundaries.md)).
The design follows published models for access decisions, but the record is
clear that this does not prove compliance with them.

### 2. Familiarity

It should feel like the AI tools people already use, and it should keep their
existing controls instead of replacing them. When an agent wants to run an
action that needs approval, Drawloom uses Codex's own review options, "ask me"
or "approve for me", rather than building a second reviewer, and it does not
change your global Codex settings
([ADR 0015](https://github.com/mafifi/drawloom/blob/main/docs/adr/0015-working-material-ownership-and-edit-approval.md)).
Screens are built from a widely used set of interface components
([ADR 0012](https://github.com/mafifi/drawloom/blob/main/docs/adr/0012-shared-ui-components-and-guidance.md)).

### 3. Vendor agnostic

No single company should become a dependency you cannot leave. Codex is the only
agent Drawloom supports today, and that is a starting point, not a permanent
requirement. Codex-specific details, such as how a conversation is resumed, stay
inside a small translating layer called an adapter, so the rest of Drawloom does
not depend on them
([ADR 0007](https://github.com/mafifi/drawloom/blob/main/docs/adr/0007-provider-neutral-agent-execution.md)).
Providers are allowed to differ honestly; Drawloom does not pretend they all
behave the same.

### 4. Open standards

Where an established format or protocol exists, use it before inventing one.
Plugins show their own screens inside Drawloom through MCP Apps, an existing
standard, rather than a custom connection. The project stays with that standard
until a concrete interaction proves it is not enough
([ADR 0013](https://github.com/mafifi/drawloom/blob/main/docs/adr/0013-plugin-boundaries-and-host-integration.md)).

### 5. Freedom of distribution and use

Anyone should be free to use and share what Drawloom ships. That means
permissively licensed dependencies, plus reviewed MPL-2.0 components, checked all
the way down: indirect dependencies, downloaded runtimes and model weights too
([ADR 0026](https://github.com/mafifi/drawloom/blob/main/docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)).
This principle had real costs. A working local search setup was replaced
because parts of it came under GPL terms. Later, the desktop app moved from the Bun runtime to
Node and pnpm, because Bun's compiled runtime carries LGPL code that Drawloom's
policy excludes
([ADR 0034](https://github.com/mafifi/drawloom/blob/main/docs/adr/0034-node-toolchain.md)).

### 6. Local offering

A solo developer should be able to start on their own computer, without paying
for hosted services first. Costs, downloads and setup should be clear before
anyone commits. When moving to Node, the project rejected the smallest option,
asking users to install Node themselves, because it would make the local start
harder. The app carries its own pinned copy instead
([ADR 0034](https://github.com/mafifi/drawloom/blob/main/docs/adr/0034-node-toolchain.md)).
The local search model is never bundled; you download it explicitly from
Settings
([ADR 0026](https://github.com/mafifi/drawloom/blob/main/docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)).

### 7. Don't over engineer

Every extra piece costs time to build, effort to maintain and effort to learn.
If no other principle or real need requires it, leave it out. The Node move
wrote no compatibility code for the old runtime, and it deleted converters that
had been written for users who did not exist
([ADR 0034](https://github.com/mafifi/drawloom/blob/main/docs/adr/0034-node-toolchain.md)).

### 8. Reuse

Use existing libraries and Drawloom's own capabilities when they meet the need.
When they do not, study proven tools before building. For running long tasks
that must survive a restart, Drawloom uses Temporal, an established workflow
engine, rather than writing another
([ADR 0021](https://github.com/mafifi/drawloom/blob/main/docs/adr/0021-local-temporal-orchestration.md)).
Changes to plugin interfaces must first be compared with two existing tools,
OpenAI's Rosalind and DeepSeek Harness
([CONTRIBUTING.md](https://github.com/mafifi/drawloom/blob/main/CONTRIBUTING.md#reference-led-changes-and-approval)).

### 9. Resiliency & testing

Changes, including changes made by agents, should be reliable. That means
checking data where it enters, testing whole paths including failure and
recovery, and measuring benefits instead of assuming them. Every implementation
of an interface runs the same shared tests, called conformance tests
([ADR 0004](https://github.com/mafifi/drawloom/blob/main/docs/adr/0004-standardise-capability-contracts.md)).
Testing also drove the Node move: under Bun, the tests could not run the code
that ships. Now they do
([ADR 0034](https://github.com/mafifi/drawloom/blob/main/docs/adr/0034-node-toolchain.md)).

### 10. Clear responsibility

Each part of Drawloom has one job, and it is written down what that part owns
and may decide. Parts use each other through their interfaces instead of
redoing or taking over each other's work. For example, the part that
coordinates work calls the others in order, but it does not take over their
decisions
([ADR 0005](https://github.com/mafifi/drawloom/blob/main/docs/adr/0005-partition-agent-platform-capabilities.md)).
In the same spirit, approving an agent's action is not the same as accepting the
finished work.

## Four questions before adding complexity

The principles favour the simplest design that meets them. Before adding
anything more complicated, ARCHITECTURE.md asks four questions:

1. What problem have we actually seen?
2. Why does the simpler option fall short?
3. What will the change cost?
4. How will we test it?

The same document adds a guard in the other direction. Saving code is not a good
trade if it removes needed protection or makes the product hard to use.
[ADR 0006](https://github.com/mafifi/drawloom/blob/main/docs/adr/0006-evidence-led-architecture-principles.md)
keeps a longer six-question version of this test.

## When principles pull against each other

They do conflict. ADR 0006 says no single principle should be pushed as far as
it will go regardless of the others. When two conflict, the decision record
states the trade-off openly.

The records show what that looks like. Temporal's local server is officially for
development use. The maintainer accepted it for the local version anyway, and
the record says plainly that it does not give production guarantees
([ADR 0021](https://github.com/mafifi/drawloom/blob/main/docs/adr/0021-local-temporal-orchestration.md)).
In the Node move, the smallest option lost to the local-start principle.

This is where the next steps come in. What is still open becomes a
[question](/questions/). How we looked into it is under
[investigations](/research/), and what we chose is recorded as a
[decision](/decisions/).

## Go deeper

- [ARCHITECTURE.md: Decision principles](https://github.com/mafifi/drawloom/blob/main/ARCHITECTURE.md#decision-principles)
- [ADR 0006: Evidence-led architecture principles](https://github.com/mafifi/drawloom/blob/main/docs/adr/0006-evidence-led-architecture-principles.md)
- [ADR 0026: Permissive dependencies](https://github.com/mafifi/drawloom/blob/main/docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)
- [ADR 0034: Run and ship Drawloom on Node](https://github.com/mafifi/drawloom/blob/main/docs/adr/0034-node-toolchain.md)
- [CONTRIBUTING.md: Reference-led changes and approval](https://github.com/mafifi/drawloom/blob/main/CONTRIBUTING.md#reference-led-changes-and-approval)
- [All decision records](https://github.com/mafifi/drawloom/tree/main/docs/adr)
