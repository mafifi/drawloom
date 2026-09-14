# ADR 0026 implementation

Status: accepted implementation checkpoint verified; release follow-ups retained. Date: 2026-09-14.

Implement the maintainer-approved ADR 0026 plan: permissive product dependencies,
llama.cpp/Qwen Q8 GGUF replacement, explicit Settings installation, preserved
knowledge/evidence, conformance and measured evaluation. The maintainer accepted
ADR 0026 and authorised its commit, reviewed MPL dependencies and the generation
endpoint rejection patch on 2026-09-14. No publication, private changes or GPL execution.

## Tasks

1. Runtime/installer: existing EmbeddingWorker interface; supervised authenticated
   loopback llama-server, Metal only, local explicit GGUF, no tools/UI/generation;
   finite normalized 1024-dim vectors, input token/byte/count budgets, cancellation,
   timeout, shutdown. Replace MLX/Python/uv supported setup. New fingerprint and
   resumable isolated rebuild. Verified runtime archive with no invented URL;
   consent, byte progress, cancellation, readiness and explicit obsolete cleanup.
2. Decision/policy: Accepted ADR 0026 partially supersedes ADR 0024. Principle,
   contribution/agent guidance, inventory, notices and
   dependency policy. Unrelated blockers visible, not silently replaced.
3. Integration/evaluation: current host and Settings; deterministic/shared tests,
   local real binary, frozen retrieval evaluation at 10k and stress at 100k,
   >=30 warm queries, cache distinctions, memory and timing. Canonical gate and
   review. Retain evidence and limitations.

## Progress and interface coordination

- Preflight: task 1 owns local-embeddings and runtime composition; task 2 owns
  policy/docs and licensing scripts; task 3 consumes their setup/model contracts.
  Runtime status changes must be carried into host/UI before completion.
- Ruling: use the current checkout and do not commit, as explicitly requested.
- Runtime artifact publication remains separate; local fixture installation
  proves implementation, not public release readiness.
- Initial worker source: llama.cpp 2f539596c6e9a977e91b6bc6344650422c6bc3b0.
  Official GGUF revision: 370f27d7550e0def9b39c1f16d3fbaa13aa67728.
  Existing investigation and binary: sibling llama.cpp/build-drawloom-audit.

## Settings interaction brief

Current verification checkpoint: runtime/installation and policy implementation
are present; both review passes completed with reported findings fixed. Real local
archive installation, managed host indexing/search/shutdown and 10k frozen-corpus
evaluation completed. Repeat archive checksum matches. 100k stress was interrupted
at 20,597 indexed records after the real server accepted a generation request in
embedding mode. The maintainer selected a minimal build patch, not a boundary
relaxation. All 100k knowledge records remain; test processes closed.
The maintainer approved reviewed MPL-2.0 dependencies and a reproducible generation
endpoint rejection patch. The final canonical gate passes. Two patched archives
match; all 12 generation routes reject, and real installed embeddings and managed
shutdown pass. See `knowledge/evidence/adr-0026-gguf.md`, not this progress note,
for authoritative measurements and limitations.

Use the approved Knowledge Settings composition (DESIGN.md), not a new screen.
Recipes: Loading and progress for setup; Guarded commitment for obsolete cleanup.
The user enables search by meaning through explicit Download and install, sees
actual byte progress and may cancel without losing knowledge. Unpublished runtime
is a durable explanation, not fake progress. VM owns pending/error/status; shared
buttons/progress own keyboard, touch, focus and reduced-motion feedback.
Repeated clicks are suppressed while pending. Cleanup is offered only for detected
owned obsolete files, with explicit confirmation naming the scope and preserved
knowledge. Cancelling confirmation makes no request; confirmed deletion reports
the authoritative result. No decorative animation. Verify consent/path rejection,
pending/re-entry/cancel/error, narrow layout and existing cached history continuity.
