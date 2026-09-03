# ADR 0004: Standardise capability contracts and conformance

- **Status:** Accepted
- **Date:** 2026-09-03
- **Decision owners:** Drawloom maintainers

## Context

Drawloom is organised around replaceable capabilities. Consumers must be able
to depend on a model, sandbox, memory, knowledge, tool, evaluation, or
observability capability without knowing which provider implements it.

TypeScript interfaces can describe provider behaviour during development, but
their types do not exist at runtime. Values arriving from configuration,
storage, networks, plugins, tools, and provider SDKs remain untrusted until the
running program validates them. Hand-maintained TypeScript types and validators
would also be free to drift apart.

Provider replacement needs behavioural evidence as well as matching method
signatures. If every provider invents its own test fixtures and expectations,
nominally compatible implementations can disagree on observable semantics.

The repository therefore needs one capability-agnostic contract standard
before choosing its first concrete capability. The standard should give human
and agentic contributors strong architectural rails without requiring
inheritance-heavy object-oriented design or a language-neutral interface
definition system before an external protocol needs one.

## Decision

### Keep ADR 0004 capability-agnostic

This ADR defines how every Drawloom capability contract is authored and
verified. It does not choose the first capability or invent a generic contract
whose semantics are not yet known. A later ADR will select the first capability
and apply this standard to it.

Each capability is organised as:

```text
packages/<capability>/
├── <capability>/       # contract, schemas, domain types, and conformance suite
├── <provider-a>/       # one implementation
└── <provider-b>/       # another implementation
```

The contract package has `drawloom.role: "contract"` and
`drawloom.runtime: "portable"`. Provider packages depend on the contract;
contracts never depend on providers.

### Express behaviour with TypeScript interfaces and composition

Public behavioural ports are TypeScript interfaces. They describe what a
consumer may ask of a capability and the observable result, without exposing a
provider's SDK, host bindings, persistence model, or internal state.

Interfaces define architecture; they do not require object-oriented
implementation throughout the codebase:

- classes may encapsulate genuinely stateful lifecycle behaviour;
- structurally compatible object implementations are equally valid;
- pure functions remain the default for stateless transformations;
- contract packages do not export abstract base classes or require inheritance;
- provider construction and selection remain responsibilities of composition
  roots.

Contract methods accept and return contract-owned domain values. Provider SDK
types are parsed and translated inside the provider package rather than leaking
through the public interface.

### Use Zod 4 as the runtime schema implementation

Zod 4 is the canonical runtime schema library for TypeScript capability
contracts. Its compatible version range is owned by the root Bun catalog.

Every value crossing a trust or serialization boundary starts as `unknown` and
is parsed by a contract-owned Zod schema before it becomes a trusted domain
value. Relevant boundaries include configuration, environment-derived values,
HTTP and MCP messages, persisted records, plugin inputs, tool calls, and
provider SDK responses.

For boundary values:

- the Zod schema is the source of truth for shape and runtime constraints;
- TypeScript input and output types are inferred from the schema rather than
  restated by hand;
- unsafe assertions such as `value as ContractType` do not replace parsing;
- schemas state their unknown-key behaviour explicitly;
- Drawloom-owned command and configuration inputs reject unknown keys by
  default, while a provider adapter may deliberately project the known fields
  from an extensible vendor response;
- normalization that is useful independently remains a named pure function;
  schema transforms are used only when their distinct input and output types
  are intentional and tested.

Purely internal values constructed from already validated domain values do not
need repeated parsing.

### Generate interchange descriptions only where needed

Zod schemas remain the TypeScript implementation source. When an external
boundary needs a language-neutral description, the contract exports or
generates JSON Schema from Zod's first-party conversion support.

Only semantics faithfully representable by the target JSON Schema dialect are
claimed at that boundary. Runtime-only refinements, transforms, or effects are
not silently presented as equivalent JSON Schema validation. Persisted or
externally exchanged formats receive an explicit schema identifier and version
when independent evolution or replay requires them; in-process values do not
receive ceremonial versions.

### Make failures part of the contract

Validation failures are normalized at the boundary that performs parsing and
must identify the invalid path without exposing secrets or raw provider
payloads. Expected capability outcomes are represented by contract-owned values
when consumers need to branch on them. Unexpected defects and infrastructure
failures may throw, but providers translate vendor-specific error types before
they cross the contract.

A contract documents for each operation:

- accepted input and produced output;
- expected domain failures;
- cancellation, timeout, and cleanup behaviour when applicable;
- ordering, idempotency, and retry semantics when observable;
- ownership and disposal of returned resources when applicable.

These requirements are added only when meaningful to that capability; empty
abstractions are not created for uniformity.

### Ship one shared conformance suite with each contract

Every contract package exports a provider-neutral conformance suite or suite
factory. It accepts only the provider factory and fixtures needed to observe the
public contract. Every provider invokes that same suite in its own tests.

The shared suite verifies observable semantics, including valid behaviour,
contract-owned failure behaviour, and relevant lifecycle guarantees. It does
not inspect provider internals or require every provider to use the same test
double. Provider packages add their own integration and vendor-edge tests in
addition to, not instead of, the shared suite.

A provider is not described as conforming until the shared suite runs against
it in a runtime the provider claims to support. Compilation or structural
assignability alone is insufficient evidence.

### Keep the public surface explicit

Each contract package has one documented public export surface. It exports only
the schemas, inferred domain types, behavioural interfaces, contract-owned
failure values, and conformance entry points consumers or implementers need.
Test-only fixtures that providers require for conformance may use an explicit
test export; unrelated internal helpers remain private.

Cross-capability behaviour depends on another capability's public contract. It
does not import package internals or combine unrelated capabilities into a
generic foundation package.

## Implementation

At acceptance, the root Bun catalog adds Zod `^4.5.4`, and the package guidance
records the schema, interface, and conformance invariants. Architecture and the
knowledge decision index link to this ADR.

No capability package is created by this ADR. The first capability ADR will
create the first contract package, provide the initial executable examples of
this standard, and add any mechanical contract-boundary checks that require a
real package graph.

## Consequences

- Boundary data has one executable source of truth instead of drifting
  TypeScript and validation definitions.
- Consumers and coding agents receive explicit interfaces and package
  direction, while implementations retain freedom to use classes, objects, or
  pure functions appropriately.
- Provider compatibility is demonstrated through shared behaviour rather than
  inferred from similar method names.
- Contract packages acquire a deliberate public dependency on Zod 4. Replacing
  it in exported schemas would require compatibility analysis and likely a new
  ADR.
- Runtime validation and conformance fixtures add code and test cost to each
  capability.
- Strict Drawloom-owned inputs catch misspellings and accidental fields early;
  provider adapters must explicitly choose when vendor response extensibility
  requires projection.
- JSON Schema consumers receive only the subset of contract semantics that can
  be represented faithfully.
- ADR 0005 can focus on the semantics of the first capability instead of
  reopening repository-wide contract mechanics.

## Alternatives considered

### Use TypeScript types and interfaces without runtime schemas

This is simpler at compile time but cannot validate external values because
TypeScript types are erased. It would move inconsistent validation into every
adapter.

### Maintain TypeScript types and validators separately

This avoids a schema dependency in public packages but creates two authorities
for each boundary shape and allows them to drift.

### Make JSON Schema or another IDL the source of truth

This gives stronger language-neutral generation but makes the initial
TypeScript developer experience and behavioural contracts more indirect. JSON
Schema remains available at boundaries that actually require interchange.

### Depend only on a library-neutral schema interface

A neutral interface could make the validator replaceable, but it would either
expose only a lowest common denominator or require Drawloom to build schema
tooling before concrete needs exist. Zod is adopted directly and may be
reconsidered from evidence.

### Require abstract base classes

Base classes can share implementation but would couple providers to inheritance
and confuse behavioural compatibility with code reuse. TypeScript interfaces
plus composition provide the required boundary with less constraint.

### Let every provider own its tests

Provider-specific tests are necessary but cannot demonstrate consistent
semantics across implementations. Shared conformance is therefore mandatory.
