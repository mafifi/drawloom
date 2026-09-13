# Evaluation SDK libraries

Research snapshot: 2026-09-12. This inventory inspects public source; it proposes
no Drawloom contract, dependency, implementation, or publication decision. The
clones were read without installing dependencies, running upstream tests,
calling model/platform services, or modifying upstream repositories. “Tests read”
below describes source assertions, not passing results or demonstrated quality.

## What remains useful without the hosted platforms?

| Library | Useful public local surface | Remaining service or operational boundary |
| --- | --- | --- |
| Braintrust JavaScript SDK | `Eval(name, { data, task, scores }, { noSendLogs: true })` runs supplied cases and computes a local summary; repetitions, concurrency, progress and result collection are available. | Ordinary mode creates a Braintrust experiment. No-send is not network isolation: an enclosing trace can still log; datasets, baseline lookup and some trace operations require services. Judge/model calls remain independently configured. |
| Autoevals | Direct deterministic scorers and composable `Scorer` functions; no Braintrust experiment or dataset is required. | LLM, embedding and moderation scorers need a compatible model endpoint. At this revision the implicit endpoint is Braintrust Gateway; inject an explicit client/model for another route. There is no experiment runner or result store. |
| LangSmith SDK | Plain evaluator callbacks and result types can be reused. Python has beta `upload_results=False` for evaluating a supplied target with local examples. | The inspected JavaScript runner has no equivalent option: it creates a project and uploads traces/feedback. Dataset services, saved comparisons and feedback operations need a LangSmith-compatible backend. The SDK licence does not provide that backend. |

“No hosted-platform purchase” and “no network/model cost” are different claims.
These repositories establish available code paths, not current commercial
entitlements, pricing, self-host licences, or the accuracy of a judge model.

## Braintrust JavaScript SDK

### Provenance and licence boundary

- Origin: `https://github.com/braintrustdata/braintrust-sdk-javascript.git`.
- Inspected HEAD: `4a79372d94cd769e00fe5bea657a374208ee11bb`; package `braintrust`
  declares version `3.32.0` in the inspected tree. This is source metadata, not a
  claim that this exact tree is the installed or latest released npm package.
- Root [LICENSE][bt-license] is Apache-2.0. [js/NOTICE][bt-notice] identifies
  vendored Orchestrion-JS and import-in-the-middle under Apache-2.0, and
  require-in-the-middle and the adapted Node diagnostics-channel runtime under
  MIT. The [import-in-the-middle][bt-vendor-iitm] and
  [Orchestrion][bt-vendor-orch] third-party manifests additionally list MIT, ISC,
  BSD-2-Clause and BSD-3-Clause components. Preserve those notices if copying or redistributing
  affected code; the root licence is not the whole attribution inventory.
- This source repository provides SDKs/integrations. Its licence is not evidence
  that Braintrust's hosted experiment, dataset, comparison or model services are
  included as a runnable permissively licensed platform here.

### Public interfaces and lifecycle

The package export map selects Node, browser, edge-light and workerd builds. The
root exports include `Eval`, `Evaluator`, `EvalTask`, `EvalScorer`, `EvalResult`,
`BaseExperiment`, `Reporter`, `buildLocalSummary`, `runEvaluator`,
`defaultErrorScoreHandler`, logging APIs and trace types. Public status here is
established through the package/root export chain; implementation helpers
prefixed `_internal` or testing-only globals are not proposed integration seams.
An exported function can still expose provider-specific semantics. [B1][bt-exports]

The core evaluation definition is `data + task + scores/classifiers`. Data can be
an array, promise, factory, asynchronous iterable/generator, or provider-backed
`BaseExperiment`. Cases carry input, optional expected output, metadata and tags;
dataset-linked cases can preserve origin identifiers. A task accepts the input
and hooks containing expected output, metadata, span, validated parameters,
progress reporting, tags and a zero-based trial index. A scorer receives the
case plus output and optional `Trace`; it can return a number, null, score
object, multiple named scores, or a promise. Classifiers form a separate result
column. Returned rows include output, error, scores, classifications and origin;
the returned wrapper also contains a summary. [B2][bt-framework]

`trialCount` repeats each case, with per-case counts overriding the global count.
`maxConcurrency` bounds queued case/trial jobs (default effectively unlimited);
within a case the implementation launches scorers/classifiers through
`Promise.all`. Consequently this setting should not be treated as an exact
global cap on all model requests. Timeout and abort signal stop scheduling and
kill queued work; they do not establish forced interruption of arbitrary
already-running task/model effects. Retaining every row is optional through
`returnResults`; a score accumulator still supports local summaries when row
retention is disabled. [B2][bt-framework]

Task exceptions are retained in row errors. Scorer failures are recorded by
name in metadata and omitted from successful scores. A caller may supply
`errorScoreHandler`; the exported default handler explicitly fills unhandled
scores with zero, but is not silently equivalent to every evaluation's default
policy. Queue failures can reject the evaluation with an aggregate error.
Plugin-specific reporting must distinguish an absent/error score from a real
judgement of zero. [B2][bt-framework]

### Local execution, traces and feedback

`noSendLogs: true` skips experiment creation and builds a local summary. The
representative test asserts local values and no drained logger events. This is
substantial local functionality, but its scope matters: the no-experiment branch
uses ordinary `traced(...)`, and the source explicitly notes that an enclosing
active span may still cause logging. Task/scorer code, existing instrumentation,
provider-backed data, remote parameters and model clients are separate possible
network paths. `BaseExperiment()` explicitly fails without a connected
experiment. [B2][bt-framework], [B3][bt-tests]

The scorer's `Trace` offers `getConfiguration`, `getSpans` and `getThread`.
`LocalTrace.getSpans` reads the local span cache first, then falls back to a
service query. `getThread` waits for spans, logs in and invokes a remote
preprocessor. “LocalTrace” therefore does not mean wholly offline. The runner
starts its span cache by default and disposes/stops it afterwards; this is
temporary evaluation support, not an artifact/history storage contract.
[B4][bt-trace]

Connected `Experiment.summarize` flushes events and requests the service's
`experiment-comparison2` endpoint, using a configured or discovered baseline.
Dataset initialization and `Experiment.logFeedback`/`Span.logFeedback` are also
service-oriented logging/data APIs. Local summaries do not recreate persisted
baseline discovery, collaborative annotation, dataset management or comparison
UI. [B5][bt-logger]

The OTel integration exports `BraintrustSpanProcessor`, `BraintrustExporter` and
compatibility helpers. This is evidence of an interoperability route, not proof
that Drawloom's content-free OTel traces contain enough semantic material to
grade tools, retrieval or artifacts. Exporting content-bearing SDK spans would
need its own explicit data/permission decision. No Bun compatibility execution
or Drawloom trace integration was performed. [B6][bt-otel]

### Representative evidence inspected

| Source | Evidence read |
| --- | --- |
| [B1: package/root exports][bt-exports] and [package manifest][bt-package] | Public functions/types and runtime-specific entry points. |
| [B2: framework][bt-framework] | Evaluation/task/scorer/result shape, local mode, repetitions, queue, cancellation, summary and errors. |
| [B3: framework tests][bt-tests] | No-send test at lines 933–978; error-score handling from 448; per-input trial overrides from 843. These assertions were read, not executed. |
| [B4: trace implementation][bt-trace] | Local-cache-first span reads; remote fallback and remote thread preprocessing. |
| [B5: logger][bt-logger] | Dataset initialization, feedback, experiment persistence and service comparison. |
| [B6: OTel integration exports][bt-otel] | Exporter/processor and context compatibility helpers. |

### Source graph for rendering

| Node | Actual path and role |
| --- | --- |
| B-public | `js/src/exports.ts` — public SDK |
| B-runner | `js/src/framework.ts` — cases, tasks, scorers, queue and local summary |
| B-trace | `js/src/trace.ts` — local cache reads and service-backed trace helpers |
| B-logger | `js/src/logger.ts` — spans, datasets, experiments and feedback |
| B-model | `js/src/functions/invoke.ts` — remote function/preprocessor invocation |
| B-otel | `integrations/otel-js/src/index.ts` — OTel interoperability |
| B-tests | `js/src/framework.test.ts` — representative assertions, not executed |

Edges: B-public → B-runner **exports Eval**; B-runner → B-trace **passes trace to
scorers**; B-runner → B-logger **creates experiment unless disabled / traces task**;
B-trace → B-logger **reads local cache or fetches spans**; B-trace → B-model
**invokes thread preprocessor remotely**; B-otel → B-logger **bridges span context
and export**; B-tests → B-runner **asserts local mode, trials and failures**.

## Autoevals

### Provenance and licence boundary

- Origin: `https://github.com/braintrustdata/autoevals.git`.
- Inspected HEAD: `b0e1055892bea1305a10f8d42fdc47ff1b41ffa4`; the manifest declares
  `autoevals` version `0.3.0`.
- Root [LICENSE][ae-license] is MIT. The tracked licence/notice filename inventory
  found no nested override. This is not a transitive dependency or model/dataset
  licence audit. The RAG scorer module explicitly credits a port of Ragas;
  availability of these scorers does not establish parity with current Ragas.

### Public scorer seam and useful scope

The package root exports `Score`, `ScorerArgs`, `Scorer`, `init`, scorer modules,
template constructors, `Evaluators`, partial application and thread helpers.
At this revision the package export map exposes only `.` and `./package.json`:
use root imports such as `import { Faithfulness } from "autoevals"`. A comment's
`autoevals/ragas` example is not an exported subpath in this inspected manifest.
Directly importing `js/oai.ts` helpers or repository test utilities would bypass
the supported package interface. [A1][ae-index], [package manifest][ae-package]

`Scorer<Output, Extra>` accepts `{ output, expected? } & Extra` and returns
`Score | Promise<Score>`. `Score` has a name, numeric-or-null score and optional
metadata. Its legacy `error` property is deprecated; failures propagate to the
caller. This is a small callable grading seam, with no obligation to use a
Braintrust task executor, agent loop, trace store or hosted dataset.
[A2][ae-score]

Deterministic helpers include exact match, Levenshtein similarity, numeric
difference, JSON validation/schema validation, recursive JSON comparison and
list matching. `ExactMatch` serializes objects/arrays; it is not a canonical
semantic JSON equality proof. `ValidJSON` has a deliberate object/array-oriented
interpretation: tests score a JSON number string as invalid. Callers should
validate metric meaning against their artifacts rather than infer semantics
from the name. JSON comparison can substitute string/number scorers, so a
normally local composition can become model-backed. [A3][ae-json],
[A4][ae-value], [A8][ae-tests]

LLM template constructors map model choices to numeric scores and can return
rationale metadata. Built-ins include `Factuality`, `ClosedQA`, `Battle`,
`Summary`, `Translation` and `Security`. These names identify rubrics, not
certified correctness, safety or publication approval. RAG functions include
context recall/precision/relevancy, faithfulness, answer relevancy/similarity and
correctness, using input/output/expected/context fields as appropriate. Some
metrics combine multiple model calls or embeddings. `Battle` compares supplied
outputs through a rubric; it is not persisted experiment comparison management.
[A5][ae-llm], [A6][ae-ragas]

### Endpoint, error and orchestration boundary

An explicit per-call OpenAI-compatible client wins over a global `init` client;
otherwise configuration resolves a base URL and credentials. The fallback URL
is `https://gateway.braintrust.dev`, with environment overrides. Thus an OpenAI
key alone is not evidence the request goes directly to OpenAI. Supply an explicit
client and model to use a chosen compatible service. A local endpoint is a
possible adapter route, not demonstrated compatibility: the model must support
the selected scorer's tool/structured-output/API requirements. GPT-5-prefixed
models and an explicit force option route through Responses rather than Chat
Completions in this implementation. [A7][ae-client]

The LLM code rejects missing tool calls, unexpected tool calls, unknown score
choices and empty responses. Deterministic scorers can reject missing expected
values too. Some model calls accept a caller cache; this is not a durable dataset
or complete experiment replay mechanism. The library has no general dataset
executor, global concurrency/repetition policy, run-comparison history or human
feedback store: a caller/runner owns those. [A5][ae-llm], [A7][ae-client]

Thread-aware templates accept a minimal trace object with `getThread()`. They
can therefore grade conversation context when the caller supplies it, but using
Braintrust's `LocalTrace` brings the remote preprocessor boundary described
above. Autoevals also cooperates with an inherited Braintrust OpenAI wrapper
when present. Deterministic standalone use remains useful without a platform;
“use Autoevals” alone is not a no-upload guarantee for a surrounding process.
[A5][ae-llm], [A7][ae-client]

### Representative evidence inspected

| Source | Evidence read |
| --- | --- |
| [A1: root exports][ae-index] | Public scorer/init/template API; checked against package export map. |
| [A2: score types][ae-score] | Input/result contract and propagated error policy. |
| [A3: JSON scorers][ae-json] | Schema validation and replaceable sub-scorers. |
| [A4: value scorer][ae-value] | ExactMatch normalization and serialization. |
| [A5: LLM scorers][ae-llm] | Rubric construction, trace seam and response parsing failures. |
| [A6: RAG scorers][ae-ragas] | Context and answer metric inputs, composite model/embedding calls. |
| [A7: client configuration][ae-client] | Explicit client, gateway defaults, API routing and inherited instrumentation. |
| [A8: JSON tests][ae-tests] and [client tests][ae-client-tests] | Validation/recursive score cases, explicit client precedence and model defaults. Assertions read, not executed. |

### Source graph for rendering

| Node | Actual path and role |
| --- | --- |
| A-public | `js/index.ts` — package exports |
| A-score | `js/score.ts` — callable/result types |
| A-json | `js/json.ts` — deterministic/composable JSON scoring |
| A-llm | `js/llm.ts` — templated model judges and trace seam |
| A-rag | `js/ragas.ts` — context/answer metrics |
| A-client | `js/oai.ts` — model client selection, API routing and cache |
| A-tests | `js/json.test.ts` — representative assertions, not executed |

Edges: A-public → A-score **exports contract**; A-public → A-json **exports local
scorers**; A-public → A-llm **exports judges**; A-public → A-rag **exports RAG
metrics**; A-json → A-score **returns named score**; A-llm → A-client **requests
configured model**; A-rag → A-client **requests judging/embeddings**; A-tests →
A-json **asserts validation and comparison semantics**.

## LangSmith SDK

### Provenance and licence boundary

- Origin: `https://github.com/langchain-ai/langsmith-sdk.git`.
- Inspected HEAD: `4083bc191d12e79ae05a9da8efde91bcee60ab28`; the JS manifest
  declares version `0.10.3`.
- Root [LICENSE][ls-license] and JS manifest specify MIT. Nested utility notices
  are MIT except [xxhash][ls-xxhash-license] (BSD-2-Clause) and
  [generated-client qs][ls-qs-license] (BSD-3-Clause). The inventory
  includes separate notices for console-table-printer, fast-safe-stringify,
  simple-wcswidth, UUID and the Jest-like vendor helper.
- This is an SDK repository, including generated platform clients, not evidence
  of a permissively licensed complete LangSmith backend or permission to operate
  a commercial self-host offering. A configurable API URL does not supply a
  server implementation.

### JavaScript evaluation and result interfaces

The supported `langsmith/evaluation` entry point exports `evaluate`, option,
target, data, evaluator and row types, `RunEvaluator`, `EvaluationResult`, and
the older `evaluateComparative`. Source `_runner.ts` also contains exported
internal classes/helpers used by tests; those are not all re-exported by the
package evaluation entry point. A consumer should not import private runner
paths simply because tests do. [L1][ls-exports], [package map][ls-package]

`evaluate(target, options)` accepts an ordinary input function or an object with
`invoke`, plus dataset name/ID, an array of `Example`, or an async iterable of
examples. `Example` is a provider-shaped record with input/output, ID, dataset
and version metadata, not just an arbitrary Drawloom file. Optional attachments
are passed when explicitly enabled. Row evaluators receive
`{ run, example, inputs, outputs, referenceOutputs, attachments }`; summary
evaluators see arrays over the dataset. `EvaluationResult` includes a key,
optional score/value, comment, correction, evaluator metadata, source/target
run identifiers and feedback configuration. This is richer than a scalar score
and can target a child/tool run. Returned rows keep run, example and evaluation
results together. [L2][ls-runner], [L3][ls-result]

`numRepetitions` repeats examples; `targetConcurrency` and
`evaluationConcurrency` can be independently set, falling back to
`maxConcurrency`. Zero means sequential; the runner selects independent queues
when both specific concurrency options are explicitly supplied, otherwise a
shared queue can be used. Evaluators are sequential within a row while rows can be scored
concurrently. The scheduler yields completed work while slow predictions are
still pending and restores input order for the final rows. [L2][ls-runner]

Target exceptions are logged and retained through the run capture; if no run
was captured the runner throws. Individual evaluator and summary-evaluator
exceptions are caught and printed, with missing successful feedback rather
than an automatic failure score. Source/queue errors can propagate, and
experiment-finalization errors are handled separately from prediction errors.
A plugin must report incomplete scoring explicitly; successful completion is
not proof every evaluator produced a judgement. [L2][ls-runner]

### JavaScript service coupling and Python difference

At this revision JS `EvaluateOptions` has **no `uploadResults` option**.
Starting evaluation creates a project through `Client.createProject`; target
and evaluator tracing are explicitly enabled. Row scores call
`logEvaluationFeedback`, summary scores call `createFeedback`, and the runner
awaits pending trace batches. Supplying local examples or disabling a general
tracing environment variable does not establish a supported local-only JS
experiment runner. Reusing a plain callback outside `evaluate` is possible, but
the caller then owns execution/collection. Replacing client methods with mocks
as tests do is test technique, not a promised offline backend adapter.
[L2][ls-runner], [L7][ls-tests]

Python `evaluate(..., upload_results=False)` is different. The public function
supports it but emits a beta warning; the implementation skips project creation,
uses local tracing context and suppresses feedback uploads. With local example
objects and local task/judge functions it supplies useful platform-independent
execution. Remote dataset inputs, external judges and independently enabled
instrumentation remain separate boundaries. The flag is rejected for evaluating
an existing experiment and for comparative experiment targets; it is not a
blanket offline mode for every API. The inspected unit test parameterizes both
values and asserts no created session when upload is false. [L8][ls-python],
[Python test][ls-python-tests]

### Comparison, tracing and feedback

JavaScript comparison accepts at least two experiment identifiers or completed
experiment results, loads projects and traces, checks a common dataset, warns
on dataset-version differences, intersects example IDs and creates a comparative
experiment. Evaluators return scores keyed by run ID; invalid IDs are rejected.
Optional randomization shuffles the `runs` argument. At this revision the
separate `outputs` argument is constructed from the original order, so a judge
must not assume positional correspondence after randomization without checking
this implementation. Results are submitted as feedback linked to the
comparative experiment. This entire facility is service-dependent, including
when handed the in-memory results of prior evaluations. [L4][ls-comparison]

`traceable` and `RunTree` supply nested execution evidence independently of an
agent framework. Input/output processing hooks exist, but they are not inherited
by nested traceable functions; blanket content minimization must be verified
across the full tree. `Client` owns backend dataset/project/run/feedback
operations and configurable endpoint selection. Neither these SDK traces nor
human feedback fields themselves grant authority to approve an artifact or
publish work. [L5][ls-traceable], [L6][ls-client]

### Representative evidence inspected

| Source | Evidence read |
| --- | --- |
| [L1: evaluation exports][ls-exports] | Supported entry point, compared with package map. |
| [L2: JS runner][ls-runner] | Task/data/row/summary shape, concurrent execution and mandatory project/tracing/feedback flow. |
| [L3: evaluator/result types][ls-result] | Structured score/value/comment/correction and run linkage. |
| [L4: comparative runner][ls-comparison] | Dataset identity, run selection/randomization, backend comparison and feedback. |
| [L5: traceable][ls-traceable] | Nested trace capture and non-inherited input/output processing hooks. |
| [L6: client][ls-client] | Dataset/project/run/feedback service operations and configurable endpoint. |
| [L7: JS runner tests][ls-tests] | Concurrency/error propagation at lines 34–121; queue independence from 344; feedback routing and source-order restoration. Assertions read, not executed. |
| [L8: Python runner][ls-python] and [Python unit test][ls-python-tests] | Beta no-upload branch, restrictions, local trace context, no-created-session assertion. Read, not executed. |

### Source graph for rendering

| Node | Actual path and role |
| --- | --- |
| L-public | `js/src/evaluation/index.ts` — public evaluation exports |
| L-runner | `js/src/evaluation/_runner.ts` — task/dataset execution and scoring |
| L-result | `js/src/evaluation/evaluator.ts` — run evaluator and result types |
| L-trace | `js/src/traceable.ts` — target/evaluator trace capture |
| L-client | `js/src/client.ts` — service persistence and feedback |
| L-compare | `js/src/evaluation/evaluate_comparative.ts` — saved experiment comparison |
| L-python | `python/langsmith/evaluation/_runner.py` — distinct beta no-upload route |
| L-tests | `js/src/tests/evaluate_runner.test.ts` — representative assertions, not executed |

Edges: L-public → L-runner **exports evaluate**; L-runner → L-result **normalizes
evaluator results**; L-runner → L-trace **captures target/evaluator runs**;
L-runner → L-client **creates project and feedback**; L-public → L-compare
**exports comparison API**; L-compare → L-client **loads saved runs and submits
pairwise feedback**; L-python → L-client **skips project/feedback writes when
upload_results is false**; L-tests → L-runner **asserts queue/order/error behavior**.

## Drawloom implications to investigate, not accepted contracts

These interfaces support evaluating a supplied callable or existing output;
none requires replacing Drawloom's agent loops. A plugin can define what an
artifact, tool outcome, retrieval example or completed run means and supply a
projection appropriate to a scorer. Braintrust supplies the strongest inspected
local JavaScript batch runner; Autoevals supplies the smallest directly reusable
scorer library; LangSmith supplies useful evidence for rich run-linked results
and comparison, with an important JavaScript/Python local-mode mismatch.

Before an implementation choice, prove the exact runtime/export path in a
Drawloom Node worker or Bun host and a fully specified data route. Preserve
artifact/revision identity, evaluator/rubric/model provenance, errored or missing
judgements, run/case/repetition identity and dataset revision separately. Current
content-free operational traces cannot silently become evaluation transcripts.
Plugin-owned results and operator review remain distinct from automatic
publication or approval. These are investigation questions anchored in the
observed SDK differences, not a new shared evaluation schema.

[bt-license]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/LICENSE
[bt-notice]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/NOTICE
[bt-vendor-iitm]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/licenses/import-in-the-middle/LICENSE-3rdparty.csv
[bt-vendor-orch]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/licenses/orchestrion-js/LICENSE-3rdparty.csv
[bt-package]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/package.json
[bt-exports]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/src/exports.ts
[bt-framework]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/src/framework.ts
[bt-tests]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/src/framework.test.ts
[bt-trace]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/src/trace.ts
[bt-logger]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/js/src/logger.ts
[bt-otel]: https://github.com/braintrustdata/braintrust-sdk-javascript/blob/4a79372d94cd769e00fe5bea657a374208ee11bb/integrations/otel-js/src/index.ts
[ae-license]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/LICENSE
[ae-package]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/package.json
[ae-index]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/index.ts
[ae-score]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/score.ts
[ae-json]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/json.ts
[ae-value]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/value.ts
[ae-llm]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/llm.ts
[ae-ragas]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/ragas.ts
[ae-client]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/oai.ts
[ae-tests]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/json.test.ts
[ae-client-tests]: https://github.com/braintrustdata/autoevals/blob/b0e1055892bea1305a10f8d42fdc47ff1b41ffa4/js/oai.test.ts
[ls-license]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/LICENSE
[ls-xxhash-license]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/utils/xxhash/LICENSE
[ls-qs-license]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/_openapi_client/internal/qs/LICENSE.md
[ls-package]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/package.json
[ls-exports]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/evaluation/index.ts
[ls-runner]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/evaluation/_runner.ts
[ls-result]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/evaluation/evaluator.ts
[ls-comparison]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/evaluation/evaluate_comparative.ts
[ls-traceable]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/traceable.ts
[ls-client]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/client.ts
[ls-tests]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/js/src/tests/evaluate_runner.test.ts
[ls-python]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/python/langsmith/evaluation/_runner.py
[ls-python-tests]: https://github.com/langchain-ai/langsmith-sdk/blob/4083bc191d12e79ae05a9da8efde91bcee60ab28/python/tests/unit_tests/evaluation/test_runner.py
