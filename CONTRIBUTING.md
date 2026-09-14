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

## Dependency licensing

Follow the [permissive-dependency principle](ARCHITECTURE.md#decision-principles)
and [ADR 0026](docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md).
Before adding or updating a dependency:

1. Identify whether it is shipped, installed for users, or development-only.
2. Inspect the exact version's licence, bundled files and transitive dependencies;
   registry labels alone are not clearance. Model weights and runtimes are separate.
3. Product dependencies require approved permissive terms or reviewed MPL-2.0.
   MPL review must record exact versions, notices and source-availability obligations;
   changes to MPL-covered files remain under MPL. GPL/LGPL/AGPL and other unapproved
   copyleft terms, including runtime exceptions, are excluded. Record an explicit
   permissible dual-licence selection. Unknown/custom terms require maintainer
   review; contributors cannot waive the principle through an exception file.
4. Preserve required copyright/licence texts and applicable notices. Update the
   inventory and attribution records together. Acknowledgements are credit, not a
   substitute for legal notices. Independent downloads still require this review.
5. Run `bun run check:licenses`. Its installed-JavaScript checks supplement rather
   than replace target-specific native/archive review. Inspect the release artifact
   itself and record unresolved findings before claiming distribution readiness.

Development-only tools receive separate review; non-permissive tools must not
become required user runtimes or enter product bundles. Retained historical
experiments and evidence are not automatically adopted dependencies. Do not delete
publication evidence as part of licence remediation.

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
