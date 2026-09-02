# Drawloom agent guide

This file is a map, not a complete manual. Read the closest `AGENTS.md` for the
area you change.

## Read first

1. `README.md`
2. `DESIGN.md`
3. `ARCHITECTURE.md`
4. The applicable ADRs in `docs/adr/`
5. The nearest nested `AGENTS.md`

## Non-negotiable rules

- Define or amend a contract before adding its implementation.
- Keep contract packages independent of provider packages.
- Make provider selection only in a composition root.
- Run the same conformance suite against every implementation of a contract.
- Parse and validate data at trust boundaries.
- Keep one authoritative home for each fact; link instead of copying.
- Update architecture, decisions, or knowledge records when their truth changes.

## Area guides

- `packages/AGENTS.md`: package roles and dependency constraints.
- `docs/AGENTS.md`: ADR, plan, and reference-document conventions.
- `knowledge/AGENTS.md`: OKF profile and provenance requirements.

## Verification

The repository has no executable toolchain yet. Do not invent passing checks.
When tooling is introduced, document canonical commands here and enforce them
in CI.
