# Permissive evaluation systems: capabilities and Drawloom fit

Inspected 12 September 2026. **Research and discussion proposal, not an ADR or an
approved contract.** Seven fresh, shallow public checkouts are under
`/Users/afifim/Development`. No vendor services, models, upstream applications or
evaluation suites were run. Source-inspected behavior is not integration proof.

## Start here

Evaluation is not one feature. The inspected systems combine three distinct jobs:

1. **Assess something that already exists:** a response, tool decision, retrieved
   evidence, conversation or finished artifact.
2. **Run an experiment:** execute known cases against selected configurations,
   collect results and assess them. This can spend money or cause effects.
3. **Learn from comparisons:** find regressions, inspect disagreements, compare
   quality with latency/cost, and turn selected failures into future cases.

Drawloom would benefit from all three. It should not acquire a second agent loop,
replace its orchestration engine, or force every workbench into text-answer
grading to get them. A score is not permission, business acceptance or publication.

### Detailed inventories and maps

- [Promptfoo and Arcade: runners and tool-selection tests](runners.md).
- [Langfuse and DeepEval: platform and metric capabilities](platform-and-metrics.md).
- [Braintrust, Autoevals and LangSmith: SDK interfaces and service boundaries](sdk-libraries.md).
- [Drawloom discussion map](../generated/evaluation-survey/proposal.html).
- Product maps: [Promptfoo](../generated/evaluation-survey/promptfoo.html),
  [Arcade MCP](../generated/evaluation-survey/arcade-mcp.html),
  [DeepEval](../generated/evaluation-survey/deepeval.html),
  [Langfuse](../generated/evaluation-survey/langfuse.html),
  [Braintrust SDK](../generated/evaluation-survey/braintrust-sdk-javascript.html),
  [Autoevals](../generated/evaluation-survey/autoevals.html),
  [LangSmith SDK](../generated/evaluation-survey/langsmith-sdk.html).

Each product map is an authored abstraction of inspected code, not automatic
call-graph extraction. Click source markers for revision-bound upstream files.
The Drawloom map is a proposal; its boxes are responsibilities, not new packages.

## Product summary

Licences below describe the inspected reusable code, not hosted subscriptions or
all transitive dependencies. Exact licence files and source revisions are linked
in the detailed inventories above.

| Product | Permissive scope | Main interfaces inspected | Strongest relevance to Drawloom |
| --- | --- | --- | --- |
| Promptfoo | MIT | `evaluate(suite, options)`, `ApiProvider.callApi`, assertions | Local experiment runner, configuration comparisons, regression and adversarial tests |
| Arcade MCP / Evals | MIT | Python `EvalSuite`, expected calls, critics, `run` | Test tool descriptions, tool selection and argument quality; not actual tool effects |
| DeepEval | Apache-2.0 | Python `evaluate`, `LLMTestCase`, `BaseMetric`, custom judge model | Rich retrieval, agent, conversation and selected multimodal scoring |
| Langfuse core | MIT, excluding enterprise directories | Dataset/experiment/evaluator/score APIs and OTel ingestion | Platform reference for comparisons, feedback and background evaluation; substantial service footprint |
| Braintrust JavaScript SDK | Apache-2.0 | `Eval` with `data`, `task`, `scores`; local `noSendLogs` option | Typed runner integration and repeated experiments; optional platform connections need separate control |
| Autoevals | MIT | Callable `Scorer` returning named `Score` | Small reusable deterministic and model-based scorers; caller owns runs and results |
| LangSmith SDK | MIT | `evaluate(target, options)`, evaluator callbacks, feedback client | Trace-linked evaluation and an optional integration for existing LangSmith users; JS runner is service-coupled |

## What would benefit Drawloom?

**Core** means reusable hosting/presentation; **plugin** means domain-specific
criteria, data preparation or interpretation. **Integrate** means first try an
existing implementation behind a narrow boundary. It does not mean adopting a
vendor platform wholesale. The following priorities are recommendations.

| Capability | Evidence in the surveyed systems | Benefit to Drawloom | Proposed disposition |
| --- | --- | --- | --- |
| Assess an existing output without regenerating it | Autoevals callable scorers; DeepEval metrics; SDK evaluator functions | Recheck a saved video, passage or Nightloom claim with no media regeneration | **First: core entry point, plugin criteria; reuse scorers** |
| Reusable cases with inputs, expectations and metadata | Promptfoo tests; Arcade cases; Braintrust data/task/scores; Langfuse datasets | Preserve real failures and exact conditions instead of inventing a new test for each ADR | **First: local cases and stable revision references** |
| Deterministic checks | Promptfoo assertions; Arcade critics; DeepEval custom metrics; Autoevals string/JSON metrics | Duration, stream counts, schema validity, citation revision, prohibited tool invocation | **First: plugin-owned functions; do not ask a model to count frames** |
| Model judgement against a rubric | Promptfoo rubric assertions; DeepEval GEval; Autoevals LLM classifiers | Script clarity, supported claims, visual consistency and other non-exact criteria | **First: replaceable assessor, explicit disclosure and spend** |
| Human feedback and disagreement | Langfuse scores/annotation; LangSmith feedback; Promptfoo review surfaces | Capture why the user rejected a result; inspect model/human disagreement | **Useful: optional feedback, not mandatory approval of each evaluation** |
| Test tool selection and arguments | Arcade's primary evaluation path; Promptfoo tool/trajectory assertions; DeepEval tool correctness | Check whether skills and tool descriptions guide the agent to the right operation | **First: reusable plugin tests; clearly label simulated execution** |
| Test actual tool effects and complete workflows | General runner task/provider functions can invoke a real consumer | A correct tool name does not prove the video rendered, survived restart or respected denial | **First: use existing gateway/orchestration, controlled fixtures and grants** |
| Multi-turn and intermediate-step evaluation | Promptfoo conversation/trajectory features; DeepEval conversational/agent metrics; SDK traces | Follow-up edits, recovery, approval waits and avoiding repeated work | **First interfaces; selective criteria. Never require copying every native transcript** |
| Retrieval and evidence-chain evaluation | DeepEval retrieval metrics; Autoevals RAG scorers; arbitrary custom criteria | Test semantic relevance separately from chain completeness, freshness and grounded answers | **First: reuse ADR 0024 cases/metrics; add richer scorers selectively** |
| Compare versions and configurations | Promptfoo matrix; Arcade comparative runs; Braintrust experiments; Langfuse experiments | Did a skill, plugin, model or retrieval change make real work better or worse? | **First: stable baseline and per-case comparison** |
| Repeat trials and control concurrency | Promptfoo run options; SDK runners; Arcade repeated comparisons | Expose variability instead of accepting one lucky generation; bound spend | **First: runner configuration, existing orchestration where durability is needed** |
| Cost and latency alongside quality | Promptfoo provider/result usage; SDK trace/experiment metrics; Langfuse usage/cost | Identify cheaper acceptable configurations without ignoring quality | **First reporting; report unknown cost as unknown** |
| Judge calibration and scoring provenance | Versionable rubric/scorer configuration; human feedback; custom criteria | A broken or lenient judge can reward a broken system | **First test criteria on known good/bad cases; preserve judge/version and failures** |
| Local reports and history | Promptfoo local storage/viewer; Braintrust local summaries; DeepEval local results | Useful evaluation for a sole developer without cloud accounts | **First: local path. Avoid mandatory hosted experiment IDs** |
| CI regression checks | Promptfoo CLI; DeepEval pytest integration; Arcade CLI; SDK scripts | Catch regressions before release | **First developer workflow; keep paid/model tests opt-in** |
| Trace-linked diagnosis | Langfuse; Braintrust; LangSmith; DeepEval trace evaluation | Explain which stage caused a low score, not just show a red badge | **Reuse ADR 0019 correlation; evaluation content needs separate permission** |
| Multimodal evaluation | DeepEval multimodal cases/metrics; provider-dependent Promptfoo grading | Images, narration, video and DAW output cannot be reduced to string matching | **Plugin-selected media adapters and scorers; no universal media score** |
| Failure mining and online sampling | Langfuse background evaluation; SDK feedback/trace workflows | Turn selected real-world mistakes into a durable regression suite | **Next: explicit sampling, retention and content authorization** |
| Adversarial evaluation | Promptfoo red-team suite | Prompt injection, data leakage and unsafe tool behavior matter for workbenches | **Optional integration; no unrestricted automatic attack runs** |
| Automatic prompt/model optimisation | Selected products expose optimisation or evaluation building blocks | Potential enterprise value, but an attractive score is not sufficient authority to change live behavior | **Later, policy-owned rollout. No automatic promotion in the initial scope** |
| Shared annotation, governance and managed infrastructure | Full platform offerings; some features outside permissive code | Organisation-wide evaluation is valuable, not required to serve one local developer | **Optional enterprise implementation, not an OSS prerequisite** |

Feature names in this matrix do not imply equal implementation depth. Read the
product inventories for concrete APIs, licenses, required services and limitations.
For example, Arcade tool-choice tests are not tool-effect tests; a general custom
function can support the latter but does not supply domain-specific truth.

## Common interface patterns worth carrying forward

There is no single interchangeable evaluation API shared by these repositories.
The useful common ground is smaller than their complete SDKs:

| Concept | Common shape in the references | Drawloom interpretation to discuss |
| --- | --- | --- |
| Case | Input, optional expected result, metadata/tags | A fixed test or an authorized reference to existing work; expected answers never enter the task's input accidentally |
| Target/task | Callable input-to-output function, provider adapter or run target | Existing agent/tool/workflow, not a new execution engine |
| Evaluator/scorer | Input/output/reference or run/example in; named score, explanation or structured findings out | Plugin-defined meaning; code and model implementations can coexist |
| Experiment | Cases × configuration × repetitions | Capture model, skill/plugin, criteria and input revisions so comparisons are meaningful |
| Result | Per-case output, named scores, metadata, errors and aggregate report | Preserve failed, skipped, blocked and uncertain assessments rather than normalizing them to a quality score |
| Evidence/correlation | Trace/run/span or example identity | Point to existing authoritative records; do not make sampled telemetry the source of truth |
| Feedback | A score or label plus attribution against a particular result | Optional human or external assessment, separate from business acceptance |

These are conceptual correspondences, **not proposed TypeScript signatures**.
The inventories show the actual upstream APIs. Before drafting contracts, test
which can score existing artifacts and which force execution, storage or upload.

## Suggested shape for Drawloom

Keep evaluation independent from execution. Start by connecting a runner/scorer
implementation to existing authority, artifacts and operation identities, with
shared presentation for findings and comparisons. Plugins supply meaningful
criteria, cases and any media preparation they require.

The first integration comparison should include:

1. **Promptfoo** for a local runner and comparison workflow.
2. **Braintrust's local SDK mode plus Autoevals** for a smaller function-shaped
   runner/scorer integration. Verify the no-upload boundary rather than assuming it.
3. **Arcade** as the tool-selection benchmark and possible plugin-author tool,
   not a second tool runtime.
4. **DeepEval** where specific Python or multimodal metrics justify another worker.
5. **Langfuse core** as the broader platform/UX reference and optional destination,
   not a mandatory multi-service installation for every Drawloom user.
6. **LangSmith SDK** for customers already using LangSmith and as an interface
   reference; distinguish its JavaScript and Python local execution capabilities.

This is an order of investigation, not a dependency choice. Being permissively
licensed does not make a library small, offline, cheap to run or safe to execute
against a user's real projects.

Judge transport also needs checking: an OpenAI-compatible HTTP client is not
Codex App Server. These libraries do not automatically inherit Drawloom's native
Codex access, approvals or subscription. A chosen integration must use the
intended provider boundary explicitly, rather than silently assuming an API key
or an interchangeable billing path.

### Concrete consumer checks before choosing

- **Saved master:** inspect existing synthetic media, run deterministic delivery
  checks and optionally a rubric. No regeneration, publication or model call for
  checks that can be computed directly.
- **Tool choice versus outcome:** test a script-revision request against declared
  tools, then separately exercise the real approved edit and inspect its result.
- **Knowledge:** re-use the frozen ADR 0024 corpus to compare retrieval and answer
  quality. Preserve the distinction between source/citation checks and factual
  judgement; do not retune held-out cases to manufacture a win.
- **Cheaper model:** run comparable cases using the same permissions/context and
  explicit budgets; expose quality/cost/latency and repeated-run variance. Produce
  a recommendation, not an automatic live model switch.

These are proposed checks, not tests executed by this survey.

## Existing Drawloom and reference-harness baseline

Drawloom already has [frozen knowledge evaluation cases and metrics](../../../evaluations/knowledge/README.md),
[content-free operational telemetry](../../adr/0019-useful-observability.md),
[owned orchestration](../../adr/0021-local-temporal-orchestration.md),
[plugin loading](../../adr/0018-plugin-standards-and-runtime-extensions.md) and
[separate edit approval](../../adr/0015-working-material-ownership-and-edit-approval.md).
Those remain authoritative. Nightloom's assessment creates/revises knowledge;
evaluating whether Nightloom performs well is a separate job. We should reuse the
existing evidence and fixtures, not pretend evaluation starts from zero.

Open Design at `933dc96038a4ee7a30c56d479f3497ad2716cbb3` has a real
[Langfuse trace/feedback integration](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/apps/daemon/src/langfuse-trace.ts),
with metrics/content consent and user rating scores. Its
[plugin specification](https://github.com/nexu-io/open-design/blob/933dc96038a4ee7a30c56d479f3497ad2716cbb3/plugins/spec/SPEC.md)
also declares evaluation cases. This does not establish that automated hosted
judges are enabled or that every declared plugin test is executed.

DeepSeek Harness at `c291e7961a515f6d7af9304e7fd1d257929aef26` has harness
benchmarks; the bounded package-manifest search found no dependency on these
named evaluation platforms. That is not proof of no internal evaluation. Both
existing reference checkouts were inspected read-only, not refreshed or executed
in this survey. See the earlier [harness survey](../harness-workbench-survey/README.md)
for its separate, older source-pinned scope.

## Privacy, licensing and limits

- MIT/Apache-2.0 library scope does not license a vendor's hosted platform. The
  pinned license files, nested exceptions and local/service distinctions are in
  the inventories. Langfuse enterprise directories are outside this survey's
  reusable scope. Phoenix ELv2 is excluded.
- Do not widen ADR 0019's content-free trace policy to make evaluation convenient.
  Selected evaluation inputs/artifacts have their own authorized disclosure and
  retention. A trace link is not permission to read the linked content.
- Local execution and no-upload flags are not complete network isolation.
  Telemetry, model defaults, trace parents, dataset fetching and report uploading
  must be checked separately in any integration test.
- A model-graded score is evidence from a particular evaluator, not objective
  truth. Pin criteria, calibrate on representative failures and expose uncertainty.
- This is a source-backed architecture survey, not a security audit, performance
  benchmark, installed integration or claim of equivalent compatibility.

## Reproduction and verification

Sources were freshly shallow-cloned from upstream; the inventories retain full
commit hashes. Archify uses the existing local checkout, unchanged. Diagram
sources live here; generated HTML/browser evidence lives under
`docs/reference/generated/evaluation-survey/`.

See [diagram receipts](diagrams.md) for exact validation, hashes, automated browser
coverage and visual review. No Drawloom dependencies or runtime configuration were
changed. No ADR, commit, push or publication is part of this research.
