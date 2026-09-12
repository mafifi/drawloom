# ADR 0024: optional MLX embedding experiment

Question: does externally installed Qwen3-Embedding-0.6B on Metal improve initial
indexing and retrieval relative to the then-existing ONNX/CPU implementation?

This is opt-in evidence, not a supported provider or an application default.
No public capability changes. The runner receives `KnowledgeEmbeddings` through
evaluation composition and uses the existing SQLite intake, per-record indexing,
512-codepoint passages, RRF retrieval, frozen corpus and 54 query calls (24 quality
questions plus 30 warm queries). There is no generated-answer/Codex call.

`worker.py` imports an independently installed runtime. No upstream implementation
or model weights are vendored. MLX execution explicitly selects GPU, refuses a
missing Metal device and synchronizes before reporting completion. The small
sequential JSON-lines worker is a test transport, not a new public plugin protocol.
The local fixture uses a synthetic owner; this is not a separate authorization
implementation or production process-supervision proof.

## Setup, only with download consent

Use an isolated Python 3.12 environment and a disposable directory, not application
data. The tested runtime is `mlx-embeddings==0.1.0`, `mlx==0.32.2`,
`mlx-metal==0.32.2`, `transformers==5.17.0`, `tokenizers==0.23.2`.
Install these explicitly using the user's Python package tooling; do not change
global packages. Other resolved dependencies are recorded with the evidence.

Download `mlx-community/Qwen3-Embedding-0.6B-8bit` at commit
`407ad2329cd30702720aafe83f74a1ba30fdfbca` using `hf download --revision`, then
verify with `hf cache verify --revision ... --local-dir ...`.
The runtime runs offline against that directory. A source/model change needs a
new embedding configuration fingerprint and separate index.

```sh
node --experimental-strip-types spikes/adr-0024-mlx/run.mts \
  --python /absolute/path/to/venv/bin/python --model /absolute/path/to/model \
  --root /absolute/path/to/fresh-store --size 10000 \
  --output /absolute/path/to/report.json
```

The CPU control was run before the maintainer selected MLX and removed the CPU
implementation. Its corrected measurements remain in the evidence record; CPU
model launch options are no longer supported by the current runner.

Run backends sequentially. Report process memory separately: the MLX worker is a
Python child, so Node RSS/CPU alone omits inference. GPU allocation is part of
unified memory, not an additional quantity to add to process RSS. Summing process
peak RSS gives only an upper bound, not a simultaneously sampled total.

The runner now ends the indexing timer before retrieval. Earlier reports included
the subsequent query phase in indexing elapsed/CPU fields. Keep those historical
reports and use corrected measurements for this comparison.

## Packaging direction and limits

The maintainer requests a Settings/install action to download and set up optional
models and runtimes, with consent, progress and readiness rather than bundling
them in Drawloom. This experiment does not implement that MLX setup UI.
`mlx-embeddings` declares GPL-3.0; the MLX conversion's model card declares
Apache-2.0. Separate installation is the intended distribution arrangement, not
a claim that licence obligations disappear. Review the final integration before
distribution. The supported implementation now uses MLX only; this retained
experiment is historical evidence, not a second runtime path for the application.

References: [model](https://huggingface.co/mlx-community/Qwen3-Embedding-0.6B-8bit),
[runtime](https://github.com/Blaizzy/mlx-embeddings),
[knowledge evidence](../../knowledge/evidence/adr-0024-local-knowledge.md).
