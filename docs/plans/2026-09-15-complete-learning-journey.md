# Complete learning journey

Status: implementation and bounded verification complete; ADR 0027 accepted on
2026-09-15. Publication and release remain separate.

## Delivery

Implement supported capture, curation and automatic knowledge preparation in
packages and the desktop. Preserve data, grants, native history and existing
evidence. No commits, publication, model downloads or live model calls without
explicit approval. The approved conversation plan is the delivery specification.

## Tasks

1. Verify Codex input channels, then implement context preparation contracts and
   a supported knowledge-backed preparer with shared conformance. Eight records,
   12 KiB, exact revisions, access rechecks, cancellation and explicit outcomes.
2. Integrate preparation, first-use controls, 5s/2s deadlines, installed-runtime
   warmup, operation receipts and native-history-safe reference delivery.
3. Implement consented tool-owned outcome projection and durable intake recovery;
   retain status-only capture for other tools. Deduplicate maintenance evidence
   per request, not across independent assessments.
4. Present Knowledge used and settings controls using shared UI. Add actual
   embedding conformance and a separate isolated Temporal CI lane.
5. Run integrated acceptance and canonical checks; update guides and evidence.
   Live/model-enabled acceptance remains explicit, Apple Silicon/Metal only.

## Required regressions

Capture/curate/fresh-conversation recall; source recall; contrary, stale,
withdrawn and irrelevant evidence; denied metadata/body disclosure; restart and
interruption without repeat effects; fixed bindings; unavailable retrieval;
hostile bodies in both curation and foreground reading; installed-embedding
quality; revision-aware receipt invalidation; oversized reference-only entries;
native history reconstruction; disabling stops new disclosure without erasure.

## Decisions and progress

- Existing checkout retained on feature/complete-learning-journey. No worktree
  relocation or commits; this preserves the user's running development setup.
- Codex 0.153.4 generated schemas include `untrusted` and `application` for start
  and steer. Schema acceptance is not proof of model-side trust semantics.
  Until semantic handling is verified, use the approved user-reference fallback.
- Oversized records get explicit metadata/reference-only entries, never silent
  body truncation. Disabling does not rewrite native history.
- Cross-assessment caching deferred: a fresh assessor must receive its evidence.
- Task 1: implemented and reviewed; shared tests pass. Authorization checks are
  per-record and point-in-time, not an atomic snapshot across external services.
- GGUF download authorized if needed; retained pinned files already verified
  through isolated installation, without changing the user's installation.
- Task 2: implemented and reviewed. Includes authenticated HTTP
  cancellation, execution changes during preparation and interrupted migration.
- Task 3: implemented and reviewed, including evidence-read receipts distinct
  from display metadata and exact-bound maintenance deduplication.
- Task 4: UI controls and disclosure reviewed; browser checks passed. The real
  Nightloom/Temporal lane passes its expanded recovery checks and review,
  including the scheduler's next dispatch after an unresolved effect.
- Task 5: complete. Connected application, installed GGUF, real Temporal and
  bounded live Codex checks are recorded in the
  [verification record](learning-journey-verification.md). Original failures and
  model-quality limitations are retained. The final isolated canonical gate
  passed; the preceding contended run's timeout is not counted as a pass.
- Later maintainer approval permits ADR acceptance and a signed-off commit,
  not a push or release. The accepted relevance boundary permits related but
  incomplete evidence and requires missing-information guidance, rather than
  adding an answer-sufficiency classifier. See
  [ADR 0027](../adr/0027-complete-learning-journey.md) for the lasting decision.
