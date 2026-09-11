# ADR 0022: Explore knowledge, memory and context through a bounded experiment

- **Status:** Accepted
- **Date:** 2026-09-11
- **Accepted:** 2026-09-12
- **Decision owners:** Drawloom maintainers

## Purpose

Learn how useful experience becomes maintained knowledge and reaches an agent
when needed. This ADR authorises a disposable experiment, not production
contracts, a database schema or a final maintenance algorithm.

The first sprint ends at a review checkpoint within one to two hours. An
informative failure is a useful result; expanding the machinery until a test
passes is not. The broader success target is:

> A later agent makes a better-informed decision, can explain the evidence it
> used, and changes its understanding when that evidence changes.

## Accepted scope

The maintainer accepts the demonstrated lifecycle and ownership boundaries:
hybrid observation capture and deliberate contribution, automatic evidence-linked
maintenance, context-guided retrieval, and plugin-owned source updates. Agents
read claims and supporting evidence; the host owns revision tracking, assessment
progress and publication. Domain judgement remains separate from that bookkeeping.
Knowledge maintenance requires no human approval, but grants no execution or
business-acceptance authority.

The retained sprints met the bounded success target: later agents used evidence
to make different decisions, qualified conflicting sources, and revised answers
after source changes. The [combined Git evidence](../../knowledge/evidence/adr-0022-memory-git-sprint.md)
also demonstrates standard package loading, selective reassessment and duplicate
intake protection across restart. Earlier failures and limitations remain in the
linked sprint records; their Proposed-status statements describe those checkpoints.

Acceptance does not freeze the disposable JSON schema, candidate signatures,
thresholds or retrieval algorithm. It establishes neither supported memory APIs
nor a production implementation. The sprint sections below retain the experiment
sequence and its original constraints, not instructions to start further sprints.

## Demonstrated approach

Knowledge retains evidence and derived claims. Memory supplies continuity from
experience using that material. Context selects what is useful for an execution.
Nightloom maintains derived knowledge automatically, without a human approval
queue. These are responsibilities, not mandatory services or stores.

Use hybrid capture: host-observed tool outcomes provide basic observations
without a model remembering to log them; explicit tools allow deliberate
contribution and retrieval. Instructions guide useful recall. Only verified
provider integration points may be used; observing Drawloom tool calls does not
establish visibility into every native provider tool. Hidden chain-of-thought
is neither required nor captured. Generated summaries are interpretations, not
independent evidence.

Keep provisional evidence and notes in isolated temporary JSON storage. Stable
source references and truthful staleness matter; a universal confidence score,
knowledge graph, domain-policy engine and schema with dozens of fields do not.
Fibres, threads and fabric guide the lifecycle without requiring a separate
entity for every metaphor. Domain-specific assessment remains a later question.

Existing tool grants and invocation evidence stay authoritative. Knowledge
maintenance is not business acceptance. Provider transcripts and ADR 0014 display
history remain separate; this experiment does not automatically mine either.
Recalled source content is reference material, not authority to change rules.

## First sprint

Use a public synthetic operational example, with no provider generation or
production data:

1. A fresh agent with no retained evidence establishes a comparison answer.
2. An agent uses a synthetic inspection tool; its returned outcome is captured
   automatically by the host, rather than by an agent memory-write call.
3. A separate automatic maintenance turn writes an evidence-linked note.
4. A fresh agent receives generic retrieval instructions, not the note or its
   facts in its prompt, and answers a relevant planning question.
5. Add contrary evidence and repeat maintenance and fresh-agent retrieval.

Observe actual tool calls and answers, not just planted search results. Record
calls, elapsed time and context bytes; do not call byte counts token measurements.
Inspect qualification, evidence citations and the difference from the baseline.
Test restart of JSON storage, duplicate capture, invalid references and stale
maintenance. This is not a calibrated evaluation or proof of general memory
quality. Irrelevant-topic retrieval provides a small negative control.

Run through existing agent/tool interfaces. Keep the source under
`spikes/adr-0022-memory/`, model-dependent runs opt-in, and sanitised findings
under `knowledge/evidence/`. Temporary state is disposable; there is no migration
promise. No supported package, desktop feature or private content is introduced.

## Complexity guardrail and references

Every additional component, lifecycle stage or required field must address an
observed failure. Materially more complexity than the inspected references
requires a concrete justification and maintainer discussion.

The [retained survey](../reference/knowledge-memory-survey/README.md) is the
source authority, with pinned implementation links:

- Hindsight informs evidence versus automatic consolidation.
- Letta Code informs advancing maintenance only after successful publication.
- Graphiti informs later evidence qualifying previously valid claims.
- HippoRAG informs preserving source support.
- DeepSeek and Open Design inform separating retention from context selection.

The experiment does not copy their engines. Unlike their richer retrieval
systems, the first proof uses a topic-filtered JSON list. This deliberate
simplification tests integration and behaviour, not search quality.

Apply architecture principles 2, 3, 5, 6 and 7: reference-led boundaries,
replaceability, proportionate effort and source-aware safety. ADR 0005's logical
partition remains accepted; this experiment explores its cooperation
without merging its contracts. ADRs 0007–0008 govern agent/tool execution;
0014 governs display history; 0018 governs plugins. No accepted API is amended.

## Review and exclusions

### Fifth bounded sprint: plugin-owned source revisions and one waterline

Exercise a source-agnostic, producer-bound intake inside the retained proof.
The producer owns source identities, revisions, detection and access. Intake
namespaces identities by producer, accepts content/revision/withdrawal changes,
and deduplicates repeated revisions without granting access to knowledge editing.
No Git detection, watcher framework, supported plugin extension or capability
API is added. A synthetic producer exercises the candidate boundary directly.

Use one ordered change log for fibres, threads and source changes, with a shared
pending-count threshold (50 by default; smaller batches in live examples).
The fifth sprint initially let Nightloom's model choose claims and revision-specific
links labelled supports, contradicts or qualifies. The agent-facing simplification
below replaces that surface with claims and evidence references; the host retains
revision-specific links, without a polarity enum. Linked revision changes mark claims
for reassessment, not automatic confidence reduction. Previously unlinked sources
enter the backlog so Nightloom can discover their relevance.

Publication atomically saves assessed claims and advances the waterline to the
snapshot actually read. New arrivals remain pending and can leave published
claims needing recheck. Reject conflicting concurrent publication; do not force
an endless restart whenever evidence arrives during assessment. Preserve source
revisions and distinguish withdrawal of support from proof a claim is false.

The earlier same-topic and whole-notebook proof shapes remain reproducible;
this scenario tests a revised disposable shape because immutable observations
alone cannot express changing external sources. Keep fields and operations
small and provisional. Verify threshold/deduplication and revision races
deterministically, then use live Codex to assess supplied sources, a revised
source, withdrawal and a previously unlinked contradiction. Stop within an hour
and retain limitations; this is not production ingestion or scheduler delivery.

The [fifth sprint evidence](../../knowledge/evidence/adr-0022-memory-sources-sprint.md)
demonstrates source revision/withdrawal intake, threshold deduplication, linked
reassessment, new-source linking and publication that leaves later arrivals
pending. The initial planner deferred unexpectedly over environment identity.
It also exposed ambiguity when mutable claim text changes meaning while link
relations still describe its original proposition. The maintainer chose to keep
these distinctions out of the agent interface rather than add a claim/assessment
subsystem. Historical receipt labels are not machine-actionable public contracts.

### Fourth bounded sprint: organisation, judgement and interrupted maintenance

Run one synthetic sequence with unfiled observations, not preassigned topic
groups. The maintainer chooses short topic labels and source-linked notes; derive
the small routing index directly from those saved labels. Reuse the existing
JSON notebook rather than introduce a catalogue service or a new public API.

Replace the proof's same-topic publication requirement for this scenario with a
bounded whole-notebook publication: every original observation must be accounted
for, referenced IDs must exist, and an older evidence snapshot cannot replace
the current notes. Coverage is not agreement or proof of a claim. Original source
text remains unchanged. Readers can see newly unprocessed observations alongside
the last saved notes; mark that pending coverage explicitly. This is coarse
whole-notebook maintenance, not incremental claim repair or production storage.

Include repeated delivery, separately identified reports of the same incident,
independent observations, unrelated topics and later contradictory evidence.
Inspect the actual claims for unjustified generalisation and independent-evidence
counting. Include a source containing misleading instructions and an unsupported
assertion; check both maintenance and later reader behaviour without a human
approval queue. Do not treat schema validation as a semantic safety guarantee.

Interrupt a live maintenance turn after reading but before publication, reopen
the stored notebook, ask a fresh reader to use the pending evidence, then run
maintenance again. Retain the last notes and source identities throughout.
Record the controlled interruption point and distinguish it from power-loss
durability. Topic stability, bounded discovery and safe use remain empirical
questions. Stop for review within an hour even if the experiment exposes failures.

The [fourth sprint evidence](../../knowledge/evidence/adr-0022-memory-organisation-sprint.md)
records generated topics, duplicate-versus-independent evidence judgement,
controlled native interruption, use of pending observations before maintenance
recovered, and rejection of an explicit hostile source instruction by maintenance
and readers. No observation/note fields were added. Seven controlled sources and
one run do not establish scalable organisation, calibrated confidence or a
security guarantee. The precise interruption boundary and remaining limits are
part of the evidence; the ADR remained Proposed at that checkpoint.

### Third bounded sprint: natural contribution and indexed recall

Use the existing provisional note-writing tool for foreground contribution;
recording a note does not promote it to established truth. A normally worded
diagnostic task does not explicitly request a memory write. Generic harness
instructions encourage preserving useful evidence-linked lessons, while the
existing host capture point still records the diagnostic result automatically.

Compare fresh-agent recall with and without a small injected topic/title index.
Use opaque topic identities and remove the old example topic from tool metadata.
The index contains no outcomes, conclusions or source bodies. Include competing
notes, a paraphrased task and an unrelated non-visual task. Reader prompts name
neither memory tools nor topic IDs. Keep retrieval as exact lookup behind the
tool initially: the model routes from index metadata to a bounded read.

Record selected topics, result counts, note writes and saved actions/answers.
Separate not attempting retrieval, retrieving the wrong/empty material, and
misusing relevant evidence. Index-assisted success is not proof that unsupported
free-text queries, semantic search, autonomous knowledge discovery or large
catalogues work. No embeddings, vector database, new data model or hook framework
is introduced. Stop after a bounded observed result for review.

The [third sprint evidence](../../knowledge/evidence/adr-0022-memory-natural-sprint.md)
records foreground contribution without an explicit user memory request. An
unindexed fresh agent tried seven unsuccessful lookups; the identical indexed
task retrieved the correct note and saved a supported choice. A paraphrase and
non-visual task also retrieved relevant evidence. Four hand-labelled topics and
one run demonstrate a small context-routing intervention, not scalable retrieval
or automatic catalogue maintenance. No notebook field or public API changed.

### Second bounded sprint (authorised after first review)

Reuse the same notebook and integration. Ask fresh agents to save a disposable
export plan, not merely recommend one. The unchanged task requires transparent
pixels and prefers the faster mode when correctness is known. Observe four
conditions: no evidence; a diagnostic demonstrating a transparent-image defect
and working compatibility mode; a successful opaque-image test that should not
change this task's choice; and a later installed-version diagnostic demonstrating
the transparent-image fix. Keep the irrelevant observation under the same topic
so a retrieval filter cannot alone pass that control.

The plan tool accepts any valid mode, including deferral. The evaluator—not the
tool handler—checks the independently specified expected choices and evidence
references. Do not put expected choices in agent prompts or fabricate execution
success. This tests one synthetic decision, not real rendering or general task
quality. Leave the notebook model unchanged unless an observed failure requires
discussion.

The [first sprint evidence](../../knowledge/evidence/adr-0022-memory-sprint.md)
records two live runs, the checked source, measurements and limitations. The
integration loop worked; a changed task outcome was still unproven at that
checkpoint, so the ADR remained Proposed pending subsequent sprints.

The [second sprint evidence](../../knowledge/evidence/adr-0022-memory-action-sprint.md)
records an informative initial failure caused by ambiguity about current versus
recorded environment state. With a snapshot-relative question, fresh agents
saved the expected changing plans and preserved their choice under same-topic
irrelevant evidence. This demonstrates synthetic plan selection, not actual
rendering, present-day environment verification or general task-performance gain.
The notebook model and supported interfaces remain unchanged.

### Agent-facing simplification (maintainer direction)

Agents consume knowledge: claims and cited evidence, with uncertainty stated in
plain language. They do not manage source revisions, link polarity, pending
counts, thresholds or waterlines. Source plugins retain their separate update
interface. Nightloom's host captures the assessment boundary and commits it;
the model doing the assessment reads evidence and writes claims with evidence
references only. A later arrival must remain pending even though the model is
never shown that bookkeeping. Historical or withdrawn evidence must still be
recognisable as such, without presenting the underlying revision machinery.

Exercise this smaller surface in the existing source-update scenario. Evidence
references are validated against the host-captured assessment; no caller-supplied
progress position is accepted. This is a proof revision, not a new public API or
a commitment to the internal claim model. Prior sprint receipts remain unchanged.
The [simplification evidence](../../knowledge/evidence/adr-0022-memory-simple-interface.md)
records the narrowed surface, verification and outstanding limits.

### Combined Git, judgement and retrieval sprint

The maintainer approved one connected experiment using this public repository.
A standard MCP Git plugin owns read-only committed-file collection and its own
delivery checkpoint. It supplies bounded evidence batches; the proof acknowledges
them only after source intake succeeds. No supported memory capability or plugin
extension is added. Git collection ignores uncommitted files, runs no hooks or
tests, and modifies no source repository state. Controlled changes happen only
in a disposable repository containing selected public committed files.

Code-domain instructions distinguish implementation, test assertions, observed
test results, ADR intent and commit-message claims. No invented confidence scores
or policy engine. Assess a bounded mixture of relevant and unrelated files; fresh
agents ask natural questions. Exercise query-based bounded retrieval and
per-operation evidence deduplication without embeddings. Maintenance may still
read the complete small notebook; this is not a scalable-index claim.

Verify an implementation change is collected, related claims become questionable
and are reassessed, a later answer changes, and an unrelated change does not
invalidate unrelated claims. The sprint required review around an hour with
changes uncommitted and the ADR Proposed. Its results and limits are recorded
in the [combined Git sprint evidence](../../knowledge/evidence/adr-0022-memory-git-sprint.md).

## Weaknesses and future implementation work

No further broad proof sprint is required to accept this boundary. Carry the
observed weaknesses into implementation acceptance tests rather than expanding
the disposable prototype. Apply the complexity guardrail above before choosing
storage, retrieval machinery or supported contracts.

| Remaining weakness | Follow-up and acceptance evidence |
| --- | --- |
| Repeated full maintenance reads | Measure incremental assessment and evidence reuse. Preserve committed coverage, pending arrivals and interruption recovery while reducing repeated bytes. The final Git run read the changed notebook twice; reader deduplication does not solve this maintenance cost. |
| Broad lexical retrieval | Test relevant and irrelevant questions against a larger, varied corpus; measure missed evidence, irrelevant material, returned bytes and resulting decisions. Correct answers from a small notebook do not establish reliable retrieval at scale. This is knowledge quality, not merely latency. |
| Input-validation friction and arbitrary proof limits | Use recorded rejected submissions as regression cases and make errors actionable. Revisit the eight-claim and small-file limits without weakening citation validation. The receipt does not establish the exact cause of the initial rejected claim submissions. |
| Uncalibrated domain judgement | Evaluate source independence, recency, contradictions, withdrawals and version applicability using domain-specific expectations. Code-source judgement is demonstrated narrowly; calibrated confidence and medical/legal reliability are not. Do not prescribe a universal score. |
| Disposable storage and source intake | Implement and verify durable local storage, scoped access, bounded reads, scheduling and source-plugin recovery. Retain duplicate protection and atomic assessment progress. The Git example reads selected current committed files, not all commits or an entire repository. |
| Limited safety and provider evidence | Preserve hostile-content and stale-publication cases as regressions, then test broader failure and access scenarios. One rejected hostile instruction is not a security guarantee; captured Drawloom outcomes do not prove coverage of all native tools. |

Per-operation evidence deduplication is not a cross-session cache or a guarantee
of model retention after compaction. Implementation must distinguish already
transferred evidence from context the current execution can actually use.
Optimisation must not hide newer evidence or make stale claims appear current.

Retain changed-decision, irrelevant-evidence, source-withdrawal, selective
reassessment, restart and interrupted-maintenance cases as behavioural acceptance
tests. Report quality and correctness separately from latency and byte savings.
Production durability and quality remain implementation work, not consequences
of this ADR's acceptance.

## Exclusions

Enterprise sharing, entitlements implementation, full Nightloom scheduling,
embedding indexes, model training, benchmark claims and production migration are
excluded. The next ADR is intentionally not specified here.
