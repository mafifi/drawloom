---
type: evidence
id: adr-0022-memory-sprint
title: First knowledge, memory and context sprint
status: draft
created: 2026-09-11
updated: 2026-09-11
---

# First sprint: a small live integration loop

Related: [Proposed ADR 0022](../../docs/adr/0022-knowledge-memory-context-experiment.md),
[reproducible proof](../../spikes/adr-0022-memory/README.md),
[reference survey](../../docs/reference/knowledge-memory-survey/README.md).

## Outcome

The first live run completed on 11 September 2026 at 17:16 UTC using
Codex CLI 0.153.4 and Bun 1.2.23. Seven fresh Codex conversations used the
existing Drawloom agent driver, authenticated MCP server and origin-bound tool
gateway. Native memory was disabled by the existing driver. All seven operations
completed and all seven conversations were archived. Temporary JSON state was
deleted; provider-owned archived transcripts were not erased.

The run took **112.260 seconds**, including setup and cleanup. It demonstrates
capture, automatic maintenance, fresh-agent recall and incorporation of contrary
evidence. It does **not** demonstrate improved task success or a changed scheduling
decision. The reader appropriately refused to infer a weekend rule from sparse
evidence both before and after the additional observation.

This is a review checkpoint, not acceptance of the ADR, a final data model or
the full Nightloom vision.

## What actually happened

1. **Baseline:** a fresh reader called `memory.search`; it received no notes and
   said Saturday reliability was unverified.
2. **Capture:** a collector called only `inspection.run`. Its controlled result
   described one Saturday capacity failure. The host automatically recorded the
   successful inspection result; the agent made no memory-write call.
3. **Maintenance:** a separate Codex conversation called `memory.evidence` and
   `memory.publish`. It wrote a provisional note explaining that one failure
   does not establish a weekend pattern. No human review was requested.
4. **Recall:** after reopening JSON storage, a fresh reader called `memory.search`
   and cited `inspection-1`. Its prompt contained neither the note nor the
   earlier answer.
5. **New evidence:** another collector inspected a fixture describing a later
   Saturday success for the same region/model.
6. **Maintenance again:** a new maintenance conversation read both observations
   and published a revised note covering both source IDs.
7. **Revised recall:** another fresh reader cited both observations, described
   mixed outcomes, and distinguished old evidence from current capacity.

The fixtures are synthetic; no renderer or external generation service was
called. They describe outcomes of hypothetical requests. The inspection tool
itself succeeded. Model maintenance and recall were live, not scripted responses.

## Observed answers

All three readers received the same question:

> We need to schedule a Fern renderer job in region west using fern-v1. Should
> we avoid Saturday? Give brief advice grounded in what we know; do not execute
> a job.

The shared instructions encouraged operational recall and source citations,
without supplying any stored facts. Topic matching was deliberately easy.

**Baseline:**

> We have no evidence-based reason to avoid Saturday for west using fern-v1:
> the `fern-renderer` memory search returned no notes or evidence IDs. That also
> means Saturday’s reliability is unverified; there’s no supported weekday rule
> to apply.

**After the failure observation:**

> We don’t have enough evidence to recommend avoiding Saturday. One synthetic
> `fern-v1` request in west failed due to capacity on Saturday, August 1, 2026,
> but there are no comparable weekday observations [inspection-1].
>
> The note is marked non-stale, but that historical failure establishes neither
> a Saturday reliability problem nor current capacity.

**After the later success:**

> There’s no established reason to avoid Saturday. For west using fern-v1, one
> synthetic Saturday request failed due to capacity on August 1 [inspection-1],
> while another succeeded on August 8 [inspection-2].
>
> These observations don’t establish a Saturday reliability pattern, and there’s
> no weekday comparison. Schedule based on your needs; current capacity is
> unverified, with evidence limited to August.

These are excerpts from this experiment's synthetic-content answers, not private
user transcripts. A reviewer can inspect whether each conclusion is supported;
there is no model-grader score or statistical performance claim.

## Basic measurements

One run, not warm repetitions or a benchmark. Phase time includes starting a
fresh session and cleanup. Returned bytes measure UTF-8 JSON at the host's tool
result boundary, including evidence metadata; they are not network bytes or
model tokens. Instruction bytes were 501 for every phase.

| Phase | Time (ms) | Prompt bytes | Returned tool bytes | Actual calls |
| --- | ---: | ---: | ---: | --- |
| Baseline | 14,284 | 161 | 201 | memory.search |
| Capture | 12,780 | 87 | 674 | inspection.run |
| Maintain first note | 19,984 | 239 | 916 | memory.evidence, memory.publish |
| Recall | 16,340 | 161 | 1,857 | memory.search |
| Capture later success | 14,091 | 87 | 638 | inspection.run |
| Revise note | 20,010 | 239 | 1,352 | memory.evidence, memory.publish |
| Revised recall | 14,768 | 161 | 2,399 | memory.search |

Nine gateway calls total. No automatic retry. The final note cited both source
IDs and its evidence-coverage `stale` flag was false. That flag means no captured
topic observation was omitted—not that the underlying service status is current.
The later reader explicitly recognised this distinction.

## Deterministic evidence

Three tests first failed against unimplemented notebook operations, then passed:

- Repeated identical delivery remains one observation after reopening storage;
  conflicting reuse of its identity is rejected.
- Missing or incomplete evidence cannot replace a maintained note. The last
  note remains available and visibly stale after new evidence.
- A revised note survives reopening with both sources and no omitted evidence;
  an unrelated topic returns an empty result.

This is clean storage reopen, not crash/power-loss testing. JSON atomic rename
does not establish full durable persistence. Evidence coverage is deliberately
coarse: all observations for one topic. Independent writers are excluded.

The canonical `bun run check:ci` gate passed on 11 September 2026: 654 tests
passed, five skipped, zero failed across 122 files. Public package build/export
checks, desktop build, Svelte checks, TypeScript, architecture/UI policy, design
checks and Node shared conformance passed. The five skips are existing opt-in
native review and OS credential tests; the separate live experiment is not part
of this count. The existing desktop bundle-size warning remains unrelated.

The initial live execution preceded a validation/narrowing correction at the
capture boundary (`unknown` to a schema-validated successful result). The final
checked source was therefore run again, rather than relying on the earlier run.

### Final-source live verification

The second run completed at **17:20:07 UTC**, exit 0, in **113.869 seconds**.
All seven operations completed, with the same nine-call sequence; all seven
native conversations were archived and the temporary runtime directory was
deleted. Phase times were 15,550 / 12,817 / 21,153 / 16,117 / 12,940 / 21,042 /
14,246 ms in table order. Returned tool bytes were 201 / 674 / 916 / 1,737 /
638 / 1,352 / 2,407. Instructions and prompts were unchanged.

The final fresh reader explicitly cited the August 1 failure (`inspection-1`)
and August 8 success (`inspection-2`), stated that weekday comparisons were
absent, and advised checking current availability. The maintained note retained
both source records and was not stale relative to captured evidence. There was
no automatic execution retry or human maintenance approval in either run.

The two runs are repeat observations of this narrow case, not an accuracy
estimate. Wording differed: one intermediate answer suggested leaving time for
a retry. That advice was not an observed operational fact or an executed action.
Retrieval supplies evidence but does not make every added recommendation
evidence-backed.

## Complexity review

Two executable files: a bounded JSON notebook and a composition/measurement
runner. Four provisional observation fields; three stored note fields. No new
public contracts, dependencies, services, capability packages or hook framework.

The proof borrows Hindsight's evidence/maintenance distinction, Letta's
successful-publication checkpoint idea, and source-linked recall from several
references. It is much smaller than those engines, with explicitly weaker
retrieval and durability. The existing gateway supplies integration and authority;
the experiment does not reimplement them.

Maintenance recomputes the note from all topic observations; it does not perform
incremental claim repair or read a previous note. The single current note replaces
its predecessor. Evidence observations remain
until disposable cleanup, but this is not a full revision audit trail. Enforcing
that every topic observation is cited checks coverage, not whether the prose is
true. No confidence or domain-policy interface was needed for this sprint.

## Boundaries and next review

Generic instructions encourage retrieval; the reader was not told to emit a
particular answer or call the tool by the user question. However, this does not
prove reliable spontaneous retrieval, semantic matching or resistance to malicious
source instructions. The unrelated-topic control is deterministic, not a live
agent negative-control conversation. No private chain-of-thought was captured.

The host initiates maintenance after capture phases. That is automatic within
this runner, not a production hook subscription, scheduler or guarantee that
every native Codex event is observable. Native-tool restrictions are cooperative
instructions; ambient tool isolation was not tested.

**Recommended next sprint:** keep the same machinery and give it a case where
new evidence should change a concrete choice, plus irrelevant evidence that
should not. For example, a synthetic version-specific workaround later superseded
by a recorded fix. Compare answers and actual selected actions, without expanding
the schema first. Separately assess whether recall fails when the question does
not repeat the stored topic name. Do not infer an embeddings requirement until
that failure is observed and discussed.

Keep ADR 0022 Proposed. Decide the next experiment with the maintainer rather
than continuing until a broader success claim becomes possible.

The subsequently authorised [second sprint](adr-0022-memory-action-sprint.md)
tests saved actions and same-topic irrelevant evidence. It preserves an initial
failed expectation and the corrected, recorded-environment test separately.
