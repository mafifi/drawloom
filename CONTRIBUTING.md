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

Canonical development commands will be added after the initial toolchain is
chosen.
