# Architecture

## Current state

Drawloom currently contains its repository constitution and documentation
structure. No runtime or supported package API exists yet. Its decision
principles are established by
[ADR 0006](docs/adr/0006-evidence-led-architecture-principles.md), and its
platform capability partition by
[ADR 0005](docs/adr/0005-partition-agent-platform-capabilities.md). The first
concrete capability, provider-neutral agent execution, is accepted in
[ADR 0007](docs/adr/0007-provider-neutral-agent-execution.md).
Tool execution and exposure are accepted in
[ADR 0008](docs/adr/0008-tool-execution-and-exposure.md), supported by retained
conformance and Codex MCP integration evidence rather than a supported package.

## Architectural intent

Drawloom provides the infrastructure around a model that makes an AI workload
controlled, portable, inspectable, and reproducible.

Its architectural metaphor is a programmable loom: durable constraints and
run-specific inputs are composed into a traceable execution. The metaphor may
guide product language and visual identity, but public APIs use direct technical
names.

## Decision principles

**Complexity must earn its place.** Choose the simplest design that satisfies
present, evidenced needs. Extra abstraction, state, lifecycle, indirection,
validation, or generalisation must justify its engineering, cognitive, runtime,
and operational cost.

1. **Useful type safety.** Use precise types and runtime validation for concrete
   invalid states and trust boundaries, not for theoretical completeness.
2. **Evidence-led multi-provider support.** Express the smallest portable
   semantics demonstrated by real providers and consumers; keep differences
   optional or adapter-private until evidence supports promotion.
3. **Clean, replaceable boundaries.** Separate real ownership, authority,
   lifecycle, trust, and change axes without assuming each boundary needs a
   service, process, package, or interface.
4. **An accessible free or local path.** Provide clear defaults and a useful
   free-tier or local route where the capability permits it; expose cost and
   operational prerequisites instead of hiding them.
5. **Proportional efficiency.** Treat implementation effort, comprehension,
   runtime resources, maintenance, and provider spend as finite. Reuse safe
   provider-native behaviour, generalise after evidence, and optimise after
   measurement.

Before adding material complexity, ask what present need or observed difference
requires it, why the simpler option fails a principle, whether the choice can
remain private or reversible, what it costs, and how evidence will verify it.
If two designs satisfy the principles, prefer the simpler one. See ADR 0006 for
the complete decision test and trade-off guidance.

## Architectural layers

The target system separates these concerns:

1. **Contracts** define stable capability boundaries and conformance behaviour.
2. **Implementations** provide models, memory, knowledge, tools, sandboxes, and
   other capabilities behind those contracts.
3. **Runtime** compiles execution context and orchestrates controlled work.
4. **Composition** selects concrete providers for a deployment or distribution.
5. **Observability and evaluation** make runs inspectable and testable.
6. **Policy and governance** constrain execution and preserve an audit trail.

These are logical boundaries. They do not imply separate processes or services.

## Dependency rules

For a capability named `<capability>`:

```text
packages/<capability>/<capability>/          # contract and conformance suite
packages/<capability>/<provider-name>/       # implementation
```

- A contract package must not import an implementation package.
- An implementation package depends on and implements its contract.
- A consumer imports the contract, never a concrete provider.
- A composition root is the only place that selects concrete providers.
- Every provider runs the contract's shared conformance suite.
- Boundary data is parsed into contract-owned domain types.

ADR 0005 identifies the initial logical capabilities. Their exact contracts
and packages are established incrementally by focused ADRs rather than
pre-created as empty packages.

## Planned repository topology

```text
.
├── .agents/skills/     # repository-specific Agent Skills
├── docs/
│   ├── adr/            # durable architecture decisions
│   ├── design/         # detailed contract and adapter working designs
│   ├── plans/          # bounded implementation plans
│   ├── reference/      # current technical reference
│   └── security/       # threat models and security design
├── knowledge/          # OKF-profiled evidence and provenance
├── packages/           # contracts, providers, runtime, and composition
├── spikes/             # retained non-production architecture evidence
└── scripts/            # repository automation and structural checks
```

Spike code is not a product layer. It remains outside workspace package globs
and cannot be imported by production or repository automation; the architecture
check enforces that one-way isolation. Durable conclusions belong in indexed
knowledge records and ADRs rather than in spike implementation details.

## Foundation non-goals

- Building the user interface before the runtime contracts are understood.
- Mirroring the structure of a consuming monorepo.
- Introducing microservices or multiple implementation languages prematurely.
- Treating one provider implementation as the architecture.
- Creating generic `utils`, `shared`, or `tools` dumping grounds.

## Naming vocabulary

The product name is Drawloom. `Draft`, `weave`, `pattern`, and `thread` may be
used where they make the product easier to understand, but they do not replace
precise domain terms such as contract, provider, policy, sandbox, or trace.

## Standards

- Progressive `AGENTS.md` files provide local operating guidance.
- Agent Skills use the `SKILL.md` convention under `.agents/skills/`.
- Knowledge records follow OKF 0.2 plus the Drawloom profile.
- ADRs record durable architectural decisions.
- MCP and JSON Schema are preferred at external tool boundaries.
- `SECURITY.md` defines repository-wide security policy; deeper security design
  belongs under `docs/security/`.

## Implementation baseline

- TypeScript and ESM are the product implementation and publication baseline.
- Bun is the canonical repository toolchain and owns the workspace lockfile.
- The root Bun catalog is the only external dependency version authority;
  workspaces use catalog references for external packages and workspace
  references for internal packages.
- Portable packages support Bun and the declared Node.js range. Cloudflare
  compatibility is verified only for packages and compositions that claim it.
- Host-specific APIs remain behind contracts and are selected in composition
  roots.
- Capability behaviour is expressed through TypeScript interfaces. Zod 4
  schemas validate trust-boundary data and own its inferred TypeScript types.
- Each contract package ships one provider-neutral conformance suite that every
  implementation runs.
- Public packages release in lockstep until a later ADR changes the release
  model.
- SvelteKit is the default UI framework. Tauri may own a minimal Rust desktop
  shell, but core product contracts and capabilities remain TypeScript.

See [ADR 0003](docs/adr/0003-typescript-bun-and-portable-packages.md) for the
toolchain, portability, dependency, and release decisions, and
[ADR 0004](docs/adr/0004-standardise-capability-contracts.md) for the contract,
runtime-schema, and conformance standard. See
[ADR 0005](docs/adr/0005-partition-agent-platform-capabilities.md) for the
capability and ownership map,
[ADR 0006](docs/adr/0006-evidence-led-architecture-principles.md) for the
decision principles, and
[ADR 0007](docs/adr/0007-provider-neutral-agent-execution.md) for the accepted
agent-execution capability. See
[ADR 0008](docs/adr/0008-tool-execution-and-exposure.md) for accepted tool
execution and exposure semantics.

Drawloom deliberately has no `CONTEXT.md`. Context that changes agent behaviour
belongs in `AGENTS.md`; architectural intent, principles, non-goals, and the
current system map belong here; the visual design system belongs in
`DESIGN.md`; provenance-bearing facts belong in `knowledge/`.

## Public and commercial boundary

The public repository is the Apache-2.0-licensed core. Proprietary enterprise
products may implement and compose its public contracts from separate,
separately licensed repositories. Public Drawloom packages must never import or
require proprietary packages.

The open core owns runtime fundamentals, contracts, conformance suites, and
basic security, evaluation, observability, and self-hosting capabilities.
Commercial differentiation belongs primarily in organisational governance,
fleet operation, compliance, enterprise integrations, hosted services, and
support.
