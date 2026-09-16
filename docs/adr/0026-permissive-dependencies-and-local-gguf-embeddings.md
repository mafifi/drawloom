# ADR 0026: Permissive dependencies and local GGUF embeddings

- **Status:** Accepted
- **Date:** 2026-09-14
- **Accepted:** 2026-09-14 by the maintainer
- **Partially supersedes:** [ADR 0024](0024-local-knowledge-memory-and-retrieval.md), only its MLX-only embedding provider, Python/uv installation prerequisites and inference-hosting choice.

## Context

The licence inventory established that `mlx-embeddings==0.1.0` is GPL-3.0-only.
The Qwen weights and MLX conversion are Apache-2.0; MLX itself is MIT. Those are
different components with different terms. Separate user downloads do not remove
licensing obligations. The maintainer excludes unapproved copyleft product
dependencies, including runtime exceptions, to preserve adoption and distribution
freedom. On 2026-09-14 the maintainer explicitly permitted reviewed MPL-2.0
dependencies with their file-level source and notice obligations preserved.

MLX-VLM 0.7.0 has a native MIT Qwen implementation that passed an isolated GPU
smoke test. Its standard installation pulls in SciPy through MLX-Audio; the Mac
wheel contains GCC runtime libraries under GPL with an exception. It therefore
does not satisfy the selected policy. This is a product policy decision, not a
claim that every GPL exception imposes the same obligations as ordinary GPL.

llama.cpp provides a native Metal runtime and Qwen publishes an official Apache-2.0
GGUF. The [investigation](../../knowledge/evidence/adr-0026-gguf.md) pins the source,
model, test results and remaining limitations. Popularity is useful maintenance
evidence, not proof of correctness, licence clearance or performance.

## Decision

### Permissive product dependencies

Product dependencies, downloaded runtimes, model weights and their bundled and
transitive components require reviewed permissive terms or reviewed MPL-2.0.
MPL-2.0 is not a permissive licence: review must record exact versions, retain
notices and provide recipients access to the covered source, including any changes.
Its presence in Tauri's dependency graph is not itself a product blocker.
GPL, LGPL, AGPL and other unapproved copyleft terms are excluded, including
GPL-with-exception. An explicit permissible
alternative may be selected from a dual licence; a missing or custom licence is
unresolved, never implicitly approved. Development-only tools are reviewed
separately and may not leak into product artifacts or installation dependencies.

This applies to components Drawloom distributes or installs, not to every external
service or application a user independently authorizes. It does not expand plugin
permissions or require copying proprietary integrations into core. Historical
research evidence remains retained and identified as non-product material.

### Local embeddings

Replace the supported MLX/Python implementation with a persistent Node-supervised
llama.cpp process and Qwen3-Embedding-0.6B Q8_0 GGUF. The existing portable embedding
contract and worker embed/close boundary remain. Metal on Apple Silicon is the
initial supported configuration; other hardware retains text search, not an
unverified CPU or hosted fallback.

Pin runtime source `2f539596c6e9a977e91b6bc6344650422c6bc3b0` and official model revision
`370f27d7550e0def9b39c1f16d3fbaa13aa67728`. Compile a minimal static Metal server,
excluding embedded UI, subprocess support, OpenSSL and optional extra backends.
The audited archive carries licence notices and a checksum. Publication is a
separate maintainer decision; no invented download URL establishes readiness.

Use authenticated loopback transport with a per-process secret, explicit local
model path and embedding-only/offline operation. Tools, MCP, generation and model
discovery are not enabled. No second general-purpose hosting API is exposed by
Drawloom. The worker owns startup, cancellation, timeout and shutdown; uncertain
in-flight work requires process termination before another request starts.

Preserve query instructions, last-token pooling, L2 normalization, 1024 dimensions,
50 items/request, 2048 tokens/item and 8192 tokens/logical batch. Tokenize before
inference and serialize bounded requests. Allocate context headroom rather than
equating the server context size with the maximum allowed input. Validate result
indices/order, count, dimensions and finite values before publication.

### Installation and transition

Settings remains the explicit download/install entrypoint for runtime and model.
Neither is bundled with Drawloom. Preserve byte progress, cancellation, hash
verification and atomic readiness; no Python or uv prerequisite remains.
Unsupported or unpublished runtime setup is explicit, with text search available.

Never start the obsolete GPL worker. A new configuration fingerprint includes the
runtime, weights and formatting policy. Rebuild indexes from authoritative records
and switch atomically when ready. Never mix or reinterpret old vectors. Preserve
knowledge, source revisions, claims and historical evidence. Cleanup of verified
Drawloom-owned obsolete files is an explicit action, never global environment
cleanup or automatic deletion of user caches.

## Alternatives considered

**`mlx-embeddings==0.1.0`.** Evaluated and rejected: the licence inventory
established it is GPL-3.0-only, which the selected policy excludes.

**MLX-VLM 0.7.0.** Evaluated: its native MIT Qwen implementation passed an
isolated GPU smoke test. Rejected because its standard installation pulls in
SciPy through MLX-Audio, and the Mac wheel contains GCC runtime libraries under
GPL with an exception. This is a product policy decision, not a claim that every
GPL exception imposes the same obligations as ordinary GPL.

**Treating separate user downloads as outside the policy.** Rejected. Separate
user downloads do not remove licensing obligations.

**Popularity as evidence of suitability.** Rejected. Popularity is useful
maintenance evidence, not proof of correctness, licence clearance or
performance.

## Evidence

The maintainer accepted this architecture and authorised its implementation commit
on 2026-09-14, including reviewed MPL-2.0 dependencies and a reproducible build patch
rejecting generation endpoints. Acceptance is not runtime-publication approval or
a claim that the incomplete 100k stress proof has passed. Remaining release checks
and measured limitations stay explicit in the evidence record.


The linked evidence distinguishes source inspection, isolated smoke tests,
deterministic conformance, local integration and evaluation. Release verification requires
the canonical gate, licence artifact review, installer/rebuild recovery, bounded
input and process lifecycle tests, frozen retrieval comparison, 10k indexing and
100k stress checks with >=30 warm searches, memory and timing. Preserve the
existing 2-second p95 hybrid-search target at 10k records. Report failures as
blockers, not reasons to restore GPL code or tune frozen cases.

Known upstream reports include long-input Metal NaNs and heap corruption in an
older vendored runtime. Passing short tests does not resolve those reports.
General prompt-cache controls may not govern embedding tasks in the inspected
server; repeated and varied inputs must be reported separately. The replacement
requires a measured index rebuild and may consume more memory than the previous
worker. Initial timings are not directly comparable benchmark results.

ADR 0024 is **partially superseded** for the named runtime decisions only.
Its other knowledge and authorization decisions remain in force.

The implementation investigation found that upstream
`--embedding` still accepts authenticated `/completion` requests. The worker's
restricted API is not a server-level prohibition. The maintainer approved a small,
reproducible build patch rejecting generation endpoints, rather than relaxing that
boundary. Patch verification and archive provenance belong in the linked evidence;
archive publication still requires separate approval.

## Consequences

ADR 0024 continues to govern SQLite authority, evidence relationships, intake,
authorization, lexical/hybrid retrieval, Nightloom, assessment boundaries,
cross-project scope, OKF export and bounded context integration. No production
retrieval-value claim or enterprise-policy claim is added by this replacement.
