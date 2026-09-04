# Repository automation

This directory will contain deterministic repository maintenance and
verification commands, including structural dependency checks, documentation
link validation, OKF profile validation, and generated architecture views.

Product runtime tools do not belong here; they live behind contracts under
`packages/`.

Current checks:

- `bun run check:dependency-policy` validates root dependency authority,
  workspace protocols, package roles, runtime declarations, exceptions, and
  lockstep publishable versions.
- `bun run check:architecture` validates module-boundary rules, currently
  preventing every non-spike module from importing retained spike code.
- `bun run check:types` checks repository automation with strict TypeScript.
- `bun run test` runs the Bun test suite.
- `bun run check:ci` runs the complete current gate in CI order.
