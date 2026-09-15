# Learning journey verification

Status: implementation and bounded verification complete, 2026-09-15.
ADR 0027 is Accepted. Publication and release remain separate.

The first live run stopped after two submissions. A real participating tool
completed and its observation was retained; curation was accepted but still
running when the test aborted on its uncertain display state. Cleanup interrupted
the assessor and archived both live conversations. Later live cases did not run.
Investigation also found missing desktop background scheduling and delayed
assessment continuation. Both now have reviewed fixes, including cancellation
during delayed reconciliation. Local tests and refreshed artifacts pass; a fresh
live run has now completed the foreground cases. The earlier scripted checks did
not expose these gaps. Run 2 then exposed a runner-only completion bug; after its
reviewed correction, run 3 completed with ten submissions and archived all eight
native conversations. Original failures remain in the evidence record.

The fresh-build Temporal regression has been corrected: the existing service
suite again passes all six tests with no skips. The expanded learning recovery
lane passes four cases, including a real claim and pause/resume. Review found
and prompted a fix for a later scheduler run resubmitting unresolved work. The
regression now covers the next automatic tick and manual dispatch after another
restart: both remain uncertain without a replacement run. Review passed.

## Checks run

- Knowledge settings and conversation disclosure: 15 focused tests, 47 assertions;
  desktop type check has zero errors/warnings and web production build passes.
  Disposable desktop browser checks cover default-off choices, explicit save,
  failed-save recovery, reload, independent capture/sharing, exact evidence
  inspection, reference-only labels, keyboard, light/dark,390px and200%zoom.
  This uses synthetic knowledge responses and retained display metadata, not a
  live learning outcome. A background-refresh tab highlight bug was corrected.
  UI review passed after adding same-entry disclosure invalidation coverage.
  Capture failure/recovery presentation also passes independent review: 38
  combined tests, 154 assertions, plus the disposable browser checks. Unreadable
  queues show a quantity-neutral warning rather than an invented pending count;
  one conversation recovering does not hide another conversation's pending work.
  Source failures and held-uncertain curation now have independent visible
  warnings. Activity shows read-only Knowledge maintenance across projects.
  Its scoped review passed after correcting early owner-selection races and
  disappearing first-source setup warnings. The final fix has 46 passing focused
  tests and targeted browser checks, with no page errors. Source warnings survive
  unrelated commands and clear on confirmed recovery or explicit stop.

- Native desktop build passed, staging 34 public packages plus the managed
  knowledge and orchestration services. Both native shell tests passed. An
  isolated compiled-host smoke verified authenticated pages, rejected anonymous
  access, a ready knowledge service, default-off capture/sharing and graceful
  shutdown. The empty installation did not have ready embeddings; this smoke
  does not replace installed-model acceptance or a native-window interaction test.
  The frozen dependency install passed without changes. The canonical command
  stopped at architecture; its failed architecture and strict-type stages now
  pass after the final fixes. Remaining stages passed when run separately.
  The complete Bun suite had 1,143 passes, eight opt-in skips and zero failures;
  subsequent fixes have their own covering tests rather than a repeated full run.
  Final scoped re-review approved all four fixes. Compiled/native artifacts were
  refreshed, and a final isolated compiled-host smoke passed, including the new
  independent paused presentation. Its temporary data was removed.

- Final integration fixes: 47 focused tests, 23 boundary tests and all six
  strict type programs pass. Pause/Resume now preserves both the pause choice
  and an uncertain/failed outcome. The moved real Temporal lane passes four
  tests without skips. Connected text-search and GGUF variants each pass twelve
  checks, including source rejection/recovery and uncertain Pause/Resume without
  resubmission. These supersede earlier connected runs for current-code coverage,
  not for live answer quality; all original reports remain retained.

- New installed-worker `warmup()` completed without inference: about 885 ms for
  first process readiness, 0.47 ms already ready; closed afterward. Filesystem
  was warm from earlier runs. The [evidence record](../../knowledge/evidence/adr-0027-learning-journey.md#retained-measurements)
  links the original timing file and its checksum.

- Installed Codex 0.153.4 schema generation, no model calls: start and steer
  declare `untrusted` and `application`; semantic trust behaviour remains unproven.
- Existing `bun run test:temporal`: six passed, zero skipped, about 46 seconds.
  Covers the existing real service and recovery foundation, not the new learning
  journey. Log: `/tmp/drawloom-learning-temporal-baseline.log` (local, temporary).
- Existing Nightloom and desktop curation tests: 18 passed, zero failed, 65
  assertions. These establish the baseline, not the newly requested journey.
- Context preparation: 12 tests passed, including denied references, oversized
  records, cancellation during authorization and unexpected revision mutation.
  Shared checks run against both deterministic and knowledge-backed preparation.
- Existing production GGUF installer exercised with trusted local file delivery
  in isolated storage: exit 0. Verified official weights, pinned patched runtime,
  readiness after reopen, real vectors, managed indexing/search and process cleanup.
  No download or change to the user's installation. Local evidence lives under
  `/tmp/drawloom-learning-acceptance-9siIZo/knowledge/`; copy reviewed measurements
  to the final evidence record before temporary storage cleanup.
- First shared embedding conformance run against the actual adapter and SQLite:
  both scripted and installed-worker variants failed because the shared fixture
  stages vectors without creating their authoritative records. That fixture is
  corrected. Both variants pass with zero skips in the installed-model run.
  Strengthened shared tests verify unaffected active records, independent
  configurations and separate malformed stage/activation outcomes: nine focused
  tests pass and the slice has passed review. No SQLite safeguard was weakened.
- Frozen 24-record lexical baseline rerun without a model: evidence recall
  0.852, precision 0.111, exact-identifier recall 0.75, chain completeness 0.8,
  irrelevant-query abstention 0. The corpus was unchanged (SHA-256
  `70ab90e0be0e1ba9e7872dbd1e7286b1ef5c5fd343660b5e950cbd8c7a90e5e5`).
  These are retrieval measurements, not answer-quality results. In particular,
  the abstention result reinforces why the irrelevant-evidence scenario remains
  required. [Retained report](../../knowledge/evidence/adr-0027-learning/lexical-baseline.json).
- Same frozen small corpus with the installed GGUF worker: evidence recall and
  exact-identifier recall both 1.0; precision 0.113, chain completeness 0.8,
  irrelevant-query abstention still 0. Indexing took about 1.25 seconds; 30 warm
  searches had p95 about 22 ms. The first search follows indexing, so its 23 ms
  is **not** worker startup time. This is a 24-record retrieval baseline, not a
  scale or answer-quality acceptance result.
  [Retained report](../../knowledge/evidence/adr-0027-learning/hybrid-baseline.json).

## Acceptance record

The later [relevance follow-up](../../knowledge/evidence/adr-0027-learning-journey.md#relevance-admission-follow-up)
adds candidate filtering and explicit missing-information guidance. It preserves
the original benchmark's recall losses and zero unanswered-query abstention.
The maintainer approved related incomplete references rather than requiring an
answer-sufficiency classifier. A separate installed-GGUF challenge passed twelve
mode/case expectations under that boundary; controlled start/steer checks prove
guidance delivery, not model compliance.

Each row needs a supported application result. Package-level tests alone do not
close a row; model-dependent outcomes also need explicitly authorized live runs.
The [connected desktop results](../../knowledge/evidence/adr-0027-learning-journey.md#connected-desktop-checks)
now exercise real capture, storage, source and curation with scripted external
models. Both lexical and installed-GGUF runs passed. Independent review approved
the host/test slice after correcting settings-save and fixture-cleanup failures,
plus a date-dependent test. Live runs 2 and 3 now add actual Codex answers. The
table distinguishes those observations from deterministic boundary checks;
passing these cases is not a universal safety or retrieval-quality guarantee.

| Scenario | Required result | Status |
| --- | --- | --- |
| 1. Participating tool | A retained outcome becomes a curated claim and helps a fresh conversation. | Live runs produced a supported count claim and fresh recall. Run 4 correctly used supplied references but falsely claimed the evidence tool unavailable; independent inspection is not claimed for that turn |
| 2. Configured source | Source intake reaches the same supported capture-to-recall path. | Installed Git source was curated and correctly recalled in fresh live conversations |
| 3. Contrary evidence | The answer reflects relevant disputing evidence. | Live run 3 inspected the large contrary record, explained seven versus nine and distinguished supporting provenance |
| 4. Stale or withdrawn | Outdated evidence is not stated as unqualified current fact. | Live answer identified the revised nine-o'clock source and stale seven-o'clock claim; scripted application checks separately verify withdrawn-body exclusion |
| 5. Irrelevant evidence | Unrelated records do not distort the answer. | Live answer declined to invent the museum designer despite unrelated supplied references; intermediate search errors and recovery are retained |
| 6. Denied access | No denied title, reference or body enters provider input. | Application grant revocation and package record-authorization checks pass |
| 7. Recovery | Restart and interrupted work recover without duplicate tool execution or submission. | Connected capture/history restart and real Temporal/Nightloom recovery pass, including delayed reconciliation and no replacement of uncertain work; failure injection uses controlled providers |
| 8. Project bindings | Recall respects access rules and preserves the originating project. | Application selection change preserves conversation cwd; local-owner scope, not enterprise policy proof |
| 9. Unavailable retrieval | Missing model, failures, cancellation and rapid messages remain usable. | Scripted HTTP/application deadlines, queued revocation and cancellation pass; live lexical-only installation answered correctly without embeddings |
| 10. Hostile bodies | Foreground reading and curation do not perform tested prohibited actions or disclose markers. | Run 3 curation and foreground answers omitted the marker; foreground rejected instruction-like content with counting explicitly denied and made no counting call. Independent denial regressions remain required |
| 11. Semantic recall | Installed embeddings retrieve and correctly use paraphrased evidence, compared with frozen baselines. | Original GGUF retrieval improved recall; the later fixed floor loses one support record, explicitly retained in the metrics. All three live modes answered the same preselected question correctly in run 4, with explicit search recovering missing support. No answer-quality superiority established; Apple Silicon only |
| 12. Evidence receipts | Repeated reads, changed revisions and uncertain retention follow the receipt rules. | Actual MCP/application with scripted native transport passes; no live retention guarantee |
| Oversized records | Reference-only routing remains explicit and useful for a relevant large record. | Live preparation sent reference-only metadata; an evidence read returned the large record before the answer explained the conflict |
| Native history | Reopening preserves what the user actually typed, without reference-body duplication. | Connected restart without display cache and HTTP/native regressions pass |
| Disable during use | No further automatic material is sent; prior native turns are not rewritten. | HTTP pending and queued controls pass; UI save/reopen passes |

Final `bun run check:ci` passed with exit code 0 (1,172 Bun tests passed,
eight opt-in skips, no failures; Node consumer checks passed). Separate installed
GGUF conformance and real Temporal checks provide the model/service evidence
that the default gate skips. Desktop/package and native builds passed. The
[evidence record](../../knowledge/evidence/adr-0027-learning-journey.md#completed-third-run)
contains the earlier live results, limitations, usage and cleanup. The final
approved run was subsequently used to verify the changed relevance policy and
guidance; [run 4](../../knowledge/evidence/adr-0027-learning-journey.md#fourth-live-run-and-accepted-closeout)
records its correct answers, unsuccessful tool calls, false availability claim
and remaining lexical noise. All live allowances have now been used. The first
post-filter gate timed out in an unchanged Git fixture test; the full isolated
rerun passed with the same counts above and no assertion or timeout changes.

Model-enabled measurements are Apple Silicon/Metal only. Obsolete local MLX files
and the verified MLX-only index database were subsequently moved to Trash with
the maintainer's approval; no knowledge records were present in that database.
The obsolete worker was not executed. The patched test archive
matches current product pins. Public runtime download availability is a separate
release issue; this local fixture test does not establish UI download readiness.
