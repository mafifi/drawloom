# Contributing

Drawloom is in its foundation stage. Contributions should make architectural
intent clearer before expanding implementation surface.

## Before changing the repository

1. Read the root `AGENTS.md` and the closest nested guide.
2. Read applicable ADRs.
3. Identify the contract affected by the change.
4. Add or update a bounded plan in `docs/plans/` for multi-step work.
5. Record durable architectural changes as a new ADR.

## Change expectations

- Do not couple a consumer to a provider implementation.
- Add conformance coverage with new contract behaviour.
- Keep documentation and knowledge links current.
- State what was verified and what remains unverified.
- Do not commit secrets, credentials, private prompts, or sensitive traces.

## Developer Certificate of Origin

Contributions must certify the [Developer Certificate of Origin 1.1](DCO).
Add a `Signed-off-by` trailer using Git's sign-off option:

```sh
git commit --signoff
```

The trailer certifies that you have the right to submit the contribution under
the repository's Apache-2.0 licence. It is not a copyright assignment.

Install dependencies and run the current complete gate from the repository
root:

```sh
bun install --frozen-lockfile
bun run check:ci
```

External dependencies are versioned in the root Bun catalog and referenced from
workspaces with `catalog:`. Internal packages use `workspace:*`. See the
[dependency and package policy](docs/reference/dependency-policy.md).
