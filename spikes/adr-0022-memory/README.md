# ADR 0022: First memory sprint

Retained disposable integration experiment for [Accepted ADR 0022](../../docs/adr/0022-knowledge-memory-context-experiment.md).
Acceptance covers the demonstrated boundaries, not this prototype as a supported
implementation. The ADR records remaining weaknesses and future implementation work.
Authoritative observations belong in [the evidence record](../../knowledge/evidence/adr-0022-memory-sprint.md).

## Run

```sh
bun test spikes/adr-0022-memory/store.test.ts
DRAWLOOM_MEMORY_LIVE=1 bun run spikes/adr-0022-memory/run-live.ts
# Second sprint: saved actions and a same-topic irrelevant-evidence control
DRAWLOOM_MEMORY_LIVE=1 DRAWLOOM_MEMORY_SCENARIO=action bun run spikes/adr-0022-memory/run-live.ts
# Third sprint: foreground contribution, metadata routing and natural tasks
DRAWLOOM_MEMORY_LIVE=1 DRAWLOOM_MEMORY_SCENARIO=natural bun run spikes/adr-0022-memory/run-live.ts
# Fourth sprint: agent-chosen organisation, judgement, interruption and hostile source text
DRAWLOOM_MEMORY_LIVE=1 DRAWLOOM_MEMORY_SCENARIO=organisation bun run spikes/adr-0022-memory/run-live.ts
# Source scenario: producer revisions, now with simplified agent-facing knowledge
DRAWLOOM_MEMORY_LIVE=1 DRAWLOOM_MEMORY_SCENARIO=sources bun run spikes/adr-0022-memory/run-live.ts
# Combined sprint: installed Git source plugin, code evidence and bounded query retrieval
DRAWLOOM_MEMORY_LIVE=1 DRAWLOOM_MEMORY_SCENARIO=git bun run spikes/adr-0022-memory/run-live.ts
```

All live commands use the installed, signed-in Codex and its configured model
allowance. It does not select a different model, generate media or use production
data. Each phase has a fresh native conversation. The supported driver disables
native memory. Codex conversations are archived in cleanup (not erased); this
is ordinary provider-owned transcript retention. Temporary JSON, execution
evidence and session mappings are deleted after the run. Only the synthetic
answers, call names, bounded note and measurements are printed.

## Small working model

### Git source and retrieval experiment

The `git` scenario builds a self-contained standard Agent Plugins package in a
temporary directory, with a stdio MCP server and no Drawloom extension. The
server imports no Drawloom runtime. The supported package loader inspects and
activates it; a deterministic test also uses a generic MCP client directly.

`git.changes` prepares a durable replayable batch for configured paths at a fixed
commit. `git.acknowledge` advances only the plugin's delivery position after
successful host intake. Neither modifies the source repository. Batches use the
existing provisional source shape via a proof-only adapter; no new supported
memory capability or MCP protocol is introduced. This is not a plugin UI or
installed-desktop integration claim.

Only ordinary committed files are read, through Git objects rather than working
files. Uncommitted content, symlinks, submodules, binary content and files over
1,600 bytes are excluded or rejected explicitly; configured paths are limited
to 60. Configuration changes cannot reuse an old delivery store. Rewritten
history fails instead of silently resetting. Single-writer JSON storage and
bounded synchronous Git subprocesses are experiment choices, not production
durability or concurrency claims. Collection detects current file-state changes,
not every intervening commit, and preserves deletion as a source withdrawal.

The live scenario reads 17 selected files from this repository's committed tree.
It copies those exact source bodies into a disposable repository, adds two
clearly labelled synthetic decision/test files, and changes a sidebar setting
there only. A stale test assertion and decision intentionally remain. No tests
from the collected repository are executed by the plugin. Commit messages are
not included as evidence. This limits the domain-judgement claim to the evidence
actually supplied.

Nightloom still assesses the whole small notebook. Readers use a simple lexical
query across claims and current source text, selecting at most three matching
claims and three matching source keys plus their linked evidence. A per-turn
read receipt avoids repeating unchanged evidence bodies; citations remain valid
within that turn. Changed evidence is resent. A new agent gets its own receipts.
Responses are capped at 64 KiB with an explicit error, not silent truncation.
This scans the bounded JSON notebook; it is not an index, vector search or a
large-corpus performance claim. No automatic RAG/context injection is added.

The printed receipt records source identity, intake counts, claim states and live
answers. Original checkout files, commits and branches are never changed by the
scenario. Temporary package artifacts, copied repository and notebooks are
removed at the end; native Codex test conversations are archived.
See [combined Git sprint evidence](../../knowledge/evidence/adr-0022-memory-git-sprint.md)
for actual outcomes, report-capture failure, repeated maintenance reads and
remaining lexical-ranking limitations.

`store.ts` is one bounded JSON notebook with observations and one current note
per topic. It uses four observation fields and three note fields. These are
temporary shapes, not capability contracts. It has one in-process writer and
atomic file replacement, not a durable background queue or power-loss guarantee.

`run-live.ts` composes existing `@drawloom/codex-agent`, `@drawloom/local-tools`
and `@drawloom/node-host`. Its phases are:

1. Ask a relevant question with an empty notebook.
2. Read a controlled tool fixture and automatically capture its successful
   gateway result. The fixture describes a capacity failure; the inspection
   tool itself succeeds. No external render is attempted.
3. Run maintenance automatically in a separate agent conversation.
4. Reopen the notebook and ask the same question in a fresh conversation.
5. Capture a fixture describing a later success, maintain and ask again.

The reader sees only `memory.search`; the collector only `inspection.run`;
the maintainer only `memory.evidence` and `memory.publish`. Existing gateway
bindings and evidence remain in use. Native tool review is explicitly configured
to allow these isolated synthetic operations; unexpected approval requests are
denied rather than impersonating a human reviewer. This grants no production
authority and changes no global settings.

There is no memory content or previous answer in reader prompts. Generic
instructions recommend recall for operational advice. The exact topic name is
deliberately easy; this does not prove semantic search or spontaneous retrieval
without guidance. Instructions forbidding unrelated native tools are cooperative,
not a claim of ambient native-tool isolation. The agent workspace is empty and
separate from notebook storage.

Maintenance is a host-triggered follow-up in the runner, not a supported provider
hook, nightly scheduler or another foreground agent loop. Failed maintenance
does not advance the note's evidence coverage. New evidence leaves the last
note readable but visibly stale. Publication must cover all current topic
observations; this intentionally small rule will not scale to arbitrary corpora.

## Deliberate limitations

- Topic equality instead of semantic retrieval or embeddings; the third sprint
  supplies a small metadata-only routing index to selected phases.
- No confidence arithmetic, universal claim graph or domain-policy interface.
- No extraction from raw conversations or hidden reasoning.
- No transcript replay, enterprise entitlement implementation or private data.
- No automatic live retry. Failed runs are evidence to review.
- Basic elapsed time and UTF-8 payload sizes, not token accounting or a benchmark.
- Clean process reopen tested; crash recovery, power loss and multi-writer access
  are not claimed.

Nothing in this directory is imported by supported packages or applications.

## Second sprint: do the saved actions change appropriately?

The optional `action` scenario leaves `store.ts` unchanged. It uses the same
capture, maintenance and fresh-session lifecycle. Its additional `plan.save`
tool appends a provisional mode, rationale and cited source IDs to a temporary
JSON-lines file. The originating phase is supplied by the host, not the model.
It accepts any schema-valid choice and does not enforce the expected answer.

Four fresh planners receive the identical request: preserve transparent pixels
with the latest installed Fern version recorded in the evidence, prefer the faster correct mode, and
save a draft plan or defer when evidence is insufficient. No expected mode or
version-specific diagnostic appears in this prompt. The evidence evolves:

- Empty memory: insufficient evidence.
- Installed version 1.0: a transparent-image test fails in native mode and passes
  in compatibility mode.
- Still version 1.0: a later opaque-image native test passes. It is under the
  same topic, and reaches maintenance, but should not change a transparent-image
  plan.
- Installed version 1.1: a later transparent-image native test passes, with both
  mode timings recorded. It should change the plan because the faster mode is
  now supported by relevant evidence.

`action.ts` contains only the temporary plan schema and post-run evaluator.
The live runner reads actual saved plan records before evaluating; it does not
grade words in the assistant answer. The evaluator checks one plan per phase,
deferral before evidence, an unchanged compatibility choice through the irrelevant
control, and a native choice citing the later fix. Its tests reject missing,
duplicate, unchanged and wrongly supported choices. Manual evidence review still
checks explanations and actual retrieval calls; the boolean is not a general
truth or confidence assessment.

No real render occurs, and a versioned synthetic diagnostic is not a statistical
reliability study. See [second-sprint results](../../knowledge/evidence/adr-0022-memory-action-sprint.md).
The first attempt asked about the current installation and failed its expected
sequence because the agent reasonably distinguished dated evidence from today's
environment. The retained report explains that ambiguity and the revised
snapshot-relative task; the memory implementation was not changed to force a pass.

## Third sprint: can ordinary requests reach useful knowledge?

The `natural` scenario keeps the notebook and its four operations unchanged.
The foreground agent receives a normal diagnostic request and generic instructions
to preserve useful lessons. It can inspect and publish a provisional note. The
host still captures the diagnostic automatically; the note cites that original
observation rather than becoming independent evidence. There is no intervening
maintenance turn to conceal a missing foreground contribution.

Three competing notes are explicitly seeded test fixtures: colour conversion,
narration pacing and opaque JPEG thumbnails. The target cut-out-image note must
be written by the live foreground agent. Every reader has a fresh conversation.
One planner has no routing index; another receives the identical task with the
index. A third uses a paraphrase, and a non-visual reader asks about narration.
None of these user requests names a topic ID or memory tool. Saving a draft is
still explicitly requested: this does not prove autonomous task selection.

`natural.ts` validates and formats at most eight topic/title pairs for the
existing compiled-context input. Only four pairs are used. Opaque topic IDs
prevent exact query hints in the prompt; no note body, evidence ID, conclusion
or expected mode is injected. The model must choose a topic and retrieve its
content through the existing tool. This is context-assisted exact lookup, not
an embedding system, a production retrieval index or proof of large-corpus search.

The receipt records actual topic queries, hit counts, saved plans and the note
written before recall. Review distinguishes no retrieval, wrong/empty retrieval
and incorrect use of relevant evidence. Single live observations are not success
rates or a controlled model benchmark. Unindexed behaviour is an ablation, not
a requirement that the model fail.

See [third-sprint results](../../knowledge/evidence/adr-0022-memory-natural-sprint.md)
for the actual contribution, empty unindexed lookups and successful indexed reads.

## Fourth sprint: one evolving notebook, four challenges

The `organisation` scenario captures mixed fixtures under `unfiled`, including
repeat delivery of one identity, a separate report of that same event, another
independent test, an unrelated narration observation, and an unverified memo
containing a false universal claim and instructions aimed at maintainers/readers.
Ingestion is deterministic host setup here; earlier sprints exercise the live
tool-result capture point. No topics or notes are pre-seeded in this scenario.

The existing note shape is unchanged: topic, text and source IDs. The model
chooses descriptive topic labels, which also serve as retrieval keys. The index
is derived directly from saved notes; it is not another stored catalogue.
`snapshot` and `organise` extend the disposable notebook for whole-notebook
maintenance. The old topic-specific operations remain to reproduce earlier
sprints, not as two recommended production implementations.

Whole-note publication validates at most eight distinct labels, known source
IDs and complete evidence coverage. An older source set cannot replace newer
state. Coverage does not mean agreement, and validation does not prove prose
true. Original source records are never rewritten or counted twice on repeat
delivery. Separate reports of one event remain separate records: the model must
recognise that they are not independent observations from their content.

`organisation.ts` projects a selected note with its sources plus observations
not covered by any saved note. Its stale flag is deliberately whole-notebook:
unprocessed evidence may be unrelated to the requested subject. Returning that
small pending set lets readers inspect changed facts without pretending the old
summary is current. This is bounded by the existing 100-observation proof limit,
not an efficient production-corpus retrieval design.

After initial organisation and two fresh readers, a release bulletin and a new
version-specific local test arrive. The next maintenance phase is deliberately
interrupted after `memory.snapshot`. In that phase the gateway also disallows
publication, closing a race with the interruption. This is a controlled pause,
not evidence that a process can be killed at any instruction without losing
data. The runner requires a real native `operation.interrupted` outcome.

The notebook is reopened, a fresh planner reads the old notes with pending
evidence, then a fresh maintenance run organises the full record. Another reopen
and planner check recovery. The receipt retains before/paused/recovered snapshots,
actual queries and saved actions. Maintenance has no human approval queue.

No source facts or expected choices are inserted into reader prompts. Instructions
generically distinguish evidence from authority and repeated reports from
independent events. The adversarial marker is benign synthetic test text, not
an instruction for the harness itself. Manual review determines whether agents
obeyed it, merely quoted it as evidence, or promoted its unsupported claim.

See [fourth-sprint results](../../knowledge/evidence/adr-0022-memory-organisation-sprint.md)
for actual generated topics, saved decisions, source handling and interruption.

## Fifth sprint: source revisions without source-specific host logic

The `sources` scenario uses `sources.ts` as a revised disposable candidate,
not another supported provider. Earlier notebooks remain reproducible evidence.
Immutable observations alone could not express a source revision or withdrawal,
and rejecting every publication after a new arrival would not exercise a
snapshot waterline. There is no migration promise for any of these JSON files.

The host binds a producer identity and passes only its `update` function to a
synthetic source producer. It supplies local source ID, revision, previous
revision, contribution kind, active/withdrawn state and text. Source fetching,
change detection, credentials and source position remain its responsibility;
no Git or watcher implementation is included. This tests a candidate backend
intake function, **not an installed Agent Plugins package or new public API**.

The notebook qualifies keys by producer, retains revisions and rejects conflicting
or out-of-order updates. Repeated delivery of an old revision is harmless and
cannot reactivate it. The explicit previous revision allows comparison without
inventing an ordering for opaque producer revision strings. Acknowledgement
means stored, not assessed or true.

One bounded change list holds fibres, threads and sources. Pending count is
change count minus the last assessed position. Default threshold is 50, tested
with mixed contributions; the live scenario uses 3. The runner checks readiness
at known ingestion boundaries and starts one maintenance turn when due. It is
not a background scheduler or a maximum-wait policy for a quiet backlog.

Nightloom's host reads a snapshot; the assessing model sees claims and evidence.
`knowledge.ts` projects only claim ID/text/evidence IDs and evidence ID/source/text.
The model writes the same small claim shape. Source keys, revisions, link
polarity, pending counts and waterlines are not in its tool interface. Historical
and withdrawn evidence is identified in plain language. A changed linked source
becomes a plain warning to reconsider the claim, not a confidence score.
A newly unlinked source adds pending work without pretending we already know
which claim it affects. The model must find that relationship.

The host retains the captured snapshot for that assessment turn and supplies its
base waterline and through position when saving. Repeated reads use that same
assessment. Unknown evidence references cannot be saved, and model-supplied
maintenance fields are rejected. Internally, links retain key/revision only;
the earlier polarity enum was removed rather than introducing a claim/assessment
subsystem to fix its ambiguity. Claims explain disagreement in prose.
Publication saves
claims and that position together, rejecting a competing committed assessment
or links to revisions outside the assessed prefix. Later arrivals remain in
the file beyond the waterline. Historical links can remain alongside an assessed
latest revision without falsely keeping the claim pending forever. These checks
validate positions and links, not whether the agent actually reasoned correctly
about every source. Claims may be omitted; completeness is reviewed as evidence,
not guaranteed by schema coverage.

The live sequence creates a guide plus a fibre and thread, updates the guide,
then injects its withdrawal after snapshot capture but before returning that
snapshot to the agent. The assessment can finish, while its now-outdated claim
remains flagged internally. A fresh reader receives claims, a plain caveat and
the relevant evidence, including later accounts of linked sources. Unassessed
new evidence is also included in this small notebook; this is not yet scalable
relevance filtering.
An independent QA source then arrives without an existing link. The next batch
must discover its relevance and reassess. No expected mode is enforced by the
plan handler, and no real render occurs.

Snapshots, trigger counts, actual source links and saved choices are printed
before cleanup. No data source, rendering service or background engine is built
merely to demonstrate this intake boundary.

See [fifth-sprint results](../../knowledge/evidence/adr-0022-memory-sources-sprint.md)
for the historical richer interface, initial deferral and relation ambiguity.
That receipt is unchanged; the current runner uses the simpler interface instead.
See [simplified-interface evidence](../../knowledge/evidence/adr-0022-memory-simple-interface.md)
for the current checks and limits.
