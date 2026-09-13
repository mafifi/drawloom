# ADR 0025: Evaluation boundaries and a comparative proof

- Status: Accepted
- Date: 2026-09-12
- Accepted: 2026-09-13 (interfaces and supported implementation direction)
- Implementation accepted: 2026-09-13 (verified local delivery; quality limitations retained)

## Accepted implementation decision

The maintainer accepted the demonstrated boundaries and approved
[supported implementation](../plans/adr-0025-supported-evaluation.md). Acceptance
does not mean that delivery or general evaluator quality has been established.
The comparative sprint descriptions below are retained as decision history.
The [implementation reference](../design/evaluation.md) records integration
ownership and links this decision to supported delivery.

Evaluation owns versioned cases, criteria, findings, comparisons and advisory
feedback. **Orchestration owns scheduling and recovery.** Evaluation consumes the
portable orchestration interface; it does not depend directly on Temporal or run
a second experiment scheduler. The selected local composition can use the
existing Temporal implementation without exposing that choice to consumers.

Promote the demonstrated contracts into supported packages. Use SQLite for scoped
local definitions, target/scorer checkpoints, findings and feedback. Persist each
completed step before acknowledging it to orchestration. Duplicate delivery must
not repeat effects; uncertain execution remains explicit until reconciled.

Braintrust's local JavaScript implementation and Autoevals supply assessment
within individual scheduled steps, not whole-experiment scheduling. Promptfoo
remains comparative evidence rather than a supported provider. Optional model
judging uses the existing agent interface and native authority. Report normalized
per-invocation usage where available; unknown usage and cost remain unknown.

Expose evaluation as an optional installation/project-scoped capability through
the existing trusted backend boundary. Preserve standard MCP Apps presentation,
independent grants, native approval and source-bound file access. Plugins own
domain checks and preparation; assessment never accepts or publishes their work.

The maintainer accepted the supported implementation and verification on
2026-09-13 and authorized committing the delivery. The
[delivery evidence](../../knowledge/evidence/adr-0025-supported-evaluation.md)
records conformance, restart/recovery, installed consumers, runtime checks and
presentation verification. Broader judgement calibration and production usefulness
remain limitations, not claims established by technical delivery.

## Context

Drawloom needs to assess existing work and compare ways of producing it. These
are different operations: checking a saved video must not require regenerating
it. An evaluation result is evidence, not permission, business acceptance or
publication. The current knowledge evaluation is a useful consumer, not yet a
general evaluation capability.

The [permissive evaluation survey](../reference/evaluation-survey/README.md)
records seven inspected repositories, exact revisions, licence boundaries,
interfaces and architecture maps. It is the comparison authority; source
inspection is not integration evidence.

This proposal applies useful type safety, replaceable boundaries, local access,
proportional efficiency, proven implementations and safe user control from
[the architecture principles](../../ARCHITECTURE.md#decision-principles).
Reuse working scorers/runners rather than recreating their libraries. Generalise
from contrasting consumers rather than naming a universal quality score.

## Comparative proposal and decision history

### Capabilities and ownership

| Capability | Include | Candidate boundary | Proof needed |
| --- | --- | --- | --- |
| Assess existing material | First-class, independent of generation | Case, scorer | Saved artifact remains unchanged; zero target calls |
| Cases and reproducibility | Stable input, criteria and configuration revisions | Case, result | Identical consumer definitions across both runners; reload baseline |
| Deterministic and model scoring | Plugins define meaning and preparation | Scorer | Computed checks, real library scorer, scripted judge now; live judgement later |
| Tool choice and actual effects | Distinct evaluation subjects | Target, result | Synthetic target now; real approved edit and tool-choice comparison later |
| Retrieval and conversation evaluation | Selected authorized evidence and steps | Case, scorer | Existing frozen knowledge cases and multi-turn edit evidence in follow-up |
| Experiments and comparisons | Repeats, bounded concurrency, cancellation, per-case differences | Runner, result | Counts, overlap, cancellation, known per-case regression |
| Results and diagnosis | Findings, references, errors, timing and known usage | Result | Failures are not zero scores; provenance and sibling findings preserved |
| Feedback and calibration | Optional attributed feedback on exact results | Feedback | Persist/reload feedback; known good/bad examples; no acceptance side effect |
| Local reports and CI | No required hosted evaluation account | Runner, result | Network-denied real-library runs and portable CI checks |
| Multimodal assessment | Plugin-selected checks, not a universal media score | Scorer, evidence references | Generated public media now; meaningful saved-master checks later |

Defer shared annotation infrastructure, continuous production sampling, automatic
failure mining, prompt/model optimisation and promotion, and broad adversarial
campaigns. Shared/enterprise implementations can follow; no enterprise service
is an OSS prerequisite. An optional later integration is not implemented by this
decision.

Exclude another agent loop, orchestration engine, artifact framework, approval
service or content-bearing operational telemetry system. No desktop UI or plugin
registration changes belong to the first sprint.

### Candidate interfaces

Keep executable candidates under the [retained proof](../../spikes/adr-0025-evaluation/README.md),
not supported packages. Contract schemas have no vendor or host imports.

- **Case:** stable identity/revision, typed input, optional expected material,
  supplied output for existing-work assessment and authorized evidence references.
- **Target:** typed input and cancellation in, output/outcome out. Expected answers
  belong to scoring and must never be forwarded through a vendor's task hooks.
- **Scorer:** input/output/permitted references in; named findings, optional scores
  and explanations out. Domain interpretation belongs to the consumer.
- **Runner:** execute bounded cases/configurations/repetitions, with progress and
  terminal results. Native runner scheduling is exercised, not replaced by a new
  engine hidden behind two nominal adapters.
- **Result:** binds case, target and scorer versions to findings and execution
  outcomes, timing, evidence references and available usage. Unknown cost stays
  unknown. A scorer error is not a poor-quality score.
- **Feedback:** attribution and rating/correction against the exact result. It
  neither approves work nor automatically updates future cases.

These responsibilities do not require six packages, services or repositories.
Plain JSON result files suffice for the disposable proof; no storage capability
or authoritative artifact system is introduced.

Two explicit paths are required: **assess existing**, which never executes a
target, and **run experiment**, which invokes a target then scores its output.
Denied, cancelled, timed-out and uncertain work remain distinct from evaluation
quality; there is no automatic retry. Cancellation stops new dispatch and reports
already-running work honestly rather than pretending an external effect stopped.

Evidence references use existing authorized file/asset access. A path/reference
alone grants no access. Selected content and results do not enter ADR 0019's
content-free operational traces.

### Implementations compared

1. **Promptfoo (MIT):** `evaluate`, custom provider and assertion APIs; a broad
   local experiment runner with existing reports and comparison behavior.
2. **Braintrust JavaScript SDK (Apache-2.0) plus Autoevals (MIT):** typed
   data/task/scorer functions, explicit local/no-send mode, and callable scorers.

Neither is selected as a supported dependency. The comparison tests public APIs,
not copied/reimplemented vendor scheduling. Versions are root-catalog pinned;
vendor-specific types and options remain in Node proof adapters.

Arcade is a useful tool-selection reference, but its evaluator does not execute
the predicted tools. DeepEval offers specialist Python metrics. Langfuse core is
a broader platform with a substantial service footprint and excluded enterprise
directories. LangSmith's permissive SDK does not supply its server; the inspected
JavaScript runner is service-coupled. These findings explain the shortlist, not
permanent exclusion of future integrations.

No-send/local flags do not establish network isolation: telemetry, model clients,
dataset reads and enclosing traces are separate outbound paths. Tests deny
network access, record attempts, and isolate configuration from user accounts.
No vendor internals are patched to suppress inconvenient findings.

An OpenAI-compatible judge client is not Codex App Server. Live model integration
must use Drawloom's intended provider boundary explicitly; it cannot silently
assume API credentials, billing or subscription equivalence.

## Proof and acceptance

The first sprint is time-bounded to 1–2 hours. It delivers a comparison, even when
a library fails a requirement. It uses public synthetic document/media fixtures,
real vendor APIs, deterministic/scripted scorers, temporary local state and no
live model calls. Record cold startup, 30 warm repetitions, latency median/p95,
process memory, target/scorer calls, result size and installed dependency cost.
Separate fixture execution from runner overhead.

Shared conformance covers target-free assessment, same consumers across adapters,
expected-answer isolation, invalid input/output, repetition/concurrency,
failure/cancellation semantics, preserved sibling findings, feedback/baseline
reload and per-case regression reporting. A scripted judge validates the interface,
not model judgement quality. Generated media is technical evidence, not a claim
of meaningful video quality assessment.

Before acceptance, subsequent sprints must additionally prove:

1. A saved video master with meaningful plugin-owned checks and no regeneration.
2. Tool selection separately from actual passage edits with native review and
   independent grants; denial must cause zero protected edits.
3. Frozen knowledge retrieval/evidence-chain and grounded-answer comparisons.
4. The intended live Codex scoring path and its actual disclosure/cost behavior.
5. Per-case findings, comparisons and feedback through existing shared UI/MCP
   Apps boundaries, without a proprietary browser protocol.

Private fixtures and real workbench evidence stay in the private repository;
public conformance never depends on it. Any broader plugin boundary requires a
maintainer decision before implementation. First-sprint success cannot accept
this ADR or establish production compatibility.

## Consequences and evidence

Evaluation remains separable from execution authority and from domain judgement.
The proof may reveal that an adapter costs more than it saves; report that
limitation rather than recreating a runner or hiding unsupported behavior.

The first sprint exercised both native runners with the same candidate consumers.
Its evidence recommends **Braintrust's local JavaScript runner plus Autoevals for
the next consumer test**, not for immediate adoption. Promptfoo's disabled
telemetry still attempted egress under OS denial; Braintrust's cancellation
needed explicit settlement of active callbacks. These differences and the
measured dependency/runtime costs are recorded in the evidence, not hidden by
the shared interface. Completed output with interrupted scoring is retained as
`unscored`; it is neither an execution failure nor a quality score.

The [second sprint](../../knowledge/evidence/adr-0025-media-consumers.md) exercises
existing private video masters and an unrelated public audio-preview consumer
through the same candidate scorer interface, without regeneration or a contract
extension. Delivery checks and decode integrity are useful evidence, not a
judgement of creative or clinical quality. The private test is not yet an
installed evaluation UI.

The [third sprint](../../knowledge/evidence/adr-0025-tools-and-codex-judge.md)
demonstrates real private passage edits through native review and independent
grants, followed by advisory scoring through Codex App Server and the candidate
Braintrust runner. Approved useful and poor edits each executed once; denial
and a revoked independent grant prevented effects. Six narrow judgements
matched their predeclared expectations, including the two actual saved edits.
Native choices were scripted test responses, not desktop clicks. All seven
disposable tasks archived after results were saved and writers closed.

This is evidence for the intended interfaces, not a general quality guarantee:
individual rubric explanations overlapped, native judging carried substantial
input-token overhead, and monetary cost was unavailable. Per-scorer usage is
retained in proof receipts; its ownership/aggregation in the candidate result
schema remains a design question before promotion. No supported contract was
extended to hide that question.

The [fourth sprint](../../knowledge/evidence/adr-0025-knowledge-and-presentation.md)
assesses 48 retained current retrieval outputs, 72 historical answers and two
labelled controlled regressions with zero target/model calls. Historical CPU
answers are not relabelled as MLX evidence. A fresh lexical 10,000-record run
matches the retained lexical references and separately exercises actual evidence
expansion; top-k reference coverage is not presented as graph traversal.
An installed standard MCP App displays per-case findings, comparisons and advisory
feedback in the existing desktop, preserving source results across save/restart.
No new browser permission or protocol is needed. This advances knowledge and
presentation evidence, not general judgement quality or production adoption.
Broader calibration, native usage aggregation, autonomous tool-choice evaluation
and the documented residual media checks remain for review.

See the [first-sprint evidence](../../knowledge/evidence/adr-0025-evaluation.md)
for the comparative measurements. The accepted implementation decision above
supersedes the proof-only disposition. The delivery evidence above records the
subsequently completed and accepted implementation.

Related decisions: ADRs [0005](0005-partition-agent-platform-capabilities.md),
[0008](0008-tool-execution-and-exposure.md),
[0013](0013-plugin-boundaries-and-host-integration.md),
[0015](0015-working-material-ownership-and-edit-approval.md),
[0018](0018-plugin-standards-and-runtime-extensions.md),
[0019](0019-useful-observability.md),
[0021](0021-local-temporal-orchestration.md),
[0023](0023-knowledge-memory-authorization-boundaries.md) and
[0024](0024-local-knowledge-memory-and-retrieval.md).
