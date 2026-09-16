# How evaluation runs, comparisons and feedback behave

This is the implementation brief for the Evaluation screens — starting and
following a run, inspecting and comparing results, and giving feedback — for
anyone building or reviewing that UI. It sits under
[ADR 0025](../adr/0025-evaluation-boundaries-and-comparative-proof.md) and
preserves the [desktop design](../../DESIGN.md) and the existing MCP Apps
boundary.

Sections below name the interaction pattern they follow, from the
[microinteraction pattern catalogue](../../.agents/skills/microinteraction-design/references/pattern-catalogue.md).
Each pattern is glossed where it first appears here; the catalogue holds the
full definition.

## Starting and following an assessment

Starting a run follows the **loading-and-progress** pattern: real progress
through actual steps, never a fabricated percentage. The user wants to check
selected saved work or run a declared experiment, then inspect useful
findings as they arrive. These modes are labelled explicitly; checking saved
work never regenerates it.

- Trigger: a labelled shared StatefulButton next to the selected definition.
  Show required setup beside the disabled start action, not only in a
  toast.
- Rules: validate the exact versioned selection. One pending start identity
  per click intent; rapid repeats cannot create extra runs. Orchestration
  owns status.
- Feedback: acknowledge starting immediately, show actual step status and
  partial findings. No invented percentage. A completed check is not
  accepted work.
- Interruption: closing the view does not cancel. A separate Cancel action
  requests cancellation; it must not claim cancellation completed or undo
  effects. Uncertainty stays visible and distinct from a failed check.
- Repetition: a deliberate new run gets a new identity. Refresh restores
  the selected run without starting it again.
- Inputs: shared controls support keyboard, touch and visible focus.
  Announce meaningful state changes without moving focus or narrating
  every poll.
- Motion: no custom animation is needed. Reduced motion retains status
  text.
- Ownership: service/orchestration owns execution; ViewModel owns pending
  UI commands and derived presentation. Views receive presentation/actions
  only.
- Character: quiet progress and continuity, not a celebratory completion
  display.

| State | Feedback | Available actions |
| --- | --- | --- |
| Ready | Selected definition, mode and setup status | Start, inspect saved results |
| Starting | Starting acknowledgement | Inspect saved results |
| Running | Actual steps and partial findings | Inspect, request cancellation |
| Completed | Per-case outcomes, not an aggregate-only verdict | Inspect, compare, give feedback, start another run |
| Failed | Durable error with responsible step where known | Inspect preserved findings |
| Cancellation requested | Request pending; effects may still settle | Inspect |
| Uncertain | Outcome could not be established; no automatic resubmission | Inspect evidence and status |
| Orchestration unavailable | Setup explanation; saved content remains readable | Inspect and give feedback |

## Inspecting and comparing results

Inspecting and comparing results follows the **contextual-navigation**
pattern: a paginated run/case list opens a bounded selected result without
leaving the list, and returns you to where you were. A baseline is an
explicit selection. Show differences against matching case/criterion
versions and identify incomparable or missing data. Unknown costs and usage
are not zero. Keep historical, current and controlled fixture provenance
visible in the public knowledge consumer.

Use ordinary shared selectors/disclosures, not a new sheet or modal
navigation layer. Keep selected content while refreshing. Late responses
cannot overwrite another selection; errors remain visible even when earlier
results are retained. Pagination preserves focus and loaded selection.
Reduced motion uses immediate updates. Service owns pages and references;
ViewModel owns selection and requests.

## Giving feedback

Feedback follows the **validated-commit** pattern: the draft is preserved
and validated before it commits. Rating/correction is advisory and applies
to the exact result. It never edits the source, accepts output or updates
criteria.

Preserve the local draft until the save is acknowledged. Only Save is
pending; coordinate reload and save so neither can hide the other's result.
Keep validation and storage failures inline with the draft intact. Rapid
repeated Save reuses the pending identity. Navigation must not silently
discard an unsaved correction. Announce saved feedback without moving
focus; no animation is necessary.

## What to check

Test initial/empty setup, rapid starts, partial findings, cancellation,
unavailable orchestration, refresh during save, navigation during reads,
saved baseline and feedback after restart. Verify keyboard traversal,
visible focus, touch targets, 390px layout, 200% zoom, light/dark
appearance and reduced motion. The supported verification record must
distinguish browser observations from ViewModel tests.
