# ADR 0006: Adopt evidence-led architecture principles

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decision owners:** Drawloom maintainers
- **Partially supersedes:** [ADR 0001](0001-repository-foundations.md), for
  ownership of principles and non-goals

## Context

[ADR 0005](0005-partition-agent-platform-capabilities.md) established clean
capability boundaries. The subsequent agent-execution design showed that a
contract-first architecture can still accumulate speculative abstractions,
types, lifecycle rules, and cross-provider semantics faster than evidence
requires them.

Drawloom needs explicit decision principles that protect its core goals without
making maximum abstraction or maximum type precision goals in themselves. The
principles must preserve type safety, provider choice, replaceability, and
accessibility while accounting for engineering time, cognitive load, runtime
cost, and developer velocity.

The repository also assigned product principles to `DESIGN.md`. Google's
[design.md specification](https://github.com/google-labs-code/design.md/blob/main/SPEC.md)
now gives that filename a precise and useful role as a machine-readable visual
design system. Keeping architecture principles there would conflate two
different responsibilities.

## Decision

### Make complexity earn its place

Drawloom chooses the simplest design that satisfies present, evidenced needs.
Additional abstraction, state, lifecycle, indirection, validation, or
generalisation is accepted only when its benefit is concrete enough to justify
its engineering, cognitive, runtime, and operational cost.

This rule governs the following five principles together. No single principle
is a mandate to maximise its concern regardless of the others.

### 1. Preserve useful type safety

Public contracts and trust boundaries use precise types and runtime validation
to rule out concrete invalid states. Type complexity must correspond to an
observable semantic, authority boundary, failure mode, or compatibility need.

Provider protocol details remain private to adapters. Drawloom does not encode
every theoretical state or create public variants solely to make an internal
implementation detail statically visible.

### 2. Support multiple models and providers from evidence

Portable contracts express the smallest shared semantics required by actual
consumers and demonstrated by real integrations. Provider-specific features
remain optional capabilities or adapter details until more than one
implementation, or a concrete consumer need, justifies promotion.

Multi-provider support means providers can differ honestly. It does not require
lowest-common-denominator behaviour, invented parity, or abstractions for
hypothetical providers.

### 3. Keep boundaries clean and replaceable

Contracts separate ownership, authority, and lifecycle where doing so allows a
capability or vendor to be replaced independently. Concrete providers are
selected in composition roots, and consumers depend on capability contracts.

A replaceable boundary does not imply a separate service, process, package, or
interface for every implementation detail. Drawloom introduces a boundary when
there is a real axis of change, trust boundary, testing seam, or ownership
distinction.

### 4. Keep a useful free or local path accessible

A layperson should be able to reach useful behaviour through clear defaults,
progressive disclosure, and free-tier or local implementations where the
capability permits it. The open core must not require a particular paid vendor
or specialist infrastructure merely to become useful.

This does not promise that every provider, workload, or scale is free. It
requires that cost and operational prerequisites are visible and that advanced
deployment choices do not burden the simplest supported path.

### 5. Optimise for proportional efficiency

Drawloom treats implementation effort, conceptual surface area, latency,
resource use, provider spend, maintenance, and contributor comprehension as
finite resources. Prefer provider-native behaviour and existing platform
semantics when they preserve Drawloom's authority and replacement boundaries.

Do not duplicate transcripts, lifecycle machinery, event models, validators,
or state merely to make the system appear more general. Generalise after
evidence, optimise after measurement, and choose reversible decisions when
uncertainty is high.

### Apply a decision test

Before adding material architectural complexity, record concise answers to:

1. Which present user need, invalid state, trust boundary, or observed provider
   difference requires it?
2. Which principle would be violated by the simpler design?
3. What is the smallest change that preserves the required boundary?
4. Can the decision remain private, optional, or reversible until evidence
   improves?
5. What engineering, cognitive, runtime, and monetary costs does it add?
6. How will tests, a spike, measurement, or a second implementation verify that
   it earned those costs?

If two designs satisfy the five principles, prefer the simpler one. If the
principles conflict, the ADR or design records the trade-off rather than
silently treating one principle as absolute.

### Correct document ownership

`ARCHITECTURE.md` owns the current statement of architectural intent,
principles, non-goals, boundaries, and dependency direction. This narrowly
supersedes ADR 0001's assignment of product principles and non-goals to
`DESIGN.md`.

`DESIGN.md` owns the visual design system and follows Google's design.md
specification. Drawloom validates it with the specification's CLI in the
canonical CI gate. Undecided visual tokens are explicitly omitted rather than
invented for compliance. The format permits CSS colour forms including OKLCH,
but this ADR does not select a colour notation or palette.

## Implementation

- The five principles, decision test, foundation non-goals, and naming guidance
  are recorded in `ARCHITECTURE.md`.
- Repository maps and agent guidance point architectural questions to
  `ARCHITECTURE.md` and visual design questions to `DESIGN.md`.
- `DESIGN.md` is a minimal conforming visual design-system document whose
  undecided sections are explicit.
- `@google/design.md` is versioned in the root Bun catalog and consumed through
  a root `catalog:` development dependency.
- `check:design` runs `designmd lint DESIGN.md` and is part of `check:ci`.
- The existing Proposed agent-execution decision is renumbered from ADR 0006 to
  ADR 0007 without changing its decision content.

## Consequences

- Architectural reviews have an explicit reason to reject speculative
  complexity even when it increases generality or type precision.
- Type safety and provider neutrality remain important, but must be tied to
  concrete semantics and evidence.
- Free-tier and local accessibility become architecture constraints rather than
  future user-interface concerns.
- Decisions may remain provider-private or reversible for longer, reducing
  premature public API commitments.
- Architecture and visual design have distinct authoritative documents.
- The canonical gate gains one external lint tool and its installation cost.
- Existing and future ADRs should state why material complexity earns its place;
  they need not repeat the six-question test verbatim.

## Alternatives considered

### Maximise type safety and abstraction

This can eliminate theoretical invalid states but tends to expose provider
mechanics, expand public APIs, and spend disproportionate effort before
integration evidence exists.

### Design to the lowest common provider denominator

This appears portable but discards useful provider capabilities and encourages
false equivalence. Optional, evidenced semantics preserve honest differences.

### Keep principles in `DESIGN.md`

This preserves ADR 0001's original document map but conflicts with the adopted
visual design-system standard and makes the filename ambiguous.

### Keep the principles informal

Informal guidance would not provide a stable review test and would be easy to
ignore whenever a locally attractive abstraction is proposed.

### Enforce design export and diff workflows now

The design.md CLI supports more than linting, but Drawloom has no selected
visual tokens or downstream design artifacts to compare or export. Adding those
gates now would violate proportional efficiency.
