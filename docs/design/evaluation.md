# Evaluate work and compare results

Use evaluation to assess an existing result or run the same cases against
different targets. A **case** is the input and expectations for a test. A
**target** performs the work, and a **scorer** checks the result. Findings explain
what each scorer observed; a score is optional.

Start with saved output when you want to judge work without regenerating it.
Use an experiment when you want the target to run, for example to compare model
configurations. [ADR 0025](../adr/0025-evaluation-boundaries-and-comparative-proof.md)
records the accepted interfaces, implementation and evidence.

## How an assessment runs

Evaluation uses orchestration to schedule work, wait, cancel and recover.
It does not add a second scheduler. Braintrust and Autoevals operate inside an
assessment step rather than controlling the whole experiment.

Each repetition has separate target and scorer steps. Assessing existing output
makes no target call. Expected answers go only to scorers, never to the target.

Outputs and findings are saved before a step reports completion. If one scorer
fails, successful sibling findings remain available. A scorer failure is an
error to investigate, not a numeric zero for output quality.

Orchestration stores execution state. Evaluation stores definitions, outputs,
findings, progress records and feedback, together with the link to the
orchestration run. Saved findings can therefore be read when orchestration is
unavailable.

## Permissions and project access

An evaluation service belongs to a particular installation and project, fixed
by the host. Browser requests cannot select another scope or supply code to run.
Trusted installed code registers versioned targets and scorers through the
existing backend and workflow mechanism.

Starting an evaluation does not grant tool access or approve an edit. A target
using an agent or tool goes through the normal controls. Evidence references
identify material; they do not give permission to read it. Plugins retain
responsibility for domain checks and preparing media for their scorers.

Shared presentation uses existing Drawloom controls and standard MCP Apps.
Feedback remains attributed advice, not business approval.

### Connect evaluation to a workbench

During activation, the trusted backend composes evaluation once with its
versioned targets and scorers. The returned service is used to start or inspect
evaluations; the returned handlers join the backend's existing `taskHandlers`.
The portable workflow module includes the reusable evaluation definitions.
The host selects storage and assessment implementations.

This setup is fixed for that activation, not a global registry where browser
requests can add functions. Existing workflow bundle and handler-version checks
still apply. Authors must update declared versions when execution or scoring
behaviour changes; a version declaration does not verify every backend byte.

Call `EvaluationService.readiness()` to see whether new work can start. It
does not schedule anything. Missing orchestration prevents new evaluations, but
saved findings and feedback remain separately usable.

### Identify the work correctly

`EvaluationInvocationContext.runId` identifies the evaluation.
`operationId` identifies the execution operation, supplied from the existing
orchestration task context. Assessment providers preserve that identity when
forwarding calls.

Consumers invoking tools use this explicit operation identity for existing
gateway checks. They must not infer it from a cancellation signal. It records
where the invocation belongs; it is not new permission or browser-supplied
authority.

## Comparing saved findings

A useful baseline compares different results against the same question and
checks. A matching display title is not enough.

Cases must match in identity, revision, input and expected material. Scorers
must match in identity, revision and configuration. Different definitions can
contain those same cases, while their supplied outputs or target configurations
differ—that is what the comparison measures.

Missing or incompatible results are shown as incomparable, not as zero change.
The UI reads the selected case and definition header without loading the entire
case collection. Output-specific references belong with the output, not a
rewritten case identity. Feedback does not overwrite earlier findings.

## Recovery and usage

After interruption, check saved findings and execution receipts before deciding
whether to repeat work. If they cannot establish the outcome, report uncertainty
rather than submit another edit or model request. A retry policy cannot override
that safeguard.

Record usage for each target or scorer invocation. Missing measurements remain
unknown. Cached input tokens are part of the input token count, not extra tokens
to add again. Evaluation content does not belong in content-free operational
telemetry; tool evidence stays in its existing store.

## Optional Codex scoring

The host offers the native rubric scorer only when
`DRAWLOOM_EVALUATION_MODEL` names a model explicitly. Without that setting,
deterministic checks remain available. Configuring or discovering the scorer
does not start a session.

The configured label tells you which model was requested; it is not measured
response metadata. Session mappings are separate for each installation and
project beneath `evaluation-agents/` in the Drawloom data directory.
The native read-only sandbox and human review policy remain in effect.
An empty Drawloom tool list does not prove that every native tool is isolated.

New judge sessions are archived only after their native terminal outcome is
known. A later failure to parse the scorer's response does not undo that native
completion or prevent archival. An uncertain outcome does not justify resubmitting
the work.

## Verification record

The ADR links the retained comparisons and implementation evidence. Keep proof
experiments, supported integration tests and model-quality measurements distinct:
working interfaces do not establish that every scorer makes useful judgements.

The optional `scripts/fixtures/evaluation-native-live.ts` exercise uses the real
host and local orchestration to assess two saved synthetic passages. After
building packages, it requires both `DRAWLOOM_LIVE_EVALUATION=1` and an explicit
`DRAWLOOM_EVALUATION_MODEL`. It uses the signed-in account and requests low
effort, so do not run it as a routine documentation check.

That exercise reports findings and usage without demanding a canned model answer
and verifies that both owned sessions are archived. If verification fails, the
fixture keeps its temporary diagnostic state for inspection rather than repeating
the model submission. It is separate from public deterministic tests.

For implementation examples, read
[the evaluation package](../../packages/evaluation/evaluation/README.md) and
[the public knowledge-evaluation example](../../packages/examples/knowledge-evaluation/README.md).
