---
type: evidence
id: adr-0023-authorization
title: Local AuthZEN-shaped decisions with Cedar and Casbin
status: draft
created: 2026-09-12
updated: 2026-09-12
---

# Short local authorization experiment

Related: [source comparison](../../docs/reference/authorization-survey/README.md),
[candidate boundary and commands](../../spikes/adr-0023-authorization/README.md),
[Archify map](../../docs/reference/authorization-survey/boundary.html).

The maintainer authorised source checkout, Archify and a short test before
selecting ADR 0023 interfaces. This does not implement production knowledge,
authorize a classification scheme or accept an ADR. No private material, live
model, identity service or remote policy service was used.

## Method and observed results

Defined the candidate single-evaluation boundary first, wrote failing cases
against deny-only stubs, then used the actual engines. The initial policy suite
had four expected allow failures; host enforcement then had eight expected
missing-behaviour failures. The final focused suite passes 36 tests with both
engines. The controlled engine-outage case uses a throwing test double; policy
decisions otherwise use real Cedar/WASM or Casbin.

Both engines allowed the entitled synthetic local user across two project names.
Both adapters denied inactive subjects, other tenants, insufficient clearance, missing
compartments, withdrawn/expired material, unsupported actions, malformed
attributes and forbidden model export. An explicit remote-processing permission
permitted export only while the other access conditions held.

The host fixture resolves identity, source labels and time itself. It ignores
caller-supplied attribute overrides and rejects a substituted subject. An allowed
claim body was read exactly once; subsequent denied reads did not invoke its
reader. A claim labelled public but linked to restricted evidence remained
restricted under the illustrative inheritance rule. Revocation, withdrawal or a
missing source denied subsequent access without restarting the engine. A change
to entitlement while evaluation was pending invalidated the earlier allow.
Cycles and failed evaluation did not expose content or trigger a retry.

Nightloom is represented by a `derive` operation acting for the synthetic owner:
local derivation can be allowed while exporting the same material to a remote
model is denied. No actual Nightloom/model run occurred. A production background
service identity and delegation still need a decision.

The host return value includes content after enforcement; it is **not** an
AuthZEN response extension. The engine decision itself uses `{ decision }`.
The Zod contract covers this tested envelope/profile, not every valid AuthZEN
extension or its complete HTTP/error/search semantics.

## Measurements

Raw receipts: [Bun](adr-0023-authorization-bun.json),
[Node](adr-0023-authorization-node.json). Four single-evaluation cases also ran
under Node; the 36-test Bun suite was not rerun as a Node suite.

Each process loaded both engines, performed 20 warmups and measured 100 allowed
checks. Initialization excludes module/WASM import and is not cold-start latency.
Results are local observations of these adapters, not a product benchmark.

| Runtime | Engine | Initialization ms | Warm median ms | Warm p95 ms |
| --- | --- | ---: | ---: | ---: |
| Bun 1.2.23 | Cedar 4.12.0 | 21.87 | 0.936 | 1.199 |
| Bun 1.2.23 | Casbin 5.43.0 | 1.74 | 0.045 | 0.074 |
| Node 24.20.0 | Cedar 4.12.0 | 35.97 | 0.849 | 1.059 |
| Node 24.20.0 | Casbin 5.43.0 | 0.93 | 0.037 | 0.063 |

CPU and sampled process RSS are retained in the receipts. They include runtime,
both loaded engines and preceding work; they are neither isolated engine memory
nor measured peak memory. Cedar reparses its policy/schema in the stateless path;
Casbin reuses a constructed enforcer. No pre-parsed Cedar tuning was attempted.
Published unpacked Cedar package size was about 13 MB, including multiple loading
targets; that is not the footprint of one deployed target. Casbin's package is
smaller but brings transitive dependencies. Root catalog pins are development-only.

## Limits and decisions to bring back

- This tests NIST-inspired subject/resource/action/environment policy evaluation;
  it is not a NIST-prescribed policy, compliance audit or certification.
- AuthZEN supplies the information model. HTTPS, authentication, batch/search,
  discovery, external provider interoperability and certification are untested.
- Source labels and lineage are trusted fixture data. The host does not establish
  their accuracy, discover missing dependencies or prove declassification safe.
- Restriction inheritance uses maximum sensitivity, union of compartments,
  earliest expiry and conjunction of active/remote flags. This conservative
  fixture policy is **not adopted by core**. Implementations or organisations
  supply these rules under Accepted ADR 0023. Confidence/tightness is unrelated.
- No previous disclosure is erased by revocation. Actual deletion, durable
  caches, indexes and materialized claims require lifecycle design.
- The fixture performs a synchronous body read and guards changed facts around
  an awaited decision. It is not distributed transaction or streaming enforcement.
- Read errors and invalid facts produce a safe fixture error; production must
  distinguish denial, unavailable policy and invalid input using agreed semantics.
- Missing labels deny access; there is no silent assumption that local means
  public. The local owner is explicit but no authentication flow was implemented.
- There is no supported package or running desktop change, no policy-authoring UI,
  background service, storage selection or additional permission bridge.

## Diagram verification

Archify checkout `c1443b31b496eebf4a68bf83151816c955ddb796` was unchanged.
Type: architecture. Deterministic delivery: 9/9 showcase checks, zero errors or
warnings. Automated Chrome evidence passed light containment at 1440×900,
1600×1000, 1920×1080 and 2048×1320 and light/dark endpoint captures.
An image-capable reviewer inspected the 2048×1320 light and 1440×900 dark images:
labels fit, no crossed connections, readable main path and balanced vertical use.
Visual review passed; correction rounds: 0. Automated and visual claims are separate.

- Specification SHA-256: `4062093999e0a921f3ea2e464cbc93b6dce0438b80c9808b71c2e96e2ac67e88` (2,374 bytes).
- HTML SHA-256: `81e8908c040440b784dee03028fb67cf240e3291d67d9546974820575383cd71` (803,438 bytes).
- [Browser receipt](../../docs/reference/authorization-survey/boundary.visual-check.json).

## Repository verification

The canonical `bun run check:ci` gate passed after the investigation: 710 tests
passed, five optional tests skipped, zero failures (3,544 assertions across 132
files). Node shared conformance passed as well. The gate includes the public
dependency, architecture and UI-policy checks. These results do not imply that
upstream Cedar, Casbin or AuthZEN test suites were run.

The maintainer accepted the enforcement boundary in
[ADR 0023](../../docs/adr/0023-knowledge-memory-authorization-boundaries.md) and
authorised committing the investigation on 2026-09-12. Acceptance does not promote
the fixture profile into core policy or claim production enforcement. No publication
or private-repository change is part of this work.
