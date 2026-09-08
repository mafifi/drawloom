# Public/private boundary implementation plan

Status: Complete. Approved scope: create a private `drawloom-workbenches` sibling
and enforce the existing public-core boundary. Do not migrate products.

## Design

Public contracts, reusable implementations and conformance remain in Drawloom.
Private plugins, consumer compositions and product integration tests belong in
the sibling. Existing applications and backends remain in `projects`.
Dependency direction is private to public only, as established by ADR 0002.
Architecture review guards against domain bias; static checks guard known
private imports and source imports escaping the checkout. Neither is a complete
information-leak detector.

## Implementation

- [x] Add failing cases to `scripts/dependency-policy.test.ts` for private
  package dependencies in root, workspace and catalog declarations, including
  npm aliases and dependency-policy exceptions.
- [x] Add `scripts/architecture-boundary.test.ts`. Run the actual dependency
  cruiser configuration against synthetic checkouts with private imports,
  outside-checkout imports and allowed local imports. Verify nonzero exits for
  forbidden edges. Tests create and clean only their own temporary fixtures.
- [x] Extend `.dependency-cruiser.mjs` and `scripts/dependency-policy.ts` using
  one known-private package pattern in `scripts/public-boundary-policy.json`.
  Keep these checks in the existing `check:ci`; add no dependency or service.
- [x] Update `ARCHITECTURE.md`, root and area agent guides, application wording
  and `scripts/README.md`. Require explicit destination and publication review,
  contrasting use cases for new abstractions, and independent public CI.
- [x] Create the sibling with README, architecture and agent guidance plus
  ignore rules. No runtime scaffolding, copied product code or public licence.
- [x] Run `bun install --frozen-lockfile`, `bun run check:ci`, and
  `git diff --check`. Review the complete changes and commit with sign-off.
- [x] Create `mafifi/drawloom-workbenches` explicitly private, push its initial
  documentation and verify remote visibility and commit. Do not push public
  Drawloom or migrate any existing workbench in this task.

## Non-goals and follow-up

No plugin loader, contract changes, real patient fixtures, provider calls or
product migration. Public contract conformance stays public; private scenario
tests will be added with their consumers. Repo privacy is a hosting setting,
not a package manifest flag. Durable rules live in ARCHITECTURE.md and AGENTS.md.

## Evidence

The new rejection tests failed before enforcement was added. Installed-private
package coverage exposed the previous blanket node_modules exclusion; the
configuration now retains known-private package edges for validation. Relative,
absolute, aliased and symlinked outside-checkout imports are exercised.

`bun install --frozen-lockfile` made no dependency changes. The canonical gate
passed with 79 tests, including publishing checks. Independent review found a
nested node_modules matching gap; a failing regression reproduced it and the
rule was corrected before the final gate. GitHub confirmed the private
sibling's visibility as PRIVATE and its remote main matched the initial
documentation commit `31baf6d`. No existing product was migrated.
