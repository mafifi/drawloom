---
type: source
id: adr-0024-local-knowledge
title: Local knowledge implementation and retrieval evaluation
status: active
created: 2026-09-12
updated: 2026-09-12
---

# ADR 0024 implementation evidence

The [Accepted ADR](../../docs/adr/0024-local-knowledge-memory-and-retrieval.md)
records the maintainer's 2026-09-12 acceptance of the implementation, including
retaining hybrid retrieval pending stronger representative workloads. The results
below are unchanged by acceptance: synthetic quality evidence is limited and
unperformed checks remain unperformed.

The subsequent [MLX acceleration check](adr-0024-mlx-acceleration.md) compares a
GPU implementation with the CPU baseline. It also corrects the original indexing
timer: the historical indexing elapsed/CPU figures below include the following
54 searches. Per-query measurements are unaffected; keep the original reports
and use the separately recorded corrected comparison.

## Reference machine and runtime checks

Observed 2026-09-12: Apple M2 Ultra, 24 physical cores, 64 GiB RAM,
macOS 26.6.2 (25G83), Node 24.20.0, Bun 1.2.23.

- `bun:sqlite` plus sqlite-vec 0.1.9 rejected extension loading with
  `This build of sqlite3 does not support dynamic extension loading`.
- A fresh `node:sqlite` DatabaseSync with extension loading explicitly enabled
  loaded sqlite-vec v0.1.9 and reported SQLite 3.53.4.
- No custom SQLite library was set and no existing database was modified.
- Transformers.js 4.2.0 imported successfully under Node. The locked dependency
  uses ONNX Runtime Node 1.24.3. Import success is not inference verification.
- Dependency installation left unrelated lifecycle scripts untrusted. No blanket
  lifecycle-script trust was granted.

## Model candidates

Model metadata and small configuration files were read from the pinned revisions.
After explicit maintainer download consent on 2026-09-12, both candidates were
installed through the supported `createModelSetup().install({ consent: true })`
path. All ten artifacts passed size and SHA-256 checks, followed by `ready()`
verification. Qwen setup took 25.41 seconds; Nomic took 7.56 seconds. The isolated
local evaluation cache is `/private/tmp/drawloom-adr24-models-Dczwc9`; no existing
Drawloom database or model installation was changed.

| Candidate | Pinned revision | q8 ONNX bytes | q8 SHA-256 |
| --- | --- | ---: | --- |
| onnx-community/Qwen3-Embedding-0.6B-ONNX | c25a394dd583836952667c12f008335071b3f43d | 613527631 | 87cd124e0ef1fd1f223ebc283efccbaeac386d0b08344701c46975d0657b591f |
| nomic-ai/nomic-embed-text-v1.5 | e9b6763023c676ca8431644204f50c2b100d9aab | 137296292 | b4342336debaea79de872370664b0aaeb67dea4605513d00ee236ea871a81f27 |

[Qwen's ONNX model card](https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX)
documents query instructions, last-token pooling and normalization. Its config
specifies 1,024 dimensions. The tokenizer advertises a larger context than the
model; input validation must use the tested model limit, not tokenizer metadata.

[Nomic's model card](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5)
documents query/document prefixes, mean pooling, layer normalization, optional
dimensional reduction and L2 normalization. The pinned config has 768 dimensions,
2,048 trained positions and separate longer-context settings. No untested
8,192-token ONNX support is assumed.

Both base models are Apache-2.0. Qwen's conversion needs its own provenance and
license check in the packaged model manifest; missing model-card license metadata
is not silently treated as proof of a separate conversion licence.

[sqlite-vec's JavaScript documentation](https://alexgarcia.xyz/sqlite-vec/js.html)
describes Node and Bun loading and the macOS SQLite caveat. sqlite-vec is dual
MIT/Apache licensed and remains a pre-1.0 dependency.

## Implemented checks and live assessment

Focused checks are not the final application gate. The SQLite Node suite passed
30 cases after review fixes. These include concurrent maintenance leasing, stale
mixed-batch release, tombstone indexing progress, held-page bounds and rejection
of cross-proposal citations. The explicit release check verifies that wrong or
consumed leases conflict and successful release leaves the checkpoint unchanged.
Counts are a point in time, not a substitute for
the canonical gate.

The first live Codex 0.153.4 assessment was interrupted because reconciliation
closed its active App Server process. A regression now verifies that polling a
running turn keeps its connection alive. The second assessment completed natively
but remained marked uncertain because the adapter expected bare native items;
the installed endpoint returns `{turnId, item}` envelopes. The corrected parser
validates the originating turn as well as unwrapping each item.

After rebuilding, the same saved request was reconciled successfully, with **zero
new turn submissions**. This recovery used one initialize request, one turn-metadata
read and three one-item history pages, taking 75.4 ms. That measures recovery of
an already-completed assessment, **not model-generation latency**.

The actual `gpt-5.6-terra` / low result contained two claims: the invented Moss
Library closes on Mondays and opens at 09:00 on Tuesdays. Both cite revision r1
of the supplied invented source. The model selected its own confidence description;
core did not apply a confidence formula. No private evidence, hosted embeddings,
or additional generation was used to recover this result.

Scripted assessment checks now cover 20 cases, including concurrent duplicate
submission, late RPC completion after cancellation, failed interruption remaining
uncertain, marker recovery and retention of an active connection. These tests do
not establish ambient tool isolation or all live restart/failure scenarios.
The added multi-root authorization check confirms that a denied second root
prevents any native connection or submission.

The current multi-root contract was then exercised live with `gpt-5.6-terra`
at low effort. Two invented sources produced two claims in **6.756 seconds**,
each citing its correct source revision. There was one `turn/start`, six
turn-metadata reads, three one-item history reads and no transport errors.
The [sanitized result](assets/adr-0024/live-codex-batch.json) retains the actual
claim text and evidence links. This is one small live assessment, not semantic
retrieval evaluation or a claim that all model failure/recovery paths are proven.

## Application and durable orchestration observations

A real-host integration test passed with two synthetic project conversations,
the actual managed Node service and SQLite. Successful tool observations from
both projects remained searchable after closing/reopening the host and creating
a fresh conversation, with unchanged record identities. Search and evidence
responses excluded the synthetic message-content marker. This verifies local
capture/storage/retrieval across projects; the final retrieval request was made
through the host API, not a live agent's autonomous choice to call a tool.

A separate installed-package integration test also passed: the shipped standard
Git package was copied outside the source checkout, installed without a Drawloom
backend extension and explicitly enabled as a source. Its committed synthetic
text arrived through the existing package host into managed SQLite. Restarting
both host and knowledge process preserved the same single source revision,
without duplicate intake. This complements the generic MCP client tests; it is
not live agent revision or semantic retrieval evidence.

The existing desktop was built and run against a dedicated synthetic data
directory, not the user's knowledge or production files. In its actual Knowledge
view, keyboard search returned an invented claim and its source; evidence
inspection showed their supporting relationship. Text search remained available
with missing embedding models, and Pause changed the visible maintenance state
and disabled Run now. No model download or generation was initiated through this
view. The records were seeded through the managed client, not collected through
the Git plugin or an agent.

The follow-up browser pass inspected actual light and dark rendering at
1440×1000 and a 390×844 narrow viewport. Search and evidence remained readable
without horizontal document overflow. Keyboard submission, an empty result,
pause state, persisted settings and the missing-project Git-source warning were
observed. The warning originally disappeared on refresh; a regression now keeps
it visible without disabling unrelated search or exposing internal paths.

Both already-verified model installations were made available to this isolated
host. The question “Which weekday is the library shut?” retrieved the invented
Monday claim and its source using actual local embeddings. Selecting Nomic after
Qwen rebuilt the index and changed the selected implementation through the
existing UI. A graceful host restart preserved that selection, both record
identities and the two index entries per configuration, without recapture or
download. Maintenance stayed paused to avoid incidental model calls.

The browser's OKF export click produced no displayed error, but the in-app
browser did not produce an observable download event or saved file. Serialization
and authorized export tests do not establish that this browser interaction
succeeded; downloadable export remains an explicit verification gap.

The installed Git integration was extended through a second committed revision
and withdrawal. The actual standard MCP package fed managed SQLite; old revisions
remained inspectable but left current search, a dependent claim became stale,
and withdrawn content did not reappear or duplicate after restart. This is an
automated real-package test, not a live agent's source-selection behaviour.

The real local Temporal `full local close/reopen` check passed in 15.7 seconds.
It exercised distinct host and project/installation owner namespaces, duplicate
host starts, changed-input rejection, host-owner persistence and rejection of
changed workflow bundles. Existing project workflows retained completed effects
and input waits across restart; an interrupted effect remained uncertain without
another handler call. This checks the actual service and workflow storage, not
live Codex assessment or full Nightloom restart behavior. Other service-dependent
tests were not included in this targeted command.

The separate `evaluations/knowledge/temporal-nightloom.mjs` integration then ran
Nightloom's actual registered workflow against local Temporal and SQLite. It
processed two source units in one deterministic assessment, published their
processing checkpoint, closed/reopened the Temporal manager and obtained the
same owned run/result without a second assessment. The capped command
`DRAWLOOM_TEMPORAL_TEST=1 node evaluations/knowledge/temporal-nightloom.mjs`
completed in 7.28 seconds (5.13 user / 1.64 system seconds). The assessor returned
no claim proposals: this tests durable batch coordination, not model judgement.
Its dedicated temporary runtime was removed by the runner after completion.

## Lexical scale measurements

The final repeat collected p95 using the corrected runner:

| Public records | Whole runner elapsed | Cold query | 30 warm queries median / p95 | Sampled process peak RSS |
| --- | ---: | ---: | ---: | ---: |
| 10,000 | 3.44 s | 1.706 ms | 0.571 / 4.840 ms | 193,576,960 bytes |
| 100,000 | 33.69 s | 1.562 ms | 0.623 / 44.885 ms | 469,762,048 bytes |

The [10k final report](assets/adr-0024/local-knowledge-lexical-10k-final.json) and
[100k final report](assets/adr-0024/local-knowledge-lexical-100k-final.json) retain
the exact commands and corpus hash. Whole-run time and RSS include synthetic
intake; they are not isolated query CPU or whole-desktop memory measurements.
Both are lexical-only. The hybrid runner now uses the application's actual
bounded indexing and reciprocal-rank retrieval implementation rather than an
evaluation-only union of lexical/vector results. The later real-vector scale
runs below use that same implementation and verified weights.

The unchanged public corpus was loaded through real SQLite intake with WAL and
full synchronous durability. After correcting an unnecessary FTS delete scan,
10,000 records completed in 3.04 seconds and 100,000 in 30.26 seconds. The
[100k measurement](assets/adr-0024/local-knowledge-lexical-100k-after-fts.json)
records a 0.635 ms median across 30 warm queries and a 451 MB sampled process RSS
peak including corpus generation and intake. This is not a whole-desktop memory
measurement, a p95 claim, or an embedding result.

The earlier 100k attempt exceeded its five-minute diagnostic window after 54,954
durable records. Its [interrupted result](assets/adr-0024/local-knowledge-lexical-100k-interrupted.json)
is retained. The correction uses indexed FTS row identities instead of scanning
the virtual table for every update; new records no longer issue a pointless
delete. Durability settings were not weakened.

The initial natural-language lexical baseline required every query word and
returned no useful matches. Changing to ranked OR matching recovers much more
evidence but returns considerable irrelevant material: recall 0.926, precision
0.120, exact-identifier recall 0.75 and chain completeness 0.60 on this small
held-out set. Irrelevant queries did not abstain. These are weaknesses to test,
not success thresholds met. The later model comparison does not change this
recorded lexical baseline.

## Download and real-inference smoke

Both supported Node workers produced finite, normalized vectors locally and
closed successfully: Qwen returned two 1,024-dimensional vectors in 1.445 seconds;
Nomic returned two 768-dimensional vectors in 0.435 seconds. These include cold
readiness/model loading and are single checks, not benchmarks.

The existing evaluation runner then completed against each model using the frozen
24-record corpus (SHA-256
`70ab90e0be0e1ba9e7872dbd1e7286b1ef5c5fd343660b5e950cbd8c7a90e5e5`).
Both hybrid runs improved aggregate evidence recall from 0.852 to 1.0 and exact
identifier recall from 0.75 to 1.0. Precision remained poor (0.1125), chain
completeness remained 0.8, and irrelevant-query abstention remained zero.
Answer evaluation still reports `not_configured`. This small corpus is a working
integration smoke, not sufficient evidence to select a model or accept semantic
retrieval. The two runners overlapped, so their timing/resource results are not
used as an isolated comparative benchmark. The 10k/100k comparisons and downstream
answer evaluation were still outstanding at that point.

## Real local embeddings at 10,000 records

The two model runs were sequential, using the same frozen corpus, 24 held-out
questions, supported indexing loop and 30 warm search requests. Other normal
desktop activity was not eliminated; these are observed local measurements,
not isolated hardware benchmarks. Each store had 9,999 eligible current index
units; the retained historical revision did not enter the current vector index.

| Model | Historical index + searches elapsed | Historical index + searches CPU (all threads) | Sampled index peak RSS | Cold search | Warm median / p95 | DB + WAL + SHM |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Nomic v1.5 q8 | 270.25 s | 1,671.52 CPU s | 716,832,768 B | 675.65 ms | 650.18 / 756.99 ms | 199,178,320 B |
| Qwen3 0.6B q8 | 532.26 s | 4,675.67 CPU s | 2,146,091,008 B | 1,014.70 ms | 862.99 / 900.01 ms | 253,447,256 B |

Both met the proposed two-second 10k search p95 target. Nomic used less time,
CPU, memory and storage, with equal aggregate retrieval quality on this small
question set. This is a candidate preference, not ADR acceptance or a broad
model-quality ranking.

Both hybrid runs raised relevant-evidence recall from 0.926 to 1.0, semantic
question recall from 0.9375 to 1.0, and exact-identifier recall from 0.75 to 1.0.
Aggregate precision fell from 0.120 to 0.1125 because more irrelevant records
were also returned. Neither retriever abstained on irrelevant queries.
Top-result chain coverage improved from 0.6 to 0.8; this metric is not evidence
expansion completeness. Historical links need the actual evidence API, which
the answer evaluation uses rather than discarding missing members.

The [Nomic report](assets/adr-0024/local-knowledge-nomic-10k.json) and
[Qwen report](assets/adr-0024/local-knowledge-qwen-10k.json) retain per-question
record identities, phase CPU/RSS and corpus hash. Some category metrics with no
applicable questions use the older ratio convention of 1; those entries are
not successful identifier/abstention tests. Only applicable categories are
interpreted above. Scale comes from added templated inventory noise, not 10,000
independently authored knowledge scenarios.

## Interrupted 100k stress and real embedding recovery

The Nomic stress run durably ingested all 100,000 records. It was deliberately
stopped with 21,190 indexed records when the paired answer results failed to
establish clear semantic value. This is **not a completed 100k hybrid benchmark**;
no fully indexed 100k search p95 or full indexing-time claim is available. The
initial portion also overlapped other verification and the live-answer runner.
The isolated database and verified model cache were retained for a later resume;
no production state was changed or removed.

After interruption, SQLite `quick_check` was `ok`, and committed vector count,
index progress and active generation were all 21,190. The initial recovery test
failed because its stdin launcher passed Node's `--input-type=module` flag to a
file-backed worker. This was a test-launcher error, not a database recovery bug.
A normal-file invocation then reused the held batch and empty generation 21,191
stage, completed one real Nomic step and acknowledged it in 1.807 seconds.
Vector count, progress and active generation became 21,191; no held stages or
batches remained, and `quick_check` remained `ok`.

The original 21,190 vectors were byte-for-byte unchanged under an ordered JSON
row hash (`SELECT * FROM embedding_entries WHERE generation <= 21190 ORDER BY id`):
`41d2bc0fb761eb69fd015f31900ff763251eaa764787b04d3a5f01375f48ccc4` before and after.
The resumed step made one embedding request. No database reset or full reindex
was needed. The fresh-corpus benchmark entrypoint itself is not a resume command:
replaying its create-only historical intake correctly conflicts with an already
newer source revision. Intake preconditions were not weakened for the test.

## Paired live answer evaluation

The [actual 72-answer report](assets/adr-0024/local-knowledge-answers-10k.json)
uses 24 paired held-out questions across three retrieval modes—not 72 independent
questions. All cases used `gpt-5.6-terra` / low, a 64 KiB evidence allowance and a
60-second case deadline. Both 10k databases supplied actual returned records and
paginated evidence, including noise and historical references. Expected answers
entered scoring only, never the prompt. All cases completed; no native tool
activity, blocked cases or uncertain outcomes were observed.

| Retrieval | Completed | Frozen surface assertions | Correct abstention decisions | Invalid / outdated citations |
| --- | ---: | ---: | ---: | ---: |
| Text only | 24/24 | 32/36 | 23/24 | 0 / 0 |
| Qwen hybrid | 24/24 | 33/36 | 24/24 | 0 / 0 |
| Nomic hybrid | 24/24 | 33/36 | 24/24 | 0 / 0 |

Independent manual review read all answers, matched all 24 substantive corpus
records against both databases, and checked all 101 citations against current
revisions reachable through returned records and evidence links. No material
unsupported claim, fabricated citation or reversal of stale/conflicting evidence
was found. All three modes correctly abstained on the four unanswerable questions.

The one substantive improvement was `i3`: text retrieval omitted `export-profile`
and the model correctly declined to guess OAK-17's frame rate. Both hybrids
retrieved it and answered 24 fps. This is improved coverage, not correction of a
lexical hallucination. Eight of the ten missed surface assertions across modes
were wording false negatives; the frozen scores above are **not factual-accuracy
rates**. Nomic's `s4` also omitted the expected 3–9 April detail without
contradicting its evidence. Scores were not tuned after seeing these answers.

There was no clear answer-level improvement across the 11 semantic questions.
Thus the experiment demonstrates a narrow identifier-recall benefit, not that
either embedding model has earned its cost under the proposed acceptance gate.
Nomic is the cheaper candidate if semantic indexing proceeds; broader value
requires a separately versioned, more demanding evaluation—not retroactive changes
to this held-out set. The subsequent maintainer decision retains hybrid retrieval
and defers that broader value judgement rather than treating this result as a veto.

A serial rerun reused all 72 completed answer receipts (`cached: true`) with
identical outcomes. No new answer generation was needed. That checks evaluation
recovery, not live-provider restart guarantees for every Nightloom scenario.

## Retrieval review corrections

Focused review found and corrected five problems before final verification:

- Search authorization is checked independently of record inspection, including
  evidence provenance and continuation requests.
- Denied candidates are removed before assigning rank positions, so undisclosed
  records cannot change the visible ordering merely by occupying hidden ranks.
- An asynchronous authorization check cannot disclose a record or evidence page
  after the store revision changes; callers receive `invalidated` instead.
- Vector candidates are grouped by exact record revision before applying the
  candidate limit, preventing many passages from one record starving others.
- Oversized internal lexical pages fall back to the caller's bounded page rather
  than disabling an otherwise valid smaller search.

Regression results at this point: 14 portable contract cases, 33 SQLite cases
and eight runtime/semantic cases passed. Independent focused re-review found
no remaining blocker in those corrections. These checks are separate from the
fresh full gate and from the real-model measurements below.

## Acceptance still to collect

The fresh follow-up `bun run check:ci` command exited successfully: 829 Bun tests
passed, five opt-in native-review/keyring tests were skipped, and none failed.
Separate Node checks passed, including 33 SQLite, one inference-prerequisite,
two runtime and six semantic cases. It includes dependency
and package artifact checks, desktop Svelte checking/build, architecture/UI
guards, TypeScript checks, Bun tests and the separate Node conformance/runtime
checks. `bun run check:ui-policy` also passed explicitly (480 maintained files).
All 20 evaluation-only Node tests and the evaluation TypeScript check passed.
An earlier gate attempt identified a Node-only test accidentally selected by Bun;
it was moved to the `.node-check.mjs` convention and remains required by the
Node gate. No test was removed to obtain the passing result.

The desktop host packaging command staged its Node dependencies and compiled the
Bun host successfully. The compiled binary then ran with a fresh data directory
outside the source checkout, explicitly using the staged knowledge and
orchestration packages. Authenticated status/search returned HTTP 200, missing
models stayed explicit and lexical search remained available. Process inspection
confirmed the staged sidecar entrypoint rather than a source-workspace fallback.
`cargo check --locked` and both `cargo test --locked` tests passed after invoking
the already-installed Cargo binary by its explicit path. This is packaging/startup evidence, not a complete native
Tauri UI or native-download test.

Sanitized browser images show the [light desktop](assets/adr-0024/drawloom-adr24-knowledge-light.png),
[dark desktop](assets/adr-0024/drawloom-adr24-knowledge-dark.png) and
[narrow dark view](assets/adr-0024/drawloom-adr24-knowledge-narrow-dark.png).
The narrow native-surface screenshot was blank despite visible DOM content;
the retained narrow image is the browser page capture, which showed the actual
stacked layout. Browser appearance/viewport overrides were restored afterwards.

The 10k hybrid and paired answer evaluations are complete, but their modest gain
does not satisfy the stated semantic-value bar. The full 100k semantic run was
stopped for review rather than reported as passed. Browser/native OKF download,
the remaining live project/tool/source journey and the complete restart/failure
matrix remain open. Existing automated host/source checks and live assessments
are real evidence, not a replacement for those unperformed scenarios.

ADR 0024 and the existing implementation were accepted by the maintainer on
2026-09-12. The original semantic-value gate is superseded by that explicit review
decision: keep hybrid retrieval and assess its wider value with stronger workloads
as Drawloom develops. The incomplete 100k benchmark and remaining integration
checks above are follow-ups, not passing results. The subsequent MLX-only
implementation and recovery correction are delivered in the same cohesive change;
see the [MLX verification record](adr-0024-mlx-acceleration.md#final-review-status).
No production-readiness, enterprise validation or general embedding-value claim
is made.
