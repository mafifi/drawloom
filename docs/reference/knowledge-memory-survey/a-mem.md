# A-Mem: note evolution around an ephemeral core

## Evidence boundary

Inspected 2026-09-11 at commit `ceffb860f0712bbae97b184d440df62bc910ca8d`
in `/Users/afifim/Development/A-mem`, newly shallow-cloned from the public
`agiresearch/A-mem` repository. The checkout was clean and its root
[MIT licence](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/LICENSE#L1-L20)
applies to the inspected source. Source and representative tests were read, not
executed. No package was installed, no model was downloaded and no model or
database service was started. This is an implementation survey, not a
reproduction of the A-MEM paper's experiments or an accepted Drawloom design.

The README calls this repository a memory system for agent construction and
directs paper-result reproduction to a different repository. That distinction
matters: paper claims are not runtime evidence for this package.
[Repository positioning](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/README.md#L1-L20).

## Capture, representation and extraction

The main entrypoint is
`AgenticMemorySystem(model_name='all-MiniLM-L6-v2', llm_backend='openai', llm_model='gpt-4o-mini', evo_threshold=100, api_key=None)`.
Its write API is `add_note(content: str, time: str = None, **kwargs) -> str`.
The unrestricted `**kwargs` are passed into `MemoryNote`; this is a convenient
Python-library interface, not a validated network boundary. A note contains
content, a random UUID, caller-supplied or default keywords, links, context,
category and tags, minute-resolution creation/access timestamps, a retrieval
counter and an evolution-history list.
[Note shape](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L24-L81),
[constructor](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L93-L124).

The implementation defines `analyze_content(content: str) -> Dict`, which asks
the configured LLM for keywords, context and tags and returns empty/default
metadata on error. No production call site in the inspected repository invokes
that method. `add_note` constructs `MemoryNote` directly and sends it to
`process_memory`; therefore the README's “automatic keyword extraction” and
structured-note description should not be read as behaviour established by
this main path. Callers can provide metadata explicitly, while the evolution
prompt can later replace a new note's tags.
[Disconnected analyzer](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L159-L231),
[actual add path](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L233-L264).

## Linking and evolution

The first note is accepted without evolution. For later notes,
`process_memory(note) -> Tuple[bool, MemoryNote]` retrieves five nearest notes,
formats their contents and metadata into a prompt, and asks the LLM whether to
evolve. A `strengthen` action appends model-returned strings to the new note's
`links` and replaces its tags. The code does not establish that suggested IDs
exist, prevent duplicates, make links reciprocal or record why a link was made.
It also does not append to `evolution_history` despite exposing that field.
[Evolution request and schema](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L590-L674),
[strengthening](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L676-L684).

The neighbour-update path has a correctness limitation important to any reuse.
`find_related_memories` returns result-position integers (`0`, `1`, …), not the
retrieved document IDs. `process_memory` then treats those integers as positions
in the insertion-ordered list of *all* in-memory notes. A semantically retrieved
second result can consequently update the second globally inserted note rather
than the retrieved note. Those neighbour mutations also remain only in the
Python dictionary until the threshold-driven `consolidate_memories` rebuild;
the corresponding Chroma metadata can be stale meanwhile.
[Result-position construction](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L288-L313),
[position reuse and neighbour mutation](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L684-L716),
[threshold consolidation](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L260-L286).

These observations describe the pinned implementation, not the A-MEM method in
the paper. Until corrected and tested, automatic neighbour evolution should be
treated as experimental.

## Storage is not process restoration

`AgenticMemorySystem` keeps authoritative note objects in `self.memories`, a
process-local dictionary. Construction creates an ordinary `ChromaRetriever`,
calls `client.reset()`, then creates a fresh retriever with the fixed collection
name `memories`. That retriever uses `chromadb.Client`, not
`chromadb.PersistentClient`. Exact reads and link expansion depend on the
dictionary, so even a surviving vector collection alone would not restore the
object graph.
[Reset and fresh state](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L108-L124),
[ephemeral retriever](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/retrievers.py#L42-L61),
[dictionary read](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L346-L355).

A separate `PersistentChromaRetriever(directory=None, collection_name='memories',
model_name='all-MiniLM-L6-v2', extend=False)` does use a disk-backed client and
can reopen an existing collection when `extend=True`. The main system has no
constructor parameter to inject it and no routine that reconstructs
`MemoryNote` objects into `self.memories`. Its presence therefore demonstrates
a persistent vector-store building block, not whole-system close/reopen
recovery. This directly qualifies the README's “persistent memory storage”
claim.
[Persistent retriever](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/retrievers.py#L147-L207),
[README claim](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/README.md#L133-L150).

## Recall and active context

`search(query, k=5)` and `search_agentic(query, k=5)` query Chroma and map IDs
back to in-memory notes. The latter expands direct links and returns dictionaries
containing content and note metadata. `_search_raw` labels Chroma distances as
`score`; there is no calibration, confidence model or documented direction for
interpreting that number. Linked neighbours have no score at all. `k` is
caller-selected without a local maximum.
[Basic search](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L415-L450),
[agentic search](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L509-L588).

Recall results are not active model context. This package does not choose a
prompt budget, preserve quotation spans, resolve contradictions for a query or
insert results into an agent turn. The caller owns those steps and must treat
both stored text and LLM-derived metadata as untrusted inputs.

## Update, deletion, provenance and scope

`update(memory_id, **kwargs) -> bool` changes any existing attribute named by
the caller, then deletes and re-adds that one vector record. It does not rerun
analysis or evolution, create a revision, retain the previous value, or update
notes that link to a changed ID. `delete(memory_id) -> bool` removes the vector
record and dictionary object but leaves incoming IDs in other notes' link lists.
There is no cascade, tombstone, undo, retention policy or source-level
retraction.
[Update](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L357-L396),
[delete](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/memory_system.py#L398-L413).

The note schema has no source URI, source revision, author/principal, quotation
range, derivation relationship, review status or calibrated confidence. Its
`context`, category, tags and links are descriptive metadata, not evidence of
truth. Likewise, the fixed collection name and note filters provide no tenant,
project, conversation or user isolation. There are no authentication,
authorization or entitlement checks. A host would have to create isolated
instances/storage and enforce allowed scopes before calling this library;
passing metadata is not such enforcement.

## Local prerequisites and maturity

The package declares Python 3.8+ and dependencies including sentence-transformers,
ChromaDB, LiteLLM and OpenAI. Default construction requires an OpenAI API key;
the alternate Ollama controller expects a reachable local Ollama model. The
embedding model can also require a first-use model download. These are runtime
prerequisites, not bundled offline operation.
[Package metadata](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/pyproject.toml#L5-L28),
[backend requirements](https://github.com/agiresearch/A-mem/blob/ceffb860f0712bbae97b184d440df62bc910ca8d/agentic_memory/llm_controller.py#L13-L94).

The public API is compact and useful as research/demo material, but the pinned
source does not establish production durability, concurrent safety, crash
recovery, migration, access control or faithful evolutionary maintenance.

## Candidate Drawloom learnings, not decisions

This inspection supports keeping source capture, derived organization, durable
storage, recall and active-context assembly separate when comparing systems. It
also shows why a persistent vector component is not enough to claim recoverable
memory, and why LLM-proposed links need stable identities and provenance. It
does **not** establish that Drawloom should adopt A-Mem's note schema, use
ChromaDB, perform autonomous evolution or add any new contract.

## Diagram source map

Use these eight nodes for a lifecycle map. Paths are relative to the inspected
checkout; immutable links above carry the same revision.

| Node | Boundary and source |
| --- | --- |
| Caller note | Content and optional metadata; `agentic_memory/memory_system.py:233` |
| MemoryNote | UUID, metadata, timestamps and links; `agentic_memory/memory_system.py:24` |
| Nearest-neighbour lookup | Chroma top-five candidates; `agentic_memory/memory_system.py:288` |
| LLM evolution | Decide strengthening or neighbour update; `agentic_memory/memory_system.py:590` |
| In-memory note map | Exact objects and link traversal; `agentic_memory/memory_system.py:108` |
| Chroma index | Ephemeral semantic index plus stringified metadata; `agentic_memory/retrievers.py:42` |
| Recall result | Ranked notes and direct linked notes; `agentic_memory/memory_system.py:509` |
| Caller context | Caller-owned selection, budgeting and prompting; no package implementation |

Edges: caller note → `MemoryNote` → nearest-neighbour lookup → LLM evolution;
evolved note → in-memory note map and Chroma index; in-memory map + Chroma index
→ recall result → caller context. Add a dashed disconnected node/edge for
`analyze_content` (`agentic_memory/memory_system.py:159`) labelled “defined, not
called by add path.” Add a dashed alternate Chroma node for
`PersistentChromaRetriever` (`agentic_memory/retrievers.py:147`) labelled
“available building block, not wired into whole-system restoration.”
