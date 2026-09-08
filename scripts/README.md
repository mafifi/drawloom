# Repository automation

This directory will contain deterministic repository maintenance and
verification commands, including structural dependency checks, documentation
link validation, OKF profile validation, and generated architecture views.

Product runtime tools do not belong here; they live behind contracts under
`packages/`.

Current checks:

- `bun run check:dependency-policy` validates root dependency authority,
  workspace protocols, package roles, runtime declarations, exceptions, and
  lockstep publishable versions. It also rejects known private package names
  and aliases in root/workspace dependencies and catalogs, regardless of
  dependency-version exceptions.
- `bun run check:architecture` validates module-boundary rules, currently
  preventing every non-spike module from importing retained spike code, known
  private package imports, and analysed source imports outside the checkout.
- `bun run check:types` checks repository automation with strict TypeScript.
- `bun run test` runs the Bun test suite.
- `bun run check:ci` runs the complete current gate in CI order.

`public-boundary-policy.json` owns the known-private package pattern used by
both checks. `architecture-boundary.test.ts` runs the real checker against
synthetic allowed and forbidden imports. These gates do not detect copied
confidential content or decide whether a public abstraction is product-biased;
see [ARCHITECTURE.md](../ARCHITECTURE.md#enforcement-and-limits).
