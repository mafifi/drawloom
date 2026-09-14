# Local knowledge and memory

Drawloom records observations and distils them into learnings, keeping evidence
that supports or disputes them. Nightloom is the background process that
coordinates this curation. Use this guide to understand how records arrive,
how they are assessed and how an agent can find them again.

[ADR 0024](../adr/0024-local-knowledge-memory-and-retrieval.md) describes the
local implementation. [ADR 0026](../adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)
replaces its original embedding runtime. The
[evidence record](../../knowledge/evidence/adr-0024-local-knowledge.md) separates
tested behaviour from remaining quality and deployment questions.

## Who can use the knowledge?

Knowledge belongs to the local user across projects. A record's project tells
you where it came from; it does not put the record in a separate knowledge
database. Saved conversation history remains separate and is not replayed
wholesale into an assessment.

The host determines who is requesting access. A browser request or model tool
argument cannot choose a different user or invent permissions. The current local
implementation permits its owner; the shared interfaces and denial tests support
other policies without prescribing an organisation's classifications.

## From observations to learnings

A configured source supplies observations and source revisions. SQLite stores
them before acknowledging receipt. Nightloom then takes a limited batch of
pending work, asks an assessor to review its evidence, and publishes the resulting
changes together with its progress marker.

A **lease** reserves a particular batch for a worker. A **checkpoint** records
how far processing has safely completed. Publication must use that exact lease
so results and progress cannot get out of step.

If a batch is too large, Nightloom releases it and retries with less work,
without marking any of it complete. A single item that still exceeds the limits
is reported as blocked; evidence is not silently cut off. The assessor receives
the selected root records and a size-limited set of related records and links,
with duplicates removed.

## Interfaces and implementations

The types and validation rules live in
[`@drawloom/knowledge`](../../packages/knowledge/knowledge/src/index.ts).

| Interface | What it does | Local implementation |
| --- | --- | --- |
| Intake | Saves observations, claims and source revisions, checking revisions and duplicates | SQLite |
| Retrieval | Searches, opens records, follows evidence and exports permitted material | SQLite with optional local semantic search |
| Maintenance | Reserves pending work and saves changes with the matching progress marker | SQLite |
| Assessment | Reviews supplied evidence and reports completed, running or uncertain work | Signed-in Codex App Server |
| Embeddings | Converts text into numerical vectors for similarity search | Qwen GGUF through llama.cpp on Apple Silicon |
| Index work and vector index | Builds searchable vectors from specific record revisions | SQLite and sqlite-vec |

The [local runtime](../../packages/knowledge/local-knowledge-runtime/src/runtime.ts)
selects these implementations. Plugins do not select them internally. Changing
the assessor does not replace storage or Nightloom.

Changing the embedding configuration requires a new index. Its fingerprint
identifies the configuration that produced the vectors; matching vector lengths
alone are not enough to combine them.

## Local operation

Records live in `knowledge/knowledge.sqlite` beneath the selected Drawloom data
directory. History and assets keep their own storage locations.

A separate Node process owns the knowledge database because this implementation
needs sqlite-vec, which the installed Bun SQLite cannot load. The desktop stages
its Node worker dependencies using `scripts/stage-knowledge-runtime.ts`; source
launches need the normal package build first. The host and worker exchange
size-limited messages over standard input and output, not a new network or
plugin-browser API.

### Optional local similarity search

An **embedding** is a numerical representation of text used to find similar
meaning. Without the embedding runtime and model, text search remains available;
Drawloom does not silently send the text to a hosted embedding service.

The accepted replacement uses llama.cpp with Qwen GGUF weights on Apple Silicon
and Metal. It needs neither Python nor `uv`. Settings requires consent before
downloading either runtime or model, and verifies the pinned artifacts before
using them. Neither is bundled with the desktop.

The public runtime archive has not yet been published. Setup must explain that
limitation rather than offer an invented URL. Installation tests use explicitly
trusted local fixture delivery.

The llama.cpp process listens only on authenticated loopback and loads the
explicit local model. It is closed with the host. The replacement uses a new
configuration identity, separate from MLX and ONNX. Existing records remain
intact while the new index is built; incompatible vectors are never mixed.
Old MLX files are not executed. Their removal requires an explicit cleanup
action, limited to obsolete Drawloom-owned files—not knowledge or global tools.

### Reading results and evidence

Search first selects a limited set of candidates, then resolves the records the
caller may read. Evidence pages retain the identities of linked records even
when the records are on another page. Follow the continuation or open a linked
record to explore a larger chain; a page is not a promise that an entire
knowledge collection fits in model context.

OKF export creates a Markdown page following Drawloom's Open Knowledge Format
profile, including permitted records and relationships. It is an export, not
another editable database or a promise of compatibility with every OKF bundle.

## Sources and disclosure

The Git MCP package owns the configured repositories and paths it reads.
Installing it or changing a model setting does not start collection: the user
must select the installed source for a project. Collection acknowledges data
after it is saved, not after a model call succeeds. Stopping collection does
not delete previously retained knowledge.

Embedding inference runs locally. **Codex assessment does not:** the selected
evidence is sent to the configured Codex destination. Assessment receipts and
Codex's native history are separate copies from the SQLite knowledge records.
Deleting a knowledge record does not currently erase those copies. Do not
promise enterprise retention or complete deletion based on local record removal.

## Current limits

- Retained evidence includes verified model downloads and small synthetic search
  evaluations. Broader retrieval value and 100,000-record semantic search remain
  unproven; see the ADR measurements for resource costs and test conditions.
- Nightloom accepts up to 50 work units per batch within the evidence limits.
  Retained live evidence includes a two-root assessment and a separate two-unit
  Temporal batch, not every larger maintenance journey.
- The source UI selects one active Git feed. Cross-project knowledge storage is
  not simultaneous scheduling of multiple repository feeds.
- SQLite tests, scripted model responses and live assessments prove different
  things. None alone establishes enterprise policy deployment or judgement
  quality across real workloads.

For a change to this system, test the affected interfaces and the full source,
curation or retrieval journey. Keep provider calls opt-in and use synthetic
records for public tests.
