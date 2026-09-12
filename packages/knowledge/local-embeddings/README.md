# Local embeddings provider

This Node-hosted provider implements Drawloom's local embedding contract. It
supports the `qwen3-embedding-0.6b-mlx` worker on Apple Silicon.

MLX setup requires macOS on Apple Silicon, an available `uv` executable, and
explicit download consent. Setup installs pinned Python 3.12.13 and the
hash-locked Python dependencies into the supplied model root, with uv's managed
Python and cache kept there too. Model weights are downloaded and verified into
that root separately. Neither the runtime nor weights are bundled with Drawloom,
and there is no hosted or CPU fallback. Lexical retrieval remains available when
the MLX index is unavailable.

After setup reports both `directory` and `runtimeDirectory`, composition selects
`MlxEmbeddingWorker`. Its structural `embed`/`close` facade is consumed by
`createKnowledgeEmbeddings`.

`mlx-embeddings` is a GPL-3.0-only runtime dependency. Installing it separately
does not change its licence. See [ADR 0024](../../../docs/adr/0024-local-knowledge-memory-and-retrieval.md)
and the linked MLX evidence for the decision, measured environment and limits.

Warm readiness uses conservative interpreter and top-level `site-packages`
directory identities to avoid importing MLX for every query. It detects ordinary
runtime replacement, addition and removal; it is not an arbitrary nested-file
integrity or tamper-detection guarantee. Cold readiness verifies real imports.
