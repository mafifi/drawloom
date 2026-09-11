# Mem0: extracted memory records and application-controlled retrieval

## Snapshot and evidence boundary

Inspected on 2026-09-11: public [`mem0ai/mem0`](https://github.com/mem0ai/mem0),
commit `c7ee362aff94a369af70f13f2b4f853f6793ff4c`, cloned to
`/Users/afifim/Development/mem0`. The root license is Apache-2.0; the Python
package declares version 2.0.20 and Python >=3.10. This is a source inspection,
not a running deployment, benchmark reproduction, dependency installation, or
model-quality evaluation. Tests identified below were read, not run.
[License][license]; [package metadata][package].

The current Python OSS implementation is `Memory`/`AsyncMemory` in
`mem0/memory/main.py`. `MemoryClient` is a different interface: an HTTP client
whose default host is `https://api.mem0.ai` and whose requests carry an API token.
Its available operations are not proof that the hosted service's implementation
is present in this checkout. This report traces the synchronous OSS path; async
methods are separately implemented in the same file and must not be assumed
identical merely because their names match. [OSS construction][construct];
[hosted client][client].

An especially important revision difference: the inspected `add` implementation
is a phased **additive** pipeline. Its docstring still describes an LLM deciding
add/update/delete, but the actual inferred path creates records and returns
`event: ADD`. Explicit `update` and `delete` remain available. Older descriptions
of a second LLM reconciliation call, and old graph-database demonstrations in
the examples directory, must not be substituted for this current call path.
[Entrypoint and dispatch][add]; [extraction and persistence][pipeline].

## Capture, extraction, and materialization

The real entrypoint is
`Memory.add(messages, *, user_id=None, agent_id=None, run_id=None, metadata=None,
timestamp=None, expiration_date=None, infer=True, memory_type=None, prompt=None)`.
It requires at least one scope identity, normalizes strings/dicts into message
lists, validates supported memory types, optionally processes vision content,
and calls `_add_to_vector_store`. A procedural-memory special case routes an
agent-scoped call to `_create_procedural_memory`. `timestamp` is explicitly
rejected as platform-only, whereas expiration dates are implemented locally.
This library receives material that its caller chooses to send; it does not
independently watch a conversation or the filesystem. [Entrypoint][add].

With `infer=False`, each valid non-system message becomes a raw embedded memory;
the role and optional named actor are recorded. With inference enabled, the
pipeline builds an escaped, deterministic session key from user/agent/run IDs,
loads the last ten stored messages for that exact combination, embeds the new
message text, and retrieves ten existing memories using the identity filters.
It presents those memories and recent messages to one extraction LLM call using
the additive prompt and optional custom instructions. Temporary integer IDs
replace retrieved UUIDs in the prompt. Provider exceptions become `LLMError`;
JSON parsing failures instead fall back to an empty extraction result and still
save the recent messages. These are materially different observable failure
outcomes. [Session key][scope]; [pipeline phases 0–2][pipeline].

Extracted texts are batch embedded with individual fallbacks. The implementation
deduplicates exact MD5 text hashes against the ten retrieved records and within
the new batch, then assigns fresh UUIDs and stores text, a lemmatized text field,
timestamps, identity metadata, and optional `attributed_to`. This is neither a
global uniqueness guarantee nor source-level semantic equivalence. The batch
write is followed by history writes, entity linking, and recent-message storage.
If vector insertion fails, individual insertion failures can be logged and
processing continues; history and the returned ADD records are constructed from
the original record list. Consequently, a successful-looking result is not by
itself proof that every vector and history row reached durable storage.
[Batch processing and fallbacks][pipeline].

## What is maintained knowledge here?

The primary maintained object is an independently retrievable text record, not
a whole transcript, source document, or always-in-context agent persona. The
model is asked to preserve concrete details and produce self-contained facts;
those are prompt instructions, not factual validators. The stored record has
identity, timestamps, a content hash, and extensible metadata. There is no
required source span, evidence document ID, extraction-model revision, human
acceptance state, or calibrated factual-confidence field in `MemoryItem`.
`attributed_to` can identify whose statement a memory concerns; it does not
establish that statement's truth. [Record schema][config];
[payload assembly][pipeline].

SQLite stores mutation history and a short extraction-context window. Its
`save_messages` transaction evicts messages beyond the most recent ten for a
session scope. Therefore this message table cannot be treated as an archival
conversation store or a permanent citation source. Mutation history retains
old/new text, event type, timestamps, and deletion markers. That provides useful
change inspection, but there is no automatic epistemic promotion from an LLM
extraction to verified knowledge. [SQLite history and rolling messages][storage].

The pipeline also maintains a lazily constructed entity collection using the
configured vector-store provider. Entity extraction supplies proper names,
quoted terms, topics, and identifiers; entity records link to memory IDs and
are matched by normalized text or strong semantic similarity. This is an
auxiliary retrieval index. The current `MemoryConfig` has no `graph_store`
field and the traced construction/add/search path does not instantiate the old
Neo4j-style graph memory backend. A vector-store provider named Neptune is not
evidence of a graph-memory traversal contract. Likewise, a prompt example's
`linked_memory_ids` is not enough: the current payload-building code copies
`text` and `attributed_to`, while entity-to-memory links are separately built by
the NLP phase. [Configuration][config]; [entity-store construction][construct];
[entity linking][pipeline]; [entity extractor][entities].

## Query and the actual model-input boundary

The current search signature is
`Memory.search(query, *, top_k=20, filters=None, threshold=0.1, rerank=False,
explain=False, reference_date=None, show_expired=False, **kwargs)`. Top-level
user/agent/run arguments are rejected by the Python library; at least one must
be inside `filters`. `reference_date` is explicitly platform-only. Search
validates the query and filter values, then invokes `_search_vector_store`.
[Search API][search].

The retrieval implementation lemmatizes the query, extracts query entities,
embeds it, and over-fetches semantic candidates with a pool of
`max(top_k * 4, 60)`. It requests keyword results where supported, normalizes
BM25 scores, obtains entity boosts, filters expired records, and scores the
semantic candidate set. The semantic threshold is applied before additive
scoring, so keyword/entity strength cannot rescue a candidate below that gate.
An optional configured reranker runs afterward and falls back on error. Scores
are retrieval signals, not probabilities that a memory is true. Backend
keyword support changes the algorithm's available signals. [Retrieval][retrieve];
[scoring][scoring]; [reranking call][search].

Crucially, `search` returns records; it does not inject them into a model.
The repository's current `chat_with_memories(message, user_id)` example is the
actual consumer proof: it calls search, joins `entry['memory']` into text,
places that text in an application-created system message, calls OpenAI chat
completions, and then sends the user/assistant exchange to `add`. Thus the
application owns retrieval timing, selection, formatting, token limits,
prompt-injection treatment, and the final model request. This example proves a
concrete path in source, not that it was executed in this survey. A notebook
using old top-level identity arguments should be reviewed against the live
signature before reuse. [Current consumer][consumer].

## Correction, deletion, restart, and authority

Explicit `update(memory_id, text=None, metadata=None, expiration_date=...,
data=None)` reads the existing vector record, preserves creation time and
identity fields, replaces text/embedding, records an UPDATE history entry, and
relinks entities when the text changes. `data` is a deprecated alias. The
identity guard prevents metadata edits from moving a record to another scope;
it does not verify that the caller owns the record. The current additive
extraction path does not automatically rewrite all contradictory prior facts,
so correction policy still belongs to a caller using these operations.
[Update implementation][mutations].

`delete(memory_id)` removes the vector, appends a DELETE history record that
retains the prior text, and attempts non-fatal entity cleanup. `delete_all`
requires identity filters and iterates batches, protecting against a vector
store's small default listing limit; it also stops on a repeated batch. Neither
operation is a comprehensive privacy erasure of mutation history, the rolling
message table, backups, downstream prompts, or provider logs. `history` reads
the SQL change records by ID. Expiration hides records from ordinary retrieval;
it is not physical deletion. [Deletion and history API][deletion];
[mutation internals][mutations]; [expiration filtering][retrieve].

Persistence is split between the configured vector store, the entity collection,
and SQLite. SQLite wraps its own history batches and message updates in
transactions, but the traced add/update/delete sequence is not a distributed
transaction across those stores. There is no durable extraction-job checkpoint
or end-to-end exactly-once key in `add`. Restarting with the same stores restores
retained material, but retrying an interrupted batch can leave duplicated or
partially indexed effects. MD5 deduplication in a small retrieval window does
not prove otherwise. This limitation follows from the visible sequence; no
fault-injection experiment was run. [Construction][construct];
[persistence sequence][pipeline]; [SQL transactions][storage].

Identity filters are data partitioning. The in-process `Memory` object has no
authenticated principal argument for `get`, `update`, `delete`, or `history`.
The bundled REST server adds authentication via `verify_auth` and reserves
some broad administrative operations, but its inspected by-ID handlers pass
the ID straight to the memory object, and search accepts caller-supplied scope
filters. Do not translate the presence of user IDs or API authentication into
per-record tenant authorization. No exploitation or full server security audit
was performed. [REST handlers][rest]; [by-ID library APIs][deletion].

## Practical prerequisites and evidence limits

The root package's default provider selections are OpenAI for the LLM and
embedding model, Qdrant for vector storage, and a local SQLite history path.
There are configurable local/provider alternatives, but provider availability,
embedding compatibility, backend keyword support, and credentials must be
established for the chosen combination. Optional spaCy-based NLP improves the
entity path; the extractor returns no entities when that facility is
unavailable. No models were downloaded and no claim of zero-cost parity is
made. [Provider configuration][providers]; [history configuration][config];
[optional dependencies][package]; [entity extraction behavior][entities].

Source-read tests include identity-metadata immutability and continuation when
one entity-boost search fails. They support the intended edge cases but are
not passing results from this inspection. The Mem0 paper and historical product
claims can explain motivations and past evaluation, but neither establishes
current OSS reconciliation, graph support, or hosted service internals. The
most useful comparison evidence for Drawloom is the explicit boundary between
source capture, fallible extraction, record maintenance, retrieval, and
application-owned prompt construction. This survey proposes no Drawloom API.
[Read tests][tests].

## Architecture-map handoff

Use eight nodes; labels describe this pinned OSS implementation, not a generic
memory platform. Every edge below has an inspected source anchor.

| From | To | Meaning and source |
| --- | --- | --- |
| Application conversation | `Memory.add` | Caller chooses capture input; [consumer lines 209–222][consumer] |
| `Memory.add` | Extraction LLM | Recent ten messages plus retrieved memories; [main lines 911–968][pipeline] |
| Extraction LLM | Memory vector store | Text, UUID, hash, embedding, scope; [main lines 996–1072][pipeline] |
| `Memory.add` | SQLite history/context | Separate history batch and rolling messages; [main lines 1074–1098, 1192–1198][pipeline] |
| Memory vector store | Entity side index | NLP entities linked to memory IDs; [main lines 1099–1190][pipeline] |
| Memory vector store | Hybrid search | Semantic candidates and supported BM25; [main lines 1628–1687][retrieve] |
| Entity side index | Hybrid search | Additional entity boosts; [main lines 1661–1687][retrieve] |
| Hybrid search | Application model prompt | Returned memory text is explicitly placed in system message; [README lines 209–217][consumer] |

[license]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/LICENSE#L1-L9
[package]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/pyproject.toml#L5-L30
[construct]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/main.py#L487-L580
[client]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/client/main.py#L82-L145
[add]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/main.py#L760-L910
[pipeline]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/main.py#L911-L1206
[scope]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/main.py#L412-L424
[config]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/configs/base.py#L16-L57
[storage]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/storage.py#L193-L324
[entities]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/utils/entity_extraction.py#L1-L16
[search]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/main.py#L1379-L1524
[retrieve]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/main.py#L1628-L1727
[scoring]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/utils/scoring.py#L60-L80
[consumer]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/README.md#L200-L222
[mutations]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/main.py#L2038-L2128
[deletion]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/memory/main.py#L1815-L1959
[rest]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/server/main.py#L367-L550
[providers]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/mem0/llms/configs.py#L6-L35
[tests]: https://github.com/mem0ai/mem0/blob/c7ee362aff94a369af70f13f2b4f853f6793ff4c/tests/memory/test_main.py#L438-L475
