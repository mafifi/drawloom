# Hindsight: retain, consolidate, recall and reflect

## Evidence boundary

Inspected 2026-09-11 at commit `48b62ee08170b464f4c42b6f133b7cb798a59b21` in
`/Users/afifim/Development/hindsight`, newly shallow-cloned from public
`vectorize-io/hindsight`. The root [MIT licence](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/LICENSE#L1-L21)
covers repository source, with its notice and warranty conditions; it does not
grant hosted service access or license third-party model weights. Source and
representative test bodies were inspected, not executed. No database, model,
content processing or runtime installation was performed.

This report describes the current code, rather than assuming the original paper
or benchmark descriptions remain a complete implementation map. Hindsight Cloud
and enterprise deployment claims are distinct from the public engine's observed
behaviour. The [README links the paper, benchmarks and Cloud](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/README.md#L5-L12);
their existence is not performance or production verification here.

## Capture and entrypoint responsibilities

The Python client exposes
`retain(bank_id, content, timestamp=None, context=None, document_id=None, metadata=None, entities=None, resolve_entities=None, tags=None, update_mode=None, retain_async=False, operation_id=None) -> RetainResponse`.
`content` may be text or ordered content blocks; image-containing blocks require
a vision-capable server-side extraction model. The caller determines bank,
source grouping, event time, metadata and tags. Entity hints can be resolved
against existing entities or deliberately stored as written. `update_mode`
selects replacement or append. Async-language execution (`aretain`) and
background submission (`retain_async=True`) are different choices.
[Client signature and semantics](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-clients/python/hindsight_client/hindsight_client.py#L346-L380).

Inside the engine, `retain_batch_async(bank_id, contents, *, request_context, ...)`
performs extraction and storage, while
`submit_async_retain(bank_id, contents, *, request_context, document_tags=None, strategy=None, operation_id=None)`
queues durable work. This separation matters to a consumer reporting “saved”:
accepted submission, raw-fact persistence, observation consolidation and refreshed
mental models are different completion points. The request context enters tenant
authentication; optional operation validation runs even when an operation ID
resolves to an existing submission.
[Execution entrypoint](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L5258-L5302),
[submission and validation](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L20806-L20856).

The pipeline extracts semantic facts, entity names and temporal information using
an LLM. Extracted facts distinguish world information from experience, with
event-time fields separate from later storage/curation metadata. There are
normalization and temporal fallback steps; a stored “fact” is model-produced
information, not a verified assertion. Source text and structured claims remain
different records.
[Extraction implementation](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/retain/fact_extraction.py#L1-L24),
[extraction result contract](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/response_models.py#L162-L183).

## Source and claim storage

The default memories extension stores facts in `memory_units`, relations in
`memory_links` and `unit_entities`, and retrieves with SQL. The configured
extension can replace that store; this is a real implementation seam, not proof
that every extension shares identical transaction or deletion guarantees.
In particular, the retained source contains a store-owned streaming path that
delegates entity resolution and atomicity to the extension. The default path
also retains document/chunk records and content hashes, providing a route from
recalled claim to stored source.
[Default and replaceable store](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/memories/__init__.py#L1-L64),
[store-owned write branch](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/retain/orchestrator.py#L825-L879).

Document replacement is a lifecycle operation, not just a vector upsert.
The default full-replace path computes a sanitized content hash, discovers
outgoing facts, invalidates their dependent observations, then replaces the
document on the first batch. Chunked work must avoid deleting facts it just
inserted. Raw document text storage can be disabled; chunk hashes remain for
idempotency while chunk text is empty. This changes recoverable evidence and
reflection capabilities without making extracted claims disappear.
[Replacement handling](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/retain/fact_storage.py#L187-L255),
[chunk text versus hashes](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/retain/chunk_storage.py#L277-L316).

## Consolidation, provenance and retraction

Observations are derived memory units. Consolidation asks for typed create,
update and delete actions, with contributing source-fact IDs. It can combine
support across retained facts, preserve history and deduplicate observations.
Writes recheck that contributing sources remain live after expensive model work,
so an extraction started before a concurrent deletion does not simply resurrect
all its deleted grounding. `source_memory_ids` and `proof_count` express support
and aggregation, not calibrated truth probabilities; justification strings are
diagnostic rather than independent evidence.
[Action schema](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/consolidation/consolidator.py#L790-L855),
[live-source check and observation update](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/consolidation/consolidator.py#L2639-L2720).

Deletion has a notably conservative dependency rule: if **any** contributing
fact disappears, the whole dependent observation is stale and is deleted;
surviving source facts have their consolidation marker reset for regeneration.
This differs from subtracting a support count while keeping the same synthesized
text. Explicit document deletion may enqueue consolidation when auto-consolidation
is enabled and separately submits refreshes for retracted mental-model grounding.
The code catches and logs consolidation submission failure, so source deletion
does not prove all regenerated descendants already exist or that refresh has
succeeded. Attachment and graph cleanup are additional dependent concerns.
[Shared stale-observation contract](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/retain/fact_storage.py#L146-L184),
[post-delete refresh submission](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L9610-L9633).

Mental models are separately stored, query-directed synthesized material with
refresh information and optional staleness reporting. They are not synonymous
with raw facts or automatic observations. Their list contract exposes content,
source query, tags, last refresh and last memory seen. A consumer can therefore
present derived-material freshness separately from source capture success.
[Mental-model projection](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L15472-L15575).

## Background work, replay and checkpoints

Async retain optionally accepts a caller-supplied UUID. Reuse within the same
bank and operation type returns the original operation; a conflicting bank or
type is rejected. Crucially, replay resolves by ID, **not payload equality**:
reusing an ID for different contents still returns the original. The client
warns that sync retain ignores this ID. A caller must preserve the identity of
the logical request and must poll operation status rather than interpret
submission replay as fresh processing.
[Replay resolver](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L20777-L20825),
[sync warning](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-clients/python/hindsight_client/hindsight_client.py#L85-L96),
[different-payload replay test](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/tests/test_async_retain_operation_id.py#L121-L167).

The worker claims durable operations with locking and tracks processing,
completion, failure and retry scheduling. Recovery resets owned processing rows
to pending while consuming retry allowance; exhausted tasks become failed and
their parent aggregators are updated. This is stronger than a process-local
queue, but it is not evidence of exactly-once model calls or a successfully
tested deployment. Cancellation is checked between documents/sub-batches, not
equivalent to instant cancellation of every in-flight model request.
[Worker claiming](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/worker/poller.py#L524-L568),
[bounded recovery](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/worker/poller.py#L1271-L1343),
[between-document cancellation](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L5485-L5500).

Consolidation has a particularly revealing checkpoint: each committed batch
unions pending mental-model refresh tags into the operation's durable payload
inside the batch's witness transaction. A retry skips already consolidated facts
but retains their refresh obligations. Tracking only the source cursor would
lose those obligations after a mid-round crash.
[Durable refresh obligation](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/consolidation/consolidator.py#L1291-L1336).

## Recall and model-context consumption

`recall(bank_id, query, types=None, max_tokens=4096, budget="mid", ...)`
returns structured memories, optionally entities, chunks and source facts.
The default pipeline combines semantic, keyword, graph and temporal retrieval,
then fusion, reranking, diversification and token filtering. `max_tokens` counts
fact text; separately requested source/chunk/entity material has separate limits.
It is therefore not a hard cap on the complete serialized API response or the
consumer's eventual model prompt.
[Recall client contract](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-clients/python/hindsight_client/hindsight_client.py#L504-L564),
[engine pipeline and budget semantics](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/memory_engine.py#L7260-L7285).

Two filters deserve explicit caller care. Default `any`/`all` tag matching
includes untagged memories; strict modes exclude them. A temporal window boosts
the temporal retrieval arm but does **not** exclude all out-of-window facts.
Neither should be advertised as a universal authorization or hard date boundary.
Scores are retrieval/reranking measures. Optional observation preference removes
raw facts already represented by returned observations using source provenance.
[Exact filter semantics](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-clients/python/hindsight_client/hindsight_client.py#L544-L561).

`reflect(bank_id, query, budget="low", context=None, max_tokens=None, response_schema=None, ...)`
goes further: it runs an internal tool-using synthesis agent over memories and
mental models, influenced by bank identity/directives. Optional `include_facts`
returns grounding and optional traces expose tool/model calls. The engine removes
raw-source expansion when source-text storage is disabled. Reflection is an
answer-generation operation, whereas recall lets an external agent own context
composition. Its page-length target and transport completion-token cap are also
separate controls.
[Reflect client](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-clients/python/hindsight_client/hindsight_client.py#L590-L644),
[agent tool and budget boundaries](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/reflect/agent.py#L524-L590).

Mental-model lookup is not another layer returned by public `recall`. Reflection
uses a separate `tool_search_mental_models` operation: the default path searches
the `mental_models` table by embedding, while a store-owned path ranks knowledge
pages before hydrating their model rows. Results include content and freshness.
Observations, by contrast, are memory facts that recall can retrieve alongside
world/experience facts when requested.
[Separate mental-model search implementation](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/reflect/tools.py#L90-L255).

## Scoping, prerequisites and negative findings

Banks group memories; tags narrow retrieval. Tenant authentication and optional
operation validation are separate. The default tenant extension accepts all
requests into one schema. The built-in API-key extension validates one configured
key and also returns one schema; true per-tenant schema selection requires a
different extension. A bank ID is therefore not evidence of access control.
[Default and API-key tenant implementations](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/extensions/builtin/tenant.py#L8-L90).

The documented default deployment uses PostgreSQL/pgvector, optionally packaged
with embedded PostgreSQL, plus extraction models and embedding/reranking
resources. Oracle is another backend, not a no-database local mode. Local model
availability does not prove acceptable extraction accuracy, throughput or hardware
cost. A concrete discrepancy limits broad backend-parity claims: although the
README advertises full Oracle feature parity, observation semantic deduplication
explicitly skips Oracle because its merge path uses PostgreSQL-specific SQL.
Cloud backups, team features and SLA are product promises, not outcomes tested
by reading this repository.
[Deployment claims](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/README.md#L64-L117),
[explicit Oracle dedup exception](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/hindsight_api/engine/consolidation/consolidator.py#L215-L225).

Representative tests read, not run: same-ID submission replay/concurrency and
cross-bank rejection; the simulated mid-round consolidation crash preserving
refresh tags. Their assertions describe intended regression coverage, not live
database/model recovery verification. No benchmark superiority, cross-provider
conformance or enterprise authorization guarantee is established by this survey.
[Replay tests](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/tests/test_async_retain_operation_id.py#L58-L167),
[crash regression test](https://github.com/vectorize-io/hindsight/blob/48b62ee08170b464f4c42b6f133b7cb798a59b21/hindsight-api-slim/tests/test_consolidation_multi_round_refresh_3411.py#L289-L380).

## Candidate Drawloom learnings, not decisions

Useful comparison candidates are explicit submission-versus-materialization
status; source-to-derived lineage with retraction obligations; typed retrieval
results separated from provider-owned answer generation; and checkpoints that
retain downstream work obligations as well as source progress. Tag and temporal
semantics should be precise at any consumer boundary. The extensive engine does
not itself justify importing its lifecycle machinery into Drawloom: the
smallest necessary contract still needs a real consumer and contrasting-provider
evidence, followed by the repository's decision process.

## Diagram source map

These nine nodes provide a diagram-ready lifecycle. Paths are relative to the
inspected Hindsight checkout; all immutable links above use its recorded SHA.

| Node | Boundary and source |
| --- | --- |
| Caller capture | Bank, source/document, text, date, tags; `hindsight-clients/python/hindsight_client/hindsight_client.py:346` |
| Durable operation | Submit, identity, auth and child work; `hindsight-api-slim/hindsight_api/engine/memory_engine.py:20806` |
| Extract and retain | LLM extraction then document/claim writes; `hindsight-api-slim/hindsight_api/engine/memory_engine.py:5258` |
| Source and raw facts | Document/chunk hashes plus memory units; `hindsight-api-slim/hindsight_api/engine/retain/fact_storage.py:187` |
| Observations | Create/update/delete with source support; `hindsight-api-slim/hindsight_api/engine/consolidation/consolidator.py:790` |
| Mental models | Derived query-directed content and freshness; `hindsight-api-slim/hindsight_api/engine/memory_engine.py:15472` |
| Hybrid recall | Retrieval, fusion, reranking, budgets; `hindsight-api-slim/hindsight_api/engine/memory_engine.py:7260` |
| Reflection or caller context | Internal synthesis or external composition; `hindsight-clients/python/hindsight_client/hindsight_client.py:590` |
| Retraction and repair | Delete stale observations, reset survivors, enqueue refresh; `hindsight-api-slim/hindsight_api/engine/retain/fact_storage.py:146` |

Edges: caller → operation → extract/retain → source/raw facts → observations →
mental models; raw facts and observations → recall → reflection/caller context;
mental models → separate mental-model lookup → reflection/caller consumption;
replacement/deletion → retraction → observations and mental-model refresh.
Draw operation → observations and operation → mental models as background edges;
label durable refresh obligations with `engine/consolidation/consolidator.py:1291`.
Label retries from operation back to execution with `worker/poller.py:1271`.
Keep tenant authentication as a separate enclosing boundary, not a bank/tag node.
