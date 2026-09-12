# Microinteraction design skill evaluation

## Purpose

Prove two separate properties:

1. Drawloom's design process routes interactive behaviour through the skill.
2. The description remains discriminating enough to skip static and backend-only
   work.

The Bun test protects repository wiring and the checked-in case corpus. Fresh-agent
forward evaluation tests actual selection and application. Do not claim that the
structural test alone proves model behaviour.

## Procedure

1. Run `bun test scripts/microinteraction-skill-eval.test.ts`.
2. Give each case in `trigger-cases.json` to a fresh agent with `AGENTS.md`, the
   applicable design authority and the repository skill catalog available.
3. Do not name the expected skill in the agent prompt.
4. For a `trigger` case, pass only when the agent selects
   `microinteraction-design` before implementation and satisfies every
   `requiredBehaviors` item.
5. For a `skip` case, pass only when the agent does not select the skill and
   explains the static or non-UI boundary correctly.
6. Read each response. Keyword matching cannot establish correct application.

Behaviour meanings:

| Behaviour | Passing evidence |
| --- | --- |
| `select-skill` | Names `microinteraction-design` as applicable during design |
| `interaction-brief` | Defines the goal, Trigger, Rules, Feedback, Loops and Modes or marks irrelevant states not applicable |
| `state-authority` | Preserves the existing contract vocabulary and identifies the state owner |
| `input-equivalence` | Covers pointer, touch, keyboard and assistive technology |
| `non-motion-fallback` | Preserves equivalent meaning without movement |
| `interruption` | Defines cancellation, rapid re-entry and truthful interrupted outcomes |
| `hundredth-use` | Reviews repeat use and removes tiring feedback |
| `signature-moment` | Identifies a rare branded interaction without spreading spectacle |
| `task-continuation` | Feedback does not block the next valid action |
| `truthful-feedback` | Does not invent loading, progress, completion or recovery |
| `duplicate-action-policy` | Defines repeated activation while work is pending |
| `audit` | Examines missing as well as excessive interaction feedback |
| `restraint` | Matches feedback intensity to frequency and consequence |
| `reduced-motion` | Retains a meaningful non-motion signal |
| `pattern-selection` | Reads the catalogue, names the best-fit primary recipe and maps it to the goal |
| `pattern-limits` | Applies the recipe's avoid/don't-use boundary and defers to authoritative product states |
| `pattern-restraint` | Does not dump the catalogue or stack unrelated recipes merely to add polish |

## 2026-09-12 baseline and forward result

Three positive scenarios were sampled before the skill existed: premium landing,
interactive SVG map and run-state lifecycle. All three selected only
`svelte-presentation-mvvm`. They offered useful local advice, but none selected a
microinteraction discipline or consistently supplied the complete Trigger, Rules,
Feedback, Loops and Modes brief. Baseline selection result: **0/3**.

The same scenarios were then given to three new, independent agents after adding
the skill and `AGENTS.md` route. All three selected `microinteraction-design`
before implementation, paired MVVM only where appropriate, preserved authoritative
state vocabulary, marked invented loading/success states not applicable, and
covered repeat use, interruption, input equivalence and reduced motion. Positive
forward result: **3/3**.

Two fresh negative controls were sampled. Static hero-copy work explicitly skipped
the skill while retaining the MVVM presentation owner; a backend-only retry
contract selected neither UI skill. Negative forward result: **2/2**.

This is bounded evidence, not a calibrated guarantee across models or future
versions. Re-run the complete corpus after materially changing the description,
routing rule or design contract, and append a dated result rather than rewriting
this observation.

## 2026-09-12 pattern-retrieval baseline

Three fresh agents used the skill before the pattern catalogue was added. They
designed autosave supersession, high-consequence deletion and optimistic table
reconciliation. All produced responsible bespoke briefs, but none could retrieve
a named recipe or its selection boundary. Pattern-retrieval baseline: **0/3**.

The missing guidance differed by case: autosave required inferred stale-revision
semantics; deletion required an inferred choice among undo, typed confirmation and
hold; optimistic tables required inferred row pinning, concurrency and rejection
behaviour.

After adding the catalogue, three new agents ran the same cases. Each selected
`microinteraction-design` and named the appropriate primary recipe. Autosave chose
`Synchronisation status`; deletion chose `Guarded commitment`; the table composed
`Collection transformation` with `Optimistic reconciliation` for two distinct
goals and explicitly rejected an unnecessary third recipe. Pattern-retrieval
forward result: **3/3**.

All three applied recipe limits, ownership, reduced-motion and behavioural
verification rather than reproducing the catalogue. This is bounded evidence for
the three new retrieval cases; it does not replace a future full-corpus run.
