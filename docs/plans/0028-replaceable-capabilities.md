# Replaceable learning, context, policy and approval presentation

Status: completed; ADR accepted and commit authorised on 2026-09-16. Baseline: clean `main` at `627c3a4`.
Branch: `feature/replaceable-capabilities`.
Decision: [Accepted ADR 0028](../adr/0028-replaceable-learning-context-and-decisions.md).
Verification: [executed checks and explicit limits](0028-verification.md).

## Global constraints

The original implementation boundaries below are retained as the plan record.
After review, the maintainer authorised fixing shutdown cleanup, accepting ADR 0028
and committing the completed delivery. No push or publication was authorised.

Implement the approved delivery in product packages and the desktop, not spikes.
No automatic commits, pushes, ADR acceptance, publication or private changes.
Preserve existing data and historical evidence. No new policy-engine dependency,
remote services, sandbox replacement, OS support or dynamically installed providers.
Select providers only through trusted startup composition. Contracts are independent
of providers. Write failing behavior/conformance tests before implementation.
Use shared Views/ViewModels and preserve native authority and independent enforcement.
Run targeted checks per slice and canonical `bun run check:ci` at final verification.
Downloads and live model calls are not authorised by this plan.

## Task 1: Shared authorization contract and bounded scheduler

Introduce a portable authorization contract independent of tools and knowledge.
Extract the existing AuthZEN-shaped definitions from knowledge into their single
authoritative contract home. Preserve compatible request data; use one promise-returning
interface, cancellation and remaining evaluation budget. Results distinguish allow,
deny and inability to decide. Validate unknown data and preserve structured failures.

Implement a host-usable portable scheduler as a separate implementation package with
foreground 12 active/24 waiting and background 4 active/8 waiting, FIFO per class,
no borrowing. Trusted host composition selects class. Each request gets at most
2,000 ms and the parent's remaining budget. Waiting consumes that deadline; require
at least 50 ms remaining at admission and dispatch. Remove cancelled/expired queued
work promptly. Distinguish overflow, exhausted budget, cancellation, malformed results,
rejection and unavailability. Timed-out underlying evaluations retain active slots
until settlement; shutdown settles clients without leaking unhandled rejections.

Add a default local decision implementation and a contrasting deterministic provider
with attribute decisions, delays, revocation and failure behavior. No Cedar. Run shared
conformance against both. Do not claim external-engine compatibility.

Keep consumer migration for Task 2: first provide and test exported APIs. Match existing
package roles, catalog/workspace dependencies, build and Node conformance conventions.
Only add the new authorization packages and necessary root workspace/build metadata;
do not edit existing consumer implementation in this slice. Document exact proposed
API and extraction follow-up in the report so subsequent tasks have one owner for types.
Tests must cover both pools under mixed load, overflow, FIFO, queue expiry/cancellation,
remaining-time admission/dispatch, malformed/rejected policy, shutdown and a policy
that ignores cancellation without allowing unbounded active work.

## Task 2: Migrate enforcement and extend the private worker protocol

Move authorization definitions out of knowledge and migrate all existing consumers
to Task 1's asynchronous contract. Cover tools; knowledge intake/read/evidence/export;
context disclosure; assessment submission/reconciliation/cancellation; embedding disclosure.
Preserve failure, denial-before-unknown-tool, and actual local behavior as default.
Host generation checks before/after awaiting and before execution invalidate pending
decisions. Retain the second full policy evaluation after tool-start evidence. Its
failure is execution `not_started`, never unknown; record terminal evidence when possible.
Grants are inputs to the default, independent binding/ownership checks remain enforcement.

Extend stdio with correlated reverse requests bound to admitted work and worker lifetime.
Validate both directions, reject unsolicited/duplicate/stale messages, settle on
disconnect/shutdown. Route through the host scheduler; do not load policy modules in
the worker or introduce a listener. Assessment transport timeouts do not extend decisions.
Tests include revoked state during awaited decisions and evidence writes, both foreground
and assessment failures/disclosure, malformed messages, cancellation and shutdown.

## Task 3: Learning facade, local setup and scoped consent

Retain existing knowledge storage/retrieval/intake/assessment/maintenance/embedding contracts.
Expose required contribution, retrieval, availability, lifecycle operations and explicit
optional curation/warmup capability objects with complete operations and concrete unions.
Remove method-name detection, untyped status and string outcomes. Local composition owns
Nightloom. A separate local setup interface owns installation, model/runtime and cleanup.

Host-owned versioned consent records contain purpose, data categories, destinations and
processing boundaries separately from preferences. Compare trusted declarations; narrower
retains grant, broader requires confirmation. Declarations do not authorise operations.
Migrate old booleans atomically/idempotently using known local capture/storage/embeddings
AND Codex assessment/conversation disclosure. Preserve preferences/data; no invented original
timestamp. Unknown scope requires confirmation. Stop new activity on disabling, not history.
Tests cover migration, replacement, consent revocation, restart, supported/unsupported
capabilities, download independence and durable recovery. No automatic provider data transfer.

## Task 4: Session and turn context assembly

Extend context contract: session admitted instructions/skills/host guidance; turn request,
explicit selections/attachments/optional prepared knowledge. Keep ContextPreparer independent.
Host retains resolution, trusted bindings, authorization/disclosure; provider owns continuation.
Preserve instructions versus references, user text, queue dispatch/steering, receipts/history.
Automatic limits eight records, 12 KiB, oversized reference-only, 5s first/2s subsequent.
Use one remaining budget throughout retrieval/reads/queue/auth. Expiry returns timeout without
partial knowledge; cancellation distinct; auth failure unavailable, deny excludes record.
Mandatory assembly failure prevents submit; optional failure continues with honest limitation.
Test default and contrasting assembler via exports and actual desktop submission/history.

## Task 5: Replaceable approval presentation

Reuse native approval types and choices. Host/adapter retain authority and correlation.
Presentation states distinguish pending, dismissed and failed. Retry a failed surface for
the same still-pending request. No answer/close does not authorise or decline; Stop remains.
No new timeout. Native cancellation/completion/expiry/disconnect invalidates. Preserve stale,
duplicate/cross-conversation rejection. Do not merge elicitation/input/business acceptance.
Prove default and alternative presentation through public exports and host paths.

## Task 6: Shared desktop learning experience and local settings

Use DESIGN.md, microinteraction and Svelte MVVM skills. Shared search/evidence/export,
preferences/consent, availability/limitations and supported curation have no mandatory model,
download or filesystem fields. Separate statically wired local settings retain Qwen/llama.cpp,
download consent/progress/cancel, verification/retry/prereqs/paths/cleanup. No downloaded views.
Use existing approved appearance and shared controls. Explicit pending, failed, cancelled,
unsupported and consent-required states. Prove local and contrasting deterministic learning
provider can power the same screens without local setup fields. Check keyboard/focus, themes,
narrow layout, reduced motion and 200% zoom.

## Task 7: Replacement examples, recovery and final verification

Separately build/pack public consumers for learning, context, authorization and presentation.
Run shared conformance, actual desktop/worker tests, Temporal recovery, dependency/licence/UI
guards and final canonical gate. Regress existing data/learning/installation/recovery and all
failure/revocation/race/deadline/consent cases. Update practical developer replacement guidance.
Report executed tests, retained evidence and unrun model acceptance separately. ADR remains
Proposed and all changes uncommitted. Completion requires replacement through documented setup,
shared desktop, independent enforcement and tested recovery, not only passing adapter tests.
