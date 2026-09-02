# Package agent guide

This guide applies under `packages/`.

## Package roles

Every package declares exactly one role in its package metadata when the
manifest:

- `contract`: domain types, interfaces, boundary schemas, and conformance tests;
- `provider`: an implementation of one or more contracts;
- `consumer`: capability logic that depends only on contracts;
- `runtime`: orchestration and execution-context compilation;
- `composition`: concrete provider selection and wiring.

Every package also declares one runtime class under `drawloom.runtime`:
`portable`, `bun`, `node`, `cloudflare`, or `tauri`. A package may claim only a
runtime exercised by its verification suite.

## Dependency constraints

- Contracts import neither providers nor composition packages.
- Providers import their contracts, not other providers.
- Consumers import contracts, not providers.
- Composition packages may import contracts and providers.
- Cross-capability behaviour goes through a contract instead of reaching into
  another package's internals.
- Shared code must have an explicit domain owner; do not create generic dumping
  grounds.
- External dependencies use `catalog:` or an approved named Bun catalog.
- Internal Drawloom dependencies use `workspace:*`.
- Direct external versions and `*` are forbidden unless the root manifest
  records a specific, reasoned exception.
- Publishable packages use the root `drawloom.releaseVersion` until a later ADR
  adopts independent releases.
- Portable packages must not import or expose Bun, Node.js, Cloudflare, or Tauri
  runtime types.

New capability work begins with its contract and failing conformance examples,
then adds providers and integration.

Run `bun run check:dependency-policy` after changing any package manifest.
