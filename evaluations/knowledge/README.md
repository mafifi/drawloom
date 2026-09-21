# Local knowledge evaluation

This is the how-to guide for running the Knowledge evaluation harness — the
retrieval benchmark, the opt-in GGUF qualification harness, and the opt-in
answer-quality evaluator — for anyone checking a retrieval or answer-quality
change.

## What the corpus is

`corpus.ts` is invented public evidence and a fixed held-out question set. It
includes exact near-colliding identifiers, paraphrases, multi-source claims,
historical contradictions and questions the evidence cannot answer. No
private project files or production data belong here.

Keep this corpus and question set unchanged after the first scored run.
Record their SHA-256 alongside each result. A new version requires reporting
results separately; never tune retrieval against the held-out answers and
call that a held-out improvement.

The 10,000/100,000-record generators add synthetic inventory noise. These
are controlled scale tests, not a claim to represent enterprise knowledge
diversity. Answer quality must use identical answering-model configuration
and context budgets across lexical and hybrid retrieval. Expected answers
support assessment; they must never be supplied to retrieval or the
answering model.

## Run the retrieval benchmark

The Node-only runner (`runner.ts`) writes a disposable SQLite store below
`--root`. Its default is a small lexical deterministic smoke run; it reports
exact-reference retrieval metrics, per-category metrics, per-question
returned reference identities, chain completeness, irrelevant-query
abstention, and separate cold and 30-query warm median and p95 latency.
Ingestion, lexical retrieval, and (when enabled) semantic indexing and
hybrid retrieval each carry elapsed time, process CPU time, and sampled
process RSS. Store size reports the database plus its SQLite WAL and SHM
sidecars at measurement time; it is not a whole-host disk measurement. The
runner emits content-free progress counts to stderr for large intake and
indexing runs — it is not a semantic-quality claim.

```sh
node --experimental-strip-types evaluations/knowledge/runner.ts --root /path/to/disposable-evaluation
node --experimental-strip-types evaluations/knowledge/runner.ts --root /path/to/disposable-evaluation --scale
node --experimental-strip-types evaluations/knowledge/runner.ts --root /path/to/disposable-evaluation --stress
```

`--scale` creates 10,000 records and `--stress` creates 100,000. Both use the
same held-out questions and only add public synthetic inventory noise.

To compare lexical retrieval with real-vector hybrid retrieval, supply
`--model` and `--models-root` pointing to already installed, verified local
model weights:

```sh
node --experimental-strip-types evaluations/knowledge/runner.ts \
  --root /path/to/disposable-evaluation \
  --model qwen3-embedding-0.6b-gguf \
  --models-root /path/to/existing-models
```

The runner never calls installation or download. If the requested model is
not already verified, it reports `model_not_ready` rather than fabricating
vectors or a semantic score. With verified weights, it uses the supported
local runtime's bounded `indexNext` loop and RRF hybrid retrieval path,
rather than a runner-only ranking. This retrieval runner makes no
answering-model call and retains `answerEvaluation: not_configured`. The
separate evaluator below measures answers without introducing an
answering-model hook into public contracts.

The runner also accepts an optional `EvaluationEmbedding` composition
containing an existing `KnowledgeEmbeddings` implementation and its index
identity. This lets opt-in external backends exercise the same
indexing/retrieval path without adding provider selection to product
contracts. The caller owns setup and cleanup.

## Run the GGUF qualification harness (opt-in)

ADR 0026 adds opt-in `gguf-local.ts` (already audited build; fixed scale
cases), `gguf-install.ts` (local fixture delivery, real managed host and
process shutdown), and `gguf-endpoint-check.ts` (negative
server-capability control). They require `DRAWLOOM_GGUF_EVALUATION=1` and
explicit local paths; they do not download models. Read the ADR 0026
evidence before use.

Before running `gguf-local.ts`, or `gguf-endpoint-check.ts` against an
uninstalled candidate, you need the SHA-256 of the exact local candidate
executable, passed as `DRAWLOOM_GGUF_RUNTIME_SHA256`; the script checks
that identity and the manifest-owned model hash before starting. At start
the stress harness also requires at least 8 GiB free disk and 4 GiB
available memory, and it stops during execution on the three-hour cap, disk
below 4 GiB, red macOS memory pressure, child RSS above 4 GiB, persistently
growing swap, or 15 minutes without indexing progress.

Run the endpoint denial check first, before scale execution — it attempts
one local generated token to test rejection, so it is not an
answering-model evaluation:

```sh
DRAWLOOM_GGUF_EVALUATION=1 \
DRAWLOOM_GGUF_RUNTIME_SHA256=<candidate-llama-server-sha256> \
node --experimental-strip-types evaluations/knowledge/gguf-endpoint-check.ts \
  /absolute/new/endpoint-root /absolute/endpoint-report.json \
  /absolute/candidate-build-root
```

Then use a new root for the first candidate stress attempt, and the same
root and identity to resume after a safely recorded interruption:

```sh
DRAWLOOM_GGUF_EVALUATION=1 \
DRAWLOOM_GGUF_RUNTIME_SHA256=<candidate-llama-server-sha256> \
node --experimental-strip-types evaluations/knowledge/gguf-local.ts \
  /absolute/new/evaluation-root /absolute/candidate-build-root 100000

DRAWLOOM_GGUF_EVALUATION=1 \
DRAWLOOM_GGUF_RUNTIME_SHA256=<same-candidate-llama-server-sha256> \
node --experimental-strip-types evaluations/knowledge/gguf-local.ts \
  /absolute/new/evaluation-root /absolute/candidate-build-root 100000 --resume
```

The isolated root holds a strict identity-bound receipt and one worker
lock. After completed ingestion, `--resume` verifies the retained corpus
and continues through the existing durable index-work checkpoint;
interrupted ingestion is not resumable. Each attempt remains a separate
segment, so resumed work is not reported as fresh throughput. A candidate
run is local qualification only: it does not change installer hashes or
establish signed/notarized release status.

Additional integration runners are explicitly opt-in:

- `DRAWLOOM_TEMPORAL_TEST=1 node evaluations/knowledge/temporal-nightloom.mjs`
  uses real local Temporal and SQLite with a deterministic, no-model
  assessor. It checks a two-unit batch and cached results after manager
  restart.
- `DRAWLOOM_KNOWLEDGE_LIVE=1 node evaluations/knowledge/codex-live.mjs` uses
  signed-in Codex with invented public evidence. This initiates a real
  assessment; it does not download embedding models or evaluate their
  quality.

## Run the answer-quality evaluation (opt-in)

`answer-evaluation.ts` uses the existing Codex App Server transport,
explicitly selecting `gpt-5.6-terra` at low effort. It supplies only actual
retrieved records and paginated evidence, including irrelevant and
historical records. Ground truth enters scoring only. Evidence allowance
and model configuration stay equal across lexical and MLX cases. Use the
complete 48-case comparison: a smaller cap selects lexical cases first and
is not a balanced model comparison.

Supply both current report/database pairs to avoid repeating indexing:

```sh
DRAWLOOM_KNOWLEDGE_ANSWER_LIVE=1 node --experimental-strip-types \
  evaluations/knowledge/answer-evaluation.ts --root /path/to/disposable-answers \
  --lexical-report /path/to/lexical-report.json --lexical-db-root /path/to/lexical-store \
  --mlx-report /path/to/mlx-report.json --mlx-db-root /path/to/mlx-store \
  --max-cases 48 --timeout-ms 60000 --evidence-bytes 65536
```

This initiates real model calls. A durable receipt records each attempted
submission; an uncertain call is reconciled, not automatically repeated.
Reuse the same root serially after interruption; concurrent evaluator
processes sharing a root are unsupported. Case deadlines cover transport
and receipt persistence.

After a durable terminal result is saved, the evaluator closes its writer
transport and archives only the exact native thread named by that case
receipt. Uncertain submissions remain unarchived for recovery. Archive
failures stay on the primary result, fail the runner after progress is
saved, and are retried from a cached terminal receipt without another
model call. The fixed evidence limit applies to the complete records/chain
package; oversized cases are reported blocked, never silently trimmed
against the expected answer.

### Reading the report

The report separates valid/current/expected citations, surface assertions
and abstention. Those heuristic checks are not universal factual
correctness. Inspect actual answers before making quality claims. Native
tool activity is reported; any contaminated cases must not support claims
about answering only from local evidence. This is not a complete
desktop-driver journey or proof of native-tool isolation.

## Run the focused unit checks

```sh
node --experimental-strip-types --test evaluations/knowledge/metrics.node-check.ts evaluations/knowledge/runner.node-check.ts
pnpm exec tsc -p evaluations/knowledge/tsconfig.json
```

## Historical context

Lexical scale measurements are recorded in the
[ADR evidence](../../knowledge/evidence/adr-0024-local-knowledge.md). The
retained two-model CPU comparison is historical: both were downloaded with
explicit consent, hash-verified and exercised in 24-record smoke and
sequential 10,000-record hybrid runs. The GGUF replacement and its
verification are tracked in
[ADR 0026 evidence](../../knowledge/evidence/adr-0026-gguf.md). Do not
rerun the historical GPL-dependent MLX worker as a baseline. Downstream
answers and 100k semantic stress are recorded separately as they complete;
a small smoke alone is not a model-selection result.

Earlier CPU Qwen and Nomic result files, referenced above, are historical
evidence only; the current evaluator does not run those backends. Indexing
measurements stop before search begins in the current runner; historical
reports written before the MLX comparison included search time in the
indexing phase.
