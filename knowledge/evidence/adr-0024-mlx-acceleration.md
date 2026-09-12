---
type: source
id: adr-0024-mlx-acceleration
title: Qwen embedding acceleration on Apple Silicon
status: active
created: 2026-09-12
updated: 2026-09-12
---

# Local MLX versus ONNX CPU

Follow-up to [Accepted ADR 0024](../../docs/adr/0024-local-knowledge-memory-and-retrieval.md).
The maintainer requested testing Qwen embeddings using the Mac GPU, not changing
the supported default on assumption. Runtime/model installation is intended to
be an explicit Settings action; this experiment installs them independently in
a temporary Python environment, not inside the shipped app.

## Method and provenance

Apple M2 Ultra, 24 physical cores, 64 GiB RAM, macOS 26.6.2. Node 24.20.0 and
Python 3.12.13. Both runs use the unchanged fixed public corpus, 10,000 records,
9,999 eligible current index units, and 24 held-out questions plus 30 warm queries.
No Codex calls, production content or paid provider operations were needed.

The [retained experiment](../../spikes/adr-0024-mlx/README.md) injects the existing
`KnowledgeEmbeddings` contract into the evaluation composition. The same supported
SQLite provider, one-record-at-a-time indexing, 512-codepoint passage segmentation,
bounded search and reciprocal-rank fusion are used by both backends. Models use
last-token pooling, normalized 1,024-dimensional vectors and the same query prefix.
No corpus tuning or bulk-index optimization was added for MLX.

MLX explicitly selects `Device(gpu, 0)`, checks Metal availability and synchronizes
before reporting completed vectors. Inference runs offline against verified local
weights. Its safetensors quantization is not bit-identical to ONNX q8; each has its
own configuration fingerprint and database. The tokenizers' `tokenizer.json`
SHA-256 is identical. Never mix vectors between these implementations.

- Model: [mlx-community/Qwen3-Embedding-0.6B-8bit](https://huggingface.co/mlx-community/Qwen3-Embedding-0.6B-8bit),
  revision `407ad2329cd30702720aafe83f74a1ba30fdfbca`, model-card licence Apache-2.0.
- Weights: 633,152,041 bytes; SHA-256
  `fe956e8d346b4f08215a3cfc48a874354f900c20a59e965b75df0d9d77c54b28`.
- Config SHA-256: `65fb46306262bac47c6a89e5ad8a766c3d40d559057c1931e9c10976266a4fc7`.
- Tokenizer SHA-256: `def76fb086971c7867b829c23a26261e38d9d74e02139253b38aeb9df8b4b50a`.
- External [mlx-embeddings](https://github.com/Blaizzy/mlx-embeddings) 0.1.0
  declares GPL-3.0; MLX/Metal 0.32.2, Transformers 5.17.0, tokenizers 0.23.2.
  The model and runtime are not vendored or added as application dependencies.
  The intended independent installation is not a legal-compliance conclusion.
- Hub verification checked all 15 remote files. Extra files were local download
  bookkeeping; no missing or mismatched remote artifact was reported.

## Measurement correction

The original runner ended the indexing timer **after** the 54 searches. The old
Qwen 532.26-second and Nomic 270.25-second figures therefore include search time;
their indexing CPU totals include that phase too. Original per-search latency
measurements are unaffected. Historical reports are retained rather than rewritten.

The runner now ends indexing measurement before retrieval. A regression test
advances a controlled clock during queries: it fails with the old timing and
passes with the correction. CPU is rerun with the corrected runner, sequentially
after MLX. Normal desktop activity remains, so this is a local observation rather
than an isolated hardware benchmark.

## Results

The fresh sequential comparison completed on 2026-09-12:

| Metric | Qwen ONNX q8 / CPU | Qwen MLX 8-bit / Metal |
| --- | ---: | ---: |
| Initial indexing elapsed | 481.71 s (8 min 2 s) | 281.83 s (4 min 42 s) |
| Warm search median / p95 | 852.44 / 870.14 ms | 788.16 / 816.45 ms |
| Sampled search-process peak RSS | 2,013.95 MB (Node + in-process worker) | 304.61 MB Node; 1,001.80 MB Python lifetime peak |
| Sampled indexing-process peak RSS | 2,000.50 MB | 292.44 MB Node; 1,001.80 MB Python lifetime peak |
| Indexing CPU time (all CPU threads, not GPU work) | 4,596.00 s | about 228.12 s across parent and worker |
| Database + WAL + SHM at query completion | 252.58 MB | 233.78 MB |

MLX indexed **1.71 times faster (41.5% less elapsed time)** through the unchanged
single-record pipeline. Including its separate 1.31-second model/runtime load
still gives about 1.70 times faster indexing. It is a material indexing gain,
not an order-of-magnitude full-pipeline improvement. Complete-search p95 improved
only about 6.2%; mean query embedding/round-trip was 11.22 ms, leaving most search
time outside inference. No precise SQL-only timing was collected.

The [CPU report](assets/adr-0024/local-knowledge-qwen-cpu-corrected-10k.json) and
[MLX report](assets/adr-0024/local-knowledge-mlx-10k.json) retain the same corpus
hash, exact per-question records, phase timings and metrics. The
[external environment snapshot](assets/adr-0024/mlx-experiment-runtime.txt) records
all installed package versions. Decimal MB are used throughout. Separate Python
RSS is included explicitly; reporting only Node RSS would incorrectly exaggerate
the memory gain. GPU compute was not measured as CPU time or energy consumption.

MLX completed 9,999 document embeddings and 54 query embeddings. Indexing took
281.83 seconds. Query embedding plus worker round-trip averaged 11.22 ms; complete
search median/p95 was 788.16/816.45 ms. Document tokenization/inference/serialization
took 104.08 seconds in the Python worker; round trips took 109.73 seconds. Roughly
172 seconds of index elapsed time remained outside those round trips, including
SQLite operations and host validation. This is a measured remainder, not isolated
SQL profiling.

Node indexing peak RSS was 292.44 MB and Python lifetime peak RSS 1,001.80 MB.
Node search peak RSS was 304.61 MB. Summing process peaks is an upper bound, not
a simultaneously sampled total. MLX peak allocated memory was 798.18 MB, part
of unified memory; do not add it to RSS again. Loading the external runtime/model
took 1.31 seconds separately before indexing; the CPU worker loads lazily inside
indexing. Download/setup time is excluded from both indexing comparisons.

## Quality and limits

MLX matched the prior CPU hybrid aggregate and category metrics: relevant-evidence
recall 1.0, precision 0.1125, exact-identifier recall 1.0, top-result chain coverage
0.8 and irrelevant-query abstention 0. No broad accuracy claim follows from these
small synthetic scenarios. No new downstream answering evaluation was run.

A deterministic sample of 100 matching passage identities gave cross-backend
vector cosine similarity mean 0.8867, minimum 0.8580. These conversions are not
interchangeable index entries even when their retrieval scores agree here.

None of the 24 top-10 ordered result lists was identical to the earlier CPU run;
they shared an average of 7.375 references (minimum four). Matching aggregate
scores mean no regression on these fixed relevance checks, not identical vectors,
rankings or universally equal model quality.

This tests inference replacement and actual indexed retrieval, not supported
desktop MLX setup, full provider conformance, production workloads, concurrent
model serving or 100k semantic search. At the time of this experiment, the CPU
implementation was still the default; the subsequent decision below replaces it.

## Verification and disposition

- An initial experiment-only smoke failed because its configuration comparison
  relied on JSON property order. Comparing the three fields fixed it; no product
  contract or validation was weakened. The fresh smoke completed on Metal.
- The 10k GPU and subsequent CPU runs completed, with 9,999 document vectors and
  54 query vectors on GPU. Every GPU result was validated for count, identity,
  dimensions, finite values and normalization before entering the index.
- Evaluation tests: 21 passed, including the new external-provider composition
  and separate-index-timing regression (observed failing before correction).
- Evaluation and experiment TypeScript checks passed. Model artifact verification
  passed. `bun install --frozen-lockfile` and the canonical `bun run check:ci`
  passed before the subsequent supported-provider integration began.

The maintainer subsequently selected MLX as the only embedding implementation
before ADR 0024's first commit, explicitly removing CPU compatibility paths.
Historical comparison reports remain, not an additional supported backend.
This experiment itself does not implement desktop setup. The supported
provider integration and its separate checks are tracked in the
[completion plan](../../docs/plans/adr-0024-mlx-pivot.md). Do not treat the benchmark
as evidence for setup, supervision or browser behaviour.

## Hosting comparison

Inspected oMLX HEAD `7cbb407168ae628bbe0d7fe385be70e0954af303` on 2026-09-12:
its [embedding engine](https://github.com/jundot/omlx/blob/7cbb407168ae628bbe0d7fe385be70e0954af303/omlx/engine/embedding.py)
uses mlx-embeddings, loads a persistent model on an MLX executor and chunks
embedding requests. Its generation KV cache is not used as an embedding cache.
The [dependency manifest](https://github.com/jundot/omlx/blob/7cbb407168ae628bbe0d7fe385be70e0954af303/pyproject.toml)
also includes language/vision models and HTTP/admin infrastructure beyond this
single-model embedding consumer. These are source-inspection findings, not an
oMLX benchmark or an assessment of the whole product.

Select the measured persistent worker for now. It uses the same replaceable
Drawloom embedding contract without adopting another server/admin lifecycle.
oMLX's model scheduling may become valuable with broader local-model hosting;
no additional performance improvement is claimed here.

## Supported installer and worker verification

The supported MLX-only provider was exercised separately from the benchmark on
2026-09-12, using a fresh disposable Drawloom data directory and real downloads.
The host-side installer installed managed Python, hash-locked MLX packages and
verified model files. Installation plus fresh-instance readiness verification
took 101.29 seconds on the recorded Mac and network. The environment, managed
Python and download cache remained beneath the supplied `knowledge/models` root;
the process did not modify global Python. The resulting directory tree measured
about 2.5 GiB including caches, runtime and model object/active copies—not just
the model weights. This is not a claim about incremental APFS disk allocation.

A separate Node 24.20.0 process then verified cold readiness, loaded the Metal
worker and returned valid normalized 1,024-dimensional vectors for a full
50-document batch. Parent-side network fetch was forbidden during that check;
the Python worker retained its explicit offline inference environment.
Cold readiness took 1.29 s and the first query, including worker startup, took
2.98 s. Thirty small warm query embeddings had a median/p95 of 10.49/11.98 ms.
These are worker checks, **not complete knowledge searches or a new 10k benchmark**.
The [supported-worker result](assets/adr-0024/mlx-supported-provider.json) retains
the exact values.
The separate cold-readiness regression passed against the actual installation;
all eleven provider tests passed with that opt-in check enabled.

## Settings and application verification

A separate fresh application data directory exercised the actual Settings route:
Settings → Open Knowledge settings → keyboard Download and install → Cancel
installation → Retry installation. The browser observed runtime installation,
model download, verification and readiness; the three public synthetic records
were indexed. This used the real installer, not a mocked download handler.

After stopping and reopening the host, the installed model and index remained
ready. Searching for recovery of a deleted draft returned the expected synthetic
backup reference, with the UI reporting text and local semantic search. No Codex
assessment ran: maintenance was paused throughout. The host and its Python worker
were both observed to exit on shutdown.

Browser checks used Chrome through the available Playwright runtime because the
Browser plugin/skill was unavailable. The verified final page was
`http://127.0.0.1:65366/`, with the one-use authenticated bootstrap kept outside
evidence. Checks covered meaningful content and title, no framework overlay, no
console warnings/errors, keyboard activation, real cancellation/retry, and
semantic search after restart. Light/dark 1440×1000 and reduced-motion 390×844
screens were inspected; no horizontal page overflow or clipped model information
was observed. This is browser-hosted desktop evidence, not a packaged Tauri launch.
Retained screenshots: [light](assets/adr-0024/mlx-settings-light.png),
[dark](assets/adr-0024/mlx-settings-dark.png),
[narrow](assets/adr-0024/mlx-settings-narrow.png).

The initial automation needed a hydration wait for the title and a textbox-role
locator instead of an ambiguous label. Its first install still completed. Those
automation issues were corrected before the passing restart/search/theme run;
they are not counted as application failures or hidden as passing script runs.
The per-file download progress denominator discovered during this pass was fixed
and covered through runtime and ViewModel tests; it is not a whole-model percentage.

## Final review status

The supported CPU/ONNX worker, model choices and JavaScript inference dependency
were removed at the maintainer's explicit request. Historical comparison reports
and their readers remain; they cannot launch a CPU embedding backend.

Review found an asynchronous pipe error could terminate the Node knowledge
process. The fix and two real Node lifecycle regressions now handle stream
errors, including errors during shutdown, and replace the obsolete CPU Node-test
entry in the canonical gate.

The scoped re-review found a launch-recovery defect: unsuccessful
process spawning emits `error` followed by `close`, without `exit`. Retirement
waited only for `exit`, so that failure led to `worker_shutdown_timeout`
on retry/shutdown. This was reproduced against the compiled worker on Node
24.20.0, and the commit was held until a maintainer-authorized focused fix.

The correction recognizes either `exit` or `close` as confirmed termination and
settles retirement idempotently. A stream error alone remains non-terminal.
A real Node ENOENT spawn regression failed before the correction, then passed:
the same worker accepts a subsequent request, returns a valid response and closes
cleanly. All three Node lifecycle cases pass, including the original pipe-error
protection. Scoped review found no remaining Important or Critical issue in the fix.

The fresh MLX-only `bun install --frozen-lockfile` and full `bun run check:ci`
both exited successfully on 2026-09-12, including the new MLX Node lifecycle
checks. That earlier passing gate did not cover the launch-recovery failure;
the new regression is now included in the same mandatory Node gate.
The owned browser-check host and its inference worker were stopped; downloaded
synthetic-test environments remain outside the repository. No commit or push was
made while that finding remained open.

After the recovery fix, the real installed Metal worker was checked again with
network fetch disabled: cold readiness, a query, a full 50-document batch,
30 warm queries and clean shutdown passed. Cold readiness took 1.90 s, the first
query including startup 2.73 s, and warm query-embedding median/p95 10.25/11.63 ms.
These are repeat worker checks, not a rerun of the full 10k retrieval benchmark.

The final post-fix `bun install --frozen-lockfile` and `bun run check:ci` both
exited zero. The canonical suite includes the real failed-spawn regression;
826 Bun tests passed, six opt-in tests were skipped, and none failed. Separate
Node conformance and runtime checks passed, including all three MLX lifecycle
cases. Svelte checking reported zero errors/warnings and UI-policy checks passed.
This closes the recovery blocker for the requested cohesive ADR 0024 commit;
the production-quality and larger-scale limits recorded above remain unchanged.
