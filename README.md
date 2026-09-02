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
- [`apps/`](apps/): private SvelteKit and Tauri composition roots.
- [`.agents/skills/`](.agents/skills/): repository-specific Agent Skills.
- [`scripts/`](scripts/): repository automation and mechanical checks.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before proposing a change.

## Status

No supported release exists yet. A private vulnerability reporting channel will
be configured before the first public release.

## Development

Drawloom uses the Bun version pinned in `package.json`:

```sh
bun install --frozen-lockfile
bun run check:ci
```

External dependency versions are owned by the root Bun catalog. See the
[dependency and package policy](docs/reference/dependency-policy.md) before
adding a workspace dependency.

## Licence

Drawloom is licensed under the [Apache License 2.0](LICENSE). Contributions are
made under the same licence and certified under the [Developer Certificate of
Origin 1.1](DCO).
