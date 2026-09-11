# Graphiti: episode-to-temporal-graph lifecycle

## Evidence boundary

Inspected 2026-09-11 at commit `c64e45c111fd43ca7f5536a7f84a73f6acafd5b1` in
`/Users/afifim/Development/graphiti`, newly shallow-cloned from the public
`getzep/graphiti` repository. The root [Apache-2.0 licence](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/LICENSE#L1-L201)
applies to that source; it is not a licence to Zep's hosted service or its
proprietary database. Source and representative tests were read, not executed.
No dependencies, graph servers or models were started. This is an implementation
survey, not a benchmark reproduction or accepted Drawloom design.

The repository explicitly distinguishes the Graphiti framework from Zep's
managed context infrastructure: user/thread management, managed governance,
production service guarantees and its proprietary Context Graph Engine belong
to the product comparison, not demonstrated Graphiti behaviour.
The [comparison and paper link](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/README.md#L79-L110)
are documentation evidence; the paper's architecture or published performance
is not treated here as proof about the inspected implementation.

## Capture, extraction and persistence

The principal Python entrypoint is
`await Graphiti.add_episode(name, episode_body, source_description, reference_time, source=EpisodeType.message, group_id=None, uuid=None, update_communities=False, entity_types=None, excluded_entity_types=None, previous_episode_uuids=None, edge_types=None, edge_type_map=None, custom_extraction_instructions=None, saga=None, saga_previous_episode_uuid=None) -> AddEpisodeResults`.
The caller supplies the source boundary, episode text, event/reference time and
scope. Custom entity/edge schemas are Pydantic model classes; they guide
extraction rather than proving source truth. The implementation retrieves recent
episodes in scope unless explicit previous episode IDs are supplied, validates
entity settings, extracts and resolves entities, extracts/resolves relationships,
hydrates node attributes using newly added facts, then saves the graph.
[Entrypoint and ordered pipeline](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L1043-L1239).

The `uuid` argument is a subtle contract: when supplied, this code **loads an
existing episode** instead of constructing a new episode using that UUID. It
does not implement a general caller-provided create/idempotency key. A wrapper
must not infer that replaying an arbitrary new UUID is an idempotent insertion.
Likewise, `add_episode_bulk` is a separate batch path; it should not be assumed
equivalent to sequential online ingestion without testing the particular
history/update scenario. At this revision it explicitly performs date extraction
and edge invalidation too; older descriptions of a bulk path without invalidation
should not be carried forward.
[UUID branch](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L1156-L1170),
[bulk pipeline](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L1290-L1468).

The source record is `EpisodicNode`, including source type, description, raw
content, creation time, event time and derived edge IDs. Entities are separate
nodes, relationships are `EntityEdge` records with readable `fact` text,
endpoints, embeddings, source episode IDs and timestamps. `MENTIONS` links
connect episodes to entities. This is stronger traceability than storing only
an embedding, but an episode ID is not a quotation range or calibrated confidence
estimate. `store_raw_episode_content=True` is the constructor default; disabling
it clears episode text immediately before persistence while leaving derived
knowledge, so audit and later extraction context have different capabilities.
[Episode shape](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/nodes.py#L318-L352),
[fact shape](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/edges.py#L263-L281),
[capture switch and save](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L742-L760).

## Consolidation, temporal updates and deletion

Relationship resolution first uses an exact normalized fact-and-endpoint match,
reusing its identity and adding episode provenance without another model call.
Otherwise, an LLM chooses duplicate and contradictory candidate indices; the
implementation bounds-checks those indices. Duplicates retain existing
timestamps. Contradictions are handled by event ordering: an older newly ingested
fact can itself be expired if a newer contradictory event is already stored.
Older facts are not necessarily deleted; `valid_at`/`invalid_at` describe event
validity and `created_at`/`expired_at` describe database knowledge timing.
These fields support temporal interpretation, not a general human-reviewed
belief or confidence system.
[Resolution and bounds checks](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/utils/maintenance/edge_operations.py#L684-L776),
[temporal invalidation](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/utils/maintenance/edge_operations.py#L811-L847).

Consolidation is not one universal background stage. Entity summaries update
during episode ingestion; community maintenance is opt-in via
`update_communities` or an explicit `build_communities(group_ids=...)` call that
removes/rebuilds communities. Sagas additionally link episode sequences and
support `summarize_saga(saga_id)`. The saga summary records two distinct
watermarks: ingestion-time `last_summarized_at` selects newly ingested episodes,
including historical backfills, while `last_summarized_episode_valid_at` tells
consumers the newest covered event time. This is a useful concrete distinction
between processing progress and content recency; it is not a durable checkpoint
for the entire extraction workflow.
[Community lifecycle](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L1548-L1583),
[saga watermarks](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L449-L575).

`remove_episode(episode_uuid)` does not mean “subtract only this source's support
and recompute all descendants.” It deletes a fact if that episode is the **first**
entry in `edge.episodes`, even if later sources also support the edge. It deletes
entities mentioned by only one episode, then deletes the episode. The inspected
method does not rebuild surviving summaries, revalidate previously invalidated
facts, or remove every reference to a deleted non-first episode from surviving
fact provenance. These are limitations of this specific deletion path, not a
claim that all backend delete APIs behave identically.
[Complete episode deletion implementation](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L1824-L1852).

## Recall and consumption

`search(query, center_node_uuid=None, group_ids=None, num_results=..., search_filter=None)`
returns `list[EntityEdge]`. `search_(query, config=COMBINED_HYBRID_SEARCH_CROSS_ENCODER, ...)`
returns structured `SearchResults` across graph layers. Retrieval combines
configurable lexical, semantic and graph methods, with recipe-selected reranking;
query embeddings are generated only when the selected methods require them.
Basic search chooses reciprocal-rank fusion or node-distance reranking. The
advanced path supports node, edge, episode and community results.
[Public search contracts](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L1585-L1688),
[query embedding and parallel scopes](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/search/search.py#L98-L220).

A caller must format selected facts into the target agent's context and decide
whether to include original sources or temporal caveats. This API does not
assemble an arbitrary agent's complete prompt or enforce its token budget.
Do not infer a default “currently true only” policy from temporal branding:
`SearchFilters()` has unset date fields, and basic search constructs that empty
filter when none is supplied. Applications requiring a point-in-time validity
predicate must specify and verify it.
[Default date filters](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/search/search_filters.py#L55-L67).

## Scope, operations and prerequisites

`group_id` partitions graph data; it is not an authenticated principal or an
authorization decision. Request-scoped driver/client bundles prevent concurrent
calls from overwriting each other's database target, with provider-dependent
routing. The low-level search function normalizes an empty group list to `None`,
which must not be mistaken for “authorized to see no groups.” Authorization and
safe treatment of empty allowed scopes remain wrapper responsibilities.
[Request scope](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L1013-L1041),
[empty-scope normalization](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/search/search.py#L154-L155).

The core explicitly recommends sequential, awaited episode ingestion and leaves
background dispatch to the application. The bundled MCP queue provides one
in-process `asyncio.Queue` per group, starts tasks locally, logs exceptions and
marks tasks done regardless of success. It has no persisted task log or
restart replay in this implementation. Database durability is therefore not
queued-work durability; a deployer needing reliable retry must own that boundary.
[Caller scheduling responsibility](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L1119-L1127),
[MCP queue](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/mcp_server/src/services/queue_service.py#L12-L80).

Local use requires Python, an appropriate graph backend and configured extraction,
embedding and reranking clients. Defaults instantiate Neo4j and OpenAI clients;
local model endpoints are documented, but configuring just the extraction model
does not replace the embedding/reranking defaults. The README lists Neo4j,
FalkorDB and Neptune/OpenSearch requirements; Kuzu is deprecated. Third-party
database/model licences, model downloads, hardware needs and cloud credentials
remain separate from Graphiti's source licence.
[Composition defaults](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/graphiti_core/graphiti.py#L138-L240),
[prerequisites](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/README.md#L156-L211).

Representative tests read: the exact-fact shortcut asserts no model call and
single provenance append; group routing tests assert the shared driver remains
unchanged while per-group clones are used. These are source-inspected assertions,
not successful test-run evidence or proofs of tenant authorization.
[Exact match test](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/tests/utils/maintenance/test_edge_operations.py#L108-L152),
[routing tests](https://github.com/getzep/graphiti/blob/c64e45c111fd43ca7f5536a7f84a73f6acafd5b1/tests/test_handle_multiple_group_ids.py#L55-L104).

## Candidate Drawloom learnings, not decisions

Evidence supports comparing source capture, extracted claims and retrieval results
as distinct responsibilities; preserving both event time and ingestion progress;
and requiring an explicit deletion contract for derived knowledge. It also argues
against treating scope filters as access controls or background dispatch as
durable execution. Whether Drawloom needs a graph abstraction, a queue, or only a
small retrieval/provider interface remains a consumer-led decision. This report
does not amend Drawloom contracts or authorize implementation.

## Diagram source map

Use these eight nodes for a lifecycle map; source paths are relative to the
inspected upstream checkout and immutable links above carry the same revision.

| Node | Boundary and source |
| --- | --- |
| Caller episode | Text, source, event time, group; `graphiti_core/graphiti.py:1043` |
| Extract and resolve | Entities then relationship deduplication; `graphiti_core/graphiti.py:1179` |
| Episode/source graph | Raw episode plus MENTIONS; `graphiti_core/graphiti.py:747` |
| Temporal claim graph | Facts, source episodes and invalidation; `graphiti_core/utils/maintenance/edge_operations.py:811` |
| Derived summaries | Optional communities and saga watermarks; `graphiti_core/graphiti.py:449`, `:1548` |
| Hybrid recall | Filtered retrieval and reranking; `graphiti_core/search/search.py:98` |
| Caller context | Structured facts returned for caller formatting; `graphiti_core/graphiti.py:1586`, `:1662` |
| Deletion | Origin-based fact deletion and singly mentioned entities; `graphiti_core/graphiti.py:1824` |

Edges: caller → extraction → episode/source graph and temporal claim graph;
temporal claims → summaries; source/claim/summary layers → hybrid recall → caller
context; later episode → extraction → invalidation of earlier claim; deletion →
source/claim graph. Mark summary rebuilding after deletion as **not established**.
Add a dashed caller/MCP-queue → ingestion edge labelled “process-local queue,
caller-owned durable retry” from `mcp_server/src/services/queue_service.py:18`.
