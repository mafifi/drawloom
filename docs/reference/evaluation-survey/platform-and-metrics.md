# Evaluation platforms and executable metrics

This source inspection compares Langfuse's evaluation platform with DeepEval's
Python evaluation engine. It records candidate lessons for Drawloom, not a
dependency selection, accepted interface, ADR or implementation plan. Drawloom
owns this public survey; the two public upstream checkouts were read only.
No dependencies were installed, services started, models downloaded, provider
requests made or upstream tests run.

## Revision and licence boundary

| Repository | Inspected revision | Permissive scope and exclusions |
| --- | --- | --- |
| `langfuse/langfuse` | `39e3cd7d6572236fa9d88e475297941eb118d74b` | MIT Expat outside `ee/`, `web/src/ee/`, and `worker/src/ee/`; those directories are governed by the separate Enterprise licence and excluded from capability reuse in this survey. Incorporated third-party components retain their licences; the inspected Scalar notice is MIT. |
| `confident-ai/deepeval` | `f94d940c1e5afc4b280420fe73fe17d146274018` | Apache-2.0; package version `4.2.2`. The three nested skill licence files explicitly refer back to the root Apache licence. This does not establish a licence for the Confident AI hosted service, bundled external datasets, model weights or all transitive dependencies. |

Inspected on 2026-09-12. These are source snapshots, not released-version or
deployment assertions. In particular, this Langfuse checkout contains v4
experiments and compatibility paths for older dataset runs. Dataset API source
marks the older run endpoints deprecated in favour of experiments. A diagram
that describes only `DatasetRun` would miss the current source model.

## Langfuse: a server-backed evaluation and comparison platform

The reusable idea is separation of dataset evidence, execution observations,
evaluator definitions, rules selecting work, and typed scores. The inspected
repository is the platform and worker, not the independently versioned Python
or JavaScript SDK. Its SDK mentions and examples establish intended client
integration, but do not prove SDK-local execution or current SDK signatures.
An SDK client pointed at a local server still uses a server-backed platform.

### Lifecycle and actual interfaces

| Stage | Source interface and behaviour | Drawloom significance |
| --- | --- | --- |
| Dataset | `CreateDatasetRequest` accepts `name`, `metadata`, `inputSchema`, `expectedOutputSchema`; dataset-item reads can select a timestamp version and retain `sourceTraceId`. | Keep fixture input, expected output, source provenance and version distinct. A dataset name alone is insufficient reproduction evidence. |
| Execute and identify | `Experiment` and `ExperimentItem` expose experiment IDs, trace IDs, item IDs, optional dataset ID and item version. `GET /api/public/experiments` and `/experiment-items` use cursor pagination and field groups. | Execution results can be assessed independently of how the application was invoked. A trace is a link to evidence, not a complete artifact identity. |
| Define evaluator | `/api/public/v2/evaluators` creates versioned LLM-as-judge or code evaluators. Definitions have stable IDs; names need not be unique. Definition replacement versions the evaluator; metadata changes do not. | Distinguish evaluator identity from editable rubric/version and deployment configuration. |
| Select evaluation work | `/api/public/v2/evaluation-rules` selects observations, maps variables and assigns evaluator IDs. Omitted filter matches all incoming observations; omitted sampling evaluates every match. Rules use each evaluator's latest version. | Useful selection/execution separation, but automatic latest-version and broad defaults need an explicit Drawloom decision before adoption. |
| Score | `ScoreV3` has a typed value, source and optional subject: trace, observation, session or experiment. Numeric, boolean, categorical, text and correction values are distinct. Observation subjects also require a trace ID. | Keep machine score, human annotation and correction distinguishable; a score's meaning depends on its subject and source. |
| Compare | `ExperimentCompareTable` and experiment score/baseline controls compare rows and score scopes; APIs export selected input/output/expected-output/metadata groups. | Per-item regression inspection is more actionable than an overall average alone. Neither the comparison UI nor this inspection proves statistical significance. |

The executable code boundary is concrete:

```ts
// Abbreviated upstream shapes, not a proposed Drawloom API.
type CodeEvalPayload = {
  observation: {
    input: unknown;
    output: unknown;
    metadata: unknown;
    toolCalls: ToolCallForEval[];
  };
  experiment?: {
    itemExpectedOutput: unknown;
    itemMetadata: unknown;
  };
};
// Evaluator source defines evaluate(ctx).
// CodeEvalDispatcher.dispatch(DispatchInput) -> Promise<DispatchResult>
```

`DispatchInput` separately carries organization/project/evaluator scope,
runtime language, job execution ID, code source and payload. Result parsing
validates score type and size. `EvalExecutionDeps` independently exposes model
configuration, model call, score upload, ingestion enqueue and job-status
update operations for the LLM path. This is useful evidence of actual ownership
seams; its server-specific dependency interface is not a portable contract to
copy wholesale.

### Hosting, artifacts and content boundaries

The supplied Compose stack runs web and worker services plus PostgreSQL,
ClickHouse, Redis and S3-compatible object storage (MinIO). Credentials,
encryption keys, network exposure and persistence require configuration.
Self-hosting is materially heavier than embedding a scoring function. LLM
judges additionally require a configured model connection; self-hosting the
platform does not by itself keep judge requests local or make them free.

`resolveConfiguredCodeEvalDispatcher()` selects `insecure-local` by default in
development/test and otherwise requires configuration. `LocalCodeEvalDispatcher`
executes trusted TypeScript/JavaScript source in `node:vm` in the worker process;
it rejects Python. Its source explicitly warns against treating this mode as
safe execution of untrusted code. The alternative dispatcher configures AWS
Lambda functions by Python/TypeScript language. Permissively licensed dispatcher
code does not eliminate the external service and isolation requirements.

Langfuse receives OpenTelemetry spans and normalizes input, output, metadata,
tool information and experiment attributes into stored observations.
`processOtelMedia()` detects embedded media, uploads or reuses media storage,
and replaces payload values with references. The LLM execution dependency uses
`compileLangfuseMediaMessages` to prepare evaluator messages. This supports
content-bearing and multimodal evaluation plumbing; it does not establish
domain-specific image/audio quality metrics or an immutable artifact review
workflow. Retrieval evaluation can be expressed through observations and
custom evaluator inputs, but no dedicated retrieval metric suite was verified
in this bounded platform inspection.

This content capture is a different boundary from operational telemetry.
Experiment analytics explicitly exclude names, scores and item content, while
evaluation observations intentionally contain material to be judged. Drawloom
must preserve that distinction under ADR 0019: enabling diagnostic spans must
not silently export conversation, file, retrieval or media content to an
evaluation backend. An uploaded media reference is also not evidence of
permission, retention guarantees or source revision identity.

### Revision-pinned evidence

The following ten groups are the primary source anchors; all exclude Enterprise
implementation paths. Licence evidence identifies the exclusion itself.

1. [Root licence](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/LICENSE).
2. [Compose services and configuration](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/docker-compose.yml).
3. [Dataset API](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/fern/apis/server/definition/datasets.yml) and [dataset-item versions](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/fern/apis/server/definition/dataset-items.yml).
4. [Experiment and item API](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/fern/apis/server/definition/experiments.yml).
5. [Evaluator API](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/fern/apis/server/definition/evaluators.yml) and [selection rules](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/fern/apis/server/definition/evaluation-rules.yml).
6. [Typed scores and subjects](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/fern/apis/server/definition/scores-v3.yml).
7. [Code dispatcher contract](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/packages/shared/src/server/evals/codeEvalDispatcherTypes.ts), [selection](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/packages/shared/src/server/evals/codeEvalDispatchers.ts) and [local execution](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/packages/shared/src/server/evals/localCodeEvalDispatcher.ts).
8. [LLM execution dependencies](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/worker/src/features/evaluation/evalExecutionDeps.ts).
9. [OpenTelemetry normalization](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/packages/shared/src/server/otel/OtelIngestionProcessor.ts) and [media capture](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/packages/shared/src/server/otel/OtelMediaProcessor.ts).
10. [Comparison table](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/web/src/features/experiments/components/table/ExperimentCompareTable.tsx) and [content-free comparison analytics](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/web/src/features/experiments/lib/analytics.ts).

Representative tests **read, not run**:
[experiment analytics payload tests](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/web/src/features/experiments/lib/analytics.clienttest.ts)
assert excluded content keys and normalized score scopes;
[evaluation execution metrics tests](https://github.com/langfuse/langfuse/blob/39e3cd7d6572236fa9d88e475297941eb118d74b/worker/src/features/evaluation/evalExecutionMetrics.test.ts)
assert bounded outcome dimensions and error classifications. These are narrow
source evidence, not proof that the full platform passes or deploys successfully.

## DeepEval: local metric execution with optional hosted operations

DeepEval provides executable Python test cases, metrics, evaluation loops,
trace/component evaluation and result reporting. Confident AI is a separate
service accessed by client operations in the same library. The permissive
engine can run deterministic checks locally; model judges still need an
explicit local or remote model and its runtime/resources.

### Lifecycle and actual interfaces

| Stage | Source interface and behaviour | Drawloom significance |
| --- | --- | --- |
| Prepare | `EvaluationDataset` contains `Golden`/`ConversationalGolden` and test cases, with CSV/JSON/JSONL import paths and `save_as`. | Keep expected fixtures separate from captured actual outputs. Dataset synthesis is additional model work, not evidence acceptance. |
| Execute | `evaluate(test_cases, metrics=..., async_config, display_config, cache_config, error_config)` returns `EvaluationResult`; `assert_test` supplies a test gate; dataset `evals_iterator` and `evaluate(task)` support running a task over goldens. | A metric engine can be useful without a central evaluation service. Execution scheduling, caching and error handling have separate configuration. |
| Measure | `BaseMetric.measure` / `a_measure` populate `score`, `reason`, `threshold`, `success`, `error`, `evaluation_model`, cost and token counts. `is_successful()` returns no threshold decision when threshold is absent. | Distinguish observed score from consumer-chosen pass/fail policy and unavailable cost from zero. Metric instances are mutable execution state. |
| Compare | `compare(test_cases, metric=ArenaGEval(...))` consumes `ArenaTestCase`/`Contestant` and returns win counts. Contestants require unique names and equal input/expected output. | Comparable cases need shared conditions; preference ranking is a different result shape from independent threshold scores. |
| Report | The local evaluation path saves test-run results and can render terminal, Markdown or HTML reports. `TestRunManager` posts a run if Confident access is enabled and requests are not disabled. | Result persistence can contain the evaluated content. A configured hosted key can change export behaviour. |

A small deterministic example, constructed from the inspected public shapes
and **not executed**, illustrates the local scoring seam:

```python
from deepeval.metrics import ExactMatchMetric
from deepeval.test_case import LLMTestCase

case = LLMTestCase(input="Return the status", actual_output="ready",
                   expected_output="ready")
metric = ExactMatchMetric(threshold=1)
score = metric.measure(case)
# score, metric.reason, metric.is_successful()
```

`ExactMatchMetric` strips leading/trailing whitespace before comparison, so its
name should not be interpreted as byte equality. This example avoids a judge
model; it is not an assurance that importing/running the package performs no
telemetry unless configured accordingly.

### Retrieval, agent and artifact coverage

`LLMTestCase` separates `input`, `actual_output`, `expected_output`, `context`
and `retrieval_context`, plus called/expected tools, cost and token information,
metadata, and MCP tool/resource/prompt calls. `FaithfulnessMetric` requires
input, actual output and retrieval context; contextual precision, recall and
relevancy metrics separately address retrieved material. A faithfulness score
is relative to supplied context; it cannot establish the context's authority,
freshness, classification or entitlement.

The metric registry includes `GEval`, `DAGMetric`, conversational variants,
`ToolCorrectnessMetric`, `TaskCompletionMetric`, `PlanAdherenceMetric` and
`MCPUseMetric`. These exported names prove available surfaces, not validated
quality for Drawloom. `ToolPermissionMetric` is concretely deterministic and
compares recorded tool names with allow/deny lists. This is retrospective
evidence checking, not runtime authorization, argument approval or proof that
all calls were captured.

Multimodal content uses `MLLMImage` objects embedded as placeholders in the
current `LLMTestCase` strings. Local image construction reads the file and
base64-encodes its bytes; remote URLs remain references at that stage. PDF
placeholders are also supported in this representation. `ImageReferenceMetric`
uses the selected model and checks multimodal compatibility. Exports also
include text-to-image, image editing, coherence/helpfulness and voice metric
families. The bounded inspection verified image reference plumbing, not audio
quality, video evaluation, arbitrary binary artifacts or model-specific vision
performance. Drawloom file handles/revisions and consent cannot be replaced
by this in-process image registry.

`DeepEvalBaseLLM` supplies `load_model`, `generate`, `a_generate` and
`get_model_name`, with optional capability queries for multimodality,
structured output and log probabilities. An Ollama implementation is present.
Python 3.9+ and the declared package dependencies are needed; a local model
server and model assets are additional prerequisites when selected. No local
model, CPU/memory requirement or quality result was exercised here.

### Trace and hosted boundaries

`@observe`, `trace`, `update_current_span` and `update_current_trace` expose
trace-aware evaluation. `ConfidentSpanExporter` converts OTel spans into
DeepEval trace structures and enqueues them for the trace worker. It is not a
generic content-free telemetry sink: mapped fields include inputs, outputs,
retrieval context and tool activity. Trace posting checks whether Confident
credentials and tracing are enabled.

`EvaluationDataset.push`, `pull`, `create_version` and `get_versions` are
Confident AI operations. Likewise, the misleadingly local-looking
`tracing/offline_evals/evaluate_trace(trace_uuid, metric_collection, ...)`
issues an HTTP POST to Confident AI. Here “offline” means evaluating a recorded
trace later, not disconnected local execution. `metric_collection` belongs to
the hosted path; supplying concrete local metric instances is a different path.
The client has a configurable `CONFIDENT_BASE_URL`, but the inspected checkout
does not supply a demonstrated self-hosted replacement for Confident AI's
service/UI. A configurable endpoint is not evidence of an available permissively
licensed server.

Usage telemetry is separate again: the library has a PostHog backend and
`DEEPEVAL_TELEMETRY_OPT_OUT=1`. Disabling usage telemetry does not itself
disable judge calls, dataset uploads or result/trace posting. Drawloom should
make all three choices explicit: operational telemetry, evaluation content
export, and model processing.

### Revision-pinned evidence

1. [Apache licence](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/LICENSE.md) and [package/runtime dependencies](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/pyproject.toml).
2. [Dataset lifecycle and hosted methods](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/dataset/dataset.py).
3. [Test case and media representation](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/test_case/llm_test_case.py).
4. [Evaluation entry points](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/evaluate/evaluate.py) and [run persistence/export](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/test_run/test_run.py).
5. [Base metric](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/metrics/base_metric.py), [exact match](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/metrics/exact_match/exact_match.py) and [tool permission metric](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/metrics/tool_permission/tool_permission.py).
6. [Metric exports](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/metrics/__init__.py), [faithfulness](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/metrics/faithfulness/faithfulness.py) and [image reference](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/metrics/multimodal_metrics/image_reference/image_reference.py).
7. [Judge model boundary](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/models/base_model.py).
8. [Arena comparison](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/evaluate/compare.py) and [contestant validation](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/test_case/arena_test_case.py).
9. [OTel bridge](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/tracing/otel/exporter.py), [trace posting](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/tracing/tracing.py) and [hosted post-hoc trace evaluation](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/tracing/offline_evals/trace.py).
10. [Usage telemetry controls](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/deepeval/telemetry/__init__.py).

Representative tests **read, not run**:
[async trace metric isolation](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/tests/test_core/test_evaluation/test_async_trace_metric_isolation.py)
uses a barrier metric to check separate mutable metric instances per trace;
[image reference metric tests](https://github.com/confident-ai/deepeval/blob/f94d940c1e5afc4b280420fe73fe17d146274018/tests/test_metrics/test_image_reference_metric.py)
cover sync/async paths and reject an incompatible model, but require an OpenAI
key for execution. Reading these assertions does not establish passing tests
or judge quality.

## Candidate lessons for Drawloom

| Disposition | Capability or pattern | Reason and boundary |
| --- | --- | --- |
| Relevant | A version-linked evaluation subject and fixture, separate from metric definition, execution attempt and result | Both repositories expose these separations in different forms. Drawloom still needs a concrete consumer and a contrasting consumer before establishing shared contracts. |
| Relevant | Deterministic checks alongside explicitly selected model judges | Cheap structural checks and uncertain model judgments should report distinct provenance and failure modes. |
| Relevant | Per-item comparisons, reasons, errors, model/cost metadata and score scope | These help explain regressions; a single aggregate score loses actionable evidence. |
| Relevant | Local engine with optional reporting adapter | DeepEval demonstrates useful local execution; Langfuse demonstrates a richer external record/comparison home. Neither requires turning content-bearing evaluation into ordinary telemetry. |
| Defer | Central evaluator registry, automatic incoming-observation rules and dataset version service | Valuable when shared evaluation operations are a proved need; costly and authority-sensitive as a first local capability. |
| Defer | A cross-language execution service, full Langfuse stack, hosted metric collections and broad metric catalog integration | Infrastructure and maintenance exceed a small evaluator seam. Select metrics and deployment only after representative workload evidence. |
| Avoid | Treating a threshold as approval, a tool-name metric as authorization, or a trace ID as artifact identity | None of these establishes permission or exact material/revision binding. |
| Avoid | Copying `insecure-local` as an untrusted-code sandbox, latest-version rules as reproducibility, or hosted “offline” calls as local operation | Each would overstate the upstream guarantee and weaken Drawloom's explicit boundaries. |

## Architecture map inputs

These nodes and labelled edges describe inspected upstream ownership, not
proposed Drawloom packages. Paths are relative to each pinned repository.

### Langfuse

| ID | Title | Source path |
| --- | --- | --- |
| lf-dataset | Versioned dataset items | `fern/apis/server/definition/dataset-items.yml` |
| lf-observe | OTel observation ingestion | `packages/shared/src/server/otel/OtelIngestionProcessor.ts` |
| lf-experiment | Experiment and item records | `fern/apis/server/definition/experiments.yml` |
| lf-evaluator | Versioned evaluator definition | `fern/apis/server/definition/evaluators.yml` |
| lf-rule | Observation selection rules | `fern/apis/server/definition/evaluation-rules.yml` |
| lf-execute | Judge execution dependencies | `worker/src/features/evaluation/evalExecutionDeps.ts` |
| lf-code | Code dispatcher boundary | `packages/shared/src/server/evals/codeEvalDispatcherTypes.ts` |
| lf-score | Typed score and subject | `fern/apis/server/definition/scores-v3.yml` |
| lf-compare | Experiment comparison | `web/src/features/experiments/components/table/ExperimentCompareTable.tsx` |
| lf-media | Media capture and references | `packages/shared/src/server/otel/OtelMediaProcessor.ts` |

| From | Label | To |
| --- | --- | --- |
| lf-dataset | identifies fixture and item version | lf-experiment |
| lf-observe | supplies experiment-linked observations | lf-experiment |
| lf-observe | supplies embedded content | lf-media |
| lf-rule | selects incoming observations | lf-observe |
| lf-rule | assigns latest definitions | lf-evaluator |
| lf-evaluator | supplies judge definition | lf-execute |
| lf-evaluator | supplies code and runtime | lf-code |
| lf-execute | persists judged result | lf-score |
| lf-code | returns validated scores | lf-score |
| lf-experiment | supplies comparable items | lf-compare |
| lf-score | supplies scoped results | lf-compare |

### DeepEval

| ID | Title | Source path |
| --- | --- | --- |
| de-dataset | Goldens and datasets | `deepeval/dataset/dataset.py` |
| de-case | Captured test case and media | `deepeval/test_case/llm_test_case.py` |
| de-runner | Local evaluation entry point | `deepeval/evaluate/evaluate.py` |
| de-metric | Mutable metric execution | `deepeval/metrics/base_metric.py` |
| de-model | Judge model adapter | `deepeval/models/base_model.py` |
| de-trace | OTel-to-trace bridge | `deepeval/tracing/otel/exporter.py` |
| de-report | Local result and optional upload | `deepeval/test_run/test_run.py` |
| de-compare | Arena comparison | `deepeval/evaluate/compare.py` |
| de-hosted | Confident post-hoc evaluation | `deepeval/tracing/offline_evals/trace.py` |
| de-telemetry | Usage telemetry choice | `deepeval/telemetry/__init__.py` |

| From | Label | To |
| --- | --- | --- |
| de-dataset | prepares expected and actual cases | de-case |
| de-case | supplies evaluated content | de-runner |
| de-runner | schedules metric execution | de-metric |
| de-metric | optionally calls selected judge | de-model |
| de-runner | records results | de-report |
| de-case | supplies matched contestants | de-compare |
| de-compare | uses preference metric | de-metric |
| de-trace | converts component evidence for evaluation | de-runner |
| de-trace | records traces for later hosted assessment | de-hosted |
| de-runner | emits optional usage counters | de-telemetry |
