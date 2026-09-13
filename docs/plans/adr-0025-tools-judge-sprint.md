# ADR 0025: tool effects and native Codex judging sprint

Started 2026-09-13 03:42 UTC. Review around 04:42; stop by 05:42.
This goal advances two gates; it does not accept ADR 0025.

Status: completed within the first hour on 13 September 2026. Durable results,
review fixes, measurements and remaining limits are in the
[sprint evidence](../../knowledge/evidence/adr-0025-tools-and-codex-judge.md).
Both canonical gates passed. Keep implementation and ADR uncommitted/Proposed
for maintainer review; no further live calls are allocated to this sprint.

## Global constraints

- Existing checkouts, no branch, commit or publication. Preserve all prior work.
- Public candidate code and synthetic cases belong in Drawloom's retained proof.
  Recipe-specific consumer code and evidence stay in drawloom-workbenches.
- Use existing evaluation, agent, gateway and native approval contracts. No new
  reviewer, agent loop, browser protocol or supported package. Bring required
  boundary changes to the maintainer, rather than silently extending them.
- Only invented passage text and disposable local state. No production data,
  media generation, downloads or hosted evaluation account.
- Real Codex calls are explicitly authorised for this sprint. Use a supported
  efficient configured model, initially gpt-5.6-terra with low effort. Record
  actual availability and usage; no silent switch to Astra.
- First live pass: at most four editing turns and six judging turns, serial,
  with a bounded timeout per turn. No automatic retry after uncertainty. Report
  a limit or failed experiment rather than spending indefinitely.
- Archive exact test-owned tasks after durable results and writer closure using
  the new cleanup helper. Preserve uncertain receipts for recovery. No title
  sweeps, production lifecycle changes or extra user-owned sidebar tasks.
- Model scoring is advisory, not permission or business acceptance. Denied or
  failed execution is not a numeric quality zero.

## Task 1: native judge and passage-effect consumer

Read applicable guides, ADR 0025, its candidate interfaces and ADR 0015's native
review evidence. Own new files under spikes/adr-0025-evaluation/ for the judge,
consumer fixtures, live launcher and regression tests; private consumer files
under drawloom-workbenches/spikes/adr-0025-video/ where needed. Root owns ADR,
plan and public evidence/index edits. Amend a candidate contract before its
implementation only if demonstrably needed, and explain the exact change first.

Reuse the Braintrust candidate runner and scorer contract. Add a Codex-backed
scorer through the actual App Server/agent boundary, not an OpenAI-compatible
client. Validate bounded structured findings, capture elapsed time and available
token usage, leave unknown monetary cost unknown. Keep expected quality labels
out of the judge input; give it the editing request, source, proposed result and
explicit rubric. Treat candidate text as untrusted material, not instructions.
No hidden reasoning capture. Keep scoring errors, cancellation and uncertainty
distinct from an unfavourable quality judgement. Persist results before archive.

Exercise the existing private passage revision operation where usable, using
only synthetic material. The live matrix is approved useful edit, approved poor
edit, denied edit and approved-but-revoked-grant edit. Denial/revocation must
produce zero protected edit-handler calls; approval should produce one correct
unaccepted revision with before/after evidence. Selection of the correct tool
and correctness of the actual effect are separate findings. Do not replace a
failed native path with a fake approval and claim live success.

Public deterministic tests must stand alone: use the existing gateway/adapter
and scripted native transport to prove selected-tool/effect distinction, deny,
grant revocation, mismatched/stale approval, expected-label isolation and scorer
failure. Reuse existing tests rather than duplicating native authority code.

Use a small fixed passage set with useful revisions and distinct poor cases
(e.g. changing a fact, omitting required detail, failing the requested style).
Freeze expected judgements before the live calls. Assess saved outputs without
regeneration, include a misleading instruction embedded in an evaluated passage,
and report disagreements rather than tuning labels to fit the judge. The
private native edit can feed the same scorer; no private fixture enters public.

Write failing tests first, then implement. Verify both the real library path
and scripted Codex scorer path. Keep evaluation vendors from uploading content
or inheriting hosted credentials; the old fully network-denied proof cannot
silently be described as covering the intentionally networked Codex phase.
Explain the actual network boundaries and any limitation. Prepare live commands
but let root launch them after checking limits, authority and cleanup.

Write an implementation report to the task report path with exact files,
commands, red/green results and limits. No subagents. No commits.

## Task 2: live run, review and evidence

Root checks the fixed rubric, actual call limits, native setup and disposable
ownership, runs the live proof, and records observed edit counts, approval
decisions, quality findings, latency, available usage and cleanup. Source-only
inspection and simulated tests must not be presented as live results.

Run the targeted suites and canonical public check; private checks cover any
private consumer changes. Use one focused review before integration; repeat only
checks covering fixes. Document unresolved cases and what another sprint needs.
Knowledge, presentation and residual media checks are explicitly outside this
sprint. Keep ADR Proposed and all changes uncommitted.

## Success

A reviewable comparison shows whether the proposed interface can separate tool
choice, permitted effects and useful work, and whether a real Codex judge helps.
Concrete limitations are a valid sprint result. Small synthetic calibration is
not proof of general judgement accuracy, production readiness or ADR acceptance.
