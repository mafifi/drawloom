---
type: source
id: adr-0025-tools-and-codex-judge
title: Tool effects and native Codex judgement
status: active
created: 2026-09-13
updated: 2026-09-13
---

# Tool effects and native Codex judgement

Third bounded sprint under [Proposed ADR 0025](../../docs/adr/0025-evaluation-boundaries-and-comparative-proof.md).
The [sprint plan](../../docs/plans/adr-0025-tools-judge-sprint.md) fixes the
scope, initial call limits and one/two-hour review points. This sprint completed
within its first hour; these observations do not accept the ADR.

## Questions

1. Can we distinguish selecting the expected tool, permission to execute it,
   and the correctness of the actual saved edit?
2. Does a native Codex scorer recognise useful versus deliberately poor passage
   revisions without seeing the expected labels?
3. What latency and token use does judging add, and what remains unknown?
4. Do disposable proof tasks archive themselves without altering results or
   blindly repeating uncertain calls?

Native approval is not editorial quality assessment. A poor revision can be
permitted, correctly saved and still receive an unfavourable quality finding.
Likewise denial or a revoked grant is not a score of zero for document quality.

## Reference and setup

The [SDK survey](../../docs/reference/evaluation-survey/sdk-libraries.md) and
[first comparison](adr-0025-evaluation.md) remain the authorities for Braintrust
local-runner behavior. This experiment must separately identify intentionally
networked Codex calls; the earlier network-denied comparison does not cover them.

Read-only preflight on 13 September 2026 found installed Codex 0.153.4. Native
`model/list` returned `gpt-5.6-terra` and `gpt-5.6-sol`, each supporting low effort.
No model turn was started by preflight. The selected first-pass judge is Terra,
not Astra. Model availability is not a completed judgement or usage measurement.

The [official App Server events](https://learn.chatgpt.com/docs/app-server#events)
document turn completion, usage updates and rerouting. Numeric usage is measured
at the proof's adapter boundary, not inferred from the generic display signal.
The [native review evidence](../../docs/reference/adr-0015-native-edit-review.md)
records the previously demonstrated approval path; new observations must be
reported separately rather than relabeling that historical proof.

## Candidate-interface question

The current result schema has optional monetary cost but no split between target
and scorer usage. This sprint retains exact per-invocation usage receipts with
case/scorer correlation rather than introducing an ambiguous combined token
counter. Monetary cost remains unknown unless the provider supplies it. A
supported usage shape remains for review; keeping it out of this candidate
schema does not remove the experiment's measurements.

## Frozen first-pass calibration

Before any live judging, the public cases were frozen in
[passage-cases.ts](../../spikes/adr-0025-evaluation/passage-cases.ts), SHA-256
`764d3e9a2bad42cc16b1bb7b9188f8063a05003cf503c1daf513e7f9338b7c37`.
Expected labels stay outside the model input. A mismatch is an experimental
finding, not a reason to change a label after seeing the answer.

The first live allowance is four editing turns and six judging turns. The judge
allocation reserves two turns for actual private saved revisions, useful and
deliberately poor, and four for public cases 02–05 (changed fact, omitted detail,
wrong style and removal of an embedded misleading instruction). Public cases
01 and 06 are available but outside that initial live allocation. Each judged
case uses a fresh session; cross-case conversation carryover is excluded.

Native human-review requests are answered by the authorised test harness with
fixed approve/deny choices. These are real native requests with scripted fixture
responses, not a claim that a person manually clicked the application UI. The
later presentation gate must independently exercise that interaction.

## Scripted checks (not live evidence)

The first focused run passed six tests / 66 assertions across the passage cases,
Codex scorer, native-transport usage observer and passage-effect consumer. It
used the actual Braintrust runner and Drawloom driver/gateway with scripted
provider messages. The five authority scenarios produced protected handler
counts `1, 0, 0, 0, 0` for approved, denied, revoked, mismatched and stale requests.
Blocked edits had no numerical document-quality score. Invalid judge output was
a scoring error, while an explicit uncertain judgement remained unscored.

This exercises the adapter/interface composition; it does not prove real model
selection, native-provider enforcement or editorial quality. Final verification
must include later timeout/cleanup hardening rather than relying on this initial
run alone.

## Live public judging — 13 September 2026

Four fresh native Codex sessions completed using requested Terra / low effort,
without observed rerouting. Braintrust assessed supplied outputs: target
execution was not part of this path. All four provider turns completed, results
were saved, writers closed and exact-owned tasks archived automatically.

| Case | Frozen expectation | Observed | Judge time | Input tokens | Cached input | Output tokens |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 02: changed opening time | Fail | Fail | 4,948 ms | 23,535 | 12,032 | 108 |
| 03: missing free-entry detail | Fail | Fail | 6,104 ms | 23,545 | 12,032 | 129 |
| 04: abrupt, incomplete rewrite | Fail | Fail | 5,036 ms | 23,551 | 12,032 | 119 |
| 05: remove misleading quoted instruction | Pass | Pass | 5,304 ms | 23,549 | 20,224 | 114 |

Native usage totals: 94,180 input tokens, including 56,320 cached input, and 470
output tokens. Cached input is a subset, not an extra chargeable-token count.
No dollar cost was supplied. These are whole native-turn figures, not the size
of the small rubric alone; this sprint has not attributed the remaining input
to individual native context sources. Total measured judging time was 21.39 s,
excluding session startup, result persistence and archiving. Four cases do not
support a stable p95 or throughput claim.

The overall decisions matched all four expectations, but explanations were not
fully reliable. Case 02 correctly detected the changed time while its style
finding claimed no unsupported additions. Case 03 correctly identified missing
content but also failed style on content grounds despite acknowledging the
output was one sentence. This is useful coarse regression detection, not a
validated fine-grained quality rubric or general judgement accuracy.

The parent Node process used the real Braintrust runner with `noSendLogs`,
hosted Braintrust credentials removed, and the existing diagnostics-channel
observer. It recorded zero outbound events. The separate Codex process was
intentionally networked. This is observation, not OS-enforced offline isolation
of the live phase, and it does not establish visibility into Codex internals.

The [sanitised measurements](adr-0025-judge-public.json) retain these observations.
Raw synthetic results and exact-owned cleanup receipts remain in the disposable
local run directory. No private passage content or task identities are published
here. An empty Drawloom tool exposure does not establish native ambient-tool
isolation; that stronger claim is deliberately excluded.

## Live private consumer — aggregate result

The actual private recipe revision handler was exercised through the existing
gateway and native Codex review. Useful and deliberately poor approved edits
each entered the protected handler once and produced the exact requested
unaccepted draft. Denial and approval with a revoked independent grant each
caused zero protected edits and left the source unchanged. All four native
requests were checked against the expected server, request kind and arguments
before the test supplied its fixed response. The single owned task archived.

Both saved revisions were then assessed through the same public scorer/runner
with fresh Codex sessions. The useful edit passed and the changed-fact edit
failed, matching the predeclared expectations; both judge tasks archived.
Private passages, identifiers, exact timings and receipts remain in the private
consumer evidence (`docs/adr-0025-passage-judge.md`), not in public fixtures.

This demonstrates real permitted/blocked effects plus advisory judgement of
actual results. It is source composition with a synthetic in-memory store and
saved proof state, not installed-desktop interaction or a restart test. Tool
and arguments were explicitly requested: it is not a test of autonomous tool
choice among ambiguous alternatives. No replacement was generated during
assessment. Four edit turns plus six judging turns used the entire initial live
allowance; none was retried.

The native archive responses confirmed all seven exact-owned tasks. A fresh
Codex recent-task listing afterward contained none of those seven identities.
No title sweep or unrelated task archival was used for this sprint.

## Remaining gates

Knowledge retrieval/grounding comparisons, UI findings/comparison/feedback,
residual media checks and broader evaluator calibration remain outside this
sprint. No ADR acceptance, supported evaluation dependency or production
judgement accuracy is established here.

## Review and failure-path checks

A focused Astra review found two defects before handoff: imported case IDs could
become filesystem paths, and a lost `thread/start` response could leave no known
task ID and lead to premature removal of recovery state. Both were corrected:
runtime directories now use generated ordinal names, and an attempted start
without its identity is explicitly uncertain and retains its recovery directory.
The reviewer confirmed both fixes without another broad review.

A controlled local App Server fixture exits after one `thread/start`; the
regression verifies retained state and exactly one submission. The hostile-ID
fixture verifies generated directories rather than interpreting `../` as a
path. Additional scripted checks cover cancellation immediately after execute
and interruption of an unexpected, correctly correlated approval request.
These are simulated failure cases, not extra live model calls.

The live allowance was already exhausted when these defensive fixes completed.
They were verified through targeted tests and typechecking, not by claiming a
second live run. Healthy-case measurements above remain the original run.

## Final verification and decision

- Final focused public suite: ten tests, 81 assertions, zero failures.
- Public `bun run check:ci`: exited zero after the two observer test typing errors
  found by the first gate run were corrected. This includes source/type checks,
  package artifacts, architecture/import guards, UI policy, builds, Bun and Node
  tests. The existing desktop large-chunk warning remains; this sprint made no
  presentation changes and does not resolve that warning.
- Private `bun run check:ci`: exited zero, 136 tests and 826 assertions, including
  Svelte checks with zero errors/warnings and the existing consumer integrations.
- Both repository diff checks passed. No commits, acceptance or publication.
- Focused Astra review and targeted fix verification completed with no remaining
  findings in the reviewed scope. Live proof calls were made by the coordinator;
  scripted fixture calls are reported separately.

Continue with the candidate Braintrust path for the remaining consumer gates.
The sprint supports separating tool choice, permission, effect and judgement;
it does not yet show that model judging earns its cost over cheaper checks for
routine cases. Keep per-scorer usage receipts until target/scorer attribution is
explicitly designed. Broader calibration should assess explanation reliability,
false positives and useful improvements over deterministic checks, not simply
repeat these six small cases.
