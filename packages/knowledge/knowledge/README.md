# @drawloom/knowledge

Portable contracts for knowledge providers: how records go in, how they
come out, how maintenance and assessment run, and how embeddings and search
indexes stay consistent with the records they cover. Read this if you are
implementing a knowledge provider or calling one from application code — for
example [sqlite-knowledge](../sqlite-knowledge/README.md), which implements
storage, or [local-embeddings](../local-embeddings/README.md), which
implements embeddings.

Application code should depend on these interfaces, not on a chosen storage
engine, embedding model or assessment provider. See
[Contributing](../../../CONTRIBUTING.md#keep-components-replaceable) for why
that separation matters across Drawloom.

## The interfaces

- **KnowledgeIntake** accepts sources, host observations and deliberate
  claims under explicit create-only or exact-revision compare-and-swap.
  Withdrawal preserves a revision and its provenance; deletion removes the
  retained logical-record body.
- **KnowledgeRetrieval** runs bounded search across current sources,
  observations and claims, before or after assessment, and supports record
  inspection, directed evidence expansion, evidence packages, and
  authorised OKF export.
- **KnowledgeMaintenance** reports bounded backlog status and issues
  provider-owned repair units. Publication completes only the issued units
  that still match their captured revisions; unissued repairs and later
  arrivals stay pending.
- **KnowledgeAssessment** uses stable request and payload identities,
  durable reconciliation, and truthful authority-bound cancellation. It
  emits only claim proposals pinned to supplied evidence.
- **KnowledgeEmbeddings and KnowledgeEmbeddingIndex** separate document and
  query inference from rebuildable indexes bound to a revision,
  configuration and generation. An immutable fingerprint covers artefacts,
  formatting, segmentation, pooling and normalisation; passage identities
  let a record carry several embeddings, while ranked results deduplicate
  record revisions.
- **KnowledgeIndexWork** feeds a consumer current searchable revision
  upserts and obsolete revision removals, bound to an authorisation and a
  configuration. A consumer acknowledges a provider batch only after
  durable index activation; unacknowledged work and duplicate
  acknowledgement are replay-safe.

## Authorisation

Every operation authorises through the `Authorizer` from
`@drawloom/authorization`, using an AuthZEN-shaped request. Trusted
composition establishes the subject; providers resolve resource facts from
trusted state, so an operation's own payload can never grant access.
Missing, invalid, unavailable or malformed decisions return explicit
failures, kept distinct from an ordinary denial. Providers authorise both
link endpoints and derived disclosure at publication, retrieval, export,
maintenance and configured model destinations.

## Time budgets

Knowledge operations accept a trailing `AuthorizationEvaluationOptions`.
Nested consumers should pass the same cancellation signal and
remaining-time supplier across every read and check they make. If you omit
it at a standalone local provider boundary, SQLite and embedding operations
fall back to a 30-second operation budget; assessment uses its own
configured operation deadline instead. Trusted composition wraps policy
providers with the authorization scheduler, which caps each decision at two
seconds and the enclosing remaining time. None of these defaults reset
inside a record loop. Context preparation needs the host's remaining-time
supplier, and reports parent expiry as `timeout`, cancellation as
`cancelled`, and policy inability as `unavailable` — it never returns a
partial automatic selection.

## Conformance suites

`knowledgeStorageConformance`, `knowledgeAssessmentConformance`,
`knowledgeEmbeddingConformance` and `knowledgeIndexWorkConformance` are
independently reusable, provider-neutral behavioural suites for exactly
this purpose: run one against your implementation to check it keeps the
contract's promises rather than just compiling against its types.
`knowledgeConformance` composes all four. Fixtures supply subjects with
known allow/deny outcomes, so the suites never select or encode a policy,
storage engine, embedding model or assessment model themselves. Embedding
providers also supply their real immutable configuration; conformance
derives dimensions and synthetic index vectors from it rather than
inventing a model.

See [Contributing](../../../CONTRIBUTING.md#test-the-behaviour-not-just-the-code)
for how conformance tests fit into review, and
[packages/README.md](../../README.md) for how this contract package relates
to its implementations.
