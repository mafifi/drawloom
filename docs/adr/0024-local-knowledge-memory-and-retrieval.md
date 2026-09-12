# ADR 0024: Local knowledge, memory and evidence-based retrieval

- Status: Accepted
- Date: 2026-09-12
- Accepted: 2026-09-12

## Context

[ADR 0022](0022-knowledge-memory-context-experiment.md) explored capture, curation and
retrieval with disposable storage. This decision turns those lessons into a local
implementation without importing experiment code. Knowledge and memory are shared
across the local user's projects and workbenches. Context remains the agent's job,
with narrow retrieval guidance and tools rather than transcript replay.

[ADR 0023](0023-knowledge-memory-authorization-boundaries.md) governs enforcement.
Cross-project scope is not unrestricted disclosure: trusted identity and the
selected authorization implementation govern intake, retrieval, evidence expansion,
assessment disclosure and export. Core does not assign enterprise classifications
or dictate inheritance rules.

## Decision

SQLite is the authoritative local store, separate from conversation history.
Observations, source revisions, claims and directed evidence relationships are
stored transactionally. Supporting, contrary and historical evidence remain
distinct. Source changes immediately make dependent claims stale; withdrawal
preserves provenance, while explicit deletion removes retained content and indexes.
Maintenance publication uses revision checks and an atomic processing checkpoint.

Portable schema-backed interfaces cover intake, retrieval, maintenance storage,
assessment and embeddings. Providers are chosen in composition roots. The same
conformance suite must exercise contrasting implementations. Domain guidance and
confidence interpretation belong to assessment configuration, not a universal
formula in core.

Lexical and local semantic search produce bounded candidates. Stored relationships
then recover current authorized claims and evidence, with explicit pagination for
larger chains. Embeddings are indexes of particular content revisions and model
configurations, never authoritative knowledge. Missing/rebuilding indexes leave
text search available with a visible degraded status. OKF is an explicit,
authorized export, not another editable store.

The selected embedding provider is **Qwen3-Embedding-0.6B, 8-bit MLX on Apple
Silicon**, using a persistent local inference worker supervised by the Node
composition. The maintainer selected this after the measured CPU/Metal comparison
and authorised revising this ADR before its first commit. The portable embedding
interface is unchanged. MLX is the only supported embedding implementation;
the experimental CPU workers and model choices are removed, not retained for
hypothetical compatibility. Unsupported hardware retains text search and a setup
explanation. Historical CPU evaluation results remain as comparison evidence.

Model weights and the isolated inference runtime are **not bundled in Drawloom**.
The user chooses Download and install in Knowledge settings. Setup downloads
pinned, verified artifacts beneath the selected Drawloom data directory (normally
`~/.drawloom/knowledge/models`), with progress, cancellation, retry and readiness.
An available `uv` executable is a reported prerequisite; Drawloom does not install
global tooling. The runtime uses its own environment, not the user's global Python.
Model/runtime licences remain applicable to these independently downloaded files.
No inference download, hosted fallback or remote model code execution is allowed.

The worker retains the loaded model between bounded requests and requires Metal;
it exits with the knowledge host. Query formatting, pooling, normalization and
runtime/model revisions form part of its indexing fingerprint. A backend change
rebuilds its index before switching; incompatible vectors are never mixed.
Experimental ONNX vectors cannot be reused as MLX vectors. Rebuilding an index
does not delete authoritative knowledge or reinterpret the old vectors.
SQLite extension loading must not change the library beneath existing databases.

We inspected [oMLX](https://github.com/jundot/omlx) as a hosting alternative. Its
[embedding engine](https://github.com/jundot/omlx/blob/7cbb407168ae628bbe0d7fe385be70e0954af303/omlx/engine/embedding.py)
uses `mlx-embeddings`; its generation-oriented KV caching is not evidence of faster
embedding retrieval. The measured, narrower worker avoids a second HTTP server,
admin UI and model-server lifecycle. oMLX remains a possible provider implementation
if measured multi-model or batching needs justify it; no extra hosting abstraction
or claim of oMLX performance is introduced here.

The target Mac's Bun SQLite rejects dynamic extension loading. A fresh Node
24.20.0 process loads sqlite-vec 0.1.9 with SQLite 3.53.4 successfully. Therefore
the local knowledge provider runs in a managed Node process with bounded requests;
the existing history database keeps its current runtime and library. This is a
provider implementation choice, not an additional storage capability or protocol
exposed to plugins.

Nightloom uses the existing Temporal implementation with an explicit host-owned
scope. Plugin/project ownership is unchanged. It processes bounded pending work
at 50 updates or one hour of age, only while the host runs. Assessment is serial,
with Run now and Pause controls. Codex initially supplies judgement through a
replaceable assessment interface; the coordinator validates references and stale
inputs before publication. Uncertain submissions are reconciled, not blindly
repeated. Individual knowledge judgements do not require human approval.
One assessment covers a bounded batch, initially up to 50 work units. If the
combined evidence does not fit, the exact owner-bound lease is released without
advancing its checkpoint and the batch size is reduced. Single oversized units
remain explicitly blocked. No partial evidence package or prefix acknowledgement
is published as if the entire batch had been processed.

The configured assessment model initially recommends 5.6-terra where available;
unsupported selection is explicit. Defaults are five minutes per assessment, six
automatic starts and thirty automatic minutes per day. They bound use, not exact
tokens or spend. Exhausted limits require an explicit manual override.

## Integration and exclusions

The existing host exposes knowledge tools and safe attributable observations,
excluding arbitrary payloads, hidden reasoning and recursive maintenance capture.
The shared UI provides search, evidence inspection, readiness, setup, maintenance
controls and export. A standard installable Git MCP package collects configured
committed files without executing repository code and acknowledges only durable
intake. Source collection stays plugin-owned.

No enterprise administration, production ingestion, hosted embeddings, universal
crawler, graph query language, transcript replay, automatic retention pruning,
private browser protocol or migration of disposable experiment state is included.

## Evidence and acceptance

The maintainer accepted this decision and its existing implementation on
2026-09-12, retaining local hybrid retrieval and proceeding with Drawloom
development. The [delivery plan](../plans/adr-0024-local-knowledge.md) records the
delivery history; it is not the authority for outstanding acceptance conditions.
The [evidence record](../../knowledge/evidence/adr-0024-local-knowledge.md) separates
observed runtime checks from verification deferred to follow-up work.
The [implementation reference](../design/local-knowledge.md) maps the portable
interfaces, local processes, source controls and current limitations to code.
The original evaluation gate required shared conformance, actual host/source/UI integration, live
Codex assessment, failure/restart and authorization tests, plus measured embedding
value on held-out questions. Compare text/hybrid at 10,000 records and stress at
100,000, including at least 30 warm queries. The initial 10,000-record hybrid p95
target is two seconds on the recorded Mac. If neither embedding model earns its
cost, bring the evidence back rather than claiming success. That review has now
taken place: the maintainer explicitly accepts the implementation without treating
the small synthetic question set as a decisive test of production retrieval value.

## Accepted trade-offs and follow-up

The completed checks demonstrate implemented interfaces, local inference and
integration, with a modest retrieval/answer benefit on the tested corpus. They do
not establish broad production value. Both evaluated models met the 10k latency
target; the 100k corpus was ingested but semantic indexing and measurement were
not completed. Acceptance does not relabel that run as passing.

Retaining hybrid retrieval adds model setup, maintenance, local indexing and search
resource costs. It does not inherently add Codex assessments: Nightloom assembles
evidence through stored relationships independently of semantic search. Actual
answer-context token differences have not been measured.

The maintainer explicitly accepts the following measured resource costs for
potential semantic-retrieval benefits that are **not yet demonstrated at production
quality or scale**. Measurements used 10,000 searchable records on an Apple M2
Ultra (24 physical cores, 64 GiB RAM), with 30 warm queries per model:

| Measured cost | Text-only baseline | Qwen3 0.6B q8 hybrid | Nomic v1.5 q8 hybrid |
| --- | ---: | ---: | ---: |
| Warm search median / p95 | about 0.6 / 4.7–4.9 ms | 863 / 900 ms | 650 / 757 ms |
| Sampled search-process peak memory | about 190 MB | 2,005 MB | 687 MB |
| Historical indexing + evaluation elapsed (see correction below) | Not applicable | 532 s (8 min 52 s) | 270 s (4 min 30 s) |
| Sampled indexing-process peak memory | Not applicable | 2,146 MB | 717 MB |
| Historical indexing + evaluation CPU time, summed across threads | Not applicable | 4,676 s | 1,672 s |
| Store including database, WAL and shared-memory files | about 25 MB | 253 MB | 199 MB |

Memory and storage use decimal MB. These are benchmark-process measurements,
not isolated model allocations or the whole desktop's memory use. Store sizes
exclude downloaded model artifacts. First measured hybrid searches took about
1,015 ms for Qwen and 676 ms for Nomic, after indexing had already loaded the
model; these are not fully cold application/model startup measurements. Indexing
is incremental after initial setup; its recorded CPU time includes parallel
threads and is not elapsed user waiting time.

Measurement correction, 2026-09-12: the original indexing timer also included the
subsequent 54 searches. Its elapsed/CPU totals above are retained but relabelled;
per-search latency remains valid. The
[MLX acceleration follow-up](../../knowledge/evidence/adr-0024-mlx-acceleration.md)
records the corrected timing and CPU/GPU comparison. The initial implementation
used ONNX on CPU; the maintainer subsequently selected MLX before this ADR's first
commit. The table above remains historical evidence, not the selected GPU runtime's
resource profile.

For the selected MLX Qwen path, corrected 10k indexing took **282 seconds**, versus
482 seconds for a fresh ONNX CPU control (1.71 times faster, 41.5% less elapsed
time). MLX worker startup added 1.31 seconds. Warm hybrid search median/p95 were
788/816 ms, versus 852/870 ms for that CPU control. The separate Node and Python
process peak-memory upper bound was about 1.31 GB, versus 2.01 GB for CPU; those
process peaks were not simultaneous samples. Metal peak allocation was 798 MB of
shared memory and must not be added to process memory as separate GPU RAM.

The maintainer accepts those local resource costs for potential semantic value,
not proven production upside. Query embedding round trips averaged about 11 ms;
most complete-query time remains outside inference. Current vector queries scan
eligible stored vectors. Faster GPU inference does not establish that total search
benefits compound with corpus size. The 10k results are not a latency or memory
guarantee at 100k or on other machines; there is no additional model judgement
or answer-quality claim from the acceleration experiment.

Stronger representative workloads and production experience will assess whether
semantic retrieval earns these costs. Preserve the frozen evaluations rather than
retuning them to claim success. Revisit or supersede this ADR if that evidence
does not support the choice; provider substitution and lexical fallback remain.
No additional synthetic quality sprint is required for this acceptance.

The evidence record also retains unperformed browser/native OKF-download checks,
the remaining live project/tool/source journey and the complete restart/failure
matrix as follow-up verification. Acceptance is not a claim that every original
scenario passed, enterprise policy is deployed, or production readiness is proven.

## References

- [Knowledge and memory survey](../reference/knowledge-memory-survey/README.md).
- [Authorization survey](../reference/authorization-survey/README.md).
- [ADR 0021](0021-local-temporal-orchestration.md), supported local orchestration.
- [Architecture principles](../../ARCHITECTURE.md), proportional efficiency,
  substitution, security and reference-led boundaries.

Exact implementation, model artifacts, measurements and known limits are linked
in the evidence record. Research inspection is not execution evidence.
