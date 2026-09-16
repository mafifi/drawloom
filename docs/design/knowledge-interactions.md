# How Knowledge search, setup and maintenance behave

This is the implementation brief for the Knowledge screens — search, evidence
inspection, local model setup and background maintenance — for anyone
building or reviewing that UI.

This guide describes the intended interactions, not a new verification record.
[ADR 0024](../adr/0024-local-knowledge-memory-and-retrieval.md) covers storage,
[ADR 0026](../adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)
covers the replacement embedding runtime, and
[ADR 0028](../adr/0028-replaceable-learning-context-and-decisions.md) covers
shared screens and consent. The desktop [design system](../../DESIGN.md)
owns appearance.

Sections below name the interaction pattern they follow, from the
[microinteraction pattern catalogue](../../.agents/skills/microinteraction-design/references/pattern-catalogue.md).
Each pattern is glossed where it first appears here; the catalogue holds the
full definition.

## Searching and inspecting evidence

Search follows the **collection-transformation** pattern: the result list
updates in place as the query changes, rather than navigating to a new page.
Evidence inspection follows **contextual navigation**: opening a record's
detail without leaving the results list and returning you to where you were.

Open Knowledge from the shared sidebar into the main content area, not a
modal drawer. Search spans authorised knowledge across projects. Submit a
query with Enter or Search. Retain the query and previous results while
loading; show pending state on that action only. Cancel superseded requests
and reject late responses by request identity. Show empty, denied,
unavailable and degraded text search distinctly. A semantic ranking is not a
confidence score.

Open a result to inspect its current claim and evidence. Supporting,
contrary, historical, stale and withdrawn entries carry textual labels. Load
more explicitly continues the authorised evidence chain; do not imply the
visible page is complete. Preserve scroll position and focus, and expose no
inaccessible record counts or hidden citations. Export triggers a fresh
authorisation check and produces OKF, not an editable mirror.

## Setting up the local model

The local implementation section of Knowledge settings owns model and runtime
installation. Shared search and consent controls do not depend on that installer.
Installation follows the
**loading-and-progress** pattern — real progress through named stages, never
a fabricated percentage — preceded by an explicit Download and install
commitment.

| State | Feedback and actions |
| --- | --- |
| Missing | Model, licence, approximate weights size, local install location and runtime prerequisite. Download and install starts only on activation. |
| Unsupported / prerequisite absent | Explain the Apple Silicon requirement or unavailable runtime; keep text search and other settings usable. |
| Installing runtime | Indeterminate named stage; no invented byte percentage. Cancel remains usable. |
| Downloading weights | Measured file/byte progress; rapid repeated activation creates no second setup. |
| Verifying | Explain file/runtime verification; do not yet present the installation as complete. |
| Ready | Show the installed location and selected model; loading and index readiness remain separate from installation. |
| Failed / cancelled | Durable explanation and retry; no partial install is presented as ready. |

Host setup owns progress and cancellation. The existing ViewModel polls while
setup runs and projects typed state; the View uses shared controls and a
status region. Navigating away does not cancel a consented installation;
closing the host does. Reopening settings retrieves authoritative progress.
Keyboard and pointer invoke the same action; focus remains stable. Reduced
motion retains stage text and measured progress without requiring a spinner.
Test first use, rapid repeat, cancellation, retry, already-installed
startup, narrow/zoom layouts and both system themes. No celebratory
animation is needed.

Download consent follows the **guarded-commitment** pattern: a deliberate,
informed confirmation before starting something consequential. Loading and
progress continues through transfer, verification and indexing. A missing
model explains that text search works now. Show model identity, licence,
expected download size and local-only inference before Download. Re-entry
cannot start duplicate downloads. Only measured bytes generate percentages.
Cancel stays actionable; failure keeps its explanation and retry action.
Installation is ready only after file/runtime verification. The model loads
on demand for indexing or queries; failures remain visible through
indexing/search status. A changed embedding configuration rebuilds its
index before use. No automatic network fallback or silent change of
assessment model.

## Choosing what knowledge can be used

Downloading the local llama.cpp runtime and Qwen GGUF model does not grant
permission to capture or disclose knowledge. Present separate choices for
retaining tool outcomes, using knowledge in conversations and automatic curation.
Explain that retrieval and embeddings run locally, while conversation references
and assessment evidence can be sent to Codex.

The host records the approved purpose, data categories and destinations. A saved
preference alone is not permission. If a replacement implementation broadens
that scope, preserve the preference but show that confirmation is required
before processing resumes. Equivalent or narrower processing retains consent.
Turning a feature off stops new activity; it does not remove material already
sent. See ADR 0028 for migration and enforcement rules.

## Background maintenance

Maintenance status follows the **synchronisation-status** pattern: an
ongoing state — pending, running, failed — rather than a one-off outcome.
Show the durable pending state and configured model, latest completed
result, and paused/running/waiting/unavailable or uncertain status. Run now
is stateful, Pause is a plain control unless its own save is pending. One
assessment runs at a time. Exhausted automatic limits expose the backlog and
require an explicit override for a manual run. Do not offer blind retry for
an uncertain provider submission. A successful assessment is distinct from
published knowledge; individual judgements require no approval dialog.

## Shared rules across these screens

Application/ViewModel owns requests, authorisation results, drafts, selected
records, pagination and operation state. Views receive typed
presentation/action slices, not provider handles or concrete ViewModels.
Labels and messages belong to presentation data; leaf Views render semantic
layout and shared components.

Use StatefulButton only for the actual pending action. Use native semantic
status regions with restrained announcements; durable errors are inline, not
toast-only. Pointer, touch and keyboard share commands. Visible focus,
Enter, Escape where appropriate and sensible focus restoration work without
hover. Reduced motion retains all status text and removes nonessential
motion. No decorative animation or loom metaphor is needed for this
surface.

## What to verify

- First use without models, empty corpus and successful text-only search.
- Repeated/rapid queries; slow earlier response cannot replace newer
  results.
- Evidence pagination, cycles, missing/withdrawn source and denied
  expansion.
- Download denial/cancel/failure/verification failure/retry and host
  restart.
- Maintenance pause, limits, manual override, failure and uncertain
  outcome.
- Keyboard-only navigation, 390px width, 200% zoom, both system themes and
  reduced motion. Verify actual behaviours as well as screenshots.
