# Package agent guide

This guide applies under `packages/`.

## Package roles

Every package declares exactly one role in its package metadata when the
toolchain is introduced:

- `contract`: domain types, interfaces, boundary schemas, and conformance tests;
- `provider`: an implementation of one or more contracts;
- `consumer`: capability logic that depends only on contracts;
- `runtime`: orchestration and execution-context compilation;
- `composition`: concrete provider selection and wiring.

## Dependency constraints

- Contracts import neither providers nor composition packages.
- Providers import their contracts, not other providers.
- Consumers import contracts, not providers.
- Composition packages may import contracts and providers.
- Cross-capability behaviour goes through a contract instead of reaching into
  another package's internals.
- Shared code must have an explicit domain owner; do not create generic dumping
  grounds.

New capability work begins with its contract and failing conformance examples,
then adds providers and integration.
