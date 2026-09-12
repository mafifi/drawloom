# Local knowledge and memory

Implementation reference for [Accepted ADR 0024](../adr/0024-local-knowledge-memory-and-retrieval.md).
This is not an acceptance record. See the [evidence and gaps](../../knowledge/evidence/adr-0024-local-knowledge.md)
before relying on unverified behavior.

## Ownership

Knowledge belongs to the local owner across projects. Projects identify where an
observation or source came from; they do not create separate knowledge stores.
Conversation history remains separate and is never replayed into an assessment.

The authenticated desktop host selects the trusted subject. Browser requests and
model tool arguments cannot select a user, authorization attributes or policy.
The local composition permits its owner. The portable contracts and contrasting
policy tests exercise denial without assigning enterprise classifications.

## Interfaces and implementations

The authoritative TypeScript schemas are in
[`@drawloom/knowledge`](../../packages/knowledge/knowledge/src/index.ts).

| Interface | Responsibility | Local implementation |
| --- | --- | --- |
| Intake | Conditional, duplicate-safe observations, claims and source revisions | SQLite |
| Retrieval | Search, inspect, follow evidence and export authorized records | SQLite plus local semantic composition |
| Maintenance | Lease bounded work and publish changes with the exact checkpoint | SQLite |
| Assessment | Judge supplied evidence; report running, completed or uncertain work | Signed-in Codex App Server |
| Embeddings | Encode a bounded batch using one explicit configuration | MLX Qwen on Apple Silicon; text search remains available without it |
| Index work and vector index | Maintain rebuildable, revision-bound derived indexes | SQLite and sqlite-vec |

Provider choice lives in
[`local-knowledge-runtime`](../../packages/knowledge/local-knowledge-runtime/src/runtime.ts),
not plugin code. Replacing the assessor does not replace storage or Nightloom.
Replacing embeddings requires a new configuration fingerprint and a rebuilt index;
vectors from different configurations are not mixed.

Maintenance may release an exact owner-bound lease without acknowledging its
work. This lets Nightloom reduce an oversized batch and try again without
discarding updates or advancing its processing checkpoint. A single evidence
package that still exceeds the limits is reported as blocked, never silently
truncated. An assessment receives the batch's root references and a deduplicated,
bounded collection of records and links; the same exact lease is used to publish
the resulting changes atomically.

## Local operation

The selected Drawloom data directory contains `knowledge/knowledge.sqlite`, local
model artifacts and state. History and assets retain their existing locations.
Node owns the knowledge SQLite connection because the installed Bun SQLite cannot
load sqlite-vec. No custom library is substituted beneath open history databases.

The desktop bundles a separate Node runtime through `scripts/stage-knowledge-runtime.ts`.
Source launches require the normal package build first. The managed sidecar uses
bounded stdio requests; it exposes no network listener or plugin browser protocol.
Native prerequisites and unavailable models must be visible rather than replaced
with hosted embeddings.

The selected MLX provider keeps an isolated Python worker alive behind the Node
embedding interface. Knowledge settings downloads the pinned runtime and verified
weights only after explicit consent. Both live beneath `knowledge/models` in the
selected data directory; neither ships inside the desktop application. Setup needs
an available `uv` executable and Apple Silicon. It must report missing prerequisites
instead of changing global tooling or silently choosing another backend.
The worker uses Metal, local-only model loading and bounded requests; closing
the host closes the worker. Its configuration identity differs from ONNX even
when both encode Qwen vectors of the same length. Existing indexes remain intact
while the selected configuration rebuilds.

Search first obtains bounded candidates, then resolves authorized records. Evidence
pages preserve endpoint identities independently of which page contains a record.
Larger chains have explicit continuations; inspecting another endpoint permits
continued exploration. A page is not a promise that all knowledge fits in context.

OKF export produces an explicitly labeled Drawloom OKF-profile Markdown page with
authorized record metadata, bodies and relationships. It is not a second editable
database or a claim of universal OKF bundle compatibility.

## Sources and disclosure

The installable Git MCP package owns configured repositories and paths. Merely
installing it or changing model settings does not enable collection. The user
explicitly chooses the installed source for a selected project. Acknowledgement
follows durable intake, not a successful model call. Stopping collection does not
delete retained knowledge.

Semantic inference is local. Codex assessment is **not**: supplied evidence is
disclosed to the configured Codex destination. Durable assessment receipts and
Codex's native history are separate from SQLite knowledge records. Deleting a
knowledge record does not currently erase those copies. This limitation must
remain visible; no enterprise retention or deletion guarantee is claimed.

## Current limits

- Verified local model downloads and small synthetic semantic evaluations have
  completed. Their accepted resource costs and limited quality evidence are in
  the ADR and its linked measurement records; production retrieval value and
  100k semantic search remain unproven.
- Nightloom batches up to 50 work units within the evidence limits. Oversized
  batches are reduced without acknowledging a prefix; a single oversized unit
  remains visibly blocked. A two-root live assessment and two-unit Temporal batch
  have passed separately; larger live maintenance journeys remain to verify.
- The source UI currently selects one active Git feed. Retained knowledge is
  cross-project; this is not simultaneous multi-repository source scheduling.
- Local SQLite/process tests, scripted provider transports and observed live
  assessment results are different evidence categories. None proves enterprise
  policy deployment or local generation-model judgement quality.
