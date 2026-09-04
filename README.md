# Drawloom

Drawloom is an open-source, contract-first harness for building and running AI
systems.

The project is at its repository-foundation stage. The first implementation
will begin only after its public contracts, dependency rules, and verification
strategy are documented.

## Principles

Complexity must earn its place. Drawloom balances useful type safety,
evidence-led multi-provider support, clean replaceable boundaries, an accessible
free or local path, and proportional efficiency. The authoritative principles
and decision test live in [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Repository map

- [`AGENTS.md`](AGENTS.md): short operating map for coding agents.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): architectural intent, principles,
  non-goals, current state, and boundaries.
- [`DESIGN.md`](DESIGN.md): visual design system in Google's design.md format.
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
