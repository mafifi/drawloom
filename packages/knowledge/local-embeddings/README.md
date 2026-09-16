# Local embeddings provider

This Node-hosted provider implements Drawloom's local embedding contract
using the official Qwen3 Embedding 0.6B Q8_0 GGUF model with a pinned
`llama-server` build on Apple Silicon. Read this if you are setting up
local semantic embeddings, or working on the provider itself. Lexical
retrieval remains available when the local semantic runtime is absent, so
this package is an enhancement rather than a hard dependency.

## Setup and consent

Setup requires explicit consent before it downloads or activates anything,
and verifies both the runtime archive and the GGUF model before atomically
activating them — a partially verified pair is never made active.

Runtime publication is kept separate from this package: the known runtime
manifest deliberately has no download URL, so setup reports
`runtime_unavailable` until trusted host composition supplies the published
artifact descriptor. Browser configuration cannot supply this override,
since only a trusted host can authorise where the runtime binary comes
from.

## The worker

`LlamaEmbeddingWorker` owns one persistent, authenticated loopback server.
It runs the model with an explicit local path, the Metal device,
embedding-only and offline modes, last-token pooling, and no Web UI — a
narrow configuration chosen to keep the server from doing anything beyond
serving embeddings to this process. It tokenizes every formatted input
before inference, enforces per-item and aggregate budgets, and serializes
embedding requests so only one bounded request is admitted at a time. It
validates model identity, indexes, dimensions, finite values, and L2
normalization on every response. Cancellation, timeouts, and uncertain
failures reap the server before another request may start, so a stuck
request cannot leave a zombie process behind.

## Removing the old runtime

`cleanupObsoleteMlxRuntime()` is the explicit cleanup boundary for the
exact legacy MLX runtime and model directories this package once used. It
refuses symlinked roots or targets and does not scan by name, so it can
only ever remove the specific paths it was told to own.

See [local-knowledge-runtime](../local-knowledge-runtime/RETRIEVAL.md) for
how these embeddings feed retrieval, and
[knowledge](../knowledge/README.md) for the `KnowledgeEmbeddings` contract
this package implements.
