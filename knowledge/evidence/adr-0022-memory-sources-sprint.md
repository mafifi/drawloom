---
type: evidence
id: adr-0022-memory-sources-sprint
title: Plugin-owned source revisions, evidence links and snapshot waterlines
status: draft
created: 2026-09-11
updated: 2026-09-11
---

# Fifth bounded memory sprint

Related: [Proposed ADR 0022](../../docs/adr/0022-knowledge-memory-context-experiment.md),
[source and commands](../../spikes/adr-0022-memory/README.md),
[full synthetic receipt](adr-0022-sources-attempt-1.json).

## Scope and candidate boundary

Test the maintainer's source-owned integration model: a plugin supplies source
updates, not instructions about which claims to edit. Nightloom creates links,
reassesses changed evidence and advances one shared processing position.

The synthetic producer receives only an `update` function bound to its identity.
Updates carry local ID, revision, previous revision, kind (fibre/thread/source),
active/withdrawn state and text. The host qualifies source keys by producer.
Previous revision prevents out-of-order replacement without imposing an ordering
on opaque revision strings. Repeated delivery of an earlier revision neither
adds a pending event nor reactivates that revision. Conflicting content under
the same identity/revision is rejected.

This is an in-process candidate intake function, **not a shipped plugin capability
or an installed standard-package integration**. Detection, fetching, access,
credentials and progress tracking remain producer-owned and are not implemented
by this experiment. No Git watcher, backend-loader extension, storage service or
new public API was added. External evidence is synthetic supplied text.

The revised disposable store keeps an ordered change list, the current claims
and a waterline. Claims have ID, text and revision-specific links; links state
supports, contradicts or qualifies. Changed linked revisions yield a computed
needsRecheck flag, not a confidence reduction. Unlinked arrivals enter pending
work without pretending the store already knows their semantic relevance.

Publication saves claims and the assessed snapshot position in one atomic file
replacement. It rejects an obsolete base waterline, invalid positions and links
to unknown or not-yet-assessed revisions. New arrivals after the read remain
beyond the committed position. These guards validate positions and references,
not truth, completeness or the quality of the agent's assessment.

## Scenario

1. A source producer supplies guide r1 describing a v1.0 transparency defect.
   Synthetic agent producers contribute a fibre and thread derived from that
   guide, explicitly not independent measurements. Repeat delivery of r1 is
   deliberately included.
2. At three pending changes, Nightloom creates evidence-linked claims. A fresh
   agent requests a draft export setting using only the generated claim index
   and retrieval tools, not preloaded source facts.
3. The producer replaces the guide with r2 reporting successful native export
   on recorded v1.1. Existing linked claims immediately need reassessment. Two
   further agent contributions bring pending count to three.
4. Nightloom captures a snapshot through change six. Before the snapshot is
   returned to the model, the producer supplies r3 withdrawing the guide because
   its v1.1 fixture was invalid. Nightloom can publish through six, while change
   seven remains pending and the resulting claims still need recheck.
5. A fresh reader inspects the pending withdrawal rather than trusting the old
   assessment. An independent QA source then arrives, with no existing claim
   links, reporting native transparency failure and compatibility success on
   v1.1. A final fibre brings pending count back to three.
6. Nightloom discovers the QA source's relationship to existing claims and saves
   a new assessment through nine. A fresh agent requests the same draft plan.

Default threshold 50 is exercised by deterministic tests. The live example uses
three to avoid filler observations. The runner checks due status at known intake
boundaries; this is threshold-driven dispatch in the proof, not an autonomous
background scheduler or a maximum-age policy for a quiet backlog.

## Observed live result

One run ended **11 September 2026, 18:40:05 UTC**, exit 0, in **184.201 seconds**,
using Codex 0.153.4 / Bun 1.2.23. All six operations completed, each in a fresh
conversation with native memory disabled; all six were archived. No live retry
or corrective rerun was performed. Seventeen gateway calls returned 55,094
UTF-8 bytes of tool envelopes/content.

| Stored checkpoint | Arrivals | Waterline | Pending | Claims needing recheck |
| --- | ---: | ---: | ---: | ---: |
| Initial assessment | 3 | 3 | 0 | 0 of 2 |
| Linked guide update | 4 | 3 | 1 | 2 of 2 |
| Publication after racing withdrawal | 7 | 6 | 1 | 3 of 3 |
| New, unlinked QA source | 8 | 6 | 2 | 3 of 3, already flagged by withdrawal |
| Final assessment | 9 | 9 | 0 | 0 of 4 |

The below-threshold check at two changes launched no model turn. Three checks
at three pending changes each launched one assessment. Duplicate r1 delivery
did not become a fourth pending change. Deterministic tests separately confirm
that a new unlinked source alone does not set existing claims' recheck flags.

Nightloom preserved the two original claim IDs, then the third claim ID when
reassessing it. It created links to exact guide revisions, treated agent notes
as qualifications rather than independent support, and added QA q1 to the
existing native-success claim as contradicting evidence. It also created a
new bounded compatibility claim supported by QA q1. The producer never received
claim IDs or supplied target claim links.

The withdrawal was not treated as proof of failure: the final assessment said
withdrawal alone proves neither mode wrong, and distinguished that loss of
support from the later independent QA result. Both the racing and final states
survived reopening the JSON store.

### Informative failure: initial plan deferred

The independently intended saved sequence was compatibility → defer →
compatibility. Actual saved choices were **defer → defer → compatibility**.
The initial agent read both claims and unsuccessfully queried an additional
`latest-recorded-setup` topic. It judged the initial guide to establish a v1.0
test but not identify the latest recorded setup. That caution may be defensible:
r1 names a recorded version, while later revisions explicitly name the latest
installed version. The fixture wording is asymmetric.

This sprint did not repair that wording or claim the initial action succeeded.
It repeats the earlier lesson that retained test evidence and environment
identity are distinct. The withdrawal and final choices were supported: the
middle reader deferred because r3 invalidated the comparison, and the final
reader selected compatibility based on QA q1's valid, bounded test. No actual
render occurred. Renderer timings in the sources are fixture values.

### Interface ambiguity: what does a link contradict?

The final text for `v1-1-native-transparency-and-speed` now says the old conclusion
is unsupported and recommends compatibility for the tested case. Yet its links
still label historical guide r2 as supports and QA q1 as contradicts. Those
labels make sense relative to the **original proposition**, not necessarily the
new composite assessment text. The prose explains the history, but a consumer
cannot safely infer current support from the relation enum alone.

This is a genuine candidate-model limitation, not a reason to invent a graph
engine. Before standardising these relations, decide how a stable proposition
is distinguished from its changing assessment—or whether to keep relations
less prescriptive initially. No extra field or subsystem was added to resolve
that decision without maintainer review. `needsRecheck:false` means linked
revision coverage is current, not that the claim is endorsed or confident.

## Measurements and checks

| Phase | Elapsed ms | Custom context bytes | Prompt bytes | Tool-result bytes |
| --- | ---: | ---: | ---: | ---: |
| Initial assessment | 25,949 | 661 | 517 | 2,238 |
| Initial plan | 31,073 | 943 | 193 | 5,936 |
| Racing assessment | 38,243 | 661 | 517 | 6,350 |
| Withdrawal-aware plan | 20,559 | 1,035 | 193 | 17,030 |
| Final assessment | 43,974 | 661 | 517 | 11,762 |
| Final plan | 24,389 | 1,135 | 193 | 11,778 |

The index derives from model-generated claim IDs, some of which describe their
propositions. It is not a manually planted answer, but neither is it a guarantee
that injected labels contain no factual suggestion. Readers still retrieved
source evidence before saving. Multiple reads repeated shared linked/pending
content; no payload-efficiency improvement is claimed. Timings include session
startup/cleanup and overlap repository checks. Bytes are not tokens or full
network measurements.

Four focused tests were written first and observed failing before implementation.
They cover mixed threshold/deduplication and reopen, producer identity/revision
conflicts, snapshot publication with a racing withdrawal, and unlinked arrivals.
Fifteen memory-proof tests pass. The canonical `bun run check:ci` passed:
**666 passed, five skipped, zero failed**, across 126 files, including builds,
type checks, architecture/UI guards and Node conformance. Existing opt-in skips
and bundle-size warning remain.

The initial type check rejected `findLast` under the repository's configured
library target. The final code uses reverse/find over a copy instead of changing
the target. That equivalent lookup correction occurred while the live run was
in progress; the final implementation passed the canonical and focused tests.
The live receipt is not represented as a separate final-source rerun.

Temporary JSON, plans, execution records and session mappings were removed;
native test conversations were archived, not erased. Receipts retain synthetic
content and completed answers, not private data, credentials or native envelopes.

## Review checkpoint

The source-ingestion and waterline mechanics are demonstrated at this small
scale. The new unlinked-source relationship was found by the model, and the
producer stayed outside knowledge maintenance. The initial action miss and
relation-target ambiguity remain explicit rather than being polished away.

The revised store is 58 lines, with no dependencies or supported package changes.
It retains at most 200 changes/eight claims and uses whole-snapshot reassessment.
It has no production durability, distributed writers, source authentication,
large-content reading, graph traversal, domain confidence model or real plugin
installation proof. Automatic propagation follows direct source links only;
semantic/transitive dependencies are not solved by the flag. The QA fixture
explicitly says which earlier report it contradicts, so this is an easy discovery
case—not a claim of subtle contradiction detection across an arbitrary corpus.

Keep ADR 0022 Proposed and everything uncommitted. Review the claim-versus-
assessment distinction before promoting evidence relations into a public API.
