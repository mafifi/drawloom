# HippoRAG 2: source-aware graph retrieval, not conversational memory

## Evidence boundary

Inspected 2026-09-11 at commit `1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff`
in `/Users/afifim/Development/HippoRAG`, newly shallow-cloned from the public
`OSU-NLP-Group/HippoRAG` repository. The checkout was clean and its root
[MIT licence](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/LICENSE#L1-L20)
applies to the inspected source. Source and representative tests were read, not
executed. No dependencies, models, datasets or services were installed or run.
This is an implementation survey of the pinned HippoRAG 2 branch, not a
reproduction of its ICML experiments or an accepted Drawloom design.

The project describes itself as a non-parametric memory/RAG research framework.
In implementation terms, it builds a persistent, source-aware retrieval index
over supplied documents. It does not capture conversations, decide which user
events deserve memory, or maintain an agent's active context automatically.
[Project and paper positioning](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/README.md#L1-L37).

## Capture and extraction

The central constructor is
`HippoRAG(global_config=None, save_dir=None, llm_model_name=None, llm_base_url=None, embedding_model_name=None, embedding_base_url=None, ..., extraction_llm=None, qa_llm=None, embedding_model=None, text_preprocessor=None, ..., index_identity=None, embedding_provider=None)`.
Its principal write API is `index(docs: List[Union[str, Chunk]])`. `Chunk` holds
`content`, an optional `source_id` and arbitrary metadata. The default text
preprocessor makes one chunk per supplied string; callers needing document
segmentation or richer provenance must supply and identify another preprocessor.
[Constructor signature](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L88-L106),
[index signature](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L488-L515),
[chunk shape](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/utils/misc_utils.py#L35-L40).

Indexing embeds the chunk text, records `source_id` inside chunk metadata,
reuses OpenIE output for existing content hashes, and asks the extraction model
for named entities and triples only for missing chunks. It separately embeds
chunks, normalized entities and facts. The graph is then rebuilt from current
contribution maps: passage-to-entity edges connect chunks to extracted entities,
fact edges connect entity pairs, and embedding-neighbour synonym edges connect
entities. This is derived knowledge: an OpenIE triple is not a verified source
fact merely because it has a source edge.
[Chunk/OpenIE pipeline](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L514-L561),
[graph construction](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L563-L583).

String identities are content-addressed using prefixed MD5. Equal normalized
content is therefore one chunk/fact/entity identity. Re-indexing duplicate chunk
content does not create a second occurrence; different metadata replaces the
one metadata entry with a warning. This supports incremental deduplication but
does not preserve multiple document versions or independent duplicate-source
records by itself.
[Content identity](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/utils/misc_utils.py#L153-L164),
[duplicate metadata behaviour](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L520-L530).

## Linking and retained state

The persistent state is split across three embedding stores, OpenIE JSON,
chunk-metadata JSON, an igraph pickle and an index manifest. Local Parquet is
the default vector store; Qdrant, Chroma and Milvus are optional. Graph and
Parquet writes use temporary files/file locks in their respective components,
whereas chunk metadata is directly overwritten. There is no transaction that
atomically commits all files and remote collections together. A crash can leave
partial generations; consistency checks can reject several mismatches on the
next operation, but the inspected code does not provide journal replay or a
general automatic repair.
[State paths](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L254-L305),
[direct metadata write](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L408-L416),
[graph save](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L1668-L1683),
[local vector save](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/embedding_store.py#L179-L226).

The manifest is a meaningful reuse guard. It binds an index to normalization,
embedding provider/model/endpoints/backend namespace, OpenIE configuration,
graph settings and component identities. Existing state without a manifest or
with a changed identity is rejected instead of silently mixed. Injected index
producers require a caller-supplied stable `index_identity`. The automatic
identity for an injected component is only its Python module and qualified class
name, however, so the caller's explicit value is what can distinguish code or
configuration changes behind the same class name.
[Manifest contents](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L307-L335),
[injection guard](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L185-L191),
[component identity](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/utils/state_utils.py#L54-L57),
[manifest validation](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/utils/state_utils.py#L60-L91).

## Updates and deletion

There is no public update/version API. A caller can add new content
incrementally, or delete exact document text and index replacement text. The
delete path computes the chunk's content hash, removes its chunk embedding and
metadata, then uses source-contribution counts to remove only facts and entities
no longer supported by another indexed chunk. It rebuilds the graph maps and
persists updated OpenIE/graph state. This is substantially more source-aware
than deleting graph nodes indiscriminately, but the deletion key is exact
content rather than a stable external source/version identity.
[Delete contract and preparation](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L584-L642),
[source-aware cleanup and persistence](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L643-L692).

Deletion is not a compliance erasure guarantee: model providers may already
have processed the text, experiment logs/caches may exist outside the index,
and the code offers no retention policy, tombstone, audit event or proof that
every external vector backend replica has erased data. Nor does replacement
retain lineage from an old value to a new one.

## Retrieval and active context

`retrieve(queries: List[str], num_to_retrieve: int = None) -> List[QuerySolution]`
first verifies the persisted graph, OpenIE state and vector-store IDs. For each
query it embeds the text, scores facts, asks a DSPy/LLM filter to select relevant
facts, and seeds personalized PageRank with associated entities plus dense
passage scores. If no facts survive (including a reranker exception), it falls
back to dense passage ranking. Results contain document text, numeric scores,
metadata and graph seeds.
[Retrieval pipeline](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L693-L791),
[state preparation](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L1739-L1805),
[query result shape](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/utils/misc_utils.py#L43-L78).

The scores are ranking signals, not calibrated epistemic confidence. Dense
scores are min-max normalized within the candidate set, graph scores come from
PageRank, and the reranker's returned confidence is `None`. A high score does
not show that the source is true, current or permitted.
[Dense score normalization](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L1919-L1956),
[graph search](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L1997-L2110).

`rag_qa` goes beyond recall: it takes the top configured documents, formats a
QA prompt and invokes the QA LLM. That is one bundled reading strategy, not a
general active-context manager. It does not combine retrieved material with an
agent's current conversation, assign cross-tool token budgets or preserve an
application's own system instructions. `retrieve` remains the cleaner boundary
for a caller that owns those decisions.
[RAG-QA entrypoint](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L881-L955),
[QA context assembly](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/src/hipporag/HippoRAG.py#L1106-L1166).

## Provenance, scope and authority

`source_id` and arbitrary chunk metadata can carry useful origin information;
source-aware edges make it possible to remove derived facts when their last
supporting chunk disappears. They do not include a mandatory source revision,
quotation span, extraction-model confidence, reviewer decision or temporal
validity interval. OpenIE provenance in the manifest identifies the producer
configuration for compatibility; it is not per-fact evidence or truth
calibration.

Similarly, `save_dir` and vector-store namespaces separate physical indexes but
are not authenticated principals. The library does not check users, projects,
grants, ACLs or entitlements at index or retrieval time. A caller that places
multiple parties' content in one index can retrieve across them. Backend
namespace selection must follow an already authorized scope; it cannot be used
as the authorization decision itself.

## Local prerequisites and maturity

The package targets Python 3.10 and pins heavyweight dependencies including
PyTorch, Transformers and igraph. Default examples use OpenAI-compatible model
and embedding endpoints; local modes can require downloaded models, vLLM and
GPU resources. Local Parquet needs no separate vector server, while remote
Qdrant, Chroma or Milvus require their optional packages and, where applicable,
services and credentials.
[Dependency surface](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/setup.py#L6-L48),
[installation and credentials](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/README.md#L41-L90),
[vector backends](https://github.com/OSU-NLP-Group/HippoRAG/blob/1438aba3fc44ff10573e5a5e1e7cc3c7f9794aff/README.md#L217-L269).

This is a serious research codebase with explicit state-consistency machinery,
but the source inspection does not establish transactional durability,
multi-tenant safety, production operations or performance under a particular
consumer workload.

## Candidate Drawloom learnings, not decisions

The implementation supports comparing raw source chunks, model-derived facts,
graph associations and retrieved context as separate layers. Its index manifest
also demonstrates why persisted derived state needs a producer identity. The
partial-commit and exact-content deletion limits show why recovery and source
version semantics cannot be inferred from “persistent RAG.” These are evaluation
questions only. This report does not propose a graph, OpenIE, PageRank, vector
backend or Drawloom contract.

## Diagram source map

Use these nine nodes for a lifecycle map. Paths are relative to the inspected
checkout; immutable links above carry the same revision.

| Node | Boundary and source |
| --- | --- |
| Caller documents | Strings or source-bearing `Chunk`s; `src/hipporag/utils/misc_utils.py:35` |
| Text preprocessing | Caller-injectable chunk production; `src/hipporag/HippoRAG.py:418` |
| Chunk embeddings | Content-addressed passage store; `src/hipporag/HippoRAG.py:520` |
| OpenIE extraction | Per-missing-chunk entities and triples; `src/hipporag/HippoRAG.py:533` |
| Entity/fact embeddings | Separate derived indexes; `src/hipporag/HippoRAG.py:552` |
| Source-aware graph | Passage, fact and synonym edges; `src/hipporag/HippoRAG.py:563` |
| Persistent state set | Manifest, JSON, graph pickle and vector stores; `src/hipporag/HippoRAG.py:281` |
| Hybrid retrieval | Fact rerank, dense seeds and personalized PageRank; `src/hipporag/HippoRAG.py:693` |
| QA/caller context | Optional bundled QA or caller-owned composition; `src/hipporag/HippoRAG.py:881` |

Edges: caller documents → preprocessing → chunk embeddings and OpenIE extraction;
OpenIE extraction → entity/fact embeddings → source-aware graph; all indexed
layers → persistent state set; query + persistent state set → hybrid retrieval
→ QA/caller context. Add delete → chunk embeddings/OpenIE/graph labelled
“exact-content removal with contribution counts” from
`src/hipporag/HippoRAG.py:584`. Add a dashed boundary around the persistent
state nodes labelled “component-level atomicity; no cross-store transaction.”
