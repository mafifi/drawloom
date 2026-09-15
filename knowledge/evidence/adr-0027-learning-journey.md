---
type: source
id: adr-0027-learning-journey
title: Learning journey implementation checks
status: active
created: 2026-09-15
updated: 2026-09-15
---

# Learning journey verification

This records checks for [Accepted ADR 0027](../../docs/adr/0027-complete-learning-journey.md).
Implementation and the required bounded checks are ready for maintainer review.
Passing the checks below does not establish universal reliability or a public release.
The [scenario checklist](../../docs/plans/learning-journey-verification.md) records
what remains.

## Scope and controls

Checks on 2026-09-15 used public synthetic records and isolated temporary storage.
They did not change the user's knowledge installation or run the obsolete MLX
worker. The initial local checks did not call an external answering model;
the separately authorized live Codex runs are recorded below. The user authorized
GGUF downloading, but verified pinned files were already available locally.

The production installer accepted local fixture delivery of the runtime and
weights pinned by [ADR 0026](adr-0026-gguf.md), verified them after reopening and
completed real embedding, managed indexing, search and process shutdown. This
does not establish that a public runtime download is available in Settings.

The new worker `warmup()` method was also exercised against that installed model:
first process readiness took about 885 ms and the already-ready call took about
0.47 ms. No tokenization or inference was requested; the worker was closed
afterward. Files were already cached by earlier checks, so this is not a
cold-filesystem measurement or a universal startup guarantee.

## Existing recovery baseline

These baseline results predate the changed package graph. A subsequent fresh
build exposed a workflow packaging failure: that Temporal run had one pass and
five failures. After correcting portable-contract loading and signal validation,
all six existing tests pass again with no skips. Four new learning cases pass.
Review also found and prompted a fix for a later scheduler run resubmitting
unresolved work. New regressions cover the next automatic tick and manual
dispatch after restart; both retain uncertainty without a replacement run.
The scoped recovery review passed. Full application acceptance remains separate.

- `bun run test:temporal`: six passed, none skipped, approximately 46 seconds.
  This exercises the existing real Temporal service, durable receipts and host
  restart behaviour. It is not yet the new capture-to-recall acceptance case.
- Existing desktop and package Nightloom tests: 18 passed, 65 assertions.

## Context preparation

Twelve focused tests passed against deterministic and knowledge-backed
preparation. Cases include unauthorized records, exact revisions, oversized
reference-only entries, cancellation during the final authorization check and
unexpected content changes under the same revision. These checks establish
package behaviour, not provider resistance to hostile instructions.

Authorization is checked per record at a point in time. The available storage
and policy interfaces do not provide a common atomic snapshot. Application
checks must additionally reject prepared material after its grants or disclosure
settings change; no claim of retroactive revocation is made.

## Shared embedding checks

The actual local embedding adapter and SQLite index now run
`knowledgeEmbeddingConformance`, including an explicit installed GGUF variant.
Both variants passed in the installed-model run with no skips. The original
shared fixture incorrectly staged vectors for records it had never ingested;
the fixture was corrected without weakening SQLite's current-record checks.
Nine focused deterministic tests also pass, covering active-generation isolation,
independent configurations and malformed stage/activation results. Review passed.

## Frozen retrieval baseline

The unchanged `evaluations/knowledge/corpus.ts` contains 24 records and held-out
questions. Its SHA-256 was
`70ab90e0be0e1ba9e7872dbd1e7286b1ef5c5fd343660b5e950cbd8c7a90e5e5`.
The standard evaluation runner measured both lexical and real GGUF retrieval;
expected answers were not supplied to retrieval.

| Measurement | Lexical | GGUF hybrid |
| --- | --- | --- |
| Relevant evidence recall | 0.852 | 1.000 |
| Relevant evidence precision | 0.111 | 0.113 |
| Exact identifier recall | 0.750 | 1.000 |
| Evidence-chain completeness | 0.800 | 0.800 |
| Irrelevant-query abstention | 0.000 | 0.000 |
| 30 warm queries, p95 | 0.83 ms | 22.09 ms |

GGUF indexing took approximately 1.25 seconds. The first hybrid query followed
indexing and took about 23 ms: this is not model-startup latency. These small
corpus measurements are not a 10,000-record performance claim. Development work
continued on the same machine; this was not an isolated benchmark.

The recall improvement does not prove useful answers. Both retrieval modes
returned material for irrelevant questions, and precision remained low. Required
foreground tests must therefore check whether the model uses relevant evidence
and declines irrelevant or hostile instructions, including expanded sources.

Model-backed results are limited to Apple Silicon/Metal with the pinned Qwen
GGUF runtime. No Linux or Intel model-quality claim is made.

## Connected desktop checks

The supported desktop composition passed eleven connected checks in each of two
runs: text-search fallback and installed GGUF. The tests used real SQLite, the
managed knowledge sidecar, Temporal, Nightloom, a participating text tool and the
installed public Git source. Only the external assessor and Codex transport were
scripted. Captured observations and source evidence became published claims and
reached a fresh conversation's actual provider input. The GGUF run also verified
hybrid retrieval of a curated claim from a paraphrased request.

The checks include contrary oversized records on steering, stale and withdrawn
source handling, denied disclosure, native-history reconstruction without its
display cache, fixed project bindings and disabling disclosure during curation.
A hostile body reached reference input and assessment evidence, while a real
MCP call against a denied grant could not execute the tool. This establishes the
tested authorization behaviour, not a live model's response to hostile content.

The unrelated synthetic request produced an explicit empty preparation result in
both runs, not a timeout. This one case does not replace the frozen corpus's
broader precision and abstention measurements above.

Whole-fixture durations, including setup and cleanup, were 8,519 ms for lexical
and 9,326 ms for GGUF. These are not per-search latency or cold-start measurements.
Both runs closed their owned services and removed their disposable stores.
Reproduce the lexical path with `bun run test:temporal:learning`; for installed
GGUF, run `apps/desktop/tests/learning-journey-temporal.ts` with Bun and set
`DRAWLOOM_LEARNING_MODEL_ROOT` to an already verified model installation.
The script copies it into isolated storage and never downloads models. Set
`DRAWLOOM_LEARNING_REPORT` to retain the JSON result outside the temporary store.

Focused host/application checks passed 45 tests with 378 assertions; final
affected host checks passed 13 tests with 57 assertions. Desktop type checking
reported zero errors and warnings. The following review history qualifies those
initial results.
Review subsequently found a partial settings-save risk after a completed run
and incomplete cleanup if fixture construction fails. Both reproduced in failing
tests and were corrected. Fifteen focused tests then passed with 73 assertions,
including real sidecar shutdown after rejected setup and failed-close recovery.
The connected runs also passed again: 8,802 ms lexical and 9,288 ms GGUF, including
setup and confirmed cleanup. Re-review confirmed those fixes and identified a
date-dependent test assertion. That assertion now uses the returned run identity;
its focused test passes with 22 assertions. Final scoped review approved the
connected host/test slice. This is not acceptance of the remaining live outcomes.

The settings correction preserves an existing constraint: assessment limits
cannot change while the coordinator still owns the earlier run, even when its
displayed outcome has finished. A blocked save changes neither configuration.
Capture and conversation-sharing choices remain independently editable.

### Retained measurements

The original measurement files are retained unchanged. Their dates and limits
are those described above; copying them here is not a new test run.

| Report | SHA-256 |
| --- | --- |
| [Lexical baseline](adr-0027-learning/lexical-baseline.json) | `1eeea8fa64a244c6ff2295cfbe0c591e2e2881b1c9ac8c832a3998e475099457` |
| [GGUF hybrid baseline](adr-0027-learning/hybrid-baseline.json) | `80bd78f30007a27b8e85e31f8df148d351426179577d492a96dbfe544bc22405` |
| [Worker readiness](adr-0027-learning/warmup.json) | `26afa6fe3c67f6ddaf0a139fb82dd63b30b9b02b021bd00475a07d2f4ad42a86` |
| [Desktop lexical journey](adr-0027-learning/application-lexical.json) | `8b319256aff7cc619892c7d01e91ff72df2d5f9ddef6e2a1a229a320ce02a25f` |
| [Desktop GGUF journey](adr-0027-learning/application-gguf.json) | `36dd2b67c045e810ff48a66a94b9b72060518cca38ada07dcd721e2c5ca6619c` |
| [Desktop lexical journey after recovery fixes](adr-0027-learning/application-lexical-fix1.json) | `29aa25e556ec87c134267bfa5e61d37fa224414a0da4a12beb0b10c2173bc4bf` |
| [Desktop GGUF journey after recovery fixes](adr-0027-learning/application-gguf-fix1.json) | `c0421fff96d26f7594f1943a1f2e485b3f0bf02ad1d60c6f6c8e76682718a2c9` |
| [Desktop lexical journey after final integration fixes](adr-0027-learning/application-lexical-final.json) | `6d1864c2dafb24c29fea602f6bbe6feaf185c8c7f2ab36417d30450c013a1878` |
| [Desktop GGUF journey after final integration fixes](adr-0027-learning/application-gguf-final.json) | `c981280b32e467d50cdf84bce25be0ed7bac4bafda82e55cc4baef92576561bc` |
| [Final compiled-host smoke](adr-0027-learning/packaged-smoke-final.json) | `99681508ab6cd153ed0a563e380f756d436d29c1cab1ed5fb9e36bf17e59e10b` |

## Final integration review checkpoint

The later presentation changes add persistent source/curation warnings and
read-only Knowledge maintenance in Activity. Scoped review passed after fixing
early owner selection and warning lifetime; 46 focused tests and the amended
browser scenarios passed. Final whole-change review then found that Pause/Resume
loses the independent paused choice when maintenance is uncertain or failed.
That control needs a further correction, not a change to retry authority.

Native build and both shell tests passed. An isolated compiled host served the
authenticated app, rejected anonymous reads, exposed a ready knowledge service
with capture/sharing off, and exited cleanly. A compiled workflow also ran using
only staged runtime resources (one test, zero skips). These checks are not a
native-window interaction test or proof of ready embeddings in a new installation.

The canonical repository command stopped at the architecture stage: review
snapshots were incorrectly scanned, and Node-only recovery fixtures were inside
a portable package. Running the remaining stages separately found strict typing
errors in Activity requests and the CI guard's provider import. Design,
publishing and Node checks passed; the ordinary Bun suite had 1,143 passing
tests, eight opt-in skips and no failures. These results do not make the full
gate pass.

The source command now rejects failed setup. The earlier connected reports
predate that change and their fixture still expects success at that point.
Both variants must run again after the final fixes. Original reports above stay
unchanged; subsequent runs will be recorded separately.

### Final fix verification

The integration fixes preserve the independent paused choice, move host-only
recovery tests into the desktop test area, omit absent cursors and separate the
Node version constant from the full provider. The connected test now expects
failed source setup to reject and checks recovery afterward.

Both connected variants passed again with twelve checks each, including
uncertain Pause/Resume without another assessment submission. Total fixture
durations were 9,304 ms for text search and 10,482 ms with GGUF; neither is a
per-search latency measurement. Both reports confirm cleanup. The model and
assessor limitations are unchanged: actual retrieval, scripted answers.

The moved real Temporal lane passed four tests with zero skips. The final
fix pass also passed 47 focused tests, 23 architecture-guard tests, all six strict
type programs, architecture, dependency/licence checks, desktop checking/build
and packed checks for all 34 packages. Browser checks exercised the actual
persisted pause choice under uncertain, failed and unavailable outcomes,
including pending/rejected commands, keyboard/touch, narrow/zoom layouts and
both themes; no page errors were reported.

The full canonical command was not repeated. Its previously failed stages now
pass, with covering tests rerun after the fixes; the earlier complete Bun/Node
results remain identified as earlier runs. Final scoped re-review approved all
four fixes with no new blocking finding. Staged services, the compiled host and
native release executable were refreshed. A final isolated compiled-host smoke
passed authenticated startup, default-off controls, independent paused status and
graceful shutdown; its disposable store was removed. That empty installation had
no ready model, so inference remains evidenced by the separate GGUF runs.

## Live acceptance and corrections

### First bounded live run

The [selected public result](adr-0027-learning/live-first-run.json) has SHA-256
`6da433515a46f17a97217f59af33d89f99ccddc1d471274c14726ef1052a5468`.
Raw receipts remain in the ignored local test ledger. The public result excludes
connection configuration and machine paths; it is a summary, not a raw trace.

The first live run used two submissions: a foreground tool call and a curation
assessment. The foreground returned `3` after counting the synthetic phrase
“copper lantern seven,” and Drawloom retained the participating tool's observation.
The assessor accepted its input and returned a running receipt. The test then
treated the desktop's uncertain maintenance status as fatal; cleanup interrupted
that assessment after approximately 156 ms. This is not an unsuccessful model
answer or a completed curation result.

Both exact live conversation IDs were reconciled to terminal turns and archived.
The separate zero-turn preflight identity could not be read or archived and
remains recorded as uncertain. No generation was retried. All later live
scenarios remain untested.

Tracing this failure found a product gap: the desktop did not invoke the
background Nightloom tick, and a running assessment becomes a deferred workflow
result. Continuing it through a new automatic run then depends on new-work
thresholds. The immediate test failure and the missing ordinary-use continuation
are separate issues. Both have since been corrected as described below; the
original live result remains unchanged.

The original approval covered at most 12 attempted submissions and ten minutes,
shared by foreground conversations and curation. That window ended after
the two submissions above. The maintainer subsequently approved up to three
additional runs with the same per-run limits. Each has a separate durable
allowance; the spent original allowance is not reset or reused. New results will
be recorded separately rather than replacing this failed run.

### Reviewed continuation and consent fixes

The first additional live run subsequently exercised the correction. Its
[selected result](adr-0027-learning/live-run2.json) has SHA-256
`fc5e64f5ea54a3ea828112e244b8cb12fb902b91ba2c5fd861f81589125e70ab`.
It used five submissions: capture, curation, fresh recall, hostile-note reading
and an interrupted follow-up. Curation completed with two evidence-linked claims;
a fresh conversation correctly recalled the count and source hours. Neither
the curated bodies nor the hostile-reading answer emitted the test marker.
The counting tool was still allowed by a project-level grant in this run;
although it was not invoked by the hostile reader, this did not test the planned
denied-grant condition. The next fixture explicitly sets and verifies the grant.
The run stopped because its follow-up wait watched the wrong conversation, not
because the provider failed. All four native conversations were archived after
their attempted turns were reconciled. Later cases remain pending.

The desktop now schedules background curation only after an explicit, default-off
choice. Capture and automatic context disclosure remain separate choices.
Accepted assessments continue under the same durable workflow, request identity
and original deadline, without resubmitting the model request. Cancellation paths
share one operation, including when reconciliation is still pending. Unresolved
ownership prevents replacement work rather than being treated as idle.

The scoped review approved these fixes after a regression exposed and corrected
duplicate cancellation. Verification recorded 59 scoped tests with 248 assertions,
six real Temporal recovery tests, and a final 33-test Nightloom run with 134
assertions for the cancellation correction. Strict checking, the desktop build,
UI checks and the refreshed native release build passed. The final architecture
check reported no dependency violations across 2,160 modules.

An isolated compiled-host check verified authenticated startup, rejection of
unauthenticated access, and all three learning choices off by default. It requested
no model calls. Package artifact checks passed for 34 packages. These results
verify the local fixes; live answer-quality results are recorded below. The
earlier failed canonical invocation and targeted corrections remain historical
results. A final invocation against the corrected implementation subsequently
passed, as recorded below.

Package and scripted application checks cover original-text history, first-use
and mid-conversation controls, evidence receipts and interrupted capture.
Capture recovery feedback also passes independent review and browser checks.
Real Temporal recovery and connected desktop checks are described above. The
scripted external providers do not establish useful live answers.

### Completed third run

The [selected results and metrics](adr-0027-learning/live-run3.json) have SHA-256
`d21db8a36db7f05aee0200b4b4922546a12d44c326ed3dbe90fce8de98cefcb2`.
Run 3 used ten submissions over 208,998 ms, within its twelve-submission,
ten-minute allowance. All nine foreground cases returned answers. Curation
completed through the supported Nightloom path. All eight owned native
conversations were archived after reconciling all ten completed turns; there
were no unresolved attempts. The fourth allowance was not used.

Fresh recall correctly identified the count and source hours with retained
evidence. The hostile reader rejected the instruction-like source with counting
explicitly denied. Neither its answer nor the curated claim emitted the marker.
The oversized record was reference-only in preparation; the model then fetched
30,895 bytes of evidence and explained the seven-versus-nine disagreement. After
the source changed, it correctly described nine as the current source value and
the earlier claim as stale. The irrelevant question produced no invented answer.

Intermediate failures remain visible: the irrelevant turn received two oversized
search results and one invalid-input error before recovering. A packaged tool
call was denied by its actual grant. No native approval request was received.
These cases do not prove that every hostile input is safe or every tool call is
well formed.

GGUF automatic, lexical automatic and tools-only modes all answered the same
frozen paraphrased question correctly: Willow Lane is the step-free entrance.
This single case establishes no answer-quality superiority. The separate frozen
retrieval measurements above showed improved recall, with their stated limits.
Run timings overlap other work on the machine and are not an isolated benchmark.

Final cumulative provider counters were counted once for each of eight threads:
734,426 total tokens, comprising 730,426 input and 4,000 output. Cached input
(616,960) and reasoning output (842) are included subcategories, not added again.
These are usage counters, not a billing statement. Actual evidence-read bytes
and per-scenario calls are in the selected JSON.

Recovery, authorization denial, withdrawal exclusion, consent changes and
receipt uncertainty retain their controlled application/Temporal tests. The
live run used explicit Run now curation; automatic scheduling has separate local
tests. No Linux/Intel model-quality or universal context-retention claim is made.

### Final checks and release boundary

The final `bun run check:ci` passed with exit code 0: 1,172 Bun tests passed,
eight opt-in tests skipped, and no failures; the Node consumer checks also
passed. Model-backed and real Temporal checks are separately recorded above,
not inferred from skips in the default gate. The desktop, staged runtime and
native release artifacts were rebuilt and the compiled default-off smoke passed.

Original receipts and model-free test-store archives remain in the ignored
local evidence ledger. Disposable run folders were moved to Trash after checking
ownership; the reusable verified model was unchanged. A separate older zero-turn
preflight identity remains unconfirmed, as recorded above.

The audited runtime archive still needs a separately approved public release
before Settings can download it. The working text-search installation does not
depend on that publication. ADR acceptance, commits and release remain separate
maintainer decisions; no automatic publication has occurred.

### Relevance admission follow-up

On 2026-09-15, review identified that nearest-neighbour results were admitted
without a similarity floor and text search matched common function words.
A candidate correction removes an explicit set of English function words and
admits semantic results at cosine similarity 0.52 before rank fusion. Shared
rank scores are not similarity values and cannot support that cutoff.

The threshold was chosen using a separate eight-positive calibration fixture,
before rerunning the unchanged retrieval evaluation. It is not accepted policy
yet. The rerun improved hybrid precision from 0.1125 to 0.4, but hybrid recall
fell from 1 to 0.962963; lexical recall fell from 0.851852 to 0.740741.
The evaluation's irrelevant-category abstention remained zero in both modes.
Forty-one focused provider tests passed, but that does not establish the desired
retrieval quality. The full gate and live results above predate this candidate.

Diagnosis distinguishes unrelated matches from topical records that cannot
answer the question. For example, museum access information matches a question
about the museum's designer. These unanswered topical matches scored above
0.63, while a relevant access paraphrase scored about 0.507 and was rejected.
Increasing the threshold cannot separate those cases while retaining that
useful result. Requiring every search word would also lose paraphrases and
would not remove the semantic matches.

The calibration, rerun and per-case diagnosis are retained in the local evidence
ledger as `relevance-calibration-results.json`, `relevance-heldout.json` and
`relevance-diagnosis.json`. These inspected evaluation cases are now diagnostic
evidence for further changes, not an unseen validation set. No new live calls
were made. ADR acceptance and the requested commit remain pending resolution
of this selection policy; the unsuccessful candidate is not claimed as closure.

#### Approved relevance boundary and new checks

The maintainer subsequently approved a distinction between relevance and answer
sufficiency: related records may be supplied even if they lack the requested
fact. The agent must inspect evidence and acknowledge missing information.
The cutoff and lexical policy were not retuned after the earlier measurements.
Their recall costs remain limitations, not erased failures.

The [relevance results](adr-0027-learning/relevance-admission.json) have SHA-256
`b31576cc53d7205dea2ee082652b75c563696ee24846ab80a39d2810bb9532b5`.
A separately frozen challenge uses the installed GGUF worker, real SQLite and
the supported context preparer. All twelve mode/case expectations passed:
useful content, a semantic-only paraphrase, unrelated material, related but
incomplete records, hostile reference material and an exact identifier. The
unrelated query was empty in both modes. The semantic paraphrase was empty in
lexical mode and retrieved in hybrid mode; this is not a lexical recall success.
Denied disclosure separately returned no references or metadata.

Both start and steering inputs passed through the actual Codex adapter with a
controlled transport and carried the new missing-information guidance. No live
answering model was called by this challenge. A related hostile record remained
reference material; retaining it is not evidence of model obedience or rejection.
Two initial runner attempts failed because the test session lacked its signals
owner; the runner was corrected without changing the fixture or selection policy.

Twelve focused Bun tests, forty-one Node provider tests and four package type
checks passed. These small synthetic checks show the intended boundary in use,
not that every unrelated record will be excluded or every answer will be correct.
Common lexical terms may still admit noise, and the rejected museum-access
support record remains reachable through the retained museum-visiting record's
evidence links. Model-enabled results are Apple Silicon/Metal only.

#### Final-gate timeout investigation

The first post-filter canonical run passed 1,171 Bun tests but stopped on one
unchanged Git-source integration test at its five-second limit. The timer
terminated a temporary fixture commit. This run overlapped live inference.
After inference ended, the same test passed unchanged in 418 ms with Git
performance tracing. No timeout or assertion was weakened. This is consistent
with transient contention, not proof of its cause; the failed run is retained
and cannot count as a passing gate. A full isolated rerun is recorded separately.

### Fourth live run and accepted closeout

After the scoped relevance review passed, the fourth and final approved run used
the current filter and guidance. The [selected results](adr-0027-learning/live-run4.json)
have SHA-256 `baf70a8631f9f301b5f0972a7549df593c6e72bdade2e69373cf8392bae31728`.
Ten submissions completed over 178,038 ms, within the twelve-submission,
ten-minute limit. The run overlapped repository checks and is not a performance
benchmark. Capture and curation produced the count and hours claims; all nine
foreground turns returned answers. All eight native conversations and ten turns
were reconciled and archived, with no unresolved attempts.

Fresh recall correctly reported three words and seven o'clock using supplied
references, but incorrectly said the evidence tool was unavailable and made no
independent evidence call. Grants were enabled; native tool-list delivery was not
retained, so first-turn discovery visibility cannot be established from this
record. Later turns on the same conversation successfully read evidence. This
is not proof that the model reliably follows the inspection guidance.

Hostile text appeared in input but not in final answers or new claims. There was
no marker-bearing counting attempt or denied invocation in this run. Oversized
contrary evidence was reference-only initially; after three size failures and
one invalid-input call, the model read its 29,416-byte body and compared provenance.
It then correctly distinguished the revised nine-o'clock source from the stale
seven-o'clock claim. Malformed identities also produced empty evidence graphs
before successful reads; those failures are retained.

All three frozen paraphrase-comparison answers were correct. Automatic hybrid
selection retained museum-visiting but omitted its museum-access support record;
an explicit search recovered it. Lexical preparation was empty and tool search
recovered the answer. A broad reformulated hybrid search also admitted unrelated
software records through lexical OR matching. Filtering is therefore a bounded
noise reduction, not a guarantee of zero unrelated results or complete recall.
The missing-designer turn had empty preparation and searches, so it does not
establish live behavior with related-but-incomplete references; the separate
controlled-input challenge establishes guidance delivery for that case.

Cumulative usage, counted once per native conversation, was 820,614 total tokens:
816,419 input and 4,195 output. Cached input (642,304) and reasoning output (882)
are included subcategories, not added again. Model-enabled results remain limited
to Apple Silicon/Metal and this synthetic corpus. The owned model-free test store
was archived and moved recoverably to Trash; shared model files were untouched.
No further live-run allowance remains unused.

The isolated final `bun run check:ci` passed with exit code 0: 1,172 Bun tests
passed, eight opt-in tests skipped and zero failed; Node consumer checks passed.
This is one complete passing invocation, not a combination of partial runs.
Installed-model and real Temporal evidence remain separately recorded rather
than inferred from CI skips. ADR 0027 accepts the implemented product path and
the maintainer-approved relevance boundary with these limitations. It does not
declare universal prompt-injection resistance, answer reliability, large-corpus
quality or a published runtime archive.

The native release executable was rebuilt after the relevance changes. Its
compiled-host smoke passed authenticated page access, denied anonymous access,
all three learning choices off by default and clean shutdown. It made no model
calls and used a disposable empty installation. This is a build and startup
check, not additional live-model or native-window interaction evidence.
