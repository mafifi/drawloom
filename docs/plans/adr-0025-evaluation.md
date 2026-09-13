# ADR 0025 comparative proof sprint

Started 2026-09-12 20:21 UTC. Checkpoint about 21:21 UTC; stop by 22:21 UTC.
The user-approved plan in this conversation governs this retained public proof.
The [Proposed ADR](../adr/0025-evaluation-boundaries-and-comparative-proof.md)
records ownership, candidate boundaries, exclusions and later acceptance gates.

## Global constraints

- Existing checkout; preserve the uncommitted survey. No commits or publication.
- No live models, paid generation, private data, production state or model downloads.
- Dependencies root-catalog pinned; vendor execution under Node, Bun toolchain.
- Candidate contracts and executable code stay inside the retained spike.
- Network-denied runs, observed attempts, no vendor-internal patching.
- First sprint is comparison evidence, not accepted ADR or supported capability.

## Tasks and ownership

1. ADR and interface/proof matrix: root agent, documentation only.
2. Candidate contracts, shared tests, fixtures and adapters: implementation agent;
   write failing tests first, preserve native vendor scheduling.
3. Network-denied launcher and measurements: root agent; consumes the proof CLI,
   separate ownership from adapter code.
4. Review, canonical checks, measured evidence: root with scoped independent review.

## Preflight

| Task / shared boundary | Finding |
| --- | --- |
| ADR and implementation | Candidate fields may be refined from proof; no supported exports |
| Adapters and launcher | Agree one report-writing CLI before dispatch; no shared file edits |
| Cases and native hooks | Expected values must be removed from target access |
| Conformance and metrics | Tests assert real callbacks/effects, not vendor names in source |
| Reports and evidence | JSON is disposable; sanitized aggregate evidence only is retained |
| Existing checkout and skill defaults | User explicitly requires existing checkout and no commits |

## Delivery status

First sprint complete; awaiting maintainer review. Both adapters passed shared
conformance, the canonical public gate passed, and final narrow fixes received
targeted checks. Durable conclusions and limitations live in the
[evidence record](../../knowledge/evidence/adr-0025-evaluation.md), not this plan.
Keep the ADR Proposed and work uncommitted. Archive this plan after review.
