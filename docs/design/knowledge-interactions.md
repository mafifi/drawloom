# Knowledge interactions — ADR 0024 implementation brief

Status: implementation brief for the approved plan; behavior is not yet verified.
The [ADR](../adr/0024-local-knowledge-memory-and-retrieval.md) owns data and authority.
The desktop [design system](../../DESIGN.md) owns appearance. No journal changes.

## Search and evidence

Primary recipe: **Collection transformation** for search, **Contextual navigation**
for evidence. Open Knowledge from the shared sidebar into the main content area,
not a modal drawer. Search spans authorized knowledge across projects. Submit a
query with Enter or Search. Retain the query and previous results while loading;
show pending on that action only. Cancel superseded requests and reject late
responses by request identity. Show empty, denied, unavailable and degraded text
search distinctly. A semantic ranking is not a confidence score.

Open a result to inspect its current claim and evidence. Supporting, contrary,
historical, stale and withdrawn entries have textual labels. Load more explicitly
continues the authorized evidence chain; do not imply the visible page is complete.
Preserve scroll/focus and expose no inaccessible record counts or hidden citations.
Export invokes a fresh authorization check and produces OKF, not an editable mirror.

## Model setup

MLX refinement: the existing Knowledge settings owns the model/runtime installation
action, not a second installer or oMLX admin screen. Primary recipe is **Loading
and progress**, preceded by the explicit Download and install commitment.

| State | Feedback and actions |
| --- | --- |
| Missing | Model, licence, approximate weights size, local install location and runtime prerequisite. Download and install starts only on activation. |
| Unsupported / prerequisite absent | Explain Apple Silicon or missing uv requirement; keep text search and other settings usable. |
| Installing runtime | Indeterminate named stage; no invented byte percentage. Cancel remains usable. |
| Downloading weights | Measured file/byte progress; rapid repeated activation creates no second setup. |
| Verifying | Explain file/runtime verification; do not yet present the installation as complete. |
| Ready | Show the installed location and selected model; loading and index readiness remain separate from installation. |
| Failed / cancelled | Durable explanation and retry; no partial install is presented as ready. |

Host setup owns progress and cancellation. The existing ViewModel polls while
setup runs and projects typed state; the View uses shared controls and a status
region. Navigating away does not cancel a consented installation; closing the
host does. Reopening settings retrieves authoritative progress. Keyboard and
pointer invoke the same action; focus remains stable. Reduced motion retains
stage text and measured progress without requiring a spinner. Test first use,
rapid repeat, cancellation, retry, already-installed startup, narrow/zoom layouts
and both system themes. No celebratory animation is needed.

Primary recipes: **Guarded commitment** for download consent, **Loading and
progress** during transfer/verification/indexing. A missing model explains that
text search works now. Show model identity, licence, expected download size and
local-only inference before Download. Re-entry cannot start duplicate downloads.
Only measured bytes generate percentages. Cancel stays actionable; failure keeps
its explanation and retry action. Installation is ready only after file/runtime
verification. The model loads on demand for indexing or queries; failures remain
visible through indexing/search status. A changed embedding configuration rebuilds
its index before use. No automatic network fallback or silent change of assessment model.

## Maintenance

Primary recipe: **Synchronisation status**. Show the durable pending state and
configured model, latest completed result, paused/running/waiting/unavailable or
uncertain status. Run now is stateful, Pause is a plain control unless its own save
is pending. One assessment runs at a time. Exhausted automatic limits expose the
backlog and require an explicit override for a manual run. Do not offer blind
retry for an uncertain provider submission. A successful assessment is distinct
from published knowledge; individual judgements require no approval dialog.

## Shared interaction rules

Application/ViewModel owns requests, authorization results, drafts, selected
records, pagination and operation state. Views receive typed presentation/action
slices, not provider handles or concrete ViewModels. Labels and messages belong
to presentation data; leaf Views render semantic layout and shared components.

Use StatefulButton only for the actual pending action. Use native semantic status
regions with restrained announcements; durable errors are inline, not toast-only.
Pointer, touch and keyboard share commands. Visible focus, Enter, Escape where
appropriate and sensible focus restoration work without hover. Reduced motion
retains all status text and removes nonessential motion. No decorative animation
or loom metaphor is needed for this surface.

## Verification cases

- First use without models, empty corpus and successful text-only search.
- Repeated/rapid queries; slow earlier response cannot replace newer results.
- Evidence pagination, cycles, missing/withdrawn source and denied expansion.
- Download denial/cancel/failure/verification failure/retry and host restart.
- Maintenance pause, limits, manual override, failure and uncertain outcome.
- Keyboard-only navigation, 390px width, 200% zoom, both system themes and
  reduced motion. Verify actual behaviors as well as screenshots.
