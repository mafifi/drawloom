# Local knowledge evaluation

`corpus.ts` is invented public evidence and a fixed held-out question set. It
includes exact near-colliding identifiers, paraphrases, multi-source claims,
historical contradictions and questions the evidence cannot answer. No private
project files or production data belong here.

Keep this corpus and question set unchanged after the first scored run. Record
their SHA-256 alongside each result. A new version requires reporting results
separately; never tune retrieval against the held-out answers and call that a
held-out improvement.

The 10,000/100,000-record generators add synthetic inventory noise. These are
controlled scale tests, not a claim to represent enterprise knowledge diversity.
Answer quality must use identical answering-model configuration and context
budgets across lexical and hybrid retrieval. Expected answers support assessment;
they must never be supplied to retrieval or the answering model.

Lexical scale measurements are recorded in the
[ADR evidence](../../knowledge/evidence/adr-0024-local-knowledge.md). The retained
two-model CPU comparison is historical: both were downloaded with explicit
consent, hash-verified and exercised in 24-record smoke and sequential
10,000-record hybrid runs. MLX Qwen is the only currently supported worker.
Downstream answers and 100k semantic stress are recorded separately as they
complete; a small smoke alone is not a model-selection result.

## Runner

Additional integration runners are explicitly opt-in:

- `DRAWLOOM_TEMPORAL_TEST=1 node evaluations/knowledge/temporal-nightloom.mjs`
  uses real local Temporal and SQLite with a deterministic, no-model assessor.
  It checks a two-unit batch and cached results after manager restart.
- `DRAWLOOM_KNOWLEDGE_LIVE=1 node evaluations/knowledge/codex-live.mjs` uses
  signed-in Codex with invented public evidence. This initiates a real assessment;
  it does not download embedding models or evaluate their quality.

The Node-only runner writes a disposable SQLite store below `--root`. Its default
is a small lexical deterministic smoke run; it reports exact-reference retrieval
metrics, per-category metrics, per-question returned reference identities, chain
completeness, irrelevant-query abstention, and separate cold and 30-query warm
median and p95 latency. Ingestion, lexical retrieval, and (when enabled) semantic
indexing and hybrid retrieval each carry elapsed time, process CPU time, and
sampled process RSS. Store size reports the database plus its SQLite WAL and SHM
sidecars at measurement time; it is not a whole-host disk measurement. The runner
emits content-free progress counts to stderr for large intake and indexing runs.
It is not a semantic-quality claim.

The runner accepts an optional `EvaluationEmbedding` composition containing an
existing `KnowledgeEmbeddings` implementation and its index identity. This lets
opt-in external backends exercise the same indexing/retrieval path without
adding provider selection to product contracts. The caller owns setup and cleanup.
Indexing measurements stop before search begins; historical reports written
before the MLX comparison included search time in the indexing phase.

```sh
node --experimental-strip-types evaluations/knowledge/runner.ts --root /path/to/disposable-evaluation
node --experimental-strip-types evaluations/knowledge/runner.ts --root /path/to/disposable-evaluation --scale
node --experimental-strip-types evaluations/knowledge/runner.ts --root /path/to/disposable-evaluation --stress
```

`--scale` creates 10,000 records and `--stress` creates 100,000. Both use the
same held-out questions and only add public synthetic inventory noise.

To compare lexical retrieval with real-vector hybrid retrieval, supply `--model`
and `--models-root` pointing to already installed, verified local model weights:

```sh
node --experimental-strip-types evaluations/knowledge/runner.ts \
  --root /path/to/disposable-evaluation \
  --model qwen3-embedding-0.6b-mlx \
  --models-root /path/to/existing-models
```

The runner never calls installation or download. If the requested model is not
already verified, it reports `model_not_ready` rather than fabricating vectors or
a semantic score. With verified weights, it uses the supported local runtime's
bounded `indexNext` loop and RRF hybrid retrieval path, rather than a runner-only
ranking. This retrieval runner makes no answering-model call and retains
`answerEvaluation: not_configured`. The separate evaluator below measures answers
without introducing an answering-model hook into public contracts.

## Opt-in answer evaluation

`answer-evaluation.ts` uses the existing Codex App Server transport, explicitly
selecting `gpt-5.6-terra` at low effort. It supplies only actual retrieved records
and paginated evidence, including irrelevant and historical records. Ground truth
enters scoring only. Evidence allowance and model configuration stay equal across
lexical and MLX cases. Use the complete 48-case comparison: a smaller cap selects
lexical cases first and is not a balanced model comparison. Earlier CPU Qwen and
Nomic result files are historical evidence only; the current evaluator does not
run those backends.

Supply both current report/database pairs to avoid repeating indexing:

```sh
DRAWLOOM_KNOWLEDGE_ANSWER_LIVE=1 node --experimental-strip-types \
  evaluations/knowledge/answer-evaluation.ts --root /path/to/disposable-answers \
  --lexical-report /path/to/lexical-report.json --lexical-db-root /path/to/lexical-store \
  --mlx-report /path/to/mlx-report.json --mlx-db-root /path/to/mlx-store \
  --max-cases 48 --timeout-ms 60000 --evidence-bytes 65536
```

This initiates real model calls. A durable receipt records each attempted
submission; an uncertain call is reconciled, not automatically repeated. Reuse
the same root serially after interruption; concurrent evaluator processes sharing
a root are unsupported. Case deadlines cover transport and receipt persistence.
The fixed evidence limit applies to the complete records/chain package; oversized
cases are reported blocked, never silently trimmed against the expected answer.

The report separates valid/current/expected citations, surface assertions and
abstention. Those heuristic checks are not universal factual correctness. Inspect
actual answers before making quality claims. Native tool activity is reported;
any contaminated cases must not support claims about answering only from local
evidence. This is not a complete desktop-driver journey or proof of native-tool
isolation.

Run the focused checks with:

```sh
node --experimental-strip-types --test evaluations/knowledge/metrics.node-check.ts evaluations/knowledge/runner.node-check.ts
bun x --no-install tsc -p evaluations/knowledge/tsconfig.json
```
