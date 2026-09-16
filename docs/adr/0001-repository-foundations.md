# ADR 0001: Establish repository foundations

- **Status:** Accepted
- **Date:** 2026-09-02
- **Decision owners:** Drawloom maintainers
- **Partially superseded by:**
  [ADR 0006](0006-evidence-led-architecture-principles.md), for ownership of
  principles and non-goals

## Context

Drawloom is intended to become an open-source harness whose implementations can
be consumed by other repositories and deployed through different providers. The
repository needs to remain understandable as it grows, particularly to
contributors and coding agents working with bounded context.

Several emerging conventions overlap: progressive `AGENTS.md` guidance, product
and architecture documents, Agent Skills, OKF knowledge records, ADRs, security
policies, MCP tool boundaries, and provider-specific implementations. Without
explicit ownership, these conventions would duplicate or contradict one another.

## Decision

### One authoritative home for each kind of information

- `README.md` introduces the product and repository.
- `AGENTS.md` files provide progressive operating guidance.
- `DESIGN.md` owns durable product principles and non-goals.
- `ARCHITECTURE.md` owns the current system and dependency map.
- `SECURITY.md` owns repository-wide security policy and reporting guidance.
- `docs/adr/` owns durable architecture decisions.
- `docs/plans/` owns bounded implementation plans.
- `docs/reference/` owns current technical reference.
- `docs/security/` owns detailed threat models and security design.
- `knowledge/` owns provenance-bearing records under the Drawloom OKF profile.

### Progressive agent guidance

The root `AGENTS.md` remains a short map. Nested guides add only the rules needed
for their subtree. The closest applicable guide takes precedence when guidance
becomes more specific.

### Contract-first capabilities

Each capability begins with a provider-independent contract and shared
conformance suite. Implementations depend on that contract. Consumers also
depend on the contract, while composition roots select implementations.

Structural checks will eventually reject contract-to-provider imports,
consumer-to-provider imports, and providers that do not participate in the
shared conformance suite.

### Standards at their natural boundaries

- Agent Skills use the `SKILL.md` convention.
- Knowledge uses OKF 0.2 with stricter local metadata and linking rules.
- External tool interfaces prefer MCP and machine-readable JSON Schema.
- Public runtime data is parsed and validated at trust boundaries.
- TypeScript is the initial implementation language; additional languages
  require an ADR justified by a concrete boundary.

## Alternatives considered

**A root `CONTEXT.md`.** Rejected: its likely responsibilities are already
covered by the documents above, so it would create a second home for
information that already has one.

New standards are not adopted merely because they exist. A standard must fill an
unowned responsibility or explicitly replace an existing convention.

This record does not establish which alternatives to TypeScript, MCP or OKF were
weighed. Those were judgements at the time, not documented comparisons.

## Evidence

None. This decision predates the toolchain that would test it, and the record is
explicit that some of its rules cannot yet be enforced: the structural checks
described above were a stated intention rather than a working gate. Those gaps
must remain visible rather than being described as complete.

## Consequences

- Initial development spends more time defining contracts and verification.
- Provider implementations remain replaceable and independently testable.
- Documentation has explicit ownership, reducing contradictory context.
- Some repository rules cannot be enforced until the toolchain and CI exist.

This decision also obliges separate ADRs for at least: licence selection; the
package manager, build system and release model; the first capability contracts
and composition root; the initial sandbox and model-provider boundaries; and the
supported security and trust model.
