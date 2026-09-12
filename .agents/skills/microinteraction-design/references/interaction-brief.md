# Interaction brief and review rubric

Use this brief before implementation. Keep it proportional: a button may need a
small table; a run lifecycle or interactive map needs the full structure.

## Brief

| Field | Required answer |
| --- | --- |
| User goal | What the person is trying to accomplish, in their language |
| Trigger | Manual or system trigger; how it is discovered; its default, hover, focus, active, disabled and pending affordances where applicable |
| Rules | Preconditions, constraints, state transitions, duplicate-action policy, cancellation and completion authority |
| Feedback | Immediate response, progress, partial result, success, failure and interruption; visual, textual and announced signals |
| Loops | Whether it repeats, stops, expires or changes after first and repeated use |
| Modes | Any context that changes the same action's result; how that mode is made unmistakable |
| Inputs | Pointer, coarse pointer/touch, keyboard and assistive-technology equivalence |
| Reduced motion | Which movement disappears and which meaningful non-motion signal remains |
| Ownership | Contract or ViewModel state and commands; View props; local ephemeral presentation; shared primitive if recurring |
| Signature value | Whether this is a quiet competence moment or one of the product's one or two recognisable signature moments |
| Verification | Concrete initial, repeated, rapid, interrupted, error and accessibility checks |

## State map

List only applicable states. Preserve domain vocabulary rather than inventing a
second lifecycle.

| State | Visible and announced feedback | Available actions | Exit condition |
| --- | --- | --- | --- |
| Idle or ready |  |  |  |
| Pending or starting |  |  |  |
| Partial or running |  |  |  |
| Success or complete |  |  |  |
| Failed |  |  |  |
| Interrupted or cancelled |  |  |  |

## Review rubric

Score each applicable dimension `0` (missing), `1` (partial) or `2` (clear and
verified). Do not average away a zero in accessibility, truthfulness or recovery.

| Dimension | Pass condition |
| --- | --- |
| Discoverability | The trigger and current state are understandable without instructions |
| Predictability | Rules match the product contract and repeated activation is safe |
| Immediacy | Direct actions receive truthful feedback without perceptible doubt |
| Continuity | State changes preserve context and avoid accidental layout jumps |
| Recovery | Failure, cancellation and interruption leave a clear next step |
| Accessibility | Keyboard, touch, announcements and reduced motion retain equivalent meaning |
| Restraint | Feedback remains useful on frequent and hundredth use |
| Brand fit | Any expressive moment supports the product metaphor without obscuring the task |

## Handoff shape

Return the approved brief, the state owner, the selected presentation primitive,
and the behavioural verification cases. An implementation is incomplete when it
matches the visual target but has not exercised those behaviours.
