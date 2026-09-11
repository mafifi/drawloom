---
type: evidence
id: adr-0022-memory-natural-sprint
title: Natural contribution and metadata-guided memory retrieval
status: draft
created: 2026-09-11
updated: 2026-09-11
---

# Third bounded memory sprint

Related: [Proposed ADR 0022](../../docs/adr/0022-knowledge-memory-context-experiment.md),
[source and commands](../../spikes/adr-0022-memory/README.md),
[complete synthetic receipt](adr-0022-natural-attempt-1.json).

## Question and method

Can a foreground agent preserve a useful lesson while doing an ordinary task,
and can fresh agents find and use it without an exact topic hint or a user
request to call memory? Start without embeddings or a dedicated RAG pipeline.

The unchanged JSON notebook stores observations and provisional notes. The
foreground request asks it to inspect an export failure and recommend the safest
setting for cut-out artwork, without rendering. Generic harness instructions
encourage consulting relevant knowledge and preserving useful lessons when the
tools are available. The user task does not request a memory write.

The synthetic inspection result is captured by the host after the gateway call
and before returning it to the model. The foreground agent can write a note
citing that original observation. No maintenance agent repairs or writes the
note before recall. This tests deliberate contribution, not independent
corroboration or promotion to established knowledge.

Three competing notes are explicitly seeded fixtures, not live discoveries:
colour conversion, speech pacing and opaque JPEG thumbnails. The JPEG note
favours native mode but does not establish transparency correctness. The target
cut-out note must be written by the foreground agent.

The optional index adds **298 UTF-8 bytes** through existing compiled context.
It contains only topic/title metadata, no source IDs, bodies, outcomes or desired
choices:

| Topic | Title |
| --- | --- |
| wk-17 | Cut-out image export |
| wk-24 | Colour profile conversion |
| wk-31 | Speech pacing and pauses |
| wk-46 | JPEG thumbnail delivery |

One fresh planner receives an ordinary request without the index; another
receives the identical request with it. The request describes a logo's empty
areas turning black and asks for a draft choice preserving transparency against
the last recorded setup, preferring speed only when correct. A third planner
uses a paraphrase about layered badges for footage. A final reader asks about
rushed narration and clipped breaths. None names a topic ID or memory tool.
Saving a draft is explicitly requested; autonomous task selection is not tested.

Every phase uses a fresh Codex conversation with native memory disabled. No
prior transcript or answer is supplied. The empty agent working directory is
separate from notebook storage. Restrictions on unrelated native tools remain
cooperative instructions, not a sandbox guarantee.

## Observed result

One live run ended **11 September 2026, 17:58:32 UTC**, exit 0, in **112.863
seconds**, using Codex 0.153.4 and Bun 1.2.23. All five operations completed and
all five conversations were archived. No automatic live rerun occurred.
Exit 0 establishes execution/cleanup, not correctness: the actual saved note,
plans, queries and answers were reviewed below.

| Phase | Actual behaviour | Interpretation |
| --- | --- | --- |
| Foreground | Queried wk-17 (empty), inspected, published a provisional note citing cutout-test | Contribution occurred under generic harness guidance, without an explicit user memory request. |
| No index | Seven guessed topics, all empty; saved defer, no sources | Tried retrieval but could not locate the material; did not invent evidence. |
| Indexed | One query, wk-17; saved compatibility citing cutout-test | Found and used the relevant note correctly. |
| Paraphrased | One query, wk-17; saved compatibility citing cutout-test | Different wording reached the same relevant material. |
| Speech | One query, wk-31; advised speed 1.0 with original pauses, citing speech-check | Same mechanism served an unrelated non-visual topic; advice remained sample-specific. |

Unindexed queries were `last_recorded_test`, `transparency`, `alpha`, `export`,
`rendering`, `logo` and `renderer`. Exact lookup matched none. This is **failure
to find**, not failure to attempt retrieval or misuse of a returned result.
The final answer asked which topic held the record.

The saved foreground note limited its conclusion to the recorded version and
transparent PNG test. It cited only original source `cutout-test` and remained
unchanged through recall. Both indexed plans prioritised correct transparency
over speed; neither used the opaque JPEG result to justify native mode. No
indexed reader retrieved the wrong topic or misused returned evidence in this
run. Three small examples do not establish a success rate. The speech answer
was manually reviewed, not graded by a fabricated general truth evaluator.

## Measurements and verification

| Phase | Elapsed ms | Custom context bytes | Prompt bytes | Returned tool bytes |
| --- | ---: | ---: | ---: | ---: |
| Contribution | 21,050 | 959 | 101 | 1,369 |
| No index | 36,400 | 661 | 211 | 1,698 |
| Indexed | 19,766 | 959 | 211 | 1,858 |
| Paraphrase | 21,503 | 959 | 219 | 1,864 |
| Speech | 14,136 | 959 | 142 | 1,373 |

There were **16 gateway calls**, including 11 memory reads, and **8,162 returned
tool bytes**. Indexed retrieval returns more bytes than empty reads because it
includes evidence. These are UTF-8 payload sizes, not tokens, full network
traffic or cost. Latencies include startup/cleanup, and repository checks ran
concurrently: no speedup or percentile performance claim follows from them.
Renderer timings inside the note are synthetic fixture values, not measurements.

Two new tests were written first; the positive case failed before implementation.
They check metadata-only validation and rejection of oversized catalogues/titles.
Seven focused tests pass. The canonical `bun run check:ci` passed on the exercised
implementation: **658 passed, five skipped, zero failed**, across 124 files.
Package builds/exports, desktop/Svelte checks, architecture/UI policy, design,
TypeScript and Node conformance passed. Existing native-review/credential opt-in
skips and the desktop bundle-size warning remain.

The runner removed its temporary notebook, plans, evidence and session mappings.
Archived provider conversations were not erased. Only synthetic completed
answers, note content, queries/call summaries and measurements are retained;
no raw native envelopes, credentials or hidden reasoning.

## Review conclusion and remaining limits

The small missing piece was discoverability: instructions alone led to seven
guesses; a metadata map let the model choose a key, read evidence and use it.
More stored content would not fix a missing route in this exact-lookup design.

This is retrieval feeding generation in the broad sense; "without RAG" means
no embeddings, vector store or dedicated retrieval pipeline here. Storage is
unchanged. The new helper only validates/formats a bounded index, and the runner
reuses existing capture, tool and context boundaries. No public contract,
service, new notebook field or hook framework was introduced.

Limits: four hand-labelled topics; one run; easy diagnostic evidence; one
successful contribution; no calibrated confidence or malicious-note test; no
large/changing catalogue proof. The index even lists the target before its note
exists. Automatic catalogue construction and selection are **not solved** by
this fixture. The foreground note is provisional, not independently vetted
fabric. Earlier maintenance evidence is not repeated or newly validated here.

Stop for review with ADR 0022 Proposed and changes uncommitted. A useful next
bounded challenge is failed/interrupted maintenance plus untrusted source
instructions: can evidence remain useful without promoting unsupported claims
or treating retrieved instructions as authority? Do not expand retrieval
infrastructure merely because this small test passed.
