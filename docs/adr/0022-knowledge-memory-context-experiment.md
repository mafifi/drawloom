# ADR 0022: Explore knowledge, memory and context through a bounded experiment

- **Status:** Accepted
- **Date:** 2026-09-11
- **Accepted:** 2026-09-12
- **Decision owners:** Drawloom maintainers

## Context

Learn how useful experience becomes maintained knowledge and reaches an agent
when needed. This ADR authorises a disposable experiment, not production
contracts, a database schema or a final maintenance algorithm.

The first sprint ends at a review checkpoint within one to two hours. An
informative failure is a useful result; expanding the machinery until a test
passes is not. The broader success target is:

> A later agent makes a better-informed decision, can explain the evidence it
> used, and changes its understanding when that evidence changes.

## Decision

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

### Demonstrated approach

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

### First sprint

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

## Alternatives considered

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

## Evidence

The experiment ran as bounded sprints, each stopping for review. Their full
records — including the failures, measurements and stated limits — live in the
evidence files below. The detail was moved there on 2026-09-16 so this record
states the decision rather than the process.

- **Fifth bounded sprint: plugin-owned source revisions and one waterline** — [record](../../knowledge/evidence/adr-0022-memory-sources-sprint.md)
- **Fourth bounded sprint: organisation, judgement and interrupted maintenance** — [record](../../knowledge/evidence/adr-0022-memory-organisation-sprint.md)
- **Third bounded sprint: natural contribution and indexed recall** — [record](../../knowledge/evidence/adr-0022-memory-natural-sprint.md)
- **Second bounded sprint (authorised after first review)** — [record](../../knowledge/evidence/adr-0022-memory-action-sprint.md)
- **Agent-facing simplification (maintainer direction)** — [record](../../knowledge/evidence/adr-0022-memory-simple-interface.md)
- **Combined Git, judgement and retrieval sprint** — [record](../../knowledge/evidence/adr-0022-memory-git-sprint.md)

The first sprint is described under Decision above; its record is the
[memory sprint evidence](../../knowledge/evidence/adr-0022-memory-sprint.md).

Single live observations are not success rates or controlled benchmarks.

## Consequences

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

### Exclusions

Enterprise sharing, entitlements implementation, full Nightloom scheduling,
embedding indexes, model training, benchmark claims and production migration are
excluded. The next ADR is intentionally not specified here.
