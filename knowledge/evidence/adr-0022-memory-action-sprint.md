---
type: evidence
id: adr-0022-memory-action-sprint
title: Memory-driven action selection and irrelevant-evidence control
status: draft
created: 2026-09-11
updated: 2026-09-11
---

# Second bounded memory sprint

Related: [Proposed ADR 0022](../../docs/adr/0022-knowledge-memory-context-experiment.md),
[first sprint](adr-0022-memory-sprint.md),
[runner and commands](../../spikes/adr-0022-memory/README.md).

## Question and method

Does maintained evidence change an agent's saved action when relevant facts
change, while preserving its choice after an irrelevant observation?

The first sprint changed explanations, not decisions. This sprint keeps its
notebook unchanged and adds a disposable `plan.save` tool. The real action is
saving a plan to a temporary file—not rendering media. The tool accepts any
schema-valid mode without checking whether it is the right choice. Evaluation
reads those saved records after the model has finished; expected answers are
not passed to the model or used to force handler outcomes.

In the first attempt each planner received this identical request in a new Codex conversation:

> Prepare a draft export plan for the currently installed Fern renderer.
> Preserve transparent pixels and prefer the faster mode if both are known
> correct. Use plan.save once with native, compatibility, or defer if evidence
> is insufficient. Cite the evidence you use. Do not render.

Generic harness instructions encourage retrieval and distinguish evidence from
instructions. The prompt does not supply the installed version, observed defect,
fix or expected mode. The agent must retrieve those through `memory.search`.

| Condition | Evidence available | Independently expected saved choice |
| --- | --- | --- |
| Baseline | No retained observations or notes | Defer |
| Defect | Installed 1.0: native loses transparent pixels; compatibility preserves them | Compatibility, citing alpha-defect |
| Irrelevant observation | Still 1.0: native succeeds on opaque JPEG; transparency was not tested | Compatibility, still citing alpha-defect |
| Fixed version | Installed 1.1: native and compatibility both preserve transparency; native is faster | Native, citing alpha-fixed |

The irrelevant observation uses the **same topic** as the defect and fix. It is
available to maintenance and in linked retrieval evidence; topic filtering cannot
alone make this control pass. All diagnostic outcomes are controlled synthetic
fixtures, not actual renderer measurements. Codex maintenance and selection are
live model operations using the existing supported driver and MCP gateway.

## Verification design and limits

Five deterministic tests pass locally. The two new evaluator tests were written
before its implementation: the positive case first failed; the negative cases
cover absent, duplicated, unchanged and wrongly supported actions. The notebook's
three existing tests still cover duplicate capture, stale publication and reopen.

This is one deliberately easy operational scenario. Source IDs and exact-topic
retrieval are available; source text explicitly states the test conditions and
installed-version change. Success here would not establish semantic retrieval,
autonomous discovery of all relevant evidence, production rendering correctness,
memory-poisoning resistance or general task-performance improvement.

The agent can add advice beyond the evidence; source citations do not validate
every sentence. The evaluator checks the requested choices and required source
IDs, while manual review checks the rationale and actual call sequence. It is
not a domain evaluation framework or an assessment of calibrated confidence.

No new public contract, dependency, service or notebook field was added. The
plan schema and evaluator are proof-only. Native memory remains disabled, prior
conversation contents are not supplied to planners, and expected choices are
not enforced by the tool handler. Native-tool restrictions remain cooperative
instructions, as in the first sprint. Temporary plans are not business acceptance.

## Attempt 1: expected sequence failed, with an informative reason

The [complete synthetic receipt](adr-0022-action-attempt-1.json) records a live
run on 11 September 2026, ending 17:34:34 UTC. Codex 0.153.4 / Bun 1.2.23;
210.886 seconds; all ten operations completed and all ten conversations were
archived. Exit 1 reflects the action evaluator, not a transport failure.

Actual saved choices were **defer → defer → defer → native**, rather than the
expected defer → compatibility → compatibility → native. Every planner searched
before saving. All captures and maintenance steps completed. The opaque-image
success was correctly described as not establishing transparency correctness.

The defect-stage planner explained that an August diagnostic did not establish
today's installed version. Its deferral was defensible. The final fixture had
stronger wording ("now the current installed version") and led it to select
native. The test mixed historical evidence with present-day environment state,
making the fixtures asymmetric. Memory coverage `stale:false` was not treated
as guaranteed current-world truth. This is an important distinction, not an
excuse to suppress caution in the agent's instructions.

### Bounded correction for attempt 2

Change only the task's time reference, consistently for all four planners:

> Prepare a draft export plan for the latest installed Fern renderer version
> recorded in the evidence, not the unverified present-day installation.

The remaining request is unchanged. Expected modes, storage, retrieval,
maintenance instructions, schemas and evaluator remain unchanged. This asks for
a plan against a recorded environment; it does not claim the actual installation
is known. No expected action or new diagnostic fact is inserted into the prompt.
The correction narrows what the experiment can prove and is retained alongside
the original failed attempt, not substituted for it in reporting.

## Attempt 2: recorded-version action test passed

The [final-source synthetic receipt](adr-0022-action-attempt-2.json) records the
run ending **17:38:50 UTC**, exit 0, in **203.194 seconds**, using the same
Codex 0.153.4 / Bun 1.2.23. All ten operations completed; each native conversation
was fresh and was archived in cleanup. Temporary notebook, plans, execution
records and mappings were removed; archived provider transcripts were not erased.

The actual saved plans, read from disk before cleanup, were:

| Phase | Saved mode | Cited evidence | Manual interpretation |
| --- | --- | --- | --- |
| Baseline | defer | None | Correctly declined to assume an installed version or mode correctness. |
| Defect | compatibility | alpha-defect | Applied the transparency requirement despite native being faster. |
| Irrelevant observation | compatibility | alpha-defect, opaque-success | Used the later observation for version context, but did not confuse opaque success with transparency correctness. |
| Fixed version | native | alpha-fixed | Applied the later version-specific transparency result and the stated preference for speed. |

Each planner made exactly `memory.search` then `plan.save`. Each collector made
one `inspection.run`; each maintainer read evidence then published a note. There
were **17 gateway calls**, no automatic rerun of a failed invocation, and no human
maintenance input. Maintenance retained all three source IDs and distinguished
historical version 1.0 from recorded version 1.1. No renderer ran.

The final saved rationale said:

> Draft targets Fern 1.1, the latest installed version recorded in evidence dated
> 2026-08-03, not the unverified present-day installation. In the local synthetic
> transparent-PNG test, both native and compatibility preserved all transparent
> pixels; native took 200 ms versus compatibility's 600 ms, so select native
> [alpha-fixed].

It also qualified that the observation was specific to the tested input and
version, rather than a general correctness guarantee. The 200/600 ms values are
fixture data, **not measured rendering performance**.

### Measurements

Phase latency includes fresh-session startup and cleanup; these are individual
observations, not percentile measurements. The two machine-readable receipts
retain every phase. Final-run times in order were 19,322 / 13,668 / 24,160 /
22,923 / 13,550 / 21,309 / 27,785 / 15,813 / 24,391 / 20,266 ms.

Custom instructions were 501 UTF-8 bytes per turn. Planner prompts grew from
279 to 354 bytes solely to clarify the time reference. Tool-result sizes include
the host result envelope and evidence metadata; they do not measure full network
traffic or model tokens. No cost, CPU, memory or broad efficiency improvement is
claimed from these two runs.

### Checks

`bun run check:ci` passed: **656 tests passed, five skipped, zero failed**, across
123 files, with package build/export validation, desktop build, type checking,
architecture/UI policy, design and Node conformance. The skips remain existing
opt-in native-review and OS-credential checks. The existing bundle-size warning
remains. After the prompt-only correction, the five targeted proof tests passed
again and the final source was exercised live above. No supported runtime source
changed.

## Review conclusion

The bounded target is demonstrated for **planning against a recorded environment**:
relevant evidence changed a saved choice, while same-topic but wrong-input-kind
evidence did not. The original present-day task did not meet its expected choice
sequence; its cautious result and the ambiguity remain part of the evidence.

This adds an 18-line plan schema/evaluator and a scenario branch to the runner;
the 64-line notebook is unchanged. There is still no graph, embeddings service,
new public interface or hook framework. The harness uses the existing boundaries.

The main lesson is about scope and time, not needing more machinery: completed
maintenance cannot verify today's environment. Before an actual current-world
action, fresh environment evidence may be needed. No new freshness contract or
automatic reinspection policy is selected by this sprint.

Stop for maintainer review. Keep ADR 0022 Proposed and all changes uncommitted.
