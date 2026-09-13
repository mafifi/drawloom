# Evaluation implementation

Status: supported implementation and verification complete under
[Accepted ADR 0025](../adr/0025-evaluation-boundaries-and-comparative-proof.md).
The [execution plan](../plans/adr-0025-supported-evaluation.md) tracks delivery.
This page records integration ownership. The linked delivery evidence distinguishes
verified paths from broader judgement-quality and platform limitations. Changes
were accepted for commit by the maintainer on 2026-09-13.

## One scheduler, separate durable findings

Evaluation describes what to assess and retains what each check found.
Orchestration owns running, waiting, cancellation and recovery. The supported
consumer depends on the orchestration contract, never its Temporal provider.
Braintrust and Autoevals run within an assessment step, not around an experiment
with another scheduler.

Each case repetition has separate target and scorer steps. Existing-output
assessment skips target execution. Expected answers go to scorers only. Each
completed output or set of findings is stored before the step acknowledges
completion. A scorer error preserves completed sibling findings and is not a
numeric quality score.

Run state is not duplicated in evaluation storage. The run binding identifies
the versioned definition and orchestration run. Results, checkpoints and feedback
are evaluation facts; orchestration remains authoritative for execution state.
Cached findings can therefore be read when orchestration is unavailable.

## Scope and authority

Host composition fixes the installation and project for each evaluation service.
Browser requests cannot choose a different scope. Trusted installed code supplies
versioned target and scorer implementations using existing backend/workflow
registration. No function bodies or executable paths come from the browser.

Targets invoking agents or tools use the existing authority. Starting an
evaluation does not grant tool access or approve an edit. References identify
evidence; they do not authorize reading it. Domain checks and media preparation
stay in the owning plugin. Shared presentation uses standard MCP Apps and
Drawloom's existing UI components.

`EvaluationInvocationContext.runId` identifies the evaluation;
`EvaluationInvocationContext.operationId` identifies its owning execution
operation. The orchestration consumer supplies the latter
from its existing task context; assessment providers preserve it when forwarding
the invocation. Tool-using consumers use that explicit identity, not an inferred
mapping from cancellation signals. It is provenance for existing gateway checks,
never a new permission or browser input.

The trusted evaluation capability has one startup composition call accepting
versioned target/scorer bindings. It returns the scoped service and ordinary
orchestration task handlers. The backend includes those handlers in its existing
`taskHandlers`; its portable workflow module includes the reusable evaluation
definitions. The host selects storage and assessment providers. This is one
immutable composition per activation, not a global registry or hot-registration
API. Missing orchestration prevents starts, not reading saved results.

`EvaluationService.readiness()` reports the host's current start availability
without scheduling anything. Shared presentation uses this fact to explain a
disabled Start action. It does not infer setup from the status of a selected run;
saved findings and advisory feedback remain separately usable.

Existing workflow bundle protection and declared handler-version checks still
apply. They do not attest backend implementation bytes. A plugin author must
change its declared version when changing judgement or execution behaviour;
unchanged-version edits are a trusted-package limitation, not a new guarantee
introduced by evaluation.

## Recovery and usage

An interrupted operation is not automatically safe to repeat. Recovery first
checks persisted findings and existing execution receipts. If they cannot
establish an outcome, report uncertainty rather than submitting another edit or
model request. Explicit retry policies cannot override that rule.

Usage belongs to individual target or scorer invocations. Missing provider
measurements remain unknown. Cached input tokens are a subset of input tokens,
not an extra quantity to add to the total. Evaluation content remains outside
content-free operational telemetry; execution evidence retains its existing home.

The desktop host exposes the optional native rubric scorer only when
`DRAWLOOM_EVALUATION_MODEL` explicitly names a model. Without it, deterministic
checks remain available. Configuring or discovering the scorer starts no session.
The selected label describes the requested model, not measured response metadata.
Each installation/project owns separate native session mappings beneath
`evaluation-agents/` in the selected Drawloom data directory. The ordinary native
read-only sandbox and human review policy remain in effect; an empty Drawloom
tool list is not a claim of complete native-tool isolation. Fresh judge sessions
are archived only after their native terminal outcome is established.

## Verification record

### Comparing saved findings

A baseline compares different outputs against the same test. Matching a display
title is insufficient: the selected cases must share identity, revision, input
and expected material, and the selected scorers must share identities, revisions
and configuration. Different immutable definitions may contain those same cases.
Their supplied outputs or target configurations may differ—that is the point of
the comparison. Missing or incompatible records are reported as incomparable,
not as a zero difference.

The presentation reads the selected case and definition header, not the entire
case collection. Mode-specific provenance belongs with the supplied output and
its references, rather than changing the underlying question identity. Feedback
is separately attributed advice; saving it neither rewrites findings nor accepts
the assessed work.

The retained comparisons and consumer tests are linked from the ADR. Supported
implementation results will be recorded separately, including runtime, restart,
installed consumers and any remaining limitations. Historical proof success is
not silently relabelled as supported integration evidence.

The opt-in `scripts/fixtures/evaluation-native-live.ts` exercise uses the supported
host composition and real local orchestration for two saved synthetic passages.
After building packages, run with `DRAWLOOM_LIVE_EVALUATION=1` and an explicit
`DRAWLOOM_EVALUATION_MODEL`. It uses the signed-in account, requests low effort,
reports findings/usage without enforcing a canned model answer, and verifies
both owned sessions archived. Failed or uncertain runs retain their isolated
state for inspection rather than automatically repeating a model submission.
