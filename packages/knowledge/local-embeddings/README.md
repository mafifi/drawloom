# Local embeddings provider

This Node-hosted provider implements Drawloom's local embedding contract with
the official Qwen3 Embedding 0.6B Q8_0 GGUF and a pinned `llama-server` build on
Apple Silicon. Lexical retrieval remains available when the local semantic
runtime is absent.

Setup requires explicit consent and verifies both the runtime archive and GGUF
before atomically activating them. Runtime publication is separate: the known
runtime manifest deliberately has no download URL, so the supported setup
reports `runtime_unavailable` until trusted host composition supplies the
published artifact descriptor. Browser configuration cannot supply this
override.

`LlamaEmbeddingWorker` owns one persistent, authenticated loopback server. It
uses an explicit local model, Metal device, embedding-only and offline modes,
last-token pooling, and no Web UI. It tokenizes every formatted input before
inference, enforces per-item and aggregate budgets, serializes bounded embedding
requests, and validates model identity, indexes, dimensions, finite values and
L2 normalization. Cancellation, timeouts and uncertain failures reap the server
before another request may start.

`cleanupObsoleteMlxRuntime()` is the explicit cleanup boundary for the exact
legacy MLX runtime/model directories. It refuses symlinked roots or targets and
does not scan by name.
