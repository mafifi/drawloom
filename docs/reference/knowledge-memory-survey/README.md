# Knowledge, memory and context: implementation survey

Inspected **11 September 2026**. This is retained research, not an accepted
Drawloom contract or a recommendation to install every product below.

The question is not “which memory database should we use?” It is: **what happens
between an experience, a retained claim, a later correction, and the material
an agent actually sees?** The answer determines which boundaries should remain
stable when a local OSS implementation is replaced by a shared implementation.

## Start here

- [Lifecycle comparison map](comparison.html): an interactive Archify overview.
- [Lifecycle and interface comparison](#the-lifecycles-side-by-side): the main synthesis.
- [What this suggests for Drawloom](#what-this-suggests-for-drawloom): findings to discuss, not APIs already agreed.
- [Research and evaluation](research-and-evaluation.md): LongMemEval, sleep-time compute and memory poisoning.
- [Evidence vocabulary](vocabularies.md): SEPIO, PROV-O, DQV, nanopublications, annotations and OKF.
- [Verification and refresh](verification.md): revisions, source-link checks, diagram receipts and limits.

The maps show selected paths, not every package or deployment option. Their
arrows mean component/data flow, not a universal mandatory sequence. In
particular, raw evidence may be retrieved before consolidation; derived
summaries are optional in several implementations. Diagrams link to pinned
source lines. Read the accompanying report for deletion, scope and failure
semantics that would overcrowd a diagram.

## Coverage and freshness

| System | What was actually inspected | Report | Architecture |
| --- | --- | --- | --- |
| Hindsight | Retention, durable work, observations, mental models, recall and reflection | [Detailed lifecycle](hindsight.md) | [Map](hindsight.html) |
| Graphiti | Episode/entity/fact graph, temporal invalidation, summaries, search and deletion | [Detailed lifecycle](graphiti.md) | [Map](graphiti.html) |
| Letta / Letta Code | Current local Code memory/reflection/compiler; archived Python server kept separate | [Detailed lifecycle](letta.md) | [Current Code map](letta.html) |
| Mem0 | Current OSS Python extraction, storage, mutation and application-owned recall | [Detailed lifecycle](mem0.md) | [Map](mem0.html) |
| A-Mem | Research note evolution, linking, retrieval and actual persistence limitations | [Detailed lifecycle](a-mem.md) | [Map](a-mem.html) |
| HippoRAG 2 | Source-aware graph/vector index, incremental indexing, deletion and reading | [Detailed lifecycle](hipporag.md) | [Map](hipporag.html) |
| DeepSeek Harness | Current context admission, session references, compaction and optional MCP memory | [Detailed lifecycle](deepseek.md) | [Map](deepseek.html) |
| Open Design | Workbench memory files/index, extraction gates, next-turn composition and verification | [Detailed lifecycle](open-design.md) | [Map](open-design.html) |

The research and vocabulary reports cover additional sources; they are not
presented as competing production memory services. Public repositories were
checked out under `/Users/afifim/Development`. DeepSeek and Open Design were
refreshed from clean checkouts; new checkouts are shallow. Exact revisions and
root licences live in [the source inventory](sources.json) and each report.

Fresh source inspection changed several earlier descriptions:

- **Letta's main repository is now a redirect to Letta Code.** Its old Python
  server and current local Code runtime must not be drawn as one current engine.
- **Current Mem0 extraction is additive.** Historical descriptions of automatic
  add/update/delete reconciliation and graph memory do not describe this pinned
  OSS path.
- **A-Mem's main implementation is not a durable service.** A persistent
  retriever class exists, but that is not proof of whole-system restoration.
- **SEPIO's old ontology repository points to newer LinkML work.** It supplies
  vocabulary and schema, not a running curation service.

These corrections are documented with immutable source references in the
respective reports. Hosted product features and paper results are not treated
as current OSS implementation guarantees.

## The lifecycles side by side

### 1. Capture is a deliberate integration point

| System | What gets written | Who decides to capture it? | What is retained separately? |
| --- | --- | --- | --- |
| Hindsight | Bank-scoped text with document/source, time and tags | Caller uses retain or submits an operation | Documents/chunks, extracted facts, observations and mental models |
| Graphiti | Episode with source and event time | Caller invokes ingestion; MCP may queue it | Episode nodes, entities, fact edges and derived summaries |
| Letta Code | Conversation transcript plus model-authored memory files | Foreground runtime records turns; configured reflection chooses slices | Transcript, candidate worktree, committed memory and compiled prompt |
| Mem0 | Selected messages or explicit memory input | Application calls `Memory.add` | Searchable facts, SQLite history/context and entity side index |
| A-Mem | A note with caller-supplied text/metadata | Caller invokes `add_note` | Note objects, their links and retrieval index |
| HippoRAG | Document strings or source-bearing chunks | Caller invokes `index` | Source chunks, OpenIE output, graph, embeddings and manifest |
| DeepSeek | Admitted workspace instructions/session references; optional external memory writes | Context middleware and explicit tools | Native session state; external memory server owns its own records |
| Open Design | Profile/rule memory files; optional extracted feedback | User action or explicitly enabled capture path | Markdown entries, active index and prompt projection |

**Common solution:** the application chooses what enters retention. None of
these examples proves that all agent activity should silently become trusted
knowledge. Automatic capture and automatic trust are different decisions.
For Drawloom, fibres can be deliberately plentiful without every fibre becoming
fabric. See each report's capture section for the actual path and defaults.

### 2. Maintenance is where implementations differ most

| System | How older material changes | Progress / recovery boundary | Important limit |
| --- | --- | --- | --- |
| Hindsight | Consolidates evidence into observations; refreshes mental models | Durable operations; consolidation checkpoints retain refresh obligations | Deleting source support can require removing and rebuilding an observation; refresh is asynchronous |
| Graphiti | Resolves duplicates and invalidates conflicting temporal facts | Ingestion and saga markers; caller owns durable scheduling | MCP queue is process-local; deletion is not a complete summary-repair guarantee |
| Letta Code | Reflection edits Git memory, then integrates it | Only merged/no-change outcomes consume the transcript slice | Git deletion leaves historical commits; reflection can produce integration conflicts |
| Mem0 | Adds extracted facts; explicit update/delete operations | Separate vector, history and auxiliary writes | No cross-store transaction; successful-looking output does not prove every write succeeded |
| A-Mem | New notes can reshape nearby notes and links | In-memory objects in the main path | Main persistence and neighbour-index correctness limitations prevent treating it as a ready service |
| HippoRAG | Incremental content indexing; source-contribution-aware removal | Manifest rejects incompatible reuse | Component persistence, not an atomic whole-index commit; no source revision lifecycle |
| DeepSeek | Refreshes instructions and compacts active conversation context | Version/snapshot checks and bounded overflow recovery | Compaction is not long-term claim maintenance |
| Open Design | Upserts/deletes files and regenerates an active index | Best-effort hooks; process-local extraction dedupe | File/index updates are not one transaction; automatic extraction is off by default |

**No common algorithm emerges.** Graph contradiction handling, Git reflection,
fact extraction and graph-assisted retrieval solve different problems. Their
maintenance engines should not be made public plugin obligations merely because
we need a common way to contribute and retrieve material.

The common operational lesson is narrower: **a source was read, its derivation
was saved, and all dependent material is current are three different facts.**
Hindsight's pending refresh work, Letta Code's successful-slice checkpoint and
Graphiti's separate saga progress/time fields are concrete evidence for this
distinction. A single undifferentiated “waterline” can hide unfinished work.

### 3. Recall and context assembly are separate jobs

| System | Retrieval boundary | Who turns results into model input? |
| --- | --- | --- |
| Hindsight | `recall` searches facts/observations; `reflect` can also look up mental models and synthesize | Caller for recall; an internal model/tool process for reflection |
| Graphiti | `search` / richer search returns graph records | Caller chooses presentation and prompt budget |
| Letta Code | Core memory is compiled; other memory is deferred for access | Host compiler and agent memory tools, not a universal top-k search API |
| Mem0 | `search` returns scoped memory records and scores | Consumer explicitly formats them into its model prompt |
| A-Mem | Semantic recall plus linked-note expansion | Caller; linked expansion is not a final prompt budget |
| HippoRAG | `retrieve` returns ranked passages; `rag_qa` additionally answers | Caller or the optional bundled QA path |
| DeepSeek | Context middleware admits bounded previews/references | Native agent-step preparation; external memory remains separate |
| Open Design | Active entries are read and grouped, not query-ranked | Host inserts the compiled memory into the next turn's instructions |

The shared boundary is **selected material returned to a consumer**. It is not
necessarily vector search and it is not necessarily a generated answer.
Returning evidence and asking another model to synthesize an answer should
remain distinguishable: they have different cost, latency and authority.

Context then decides what fits, what is omitted, how it is framed and whether
it is authoritative instruction or untrusted reference. DeepSeek's bounded
session references are especially relevant here. Open Design and Letta show
that some retained material intentionally acts as instructions; that should not
be confused with retrieving factual evidence. Conversation compaction remains
the harness's concern, not a reason to duplicate its transcript in a knowledge
engine.

## Common interfaces and interaction points

These are **observed interface families**, not proposed TypeScript signatures.
The native names below make the comparison testable against the detailed reports.

| Interaction | Working examples | Stable meaning worth preserving | Implementation detail not to standardise yet |
| --- | --- | --- | --- |
| Contribute material | Hindsight `retain`; Graphiti `add_episode`; Mem0 `Memory.add`; A-Mem `add_note`; HippoRAG `index` | Source, content, scope, time and a caller-visible outcome | Fact extractor, graph shape, embeddings or file format |
| Follow accepted background work | Hindsight operations; Letta reflection completion | Accepted work versus safely committed effects; failures and pending derivations | Particular queue or worker model |
| Retrieve for a purpose | Hindsight `recall`; Graphiti/Mem0 `search`; HippoRAG `retrieve` | Scoped, bounded results with source relationships and meaningful status | One ranking algorithm or universal score |
| Inspect origin | Hindsight source support; Graphiti episode references; HippoRAG chunk metadata; Git revision in Letta | What produced this result and which source version it represents | Requiring every provider to expose its complete internal graph |
| Correct or retract | Hindsight source repair; Graphiti invalidation; explicit Mem0 mutations; HippoRAG `delete` | What changed and whether derived material still needs repair | Universal in-place update, rollback or cascade algorithm |
| Compose current context | DeepSeek admission; Letta compiler; Open Design `composeMemoryBody`; consumer examples in Mem0 | Selection, budget, omission and authority are caller/host concerns | A memory backend owning the foreground agent loop |

The thinner systems often leave durability, identity and scope validation to
their caller. A Drawloom implementation cannot claim enterprise substitutability
merely by matching method names. The outcome semantics must match too.

### Four distinctions the public boundary must not erase

1. **Observation versus derived claim.** Repeating a model inference is not a
   second independent observation. Keep the derivation path available.
2. **Relevance versus confidence.** Cosine similarity, PageRank, reranker scores
   and support counts do not share a calibrated truth scale.
3. **Scope versus entitlement.** A bank, group, agent ID or directory is a
   partition. The host/service must establish who may write and read it.
4. **Removal versus repair versus erasure.** Removing a searchable record,
   reconsidering descendants and erasing retained history are different duties.

Each distinction is visible in the implementation reports. The
[vocabulary comparison](vocabularies.md) supplies ways to describe the first two;
the [security research](research-and-evaluation.md#minja-retrieval-memory-as-an-injection-channel)
explains why shared read/write paths make the third particularly important.

## What this suggests for Drawloom

This section is synthesis, not a decision or an implementation plan.

### Keep the consumer-facing story simple

The user's proposed shape fits these references: **contribute something, or
retrieve something useful**. Memory can provide continuity through those
operations; context can use the same retrieval results to prepare a particular
agent step. They need not have competing stores of truth.

That simple front door still needs truthful receipts and result metadata.
“Stored” should not mean “verified,” and “retrieved” should not hide that a claim
is disputed or still based on an older source revision. Status/provenance can
be exposed without exposing Nightloom's entire internal machinery.

### Treat Nightloom as a maintainer, not another foreground harness

Hindsight is the closest inspected reference for separate evidence and
background consolidation. Letta Code contributes a useful successful-work
checkpoint and committed-publication boundary. Graphiti contributes temporal
claim invalidation; HippoRAG contributes source-aware removal and derived-index
compatibility. None alone supplies the complete proposed fabric.

An automatic maintainer can combine those lessons without a human approval
queue. **No human approval is proposed here.** Automated checks, traceable
derivations, bounded work and repair after failure are still valuable. Existing
execution permissions and cost controls remain separate from epistemic trust.

The nightly metaphor should not force one schedule. New evidence can mark
affected knowledge as needing attention; maintenance can run periodically or
in response to that event. A legal change, a new paper and an operational event
share that lifecycle even if their domain rules differ. The domain examples
are design motivations, not medical or legal recommendations.

### Make domain policy describe evidence, not replace the lifecycle

SEPIO's distinction between a statement, supporting/opposing evidence and an
assessment is a better starting point than inventing one confidence number.
PROV-style derivation and source revisions can remain general. What counts as
strong evidence, what expires and what a contradiction means can remain domain
specific. See [the vocabulary report](vocabularies.md) before selecting a schema.

For the Veo example, “five successes” should not mechanically reduce a claim's
confidence. Were they weekends, the same model/region, and independent runs?
They may contradict the claim, narrow its scope or be irrelevant. This is why
the original observations, their conditions and independent source identity
matter more than a universal support counter.

### Local OSS and shared enterprise can keep the same behaviour

Local files/SQLite beneath the selected Drawloom data directory are a plausible
implementation direction, **not an already selected backend in this survey**.
Existing installations and explicit directory overrides must remain respected;
`~/.drawloom` is the default, not a reason to relocate data.

The enterprise substitution should not change “contribute, maintain, retrieve”
into a different product. But shared infrastructure is not merely a different
path. Identity, authorized scope, source visibility and derived-result access
need to survive the substitution. A summary built from restricted material
cannot become public merely because its raw source text is omitted. Partition
labels in the inspected libraries are not sufficient evidence of these controls.

We should test those semantics with a local implementation and a contrasting
shared consumer rather than prebuilding a large entitlement framework. The
existing public/private boundary remains: public contracts/conformance in
Drawloom, proprietary policy and shared-service implementation outside it.

## Discussion order suggested by the evidence

1. **Retained units and lineage:** what is the minimum source/observation/claim
   relationship that fibres, threads and fabric all use? Start with the
   vocabulary evidence, not a mandatory knowledge graph.
2. **Truthful write and read outcomes:** distinguish captured, maintained and
   available-for-retrieval, with scope and provenance. Keep recall separate from
   optional model synthesis and from context assembly.
3. **Change and waterlines:** identify source revision, committed processing
   coverage and outstanding invalidation/refresh work. Do not equate them.
4. **Domain interpretation:** define one operational example and one contrasting
   evidence-heavy domain without putting their rules into the core lifecycle.
5. **Evaluation and substitution:** test correction, abstention, deletion/repair,
   restart, isolation and reading quality—not just retrieval recall. Use the
   research as a test-design reference, not an imported benchmark score.

This order narrows the next conversation. It does not authorize a new graph
service, autonomous provider spend, transcript capture, licensed module or ADR.

## Evidence limits

This pass read implementation and representative tests. **It did not run the
upstream products, their tests or their benchmarks.** No models, datasets or
product dependencies were installed. Archify was executed to generate and check
the retained diagrams; those checks validate artifacts, not upstream runtime
behaviour. See [verification](verification.md) for the exact distinction.

No private clinic OKF contents, media, prompts or fixtures are included. OKF is
discussed only through public vocabulary and Drawloom's existing public profile.
No contract, ADR status or runtime code changes are part of this survey. Nothing
has been committed or published.
