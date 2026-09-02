# Drawloom

Drawloom is an open-source, contract-first harness for building and running AI
systems.

The project is at its repository-foundation stage. The first implementation
will begin only after its public contracts, dependency rules, and verification
strategy are documented.

## Principles

- Contracts precede implementations.
- Execution context is versioned, inspectable, and reproducible.
- Providers are selected at composition roots, not inside consumers.
- Knowledge carries provenance and lifecycle metadata.
- Security, evaluation, and observability are architectural concerns.
- The repository is designed to be legible to people and coding agents.

## Repository map

- [`AGENTS.md`](AGENTS.md): short operating map for coding agents.
- [`DESIGN.md`](DESIGN.md): durable product principles and non-goals.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): current state and architectural boundaries.
- [`docs/`](docs/): ADRs, plans, reference material, and security design.
- [`knowledge/`](knowledge/): OKF-profiled knowledge and provenance records.
- [`packages/`](packages/): contract-first product packages.
- [`.agents/skills/`](.agents/skills/): repository-specific Agent Skills.
- [`scripts/`](scripts/): repository automation and mechanical checks.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before proposing a change.

## Status

No supported release exists yet. A private vulnerability reporting channel will
be configured before the first public release.
