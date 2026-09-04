# Drawloom agent guide

This file is a map, not a complete manual. Read the closest `AGENTS.md` for the
area you change.

## Read first

1. `README.md`
2. `ARCHITECTURE.md`
3. The applicable ADRs in `docs/adr/`
4. `DESIGN.md` when changing visual or user-interface design
5. The nearest nested `AGENTS.md`

## Non-negotiable rules

- Define or amend a contract before adding its implementation.
- Keep contract packages independent of provider packages.
- Make provider selection only in a composition root.
- Run the same conformance suite against every implementation of a contract.
- Parse and validate data at trust boundaries.
- Keep one authoritative home for each fact; link instead of copying.
- Update architecture, decisions, or knowledge records when their truth changes.
- Keep external dependency versions in the root Bun catalog; workspaces use
  `catalog:` for external packages and `workspace:*` for internal packages.
- Keep portable packages free of Bun, Node.js, Cloudflare, and Tauri ambient
  APIs. Cross host-specific behaviour through an explicit contract.
- Make complexity earn its place: apply the principles and decision test in
  `ARCHITECTURE.md` before adding material abstraction or lifecycle machinery.

## Area guides

- `packages/AGENTS.md`: package roles and dependency constraints.
- `docs/AGENTS.md`: ADR, plan, and reference-document conventions.
- `knowledge/AGENTS.md`: OKF profile and provenance requirements.

## Verification

Install the pinned toolchain dependencies and run the canonical gate from the
repository root:

```sh
bun install --frozen-lockfile
bun run check:ci
```

`check:ci` validates dependency policy, runs strict TypeScript checking, and
runs the Bun test suite. Add target-specific checks when a package first claims
Node.js, Cloudflare, or Tauri compatibility; do not claim untested portability.
