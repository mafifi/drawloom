---
type: evidence
id: adr-0022-memory-simple-interface
title: Claims and evidence without agent-visible maintenance bookkeeping
status: draft
created: 2026-09-11
updated: 2026-09-11
---

# Agent-facing simplification

Related: [Proposed ADR 0022](../../docs/adr/0022-knowledge-memory-context-experiment.md),
[source scenario](../../spikes/adr-0022-memory/README.md),
[previous source-revision experiment](adr-0022-memory-sources-sprint.md),
[full synthetic live receipt](adr-0022-simple-interface-attempt-1.json).

## Decision exercised

The maintainer rejected exposing the maintenance machinery to agents. The
current source scenario therefore presents only:

- Claims: identity, plain text and evidence references.
- Evidence: citation identity, source label and text.

The same projection serves readers and the model doing Nightloom's assessment.
Readers receive matching claims, their source accounts and new unassessed
evidence. Maintenance receives the bounded notebook. Historical/withdrawn
accounts and a changed-evidence caveat are expressed in plain language, not
revision records, relation enums or processing-state fields.

The source producer still owns updates. The host captures an assessment once
per maintenance turn, holds its processing positions privately, resolves cited
evidence against that snapshot and commits the claims and position together.
Later arrivals remain pending. Another assessment cannot overwrite committed
work using an obsolete position. Unknown citations and extra maintenance fields
are rejected. No separate service, provider, package or dependency was added.

The earlier supports/contradicts/qualifies enum was removed from this disposable
store rather than made more elaborate. Claims explain disagreements in prose.
Historical receipts are unchanged; their richer schemas describe prior runs,
not the current model-facing interface. Other earlier scenarios remain retained
comparisons rather than supported interfaces.

## Verification

One live run ended **11 September 2026 at 20:05:36 UTC**, exit 0, in
**196.501 seconds**, using Codex 0.153.4 and Bun 1.2.23. All six fresh native
conversations completed and were archived. Eighteen gateway calls returned
**66,155 bytes** of tool envelopes/content. No corrective rerun was performed.
The tested executable source did not change during the run.

The three assessing turns each read knowledge and saved claims, without
supplying processing positions or source revisions. The host alone advanced
the waterline. Actual stored states were:

| Checkpoint | Arrivals | Waterline | Pending | Claims needing recheck |
| --- | ---: | ---: | ---: | ---: |
| Initial assessment | 3 | 3 | 0 | 0 of 3 |
| Linked guide update | 4 | 3 | 1 | 3 of 3 |
| Publication after racing withdrawal | 7 | 6 | 1 | 3 of 3 |
| Unlinked QA arrival | 8 | 6 | 2 | 3 of 3, already flagged |
| Final assessment | 9 | 9 | 0 | 0 of 3 |

These counts are host evidence, not fields supplied to the model. The threshold
check at two changes launched no assessment. The three checks at three pending
changes each launched one. Repeated source delivery did not advance the count.
All three claim identities survived reassessment. Each final claim cited the
new independent QA source; no producer supplied those claim relationships.

Fresh planners saved **defer → defer → compatibility**, matching the previous
run's actual sequence. The middle agent cited the withdrawn test and did not
rely on the stale native-success recommendation. The final agent selected
compatibility using the independent valid test and confined the conclusion to
that recorded case. Disagreements and duplicate-versus-independent evidence
were explained in claim text rather than a polarity enum.

The initial planner still treated the v1.0 guide as historical rather than proof
of the latest setup. The original fixture/prompt ambiguity was deliberately
unchanged: this is not a newly successful initial-action test. No actual render
or present-day renderer inspection happened.

| Phase | Elapsed ms | Instruction bytes | Prompt bytes | Tool-result bytes |
| --- | ---: | ---: | ---: | ---: |
| Initial assessment | 34,873 | 661 | 388 | 2,212 |
| Initial plan | 29,022 | 1,071 | 193 | 7,602 |
| Racing assessment | 40,377 | 661 | 388 | 7,625 |
| Withdrawal-aware plan | 23,127 | 1,071 | 193 | 17,017 |
| Final assessment | 45,832 | 661 | 388 | 11,873 |
| Final plan | 23,255 | 1,071 | 193 | 19,826 |

Every planner read all three related claims; shared evidence was repeatedly
returned. Total returned bytes exceed the previous run's 55,094. Claim prose,
citation handles and model choices differ, so this is not a controlled overhead
comparison, but it clearly does not establish a payload reduction. Timing
includes setup/cleanup and overlaps repository checks. Bytes are not tokens.

Temporary JSON, plans, execution records and session mappings were removed by
the runner's cleanup. Native conversations were archived, not erased. The
receipt retains only synthetic material, answers and measurements, not native
identifiers, credentials, private transcripts or hidden reasoning.

Four regression tests were observed failing before implementation, then passing:
projection without maintenance fields and correct citation binding; a racing
withdrawal and reopen; unknown evidence/extra fields leaving progress unchanged;
and competing assessments plus an unlinked new source.

The focused memory suite passes **19 tests**. The canonical `bun run check:ci`
passes **670 tests, five opt-in skips, zero failures**, across 127 files, plus
Node shared conformance. Builds, types, dependency and UI/architecture guards
passed. The existing large-client-bundle warning remains.

## Limits and remaining decisions

This narrows the agent interface; it does not prove a final internal knowledge
model. Evidence references validate provenance, not whether a statement follows
from the evidence. No calibrated confidence or domain assessment policy exists.

The proof still reads the whole bounded notebook during maintenance and includes
all new unassessed evidence during retrieval. It holds at most 200 changes and
eight claims. Relevance selection, duplicate evidence across sources and selective
reassessment need a less conveniently worded, noisier case before larger-scale
claims are justified. No vector/RAG infrastructure is added here.

Plugin source detection is still a synthetic producer calling the candidate
intake, not an installed Git/source plugin. Automatic host capture and native
Codex retrieval have separate earlier evidence, but the complete integration
has not yet shipped in a real workbench. Durable local implementation, access
scoping and scheduling remain outside this disposable proof.

ADR 0022 remains Proposed. All work stays uncommitted for review.
