# Architecture

## Current state

Drawloom currently contains its repository constitution and documentation
structure. No runtime or supported package API exists yet.

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

The exact initial capabilities will be established by later ADRs rather than
pre-created as empty packages.

## Planned repository topology

```text
.
├── .agents/skills/     # repository-specific Agent Skills
├── docs/
│   ├── adr/            # durable architecture decisions
│   ├── plans/          # bounded implementation plans
│   ├── reference/      # current technical reference
│   └── security/       # threat models and security design
├── knowledge/          # OKF-profiled evidence and provenance
├── packages/           # contracts, providers, runtime, and composition
└── scripts/            # repository automation and structural checks
```

## Standards

- Progressive `AGENTS.md` files provide local operating guidance.
- Agent Skills use the `SKILL.md` convention under `.agents/skills/`.
- Knowledge records follow OKF 0.2 plus the Drawloom profile.
- ADRs record durable architectural decisions.
- MCP and JSON Schema are preferred at external tool boundaries.
- `SECURITY.md` defines repository-wide security policy; deeper security design
  belongs under `docs/security/`.

Drawloom deliberately has no `CONTEXT.md`. Context that changes agent behaviour
belongs in `AGENTS.md`; product intent belongs in `DESIGN.md`; architecture
belongs here; provenance-bearing facts belong in `knowledge/`.

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
