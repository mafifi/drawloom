# ADR 0020 implementation

Status: completed; ADR 0020 accepted by the maintainer on 2026-09-11.

Follow-up: shared remote-media policy implemented, approved after the initial
local-delivery verification. Browser evidence is recorded with the same ADR.

## Outcome

Implement the maintainer-approved project/file-delivery plan in the existing
public desktop. Keep file ownership unchanged. No R2, remote synchronization,
private publication or production changes. Acceptance and a cohesive implementation
commit are authorised. The authoritative decisions are recorded in
[ADR 0020](../adr/0020-directory-backed-projects-and-file-delivery.md).

## Delivery sequence

- [x] Inspect the existing project, controller, backend, file and MCP App boundaries.
- [x] Draft and index Proposed ADR 0020, preserving accepted ADRs unchanged.
- [x] Resolve the explicit backend project-scoping gate before changing contracts.
- [x] Amend project/host contracts and write failing shared conformance tests.
- [x] Implement project records, conversation bindings, directory validation,
  execution/discovery scope and non-destructive legacy handling.
- [x] Implement validated open-handle reads, atomic streamed imports and bounded
  whole-buffer compatibility helpers.
- [x] Integrate HTTP ranges/HEAD/cancellation and replace base64 browser upload.
- [x] Integrate approved MCP App media origins and scoped project URLs without
  adding browser capability methods.
- [x] Update the existing shared project controls/viewers and test navigation,
  isolation, accessibility, failure states and light/dark/narrow layouts.
- [x] Verify public synthetic scenarios and separately retained private sample
  playback; record actual measurements and limitations without publishing media.
- [x] Run canonical checks/conformance/UI policy and return for review.

## Current findings

The maintainer approved global installation and project-scoped activation.
Contracts, implementation and regression tests now reflect this. Independent
review found and prompted fixes for global OAuth disconnection, offline Stop,
upload/navigation ordering, awaited resource checks and deferred activation when
a missing folder returns. Actual browser cancellation also exposed a pinned-Bun
stream error, now fixed and covered by a regression test.

The [evidence record](../../knowledge/evidence/adr-0020-projects-file-delivery.md)
owns the measured results and verification limits. Maintainer review is complete;
this plan is a historical checklist, not a second architecture authority.

## Shared remote-media completion

- [x] Amend ADR 0020 with the approved central policy and reference differences.
- [x] Test and implement durable declarations from activation and typed results.
- [x] Share policy across MCP Apps and an authenticated remote-media viewer.
- [x] Add Sonner/source visibility and explicit workbench reopen on policy change.
- [x] Verify cross-plugin display, browser load/error/reopen and privacy.
- [x] Complete the final post-cleanup-fix canonical gate.
