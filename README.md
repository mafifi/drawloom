# Drawloom

<img src="publishing/site/public/artwork/drawloom/mark.png" width="128" height="128" alt="Drawloom" />

Drawloom is an open-source harness for building AI workbenches: tools and
workflows tailored to a particular use case. It brings your tools together to
help you instruct, control and manage an AI agent.

It provides 10 core capabilities, implemented in Drawloom or delegated to
permissively licensed open-source software. These come together in a desktop
application that connects to your local AI agent—currently Codex.

To learn more about Drawloom, read the [Drawloom journal](https://drawloom.org/),
starting with [Why Drawloom?](https://drawloom.org/articles/a-place-to-do-the-work/).

Developers can use the built-in implementations or replace them through the
[foundation APIs](docs/reference/foundation-api.md), without rebuilding the rest
of the application.

## Core capabilities

- **Context:** Brings together the instructions, skills and information your agent
  needs, including guidance on how it should approach the work.
- **Tools:** The functions and MCP tools available for your agent to call when
  completing a user request.
- **Memory:** Helps your agent record and recall past events, so previous
  experience can inform future work.
- **Knowledge:** Builds and curates knowledge from recorded observations and
  outcomes. Revisits claims as new evidence arrives, keeping their supporting
  evidence and confidence assessments available for review.
- **Evaluation:** Helps you assess how an agent is performing. Use it to develop
  your workbenches, compare models and understand where results fall short.
- **Orchestration:** Helps you organise and delegate work through tasks and
  workflows, including work performed by agents. Supports retries and recovery
  after interruption.
- **Sandbox:** Uses the agent's execution environment to restrict where it can
  act and what it can access, helping it work safely.
- **Observability:** Lets you monitor your agent's activities, understand its
  behaviour and investigate problems.
- **Agent integration:** Connects Drawloom to your agent so you can send messages,
  direct its work and follow its progress. Currently supports Codex.
- **Policy and approval:** Puts you in control of what the agent is allowed to do.
  Approve actions yourself or entrust supported actions to the agent's review
  process.

## Principles

Drawloom is built on 10 design principles. They guide us to make it extensible,
with replaceable components and clearly defined, tested interfaces informed by
studies of existing tools.

We aim to make Drawloom safe and secure by default, use permissively licensed
open-source software, and give solo developers an accessible way to get started
locally. Drawloom is designed to work with different AI providers, although Codex
is currently the only supported agent integration.

The principles and key design decisions are documented or linked from
[ARCHITECTURE.md](ARCHITECTURE.md).

## Repository map

To help you navigate this repository, below are the key documents and folders to
review.

- [AGENTS.md](AGENTS.md): instructions for coding agents working in this repository.
- [ARCHITECTURE.md](ARCHITECTURE.md): architectural intent, principles and key decisions.
- [DESIGN.md](DESIGN.md): visual design system and brand voice in Google's design.md format.
- [SECURITY.md](SECURITY.md): security policy and guidance for reporting vulnerabilities.
- [docs/](docs/): architecture decision records (ADRs), plans, reference material and security design.
- [knowledge/](knowledge/): research findings and test evidence, with records of their sources.
- [packages/](packages/): Drawloom's reusable components, their interfaces and implementations.
- [apps/](apps/): applications that bring those components together, including the desktop app.
- [spikes/](spikes/): experiments used to test design choices, retained alongside their supporting evidence.
- [publishing/](publishing/): the public journal and website.
- [.agents/skills/](.agents/skills/): skills that guide coding agents working on Drawloom.
- [scripts/](scripts/): scripts for building, checking and maintaining the repository.

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change.

## Development

Drawloom pins its toolchain exactly: the pnpm version in `packageManager`, the
Node version in `engines`, and the Rust toolchain in
`apps/desktop/src-tauri/rust-toolchain.toml`.

```sh
pnpm install --frozen-lockfile
pnpm run check:ci
```

External dependency versions are owned by the root dependency catalog. See the
[dependency and package policy](docs/reference/dependency-policy.md) before
adding a workspace dependency.

To run the application from source, follow the
[desktop setup guide](apps/desktop/README.md).

## Licence

Drawloom is licensed under the [Apache License 2.0](LICENSE). Contributions are
made under the same licence and certified under the [Developer Certificate of
Origin 1.1](DCO).
