# Spike agent guide

This guide applies under `spikes/`.

- Spike code is retained architectural evidence, not production code or a
  supported Drawloom API.
- Keep each spike tied to explicit ADR questions and link its authoritative
  result under `knowledge/evidence/`.
- Do not import spike modules from `apps/`, `packages/`, `scripts/`, or any
  future production surface. `bun run check:architecture` enforces this for
  TypeScript imports, including type-only imports.
- Spikes may reuse other spikes when the dependency is explicit and documented.
- Keep authenticated, provider-dependent, or model-dependent runs out of
  `check:ci`; put deterministic unit and contract tests in the canonical gate.
- Never commit credentials, provider identifiers, personal data, raw private
  transcripts, or unredacted protocol traces.
- Use temporary directories for runtime state and archive or delete remote and
  provider state created by a live run in `finally` cleanup.
- A passing spike is evidence for review. It does not accept an ADR or authorise
  copying spike code into a production package.
