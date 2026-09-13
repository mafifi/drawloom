# ADR 0025 knowledge and presentation sprint

Status: Bounded sprint complete, pending maintainer review. Started 2026-09-13;
reviewable handoff in approximately 42 minutes. ADR remains Proposed.

## Outcome and constraints

Continue the approved evaluation proof using frozen knowledge cases and a standard
MCP App in the existing desktop. Keep ADR 0025 Proposed and changes uncommitted.
All new code and synthetic consumer material is public retained proof under
`spikes/adr-0025-evaluation/`. Supported packages must not import it. No downloads,
production ingestion, new model calls, private data or browser protocol additions.
Reuse the current candidate evaluation/result/feedback contracts and Braintrust
adapter. Distinguish retained answer assessment from fresh retrieval and judgement.
Do not change the frozen questions to improve scores.

## Task 1: Knowledge consumer and findings inspection

Implement a cohesive proof with focused failing tests before implementation.

1. Inspect the frozen `evaluations/knowledge` corpus, metrics and retained public
   ADR 0024 reports. Compose existing-output cases through the ADR 0025 candidate
   runner for relevance, evidence chains, current revisions and grounded answers.
   Preserve category/corpus/version/source provenance. Reuse existing checks where
   suitable; clearly label heuristic grounding and historical CPU reports. Prefer
   current MLX/lexical retained results if available. Do not regenerate answers.
   Add controlled regressions to prove case-local diagnosis, labelled separately
   from actual retained results. Assert zero target/model calls and source hashes.
2. Define a small schema-backed proof presentation document using existing result
   and feedback schemas, plus provenance/comparison data only as needed. No new
   supported contracts. Package a standard MCP server with an opening tool and
   compiled Svelte MCP App; feedback uses an app-only tool and validates exact
   result identity. Keep configured inputs bounded, source-bound, unchanged;
   feedback persists separately in local JSON and survives restart. No arbitrary
   paths from app arguments. Feedback is attributed, advisory and never accepts
   work. Protect concurrent saves and late responses without new infrastructure.
3. Use `@drawloom/ui` and the existing theme, standard MCP Apps SDK, View/ViewModel
   separation and the interaction brief below. Build self-contained installed
   artifacts in an ignored/temp runtime folder. No direct host imports of spikes.
4. Write concise launch instructions for installing/opening the proof in existing
   desktop. Run focused tests and source/Svelte/Node checks covering all new files.
   Record commands, red/green results, paths and limits in the SDD report. Root
   will conduct browser verification, broad gate and final evidence/ADR updates.

File ownership: new `knowledge-*`, `inspection-*`, and `inspection/` files under
the proof, its README and tsconfig.node.json. Do not edit supported packages,
frozen corpus, root config, evidence/ADR or private repository without escalating.
Use existing dependencies; new dependencies need a concrete reason first.

## Interaction brief

Primary recipes: contextual navigation for cases; validated commit for feedback.

| Field | Behaviour |
| --- | --- |
| Goal | Find which case regressed, inspect reasons and record whether the assessment is useful. |
| Trigger | Open the installed evaluation proof; keyboard-focusable case list and comparison controls. |
| Rules | Read saved results only. Feedback targets exact result, requires attribution, and never changes scores or accepts source work. One pending save at a time. |
| Feedback | Keep selected result visible while loading; inline failure/retry, truthful saved status; StatefulButton only for saving. |
| Loops | Repeated navigation is local. Save is explicit; preserve drafts on failure and associate drafts/results correctly. |
| Modes | Label retained/live/synthetic-regression provenance. Do not present errors as zero quality. |
| Inputs | Shared controls, visible focus, logical keyboard order, readable narrow layout. |
| Reduced motion | No essential animation; static pending text remains. |
| Ownership | MCP client/ViewModel owns loading, selection, draft and save state; View receives presentation/actions. Server owns validation and persisted feedback. |
| Signature value | Quiet, readable inspection, not a dashboard redesign. |
| Verification | Initial/empty/error, switch cases, reload, repeated save, narrow/light/dark/reduced-motion, source unchanged. |

## Task 2: Integration, review and evidence

Exercise the installed App in the existing desktop with isolated synthetic state.
Verify findings, comparison and feedback persistence, keyboard/narrow/system themes.
Run canonical public gate and UI/dependency checks. Review scoped implementation
once with Astra; verify targeted fixes. Record actual observed results and limits
in indexed evidence, link from Proposed ADR 0025. Do not claim broader semantic
quality or complete ADR acceptance. Leave changes uncommitted.

## Delivered review point

See [indexed evidence](../../knowledge/evidence/adr-0025-knowledge-and-presentation.md)
for 122 retained assessments, the fresh lexical/evidence checks, installed MCP App
browser/restart receipts, fixed review findings, verification and remaining limits.
No new model calls or native tasks. Public gate passed, followed by targeted
post-review checks. Isolated host processes stopped; source and runtime evidence
preserved. Nothing committed, published or accepted.
