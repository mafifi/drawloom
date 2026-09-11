---
type: evidence
id: adr-0022-memory-git-sprint
title: Installed Git evidence, code-domain judgement and bounded retrieval
status: draft
created: 2026-09-11
updated: 2026-09-12
---

# Combined Git sprint

Related: [ADR 0022](../../docs/adr/0022-knowledge-memory-context-experiment.md),
[commands and boundaries](../../spikes/adr-0022-memory/README.md),
[preceding simplified interface](adr-0022-memory-simple-interface.md).

## What was built

A retained standard Agent Plugins package, compiled into a self-contained MCP
stdio server outside the checkout. No Drawloom extension, privileged memory
object or new browser protocol. `git.changes` reads selected committed files;
`git.acknowledge` records successful delivery. The proof transfers updates into
its existing provisional source intake, then acknowledges them. This keeps
Git access/checkpoint ownership in the plugin and claim maintenance in Nightloom.

The package is exercised through both the supported Drawloom package loader and
an ordinary MCP client. It is not installed permanently in the desktop, nor is
this a supported production memory implementation. Model tools remain claims
and evidence; source collection is host-driven, not dependent on an agent
remembering to poll Git.

Code-specific instructions distinguish implementation from design intent and
test assertions from observed test results. No numerical confidence, policy
engine or new knowledge entity is introduced. Lexical query retrieval replaces
exact-topic lookup only for this scenario. It bounds selected claims/source
matches and avoids repeating unchanged evidence within an agent operation.

## Data and scenario

The plugin reads 17 selected committed files from Drawloom at
`a186b2733c44f3c85449c3c56a0c642d649588c7`. These are short complete files,
not arbitrary truncated snippets. They cover sidebar settings, MCP media policy,
resource recovery, grants, folder picking, context, orchestration and UI utilities.
The original checkout receives no Git writes or working-file changes from the
scenario. Uncommitted material is not collected.

Exact bodies are copied into an isolated temporary Git repository. Two labelled
synthetic fixtures are added: a sidebar test assertion and an accepted design
note. They are explicitly not a real Drawloom test result or accepted ADR.
The copied sidebar constant initially specifies seven days; a later disposable
commit changes it to one day while leaving the test assertion and design note
unchanged. A final spinner comment is an unrelated source change.

The sequence is initial intake and maintenance; a fresh sidebar question; an
unrelated MCP-policy question; changed-code intake and recall before maintenance;
reassessment; installed-plugin restart and fresh recall; unrelated intake.
No collected repository test is executed. Commit messages are not ingested, so
no conclusion about judging misleading commit messages is claimed.

## Complete repeat and observed result

The [complete second receipt](adr-0022-git-attempt-2.json) ended at
**20:44:30 UTC**, exit 0, in **253.621 seconds** with Codex 0.153.4 / Bun 1.2.23.
All six fresh native conversations completed and were archived. The original
17 source bodies were checked against the originating public commit after the
run; all match. The real checkout remains at the same commit.

| Checkpoint | New source updates | Pending | Claims needing reassessment |
| --- | ---: | ---: | --- |
| Initial intake | 19 | 19 | None yet |
| Initial maintenance | 0 | 0 | None |
| Sidebar code change | 1 | 1 | `sidebar-persistence` only |
| Reassessment | 0 | 0 | None |
| Plugin restart/reconnect | 0 | 0 | None |
| Unrelated spinner change | 1 | 1 | `ui-utilities` only |

All eight generated claim identities survived reassessment. Nightloom retained
the disagreement between one-day implementation and seven-day design/test intent;
it did not silently rewrite the older sources to agree. A fresh reader identified
one day even before maintenance, using the new evidence accompanying the stale
claim. Another fresh reader did so after the installed plugin restarted.

All relevant readers explicitly rejected the inference that committed test
assertions prove a passing run. They also distinguished the configured cookie
constant from observed browser behaviour, and correctly described the stale test
as a predicted failure if run unchanged, not an observed result. The MCP-policy
question provided a contrasting consumer and correctly noted missing imported
implementation and runtime-enforcement evidence.

This establishes useful code-domain judgement for this small case, not calibrated
confidence, all-domain knowledge maintenance or general coding correctness.
The public repository's real sidebar setting was never changed; the one-day
result belongs only to the disposable copy.

### Retrieval and cost

Twelve gateway calls returned **195,844 UTF-8 bytes** of tool envelopes/content.
Bytes are not token counts. Timing includes startup/cleanup and overlaps repository
checks. The actual phase measurements are:

| Phase | Elapsed ms | Tool-result bytes | Calls |
| --- | ---: | ---: | ---: |
| Initial maintenance | 118,312 | 31,014 | 3 |
| Initial sidebar recall | 22,861 | 19,189 | 2 |
| MCP-policy recall | 20,428 | 18,504 | 1 |
| Recall before maintenance | 26,592 | 25,267 | 2 |
| Reassessment | 39,138 | 82,301 | 3 |
| Recall after restart | 23,225 | 19,569 | 1 |

Across repeat queries in a reader's operation, **zero unchanged evidence IDs
were returned twice**. The second initial-sidebar query returned its matching
claim and no evidence bodies because that evidence had already been supplied.
Each fresh operation had independent receipts. This does not prevent the agent
from receiving the same evidence in a different conversation.

Query precision is still weak: general words about tests can rank unrelated
claims above the sidebar claim. Source matching nevertheless returned the sidebar
evidence, and a more focused follow-up retrieved its claim. Reader calls returned
up to ten source records, not the whole nineteen/twenty-record notebook, but
several were unnecessary. Successful answers do not establish efficient ranking.

Nightloom called `memory.snapshot` twice during reassessment and received the
same complete twenty-record assessment twice. Reader deduplication deliberately
does not cover that older maintenance path. This is a concrete remaining cost,
not hidden by an overall efficiency claim. No performance gain against the prior
scenario is claimed; source bodies and model behaviour differ.

The initial maintenance input was again rejected before execution, followed by
a successful corrected submission; all other recorded tools succeeded. Retain
this validation friction when reviewing the arbitrary small-notebook claim cap.
The report-only parser was tightened to validate existing tool-result schemas
during the repeat; source collection, prompts, retrieval and assessment behaviour
were unchanged. The final code passed the full gate. The receipt's inherited
generic footer predates this scenario: these Git reads are real, and retrieval
is lexical rather than the older exact-topic lookup.

Temporary package artifacts, copied Git repository and JSON state were removed.
No model-generated work or production data was published. Native conversations
were archived rather than erased. Full private transcripts and hidden reasoning
are not part of the evidence.

## Verification and limits

### First live attempt and capture limitation

The first run ended at **20:38:26 UTC**, exit 0, in **274.668 seconds**. All six
live phase records were retained, with completed and archived status. The
[partial receipt](adr-0022-git-attempt-1.json) explicitly records that the command
output cut off inside its repeated Git-state appendix. Two complete state
records were recoverable; the missing suffix is not reconstructed or described
as a complete record. A compact report was introduced for a repeat of the same
scenario, without changing evidence, prompts or retrieval logic.

The retained first-run answers identify seven days initially and one day both
before maintenance and after reassessment/restart. They explain the stale design
and test assertion without claiming an observed failure or successful execution.
The contrasting MCP-policy answer distinguishes source-inspected validation from
verified browser enforcement, and identifies the missing imported origin schema.

The first maintenance submission failed `invalid_input` at `claims` before
execution. A second submission saved seven claims. The captured gateway summary
records that outcome; it does not contain the rejected arguments, so the exact
invalid field/value is not inferred. This was a model correction within the run,
not a maintainer repair or an automatic retry of denied execution.

The initial sidebar query returned seven evidence records out of nineteen,
including unrelated grants and MCP-policy material through broad claim matches.
The two MCP-policy queries returned different evidence sets: the second did not
repeat the three records already supplied. Query routing and deduplication worked,
but lexical precision was imperfect. This is not proof of optimal retrieval or
semantic understanding by the retrieval implementation.

Test-first source checks cover committed-only reads, replay before acknowledgement,
unchanged files, changed and deleted sources, traversal, symlinks, oversized files
and configuration reuse. A separate real package test stores a batch, restarts
before acknowledgement, ingests it again without duplicates, then reads the
same artifact through a generic MCP client. A test-first retrieval check includes
30 unrelated pending observations, repeat queries, changed evidence and a new
operation with independent read receipts.

The canonical `bun run check:ci` passed: **674 passed, five existing opt-in skips,
zero failures**, across 130 files, plus Node shared conformance. Type checks,
builds and dependency/UI guards passed. The existing large-client-bundle warning
remains. These checks do not imply the collected codebase tests were run by the
Git plugin or supplied as evidence to the model.
The focused memory suite passes **23 tests**. The final receipt was separately
checked for six completed/archived phases, stable claim identities, selective
invalidation, zero reconnect updates and nonduplicated reader evidence.

The plugin observes current committed file state, not every intervening commit.
Rewritten history is rejected; no history-reset or multi-branch policy is added.
Files must be ordinary text files at configured paths, at most 1,600 bytes each;
at most 60 paths. This intentionally excludes much of a real repository.

Nightloom still reads a complete bounded notebook, and query ranking scans it.
Matching is lexical, not semantic. Three top claims plus three source matches
may still pull unrelated evidence through broadly written claims. Per-turn
deduplication is not a general cross-session cache or a guarantee that the model
retains earlier evidence after compaction. Domain judgement is not confidence
calibration, and source links alone cannot prove correctness or completeness.

The source integration is real MCP; the knowledge intake and storage remain
disposable proof code. There is no shipped workbench feature, background Git
watcher, domain engine, production persistence or enterprise access control.
At the sprint checkpoint ADR 0022 remained Proposed and changes were uncommitted.
The maintainer accepted the demonstrated boundaries on 2026-09-12; the
[ADR's follow-up section](../../docs/adr/0022-knowledge-memory-context-experiment.md#weaknesses-and-future-implementation-work)
records remaining work without changing these observations or claiming production
readiness.
