# @drawloom/knowledge

Portable contracts for local knowledge intake, evidence-aware retrieval,
bounded maintenance, assessment, and embeddings.

## Public surface

- KnowledgeIntake requires explicit create-only or exact-revision CAS for
  sources, host observations, and deliberate claims. Withdrawal preserves a
  revision and provenance; deletion removes retained logical-record bodies.
- KnowledgeRetrieval provides bounded search across current sources,
  observations, and claims before or after assessment, plus record inspection,
  directed evidence expansion, evidence packages, and authorized OKF export.
- KnowledgeMaintenance reports bounded backlog status and issues provider-owned
  repair units. Publication completes exactly the issued units that still match
  their captured revisions; unissued repairs and later arrivals remain pending.
- KnowledgeAssessment uses stable request and payload identities, durable
  reconciliation, and truthful authority-bound cancellation. It emits only
  claim proposals pinned to supplied evidence.
- KnowledgeEmbeddings and KnowledgeEmbeddingIndex separate document/query
  inference from rebuildable revision-, configuration-, and generation-bound
  indexes. An immutable fingerprint covers artifacts, formatting,
  segmentation, pooling, and normalization; passage identities permit several
  embeddings per record while ranked results deduplicate record revisions.
- KnowledgeIndexWork provides an authorization-bound, configuration-scoped feed
  of current searchable revision upserts and obsolete revision removals. The
  consumer acknowledges a provider batch only after durable index activation;
  unacknowledged work and duplicate acknowledgement are replay-safe.

The `Authorizer` from `@drawloom/authorization` uses an AuthZEN-shaped request. Trusted composition
establishes the subject, and providers resolve resource facts from trusted
state; operation payloads cannot grant access. Missing, invalid, unavailable,
or malformed decisions return explicit failures; ordinary denial stays distinct.
Providers authorize both link
endpoints and derived disclosure at publication, retrieval, export,
maintenance, and configured model destinations.

Knowledge operations accept a trailing `AuthorizationEvaluationOptions`. Nested
consumers pass the same cancellation signal and remaining-time supplier across
all reads and checks. When omitted at a standalone local provider boundary,
SQLite and embedding operations establish one 30-second operation budget;
assessment uses its configured operation deadline. Trusted composition wraps
policy providers with the authorization scheduler, which caps each decision at
two seconds and the enclosing remaining time. These defaults never reset inside
a record loop. Context preparation requires the host's remaining-time supplier
and reports parent expiry as `timeout`, cancellation as `cancelled`, and policy
inability as `unavailable`, without returning a partial automatic selection.

`knowledgeStorageConformance`, `knowledgeAssessmentConformance`,
`knowledgeEmbeddingConformance`, and `knowledgeIndexWorkConformance` are
independently reusable provider-neutral behavioral suites. `knowledgeConformance`
composes all four. Fixtures supply
subjects with known allow/deny outcomes, so the suites do not select or encode
a policy, storage engine, embedding model, or assessment model. Embedding
providers also supply their real immutable configuration; conformance derives
dimensions and synthetic index vectors from it instead of inventing a model.
