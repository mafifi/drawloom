# Memory research and evaluation: LongMemEval, sleep-time compute and MINJA

## Evidence boundary

This report separates three different forms of evidence:

- **LongMemEval** is a benchmark and experiment harness. Its public source was
  inspected at commit `9e0b455f4ef0e2ab8f2e582289761153549043fc` in a clean,
  newly shallow-cloned `/Users/afifim/Development/LongMemEval`. The repository is
  the original paper repository: the paper links to the same
  `xiaowu0162/LongMemEval` URL and the repository links back to arXiv 2410.10813.
  Its root [MIT licence](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/LICENSE#L1-L20)
  applies to the inspected code.
- **Sleep-time Compute** (arXiv:2504.13171) is a research method for using
  offline inference to rewrite a known context before future queries. Its
  official public source was inspected at commit
  `ffdf6626178f55318e1109610fecd95f58b9ee28` in a clean, newly shallow-cloned
  `/Users/afifim/Development/sleep-time-compute`. The repository identifies
  itself as paper-reproduction code, rather than the separate sleep-time-agents
  developer product, and its root
  [MIT licence](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/LICENSE#L1-L20)
  applies to the inspected code.
- **MINJA**, whose current arXiv title is *Memory Injection Attacks on LLM
  Agents via Query-Only Interaction* (arXiv:2503.03704), is security research
  against a particular shared long-term-memory agent pattern. Its official
  public source was inspected at commit
  `a3ec8da0f7740b3fe629f6706e1c14296ee6861d` in a clean, newly shallow-cloned
  `/Users/afifim/Development/MINJA`. The repository's root
  [MIT licence](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/LICENSE#L1-L20)
  applies to the inspected code.

Only public source was inspected. No dependencies, external datasets, Git LFS
payloads or models were downloaded, and no test, attack, retrieval, generation,
judge, environment or model process was run. The MINJA checkout contains its
ordinary tracked research fixtures, but its LFS database payloads were not
materialized. Paper-reported measurements below remain research results, not
independent reproduction. None of the three artifacts is evidence that a
production product provides a given lifecycle, privacy control or service
level, and none establishes a Drawloom contract.

## What each artifact actually studies

| Artifact | Unit of study | Lifecycle contribution | What it is not |
| --- | --- | --- | --- |
| LongMemEval | 500 questions embedded in timestamped synthetic/curated chat histories | Evaluates indexing, retrieval and reading across extraction, multi-session, temporal, update and abstention tasks | A durable memory service or application |
| Sleep-time Compute | A context `c` transformed offline into `c'` before one or more future queries | Studies when precomputed reasoning can move cost/latency away from query time | A source-of-truth, access-control or deletion design |
| MINJA | Similarity-retrieved query/reasoning records in an agent memory bank | Demonstrates a query-only route for poisoning later in-context demonstrations | Proof that every isolated or non-writing memory system is vulnerable in the same way |

Together they illuminate reading quality, asynchronous derivation and security,
but they do not form one ready-made architecture.

## LongMemEval: benchmark lifecycle, not retained application memory

The repository describes 500 questions across information extraction,
multi-session reasoning, knowledge updates, temporal reasoning and abstention.
Each evaluation item supplies a question and date, expected answer, timestamped
haystack sessions, evidence-session IDs and `has_answer` labels on evidence
turns. The short form is roughly 115k tokens/~40 sessions; the medium form is
roughly 500 sessions; the oracle form includes only evidence sessions.
[Benchmark and abilities](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md#L19-L30),
[data shape](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md#L72-L88).

Those labels are evaluation ground truth, not production provenance. The
benchmark intentionally tests whether a submitted assistant can remember an
updated value or abstain when evidence is absent; it does not implement an API
that revises or deletes a user's stored memory. Nor does it prescribe a
confidence representation or decide which real conversation turns a product is
authorized to retain.

The bundled retrieval experiment is per evaluation instance. It builds a flat
corpus from that item's haystack and supports oracle, BM25, Contriever, Stella
and GTE ranking at session or turn granularity. The flat index includes only
user-role text: session mode concatenates user turns and turn mode drops
assistant turns. Evidence labels are encoded into corpus IDs for scoring.
[Retriever choices](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/retrieval/run_retrieval.py#L26-L45),
[user-only index construction](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/retrieval/run_retrieval.py#L202-L229),
[per-item retrieval](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/retrieval/run_retrieval.py#L232-L287).

The output is an experiment log, not a reusable memory database. Each result
copies the question, answer, complete haystack, ranked item texts/timestamps and
metrics into JSONL. Retrieval aggregates omit abstention questions and items
without user-side target labels, a necessary qualification when comparing a
retriever's headline recall to end-to-end memory behaviour.
[Log contents](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/retrieval/run_retrieval.py#L289-L331),
[excluded retrieval cases](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/retrieval/run_retrieval.py#L384-L410).

Generation is a separate reading stage. It takes a retrieval log, selects
top-k items, sorts them by date, formats JSON or natural language, optionally
uses an LLM to produce Chain-of-Note summaries, truncates the assembled history
to a model-specific token allowance, and sends it to a reader model. Because
truncation retains the prefix of the already date-sorted string, a long prompt
can discard later items; that is benchmark implementation behaviour, not a
general recent-memory guarantee.
[Context formatting and ordering](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/generation/run_generation.py#L224-L261),
[truncation](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/generation/run_generation.py#L265-L282),
[reader invocation](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/generation/run_generation.py#L291-L382).

Answer accuracy is itself model-judged. Category-specific prompts deliberately
accept an off-by-one temporal duration and, for knowledge updates, can accept a
response that repeats obsolete information alongside the required updated
answer. The evaluator sets success when the judge output contains “yes.” These
choices are documented scoring semantics; results from another judge, prompt or
policy need not be identical.
[Judge rubrics](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py#L24-L43),
[judge execution](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/src/evaluation/evaluate_qa.py#L46-L130).

The paper's useful conceptual lens is three stages—indexing, retrieval and
reading—and four control points: stored value granularity, index key, retrieval
query and reading strategy. It reports that even oracle retrieval does not
eliminate reading errors, and that temporal query expansion depends on the LLM
correctly inferring a time range.
[Primary paper formulation](https://arxiv.org/html/2410.10813#S4.SS1),
[reading and temporal results](https://arxiv.org/html/2410.10813#S5.SS4).
These are benchmark findings, not a requirement to use its particular fact
expansion, Chain-of-Note or JSON prompts.

Operationally, the cleaned datasets are separate downloads. Evaluation-only
use targets Python 3.9 and an LLM judge; the full experiment setup documents
Linux, CUDA 12.1, PyTorch and large retrieval/reader models. The checked-in
scripts assume local model endpoints or provider credentials and can write full
history/answer data to logs. A real evaluation must therefore apply its own
data-handling, retention and access rules rather than treating benchmark code
as an entitlement boundary.
[Data and environments](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md#L32-L70),
[experiment prerequisites](https://github.com/xiaowu0162/LongMemEval/blob/9e0b455f4ef0e2ab8f2e582289761153549043fc/README.md#L146-L206).

## Sleep-time compute: derived context between queries

The paper studies transforming known context before future questions arrive,
then reusing that derived context at answer time. This is offline derivation,
not a complete memory lifecycle.
[Method definition](https://arxiv.org/html/2504.13171#S3).

It reports lower answer-time token use and improved accuracy in selected
stateful mathematics experiments. Its cost comparison assumes cheaper offline
tokens. These are conditional research results, not general operating guarantees.
[Experiments and cost assumption](https://arxiv.org/html/2504.13171#S5).

Benefits depend on query predictability and compute allocation; conventional
answer-time reasoning can win at larger budgets. The software case study
measures changed-file prediction rather than working-code correctness.
[Case study](https://arxiv.org/html/2504.13171#S6),
[limitations](https://arxiv.org/html/2504.13171#S7).

### Inspected sleep-time experiment lifecycle

The source release is narrower than the paper's general formulation and is
explicit about that boundary: it contains scripts to reproduce the AIME and
GSM experiments and points agent builders to separate developer documentation.
The checkout does not implement an independent memory library or service.
[Repository scope](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/README.md#L1-L10).

In the GSM script, `run_memory_edits(input_file, output_file, ..., sleep_time_model=None,
test_time_model=None, ..., ablate_question=False) -> None` constructs one shared
Letta memory block per evaluation example. That same block ID is attached to a
test-time agent and a `sleeptime_agent`. The sleep agent receives the source
context through a message and can invoke `rethink_memory(agent_state,
new_memory, target_block_label, source_block_label)`, which creates or replaces
the target block's entire string value. `finish_rethinking_memory` only returns
`None`; completion is a tool-use convention prompted into the agent, not a
durable workflow checkpoint in this repository.
[Block-write interface](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/run_stateful_gsm_symbolic.py#L24-L49),
[shared block and agents](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/run_stateful_gsm_symbolic.py#L76-L119),
[sleep trigger](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/run_stateful_gsm_symbolic.py#L121-L147).

The script waits for sleep-time calls to finish before it queries the test-time
agent. For the ordinary GSM condition it sends the **original context plus the
question** as the user message while the agent also has the rewritten memory
block. Thus this concrete experiment uses `c'` alongside `c`, not literally as
a durable replacement for `c`. The result JSONL captures model responses, both
agents' observed block values, the reference answer and sleep-agent responses.
It does not persist a source-to-derived revision link, review decision or
confidence value.
[Test-time ordering and message](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/run_stateful_gsm_symbolic.py#L149-L187),
[bounded concurrency and output](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/run_stateful_gsm_symbolic.py#L196-L211).

The memory string is bounded by the Letta block's configured `limit=5000`, but
the source does not define that limit's unit itself or expose its own merge, incremental update,
versioning, deletion or invalidation API. Each example creates new server-side
agents and blocks; there is no close/reopen, cleanup, recovery or replay logic
in the experiment script. Any database durability, tenant isolation and block
authorization come from the separately deployed Letta server and cannot be
credited to this checkout. In particular, sharing a block ID between two
experiment agents is data flow, not evidence of an entitlement check.

The AIME variant follows the same shared-block pattern, permits multiple sleep
and conversation agents, records token-usage objects, and retries an example in
an unbounded `while True` loop after broad exceptions. That makes it an
experiment runner optimized to eventually collect results, not a bounded
production job lifecycle.
[AIME run signature and model restriction](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/run_stateful_aime.py#L60-L95),
[retry and result capture](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/run_stateful_aime.py#L101-L105),
[uncapped retry branch](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/run_stateful_aime.py#L243-L268).

Local reproduction requires Python 3.12, the dataset/jsonlines/tqdm/Letta-client
packages, external benchmark datasets, a Letta server, OpenAI embeddings and
the selected reasoning models. The README's example starts a floating
`letta/letta:latest` container and mounts a persistent PostgreSQL directory, so
even the documented environment is not pinned solely by this repository.
[Requirements](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/requirements.txt#L1-L4),
[documented setup](https://github.com/letta-ai/sleep-time-compute/blob/ffdf6626178f55318e1109610fecd95f58b9ee28/README.md#L12-L36).

A derived `c'` can contain speculative or stale inferences. Reuse therefore
raises questions the paper does not solve as a product contract: which source
revision produced it, when context changes invalidate it, who may read it, how
it is reviewed, and whether deletion of `c` retracts `c'`. Those are evaluation
questions suggested by the lifecycle, not claims about the linked code and not
new Drawloom requirements.

## MINJA: retrieval memory as an injection channel

MINJA studies query-only poisoning of retained reasoning that is later retrieved
as demonstrations. Its shared-memory threat model matters: it does not establish
equal exposure for isolated, non-writing or differently authorized systems.
[Threat model](https://arxiv.org/html/2503.03704#S3).

The method gradually steers accepted memory toward attacker-selected behaviour.
Reported success depends on the evaluated admission and retrieval mechanisms;
the inspected code below makes those conditions more concrete.
[Method](https://arxiv.org/html/2503.03704#S4),
[experiments](https://arxiv.org/html/2503.03704#S5).

### Inspected MINJA experiment lifecycles

The code release is a collection of experiment scripts for RAP/WebShop, an EHR
agent and a multiple-choice QA agent, matching the three families named by the
root README. It is not a reusable attack API, memory server or defensive
library.
[Repository scope](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/README.md#L1-L11).

The QA experiment gives the clearest minimal lifecycle. Its process-local
`current_memory` is a list of dictionaries containing an experiment ID,
question, options, model-generated thought, answer and ground truth. For each
query it computes Levenshtein distance against every stored question, chooses
at most `n_shots`, and interpolates the retrieved question and thought directly
into the next model prompt. This is recall-to-active-context coupling with no
separate trust marker: generated reasoning becomes an in-context demonstration.
[QA retrieval and prompt assembly](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/QA/main.py#L252-L292).

Admission is scripted for the experiment. A benign record is appended when its
answer passes the harness check; a generated attack record is appended when its
experiment-specific condition passes. The whole list is rewritten as JSON
after each admitted record. There is no append transaction, source signature,
writer identity, revision, confidence, quarantine or independent human review.
The subsequent test phase reloads the hard-coded `memory.json`, even though
writes use the configurable `args.memory_path`; a non-default path can therefore
diverge from the file actually tested.
[QA admission and JSON write](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/QA/main.py#L348-L413),
[hard-coded test reload](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/QA/main.py#L415-L430).

The RAP/WebShop experiment stores a richer trajectory: instruction, action and
observation sequence, success and reward. Before retrieval it filters out
zero-reward records and can optionally require success, then creates sentence-
transformer embeddings. It selects examples using instruction similarity and,
depending on configuration, action/observation similarity; selected trajectories
are inserted into an initialization prompt capped by a 6,400-character check.
That cap is not a tokenizer-aware model-context guarantee.
[RAP memory filtering and embeddings](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/rap/minja.py#L367-L389),
[RAP retrieval and prompt bound](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/rap/minja.py#L391-L462).

Most importantly, the RAP experiment explicitly changes a completed malicious
episode's reward to `1.0` “to make sure that malicious instructions can be
stored in memory,” then admits successful returned records to `current_memory`
and rewrites the JSON output. This is a deliberately constructed experimental
write policy used to demonstrate the attack path. It is not evidence that a
production agent would or must assign the same reward, and the resulting attack
rate is inseparable from this admission rule.
[Constructed reward/admission condition](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/rap/minja.py#L556-L583),
[memory append and persistence](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/rap/minja.py#L585-L687),
[separate test over saved memory](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/rap/minja.py#L689-L739).

The EHR variant starts from built-in demonstrations or optionally loads a JSON
memory list. `MedAgent.retrieve_examples(query)` embeds every stored question,
ranks cosine similarity, and formats the top `num_shots` questions, knowledge
and generated code as examples. A second model call derives knowledge from
those examples before the agent receives its initial prompt. After each
processed benchmark question the main script appends question, derived
knowledge and generated code, with optional whole-file JSON persistence.
[EHR load and initial memory](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/EHR/ehragent/main.py#L47-L105),
[EHR similarity recall](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/EHR/ehragent/medagent.py#L117-L174),
[EHR append and optional persistence](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/EHR/ehragent/main.py#L148-L205).

Across all three variants, “memory” is an experiment-global Python list and/or
JSON file. The code has no tenant/user partition, authenticated writer,
entitlement check, deletion, correction, expiry, incoming-source retraction or
provenance-preserving update. The shared-bank condition is intentionally
created by reusing one list for injection and later tests; it is not an
independently implemented multi-user service. Numeric distance, similarity,
reward and task success are retrieval/admission signals, not calibrated
confidence in the stored reasoning's truth.

The source also reinforces that this is hazardous experiment code rather than
a production package. The QA and RAP scripts read API keys from checkout-local
text files, RAP expects a separately installed WebShop server and downloaded
datasets, and the EHR agent can execute generated Python against configured
research databases. The RAP guide calls for Python 3.10, OpenJDK, further
dependencies and a local WebShop process. None of those prerequisites was
installed or started for this survey.
[RAP prerequisites](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/rap/README.md#L1-L34),
[RAP model/environment composition](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/rap/minja.py#L742-L817),
[EHR generated-code boundary](https://github.com/dsh3n77/MINJA/blob/a3ec8da0f7740b3fe629f6706e1c14296ee6861d/EHR/ehragent/medagent.py#L251-L285).

The evaluated defenses have trade-offs: similarity-based sanitization and
detector prompts do not cleanly separate all malicious and benign records.
This is evidence to test defenses, not a conclusion that authorization is useless.
[Defense evaluation](https://arxiv.org/html/2503.03704#S5.SS4).

Practical questions carried forward from MINJA are to distinguish source text
from generated reasoning; retain writer, scope and derivation provenance; make
memory-writing authority separate and explicit; treat retrieved records as
untrusted context; and support bounded review/retraction. These are security
review prompts, not an assertion that MINJA's design or a new API must be adopted.

## Cross-cutting conclusions, not product requirements

1. **Persistence, recall and active context are different evidence.**
   LongMemEval measures retrieval and reading separately; sleep-time compute
   materializes a derived context; MINJA exploits what is written and later
   inserted into a prompt. A system can succeed at one and fail another.
2. **Updates need semantic evaluation.** A “knowledge-update” benchmark score
   does not prove stored obsolete data was retracted, and its judge may accept
   an answer containing both values. Product deletion, correction and lineage
   need their own evidence.
3. **Provenance is not confidence.** Evidence-session labels, timestamps and
   writer identities can explain origins, but none calibrates truth. Retrieval
   scores and model judges are likewise not confidence guarantees.
4. **Scope is not entitlement.** A benchmark corpus, retrieval partition or
   memory-bank namespace does not authenticate a caller. MINJA particularly
   shows why cross-user reuse must be an explicit, reviewed decision.
5. **Offline evolution creates invalidation work.** Precomputed summaries,
   facts or rewritten contexts need a relationship to the exact source state;
   otherwise later corrections and deletions cannot be propagated reliably.

These conclusions define questions for later comparison. They do not amend an
ADR, select a model/provider, authorize collection of user history, or invent a
portable Drawloom memory contract.
