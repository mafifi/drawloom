# Evaluation runners: Promptfoo and Arcade

Research snapshot: 2026-09-12. This is source inspection of public repositories,
not an accepted Drawloom design, implementation proposal or runtime validation.
No dependencies were installed, tests run, models invoked or upstream files edited.
Examples below are small, newly written illustrations of inspected interfaces;
they have not been executed. Cost assessments are engineering judgements rather
than measured estimates.

## Promptfoo

### Revision and licence scope

- Checkout: `/Users/afifim/Development/promptfoo`.
- Origin: `https://github.com/promptfoo/promptfoo.git`.
- HEAD: `b532fbae55b3706f13ccde6255f4e611788ce577`.
- Package manifest: `promptfoo` 0.123.0, Node.js `>=22.22.0`, CLI entry points
  `promptfoo` and `pf`; ESM/CJS package entry and separate `promptfoo/contracts`
  export. These are snapshot declarations, not installed-runtime verification.
- Root licence is MIT. Nested licence files inspected: Microsoft/PyRIT-derived
  Crescendo code is also MIT; vendored provider-setup script code is MIT;
  `src/external/APACHE_LICENSE` is Apache-2.0. No noncommercial or proprietary
  restriction was found in the licence files discovered in this checkout.
  This is not a transitive dependency or hosted-service terms audit.

### Lifecycle and capabilities

`src/index.ts` exports `evaluate`, provider loaders, assertions, cache helpers,
guardrails and a red-team namespace. The public Node wrapper passes a library
event source into `src/evaluate.ts`. That implementation resolves prompts,
providers, tests and grading providers, creates an evaluation record, and invokes
the evaluator. The evaluator renders test variables, calls the target provider,
applies transforms, evaluates assertions and records row-level results. Optional
file export and sharing happen around that run lifecycle. Stored results can be
opened through the included local web application.

| Capability | Concrete source behaviour | Boundary or qualification |
| --- | --- | --- |
| Dataset and comparison runs | Prompts, provider lists, variable-bearing test cases, assertions, scenarios and defaults; repeat/concurrency/time budgets | A useful batch comparison runner; provider behaviour remains provider-specific |
| Deterministic scoring | Equality, substring/regex, JSON/schema, lexical similarity, latency, cost, tool-call validity and custom code assertions | Custom JavaScript/Python and provider modules are trusted executable code |
| Model-assisted scoring | `llm-rubric`, factuality, relevance, context faithfulness/recall/relevance and other graders | Grading is a separate provider call with its own cost and disclosure boundary |
| Agent trajectory scoring | Tool-used, sequence, argument matching, step count and `trajectory:goal-success` assertions | Requires usable trace spans; goal success is a judge of supplied trace/output, not independent proof of changed external state |
| Conversation testing | `_conversation` template state; separate histories through `metadata.conversationId`; provider session/end metadata; simulated-user and red-team strategies | Not Drawloom conversation-history ownership or a generic durable agent runtime |
| Security evaluations | Red-team generation, plugins, strategies and graders exposed by the SDK | Local execution does not mean every generator/strategy is local; remote generation is a separate route |
| CI/reporting | CLI pass-rate threshold, nonzero failed-test exit, JSON/other file exports, saved results and web review | The inspected CLI uses default 100% pass threshold and failed-test exit 100 unless configured; SDK callers should inspect results themselves |

### Public interface shapes

The actual public API returns an evaluation **record**, whose
`toEvaluateSummary()` returns `EvaluateSummaryV3`, rather than returning a bare
summary directly. `EvaluateTestSuite` contains prompts/providers/tests and
`writeLatestResults`, `sharing` and `outputPath`. The current implementation
reads `outputPath` from the suite: the Node wrapper's documentation still shows
it in the second argument, so use the type and implementation as the authority.

```ts
import { evaluate } from 'promptfoo';

const record = await evaluate({
  prompts: ['{{ question }}'],
  providers: [{
    id: () => 'recorded-output',
    callApi: async () => ({ output: 'four' }),
  }],
  tests: [{ vars: { question: 'Two plus two?' },
    assert: [{ type: 'equals', value: 'four', metric: 'correctness' }] }],
  writeLatestResults: false,
  sharing: false,
}, { cache: false, maxConcurrency: 1, repeat: 1 });
const summary = await record.toEvaluateSummary();
```

`ApiProvider` has `id()` and
`callApi(prompt, context?, options?): Promise<ProviderResponse>`. Context carries
the rendered prompt, variables, optional test/evaluation identifiers and trace
headers; options include `abortSignal`. Optional `cleanup()` releases persistent
provider resources. `ProviderResponse` includes output/error, raw data, cost,
token usage, latency, metadata, session identifiers, conversation-ended signals
and media references. This is a broad provider envelope, not an independently
validated Drawloom result contract.

`Assertion` contains `type`, optional `value`, `threshold`, `weight`, `metric`,
grading `provider`, transforms and configuration. A custom value function can
return a boolean, number or `GradingResult` with `pass`, `score`, `reason`, named
scores and component results. `EvaluateResult` retains prompt/test indices,
test case, provider identity, response, failure reason, score, latency, cost,
grading result, named scores and optional trace identifiers. Summary v3 groups
results, completed prompts, timestamp and aggregate statistics.

### Persistence, local operation and disclosure

Ordinary evaluation does not require Promptfoo Cloud. Custom functions, recorded
outputs, deterministic assertions and registered Echo/Ollama providers provide
local paths; local model availability was not tested. The SDK selects an
in-memory evaluation when `writeLatestResults` is false. Persisted runs use
SQLite through libSQL/Drizzle, normally `~/.promptfoo/promptfoo.db`, with a
configurable config directory. Response caching is separate, normally under
`~/.promptfoo/cache` and configurable with `PROMPTFOO_CACHE_PATH`; disabling result
persistence alone does not disable caching. Saved records and exported reports
can contain prompts, variables, model output, trace content and grader details.

The hosted generation router prefers configured Cloud, supports
`PROMPTFOO_REMOTE_GENERATION_URL`, and otherwise defaults to a Promptfoo task
endpoint. Without suitable local credentials it can choose remote generation.
`PROMPTFOO_DISABLE_REMOTE_GENERATION` suppresses that route; the red-team-specific
flag has narrower scope. Some strategies explicitly fail when remote generation
is unavailable. A complete offline capability claim cannot include those paths.

There is also a concrete telemetry caveat at this revision:
`PROMPTFOO_DISABLE_TELEMETRY` suppresses PostHog, but `Telemetry.record()` invokes
`recordTelemetryDisabled()` once, which invokes `sendEvent()`. Its separate
`fetchWithProxy(R_ENDPOINT, ...)` is unconditional inside that method and includes
user/runtime metadata. Consequently that flag alone is not evidence of zero
outbound requests. Fully offline use needs a bounded egress check and explicit
local provider/grader/generation selection. No such network validation was run.

### Relevance and integration cost for Drawloom

The lowest-cost candidate seam is an external Node evaluation worker: map a
public synthetic case corpus to Promptfoo configuration, expose a Drawloom run
through an `ApiProvider`, then translate summary rows into a deliberately small
assessment record. This fits output, retrieval and trajectory comparisons while
leaving Drawloom execution and authority in their existing owners. A process seam
also keeps Node, SQLite, executable assertion modules and Promptfoo-specific
configuration outside portable contract packages.

Integration is moderate for deterministic output cases, higher for complete
conversation/trace fidelity, attribution of target versus judge usage, media
handling and verified offline policy. Its internal `EvaluatorRuntime` and
`EvaluationStore` abstractions are informative but not the selected public
package integration entry. No inspected interface grants Drawloom policy
enforcement, external-state restoration, durable workflow recovery or a
ground-truth success oracle automatically. An upstream assertion score should
remain evidence attached to an exact case/output, with evaluator provenance.

### Evidence read, not executed

Read tests include `test/evaluator/metadata.test.ts` (conversation history and
conversation-ID separation) and `test/assertions/trajectoryGoalSuccess.test.ts`
(trace/output passed to the judge, object/string goal forms and grader-error
handling). Those are source assertions, not passing test results in this survey.
The inventory also followed `src/index.ts`, `src/evaluate.ts`,
`src/providers/registry.ts`, `src/cache.ts`, `src/node/doEval.ts` and the licence
files named above.

Revision-pinned anchors:

1. [Root licence](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/LICENSE)
2. [Package exports and runtime](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/package.json)
3. [Evaluation resolution and persistence lifecycle](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/src/evaluate.ts)
4. [Suite, assertions and result contracts](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/src/types/index.ts)
5. [Provider interface](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/src/types/providers.ts)
6. [Trajectory assertion implementation](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/src/assertions/trajectory.ts)
7. [Local database](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/src/database/index.ts)
8. [Remote generation routing](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/src/redteam/remoteGeneration.ts)
9. [Telemetry including disabled-event request](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/src/telemetry.ts)
10. [Conversation tests](https://github.com/promptfoo/promptfoo/blob/b532fbae55b3706f13ccde6255f4e611788ce577/test/evaluator/metadata.test.ts)

## Arcade MCP evaluation library

### Revision and licence scope

- Checkout: `/Users/afifim/Development/arcade-mcp`.
- Origin: `https://github.com/ArcadeAI/arcade-mcp.git`.
- HEAD: `7246e9d6500f213ce42e8e84dd9ee72ebfec926b`.
- Root package: `arcade-mcp` 1.15.2, Python `>=3.10`, MIT.
  `arcade_evals` and `arcade_cli` are shipped by that root wheel; evals are an
  optional dependency group, not a separately declared workspace package here.
- Root and discovered toolkit-template licence files are MIT. No conflicting
  nested licence was discovered. This does not assess every dependency, tool
  service, hosted Arcade component or model service's terms.

### Lifecycle and capabilities

The evaluation library exports `EvalSuite`, expected-call dataclasses, rubric,
critics, capture types, `tool_eval()` and schema loaders. A suite registers tool
definitions from dictionaries, Python `ToolCatalog`, MCP stdio, MCP HTTP/SSE or
an Arcade gateway. Definitions enter a normalized registry and are converted
to OpenAI/Anthropic tool schemas. Each case builds model messages and expected
calls. `run()` requests model tool choices, parses predicted names/arguments,
matches expected and actual calls, runs field critics and aggregates scores.

| Capability | Concrete implementation | Qualification |
| --- | --- | --- |
| Tool choice and quantity | Expected tool names, selection weight and optional fail-on-selection/quantity rubric rules | Measures the model's proposed tool calls |
| Argument assessment | Binary, numeric, datetime and TF-IDF/cosine similarity critics; custom critic base | Binary critic may cast actual values to expected type; it is not strict JSON type equality |
| Matching multiple calls | Linear-sum assignment over the expected/actual call cost matrix | This is assignment scoring, not a sequential tool-execution trace |
| Comparative tracks | Isolated tool registries, common task context, track-specific expected calls and critics | Useful for comparing descriptions/schema designs against the same task |
| Repeatability analysis | Multiple runs, seed policies, mean/stddev and last/mean/majority pass rules | A seed is sent on OpenAI path; this does not make all providers deterministic |
| Capture | `capture()` returns predicted calls and optional repeated-run metadata without scoring | Recording model choices does not invoke tools |
| Local reporting | CLI JSON, text, Markdown and HTML formatters; context inclusion option | Results include inputs and expected/predicted arguments; exported content needs appropriate handling |

### Choice evaluation versus execution/outcome evaluation

This revision supports choice/argument evaluation. It does **not** implement a
general execution/outcome evaluation loop in the inspected `arcade_evals` paths.
`_run_openai()` calls `client.chat.completions.create()` and returns parsed tool
arguments; `_run_anthropic()` calls `client.messages.create()` and extracts
`tool_use` blocks. `_run_case_with_stats()` feeds those predictions directly to
`EvalCase.evaluate()`. MCP loaders initialize sessions and call `list_tools()`,
then close the session; they do not retain execution sessions for running the
predicted calls. Python callable references provide identity/default arguments
and schemas, not a tool execution loop in this path.

Files named `_comparative_execution.py` and tests named
`test_capture_execution.py` refer to execution of evaluations/capture. They do
not prove tool execution or external-state assessment. `additional_messages`
can supply historical assistant/tool messages, but this is fixed context before
the next choice request. No inspected case field supplies expected tool output,
environment setup/reset, final answer rubric or post-action state oracle. Other
Arcade server/tool packages can execute tools; their presence does not add that
behaviour to this evaluator.

### Public interface shapes

```python
from arcade_evals import EvalSuite, ExpectedMCPToolCall, BinaryCritic

suite = EvalSuite(name="lookup-choice", system_message="Choose the relevant tool.")
suite.add_tool_definitions([{
    "name": "lookup", "description": "Look up a document by title",
    "inputSchema": {"type": "object", "properties": {
        "title": {"type": "string"}}, "required": ["title"]}
}])
suite.add_case(
    name="find-guide", user_message="Find the installation guide",
    expected_tool_calls=[ExpectedMCPToolCall("lookup", {"title": "installation"})],
    critics=[BinaryCritic(critic_field="title", weight=1.0)],
)
# Caller supplies an OpenAI-compatible asynchronous client.
result = await suite.run(client, model="local-tool-model", provider="openai",
                         num_runs=3, seed="constant", multi_run_pass_rule="majority")
```

`EvalRubric` defaults are `fail_threshold=0.8`, `warn_threshold=0.9`,
`fail_on_tool_selection=True`, `fail_on_tool_call_quantity=True` and
`tool_selection_weight=1.0`. `ExpectedToolCall(func, args)` identifies a Python
tool, whereas `ExpectedMCPToolCall(tool_name, args)` identifies a registered name.
`add_case()` also accepts system-message/rubric overrides and
`additional_messages`. Missing field critics become zero-weight `NoneCritic`
placeholders, so listing an expected argument is not enough to assert it.

`run(client, model, provider="openai", num_runs=1, seed="constant",
multi_run_pass_rule="last")` returns a dictionary with model, suite name,
rubric and case results. A case contains input/context, expected and predicted
calls, evaluation, and optional run/critic statistics. Public `ProviderName` is
limited to OpenAI and Anthropic. Comparative usage registers definitions with a
`track` and uses `add_comparative_case(...).for_track(...)`, followed by
`run_comparative()`. That result is keyed by track. Capture results are typed
dataclasses rather than the same scored-result dictionary.

### Local operation, persistence and disclosure

Schema-only dictionary registration and critics can run locally without an
Arcade account. SDK `run()` accepts a caller-provided client, making a local
OpenAI-compatible endpoint a plausible seam, provided it supports the emitted
tool-call request including model/tool-choice/seed fields. That compatibility was
not tested. CLI convenience runners instantiate provider clients with API keys;
they are not a generic local-model adapter registry. Arcade gateway discovery is
optional and explicitly requires the selected endpoint/authentication.

Evaluation results are in-memory structures plus requested output files; no
evaluation database, durable recovery log or experiment server was found in the
inspected library flow. Loader schema caches are process-global; their keys
include URL and stringified request headers. Stdio loading copies the parent
environment and adds overrides before starting the subprocess, which matters
when choosing what environment may reach an inspected tool server. Remote
loading's `timeout` parameter is retained for API compatibility but explicitly
discarded because the MCP SDK manages timeout. Callers needing a bounded discovery
operation must arrange that at their own boundary.

Model requests disclose system/user/history messages and the registered tool
schemas to the chosen model endpoint. CLI command tracking is enabled through
`TrackedTyper` and `CommandTracker`, with `ARCADE_USAGE_TRACKING=0` documented as
the opt-out. Tracking can include command outcome, runtime and truncated exception
text, so a local evaluation runner is not automatically an offline CLI workflow.
No provider calls or egress tests were performed.

### Relevance and integration cost for Drawloom

This is a focused reference for tool-discovery quality: compare MCP names,
descriptions and argument schemas using public synthetic cases, then attach the
choice/argument result to the schema revision under assessment. An external
Python process consuming exported schemas is a small conceptual integration,
although the optional dependency set includes OpenAI/Anthropic clients, MCP,
NumPy, SciPy and scikit-learn. Preserving imported Python tool identity is more
coupled than using schema dictionaries.

It is unsuitable as a complete Drawloom execution-success evaluator without a
separate execution owner and outcome oracle. Adding those would be new work,
not configuration of an existing case contract. Comparative tracks, explicit
uncriticized arguments and repeated-run statistics are reusable concepts; the
Python provider-specific runner need not become a core abstraction.

### Evidence read, not executed

Read `libs/tests/arcade_evals/test_capture_execution.py` (mocked calls captured,
no scoring, absent-tool error), `test_comparative_execution.py` (track isolation,
validation and result shape), and critic implementation/test names for casting,
numeric ranges and cosine behaviour. Those tests were not run. Also inspected
`arcade_evals/__init__.py`, `_evalsuite/_types.py`,
`_evalsuite/_providers.py`, `_evalsuite/_convenience.py`, `loaders.py`,
`arcade_cli/evals_runner.py` and CLI tracking wiring.

Revision-pinned anchors:

1. [Licence](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/LICENSE)
2. [Runtime and optional dependencies](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/pyproject.toml)
3. [Suite lifecycle and choice-scoring call chain](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/libs/arcade-evals/arcade_evals/eval.py)
4. [Expected calls, rubric and track configuration](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/libs/arcade-evals/arcade_evals/_evalsuite/_types.py)
5. [Critics](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/libs/arcade-evals/arcade_evals/critic.py)
6. [MCP schema discovery and cache](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/libs/arcade-evals/arcade_evals/loaders.py)
7. [Comparative run implementation](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/libs/arcade-evals/arcade_evals/_evalsuite/_comparative_execution.py)
8. [Capture execution tests](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/libs/tests/arcade_evals/test_capture_execution.py)
9. [Comparative execution tests](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/libs/tests/arcade_evals/test_comparative_execution.py)
10. [CLI usage tracking](https://github.com/ArcadeAI/arcade-mcp/blob/7246e9d6500f213ce42e8e84dd9ee72ebfec926b/libs/arcade-cli/arcade_cli/usage/command_tracker.py)

## Architecture diagram source map

These are source-inspected call/dependency maps, not proposed Drawloom contracts.
Paths are relative to each repository at its recorded revision. Dashed or
separately labelled remote branches should remain visibly optional in rendered
diagrams.

### Promptfoo nodes

| ID | Title | Path |
| --- | --- | --- |
| pf_entry | SDK evaluate | `src/node/evaluate.ts` |
| pf_config | Resolve suite and record | `src/evaluate.ts` |
| pf_run | Render, schedule and evaluate | `src/evaluator.ts` |
| pf_provider | Target provider | `src/types/providers.ts` |
| pf_assert | Assertions and graders | `src/assertions/index.ts` |
| pf_trace | Trajectory assessment | `src/assertions/trajectory.ts` |
| pf_store | Local evaluation database | `src/database/index.ts` |
| pf_remote | Optional remote generation | `src/redteam/remoteGeneration.ts` |
| pf_result | Evaluation result record | `src/models/eval.ts` |
| pf_telemetry | Usage event channel | `src/telemetry.ts` |

Edges: `pf_entry -> pf_config` (delegates); `pf_config -> pf_run` (resolved suite);
`pf_run -> pf_provider` (callApi); `pf_provider -> pf_run` (ProviderResponse);
`pf_run -> pf_assert` (grade output); `pf_assert -> pf_trace` (trajectory handlers);
`pf_config -> pf_store` (optional persistent record); `pf_run -> pf_result`
(append results); `pf_result -> pf_store` (persist when enabled);
`pf_remote -> pf_provider` (generation uses provider context);
`pf_run -> pf_telemetry` (usage events). The remote-generation arrow represents
a context dependency, not a mandatory stage of every run.

### Arcade nodes

| ID | Title | Path |
| --- | --- | --- |
| ar_entry | CLI suite runner | `libs/arcade-cli/arcade_cli/evals_runner.py` |
| ar_suite | Suite and cases | `libs/arcade-evals/arcade_evals/eval.py` |
| ar_load | MCP schema discovery | `libs/arcade-evals/arcade_evals/loaders.py` |
| ar_registry | Tool registry and conversion | `libs/arcade-evals/arcade_evals/_evalsuite/_tool_registry.py` |
| ar_model | Model choice request | `libs/arcade-evals/arcade_evals/eval.py` |
| ar_score | Call matching and critics | `libs/arcade-evals/arcade_evals/critic.py` |
| ar_tracks | Comparative tracks | `libs/arcade-evals/arcade_evals/_evalsuite/_comparative_execution.py` |
| ar_capture | Unscored capture | `libs/arcade-evals/arcade_evals/_evalsuite/_capture.py` |
| ar_report | Result file formatting | `libs/arcade-cli/arcade_cli/evals_runner.py` |

Edges: `ar_entry -> ar_suite` (load and run); `ar_load -> ar_registry` (schemas only);
`ar_suite -> ar_registry` (register or select tools); `ar_suite -> ar_model`
(messages and schemas); `ar_model -> ar_score` (predicted names and arguments via
EvalCase); `ar_tracks -> ar_suite` (isolated case/registry per track);
`ar_capture -> ar_model` (request without scoring); `ar_score -> ar_report`
(scored cases via runner); `ar_capture -> ar_report` (captured choices).
There is deliberately no tool-execution or environment-state node: neither is
part of this inspected evaluator call chain.
