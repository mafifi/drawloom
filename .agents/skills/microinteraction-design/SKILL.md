---
name: microinteraction-design
description: >-
  Use when designing, refining, auditing, or implementing interactive UI behaviour involving product polish, feedback, interaction states, motion, animation, transitions, hover, press, focus, loading, success, failure, interruption, gestures, reveals, or interactive SVG. Do not use for purely static copy, colour, typography, or layout changes with no behaviour.
---

# Microinteraction Design

A microinteraction is a complete behaviour. Motion is optional feedback, not the
behaviour itself. Use this skill before choosing an implementation primitive.

## Read first

Read `DESIGN.md`, Accepted ADR 0012 for product UI, and the nearest
`AGENTS.md`. For Svelte View or state-ownership changes, also use
`svelte-presentation-mvvm`.

## Design contract

Write an interaction brief for every material behaviour before implementation.
Use [the brief and review rubric](references/interaction-brief.md). It must cover:

- the user goal and discoverable trigger;
- rules, constraints and authoritative states;
- feedback for pending, partial, success, failure and interruption where relevant;
- loops and modes, including first use, repeated use and rapid re-entry;
- pointer, touch, keyboard, assistive-technology and reduced-motion paths;
- ownership: application rules and operation state outside the View; visual and
  local ephemeral feedback inside the View or shared UI primitive.

If a state is impossible for the interaction, mark it not applicable rather than
inventing UI. If motion adds no clarity, omit it.

## Character and restraint

Choose one or two signature moments for a product surface; make frequent actions
quiet and immediate. Scale feedback to consequence. Never hide progress, block the
next action, fake completion, or make animation the only status signal. A
hundredth use should remain calm.

For Drawloom, use the loom/knowledge metaphor only where it explains composition,
connection or transformation. Ordinary controls should feel precise rather than
theatrical. `publishing/DESIGN.md` remains authoritative for the journal; the
desktop and journal do not inherit each other's visual systems.

## Implementation handoff

Before inventing common behaviour, read the
[pattern catalogue](references/pattern-catalogue.md). Select one primary recipe
per user goal, name it in the brief, and explain its fit and limits. Compose
recipes only when the goals are genuinely separate; a richer animation is not a
reason to stack patterns.

After approval, choose the narrowest implementation: semantic HTML and CSS states,
then Svelte primitives, shared components, and only then custom JavaScript. Keep
the non-animated path complete.
Do not introduce a runtime dependency without a demonstrated gap and the required
architecture decision.

## Verification

Exercise the actual behaviour, not a screenshot:

- initial, repeated, rapid, interrupted and error paths;
- keyboard and touch equivalence, visible focus and useful announcements;
- reduced motion, no JavaScript where the surface promises it, 390px mobile and
  200% zoom;
- layout stability and task continuation while feedback runs.

Run the nearest targeted checks and the canonical repository gate. Skill discovery
is evaluated with [the trigger cases](evals/trigger-cases.json) and the
[forward-evaluation procedure](evals/evaluation.md); use fresh agents against
those cases when changing the description or workflow.

## Sources

The framework is an original Drawloom adaptation of established microinteraction
design ideas and inspected community skills. Read [sources and decisions](references/sources.md)
before materially changing this skill.
