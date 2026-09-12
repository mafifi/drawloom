import {
  AssessmentCancellationResultSchema, AssessmentResultSchema,
  EmbeddingIndexActivateResultSchema, EmbeddingIndexPrepareResultSchema,
  EmbeddingIndexQueryResultSchema, EmbeddingIndexStageResultSchema, embeddingResultSchemaFor,
  EvidenceResultSchema, IndexWorkAcknowledgeResultSchema, IndexWorkResultSchema, IntakeResultSchema, PendingKnowledgeSchema,
  PublicationResultSchema, RecordReadResultSchema, SearchResultSchema, WorkBatchReleaseResultSchema,
  type ClaimRecord, type EvidencePackage, type KnowledgeAssessment, type KnowledgeEmbeddingIndex,
  type EmbeddingBatch, type KnowledgeEmbeddings, type KnowledgeIndexWork, type KnowledgeIntake, type KnowledgeMaintenance,
  type EmbeddingConfiguration, type KnowledgeRecord, type KnowledgeRetrieval, type RecordRef,
  type TrustedKnowledgeSubject,
} from "./index.js";

export interface KnowledgeStorageConformanceFixture {
  intake: KnowledgeIntake;
  retrieval: KnowledgeRetrieval;
  maintenance: KnowledgeMaintenance;
  authorizedSubject: TrustedKnowledgeSubject;
  deniedSubject: TrustedKnowledgeSubject;
}
export interface KnowledgeAssessmentConformanceFixture {
  assessment: KnowledgeAssessment;
  authorizedSubject: TrustedKnowledgeSubject;
  deniedSubject: TrustedKnowledgeSubject;
  evidence: EvidencePackage;
}
export interface KnowledgeEmbeddingConformanceFixture {
  embeddings: KnowledgeEmbeddings;
  embeddingIndex: KnowledgeEmbeddingIndex;
  configuration: EmbeddingConfiguration;
  authorizedSubject: TrustedKnowledgeSubject;
  deniedSubject: TrustedKnowledgeSubject;
}
export interface KnowledgeIndexWorkConformanceFixture {
  intake: KnowledgeIntake;
  indexWork: KnowledgeIndexWork;
  configuration: EmbeddingConfiguration;
  authorizedSubject: TrustedKnowledgeSubject;
  deniedSubject: TrustedKnowledgeSubject;
}
export interface KnowledgeConformanceFixture extends KnowledgeStorageConformanceFixture,
  KnowledgeAssessmentConformanceFixture, KnowledgeEmbeddingConformanceFixture,
  KnowledgeIndexWorkConformanceFixture {}

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function ref(type: RecordRef["type"], id: string, revision: string): RecordRef {
  return { type, origin: "conformance", id, revision };
}
const sameRef = (left: RecordRef, right: RecordRef) => left.type === right.type && left.origin === right.origin && left.id === right.id && left.revision === right.revision;
type ActiveKnowledgeRecord = Extract<KnowledgeRecord, { status: "active" }>;
type WithdrawnKnowledgeRecord = Extract<KnowledgeRecord, { status: "withdrawn" }>;
function record(reference: RecordRef, body: string, inputs: RecordRef[] = []): ActiveKnowledgeRecord {
  const common = {
    body, status: "active" as const,
    confidence: { vocabulary: "conformance", value: "provisional" },
    provenance: { producer: { type: "conformance", id: "fixture" }, inputs },
  };
  return reference.type === "claim" ? { ...common, ref: { ...reference, type: "claim" }, freshness: "current" } :
    reference.type === "observation" ? { ...common, ref: { ...reference, type: "observation" } } :
      { ...common, ref: { ...reference, type: "source" } };
}
function withdrawn(reference: RecordRef, body: string): WithdrawnKnowledgeRecord {
  const common = {
    body, status: "withdrawn" as const,
    confidence: { vocabulary: "conformance", value: "withdrawn" },
    provenance: { producer: { type: "conformance", id: "fixture" }, inputs: [] },
  };
  return reference.type === "claim" ? { ...common, ref: { ...reference, type: "claim" }, freshness: "withdrawn" } :
    reference.type === "observation" ? { ...common, ref: { ...reference, type: "observation" } } :
      { ...common, ref: { ...reference, type: "source" } };
}
async function accept(fixture: KnowledgeStorageConformanceFixture, input: Parameters<KnowledgeIntake["ingest"]>[1]) {
  const result = IntakeResultSchema.parse(await fixture.intake.ingest(fixture.authorizedSubject, input));
  check(result.kind === "accepted", "intake accepts a valid compare-and-swap operation");
}

/** Policy-neutral: providers supply subjects with known allow and deny outcomes. */
export async function knowledgeStorageConformance(fixture: KnowledgeStorageConformanceFixture): Promise<void> {
  const { authorizedSubject: allowed, deniedSubject: denied } = fixture;
  check((await fixture.maintenance.status(denied)).kind === "denied", "maintenance status applies authorization before backlog counts or age");
  const support1 = ref("source", "support", "r1");
  const claim1 = ref("claim", "claim", "r1");
  await accept(fixture, { operation: "upsert", expectedRevision: null, record: record(support1, "Local evidence."), links: [] });
  await accept(fixture, {
    operation: "upsert", expectedRevision: null, record: record(claim1, "Local claim.", [support1]),
    links: [{ from: claim1, to: support1, relation: "support" }],
  });
  const claim2 = ref("claim", "claim-two", "r1");
  await accept(fixture, {
    operation: "upsert", expectedRevision: null, record: record(claim2, "Second local claim.", [support1]),
    links: [{ from: claim2, to: support1, relation: "support" }],
  });
  const duplicate = IntakeResultSchema.parse(await fixture.intake.ingest(allowed, {
    operation: "upsert", expectedRevision: null, record: record(support1, "Local evidence."), links: [],
  }));
  check(duplicate.kind === "duplicate", "an identical revision and payload is duplicate-safe");
  const sameRevisionChange = IntakeResultSchema.parse(await fixture.intake.ingest(allowed, {
    operation: "upsert", expectedRevision: "r1", record: record(support1, "Changed in place."), links: [],
  }));
  check(sameRevisionChange.kind === "conflict", "a changed payload cannot reuse a revision");
  const createOverExisting = IntakeResultSchema.parse(await fixture.intake.ingest(allowed, {
    operation: "upsert", expectedRevision: null, record: record(ref("source", "support", "r2"), "Replacement."), links: [],
  }));
  check(createOverExisting.kind === "conflict", "null precondition remains create-only");
  const deniedExisting = await fixture.retrieval.get(denied, support1);
  const deniedMissing = await fixture.retrieval.get(denied, ref("source", "missing", "r1"));
  check(deniedExisting.kind === "denied" && deniedMissing.kind === "denied", "authorization precedes existence disclosure");

  const found = SearchResultSchema.parse(await fixture.retrieval.search(allowed, {
    query: "local", mode: "best_available", limit: 10, maxBytes: 16_384,
  }));
  check(found.kind === "ok" && (found.mode === "lexical" || found.semantic.status === "ready") &&
    found.items.some((item) => item.record.ref.type === "source" && item.record.ref.id === support1.id) &&
    found.items.some((item) => item.record.ref.type === "claim" && item.record.ref.id === claim1.id),
    "source material is searchable before assessment, while mode and semantic readiness remain separate from relevance and confidence");
  check((await fixture.retrieval.search(denied, { query: "local", mode: "best_available", limit: 10, maxBytes: 16_384 })).kind === "denied",
    "search applies authorization before counts, results, and cursors");
  const forward = await fixture.retrieval.expand(allowed, { ref: claim1, direction: "forward", limit: 10, maxBytes: 16_384 });
  const reverse = await fixture.retrieval.expand(allowed, { ref: support1, direction: "reverse", limit: 10, maxBytes: 16_384 });
  check(forward.kind === "ok" && forward.items.length === 1 && reverse.kind === "ok" && reverse.items.length >= 1,
    "evidence expansion supports both directions");
  const evidence = EvidenceResultSchema.parse(await fixture.retrieval.evidence(allowed, {
    root: claim1, direction: "forward", maxDepth: 4, maxRecords: 1, maxLinks: 1, maxBytes: 16_384,
  }));
  check(evidence.kind === "ok" && evidence.cursor, "evidence traversal pages bounded records and links with an opaque continuation");
  if (evidence.kind === "ok" && evidence.cursor) {
    const continued = await fixture.retrieval.evidence(allowed, {
      root: claim1, direction: "forward", maxDepth: 4, maxRecords: 1, maxLinks: 1, maxBytes: 16_384, cursor: evidence.cursor,
    });
    check(continued.kind === "ok" && continued.records.every((item) => !evidence.records.some((prior) => JSON.stringify(prior.ref) === JSON.stringify(item.ref))),
      "evidence continuation progresses without duplicate records");
    const wrongRequest = await fixture.retrieval.evidence(allowed, {
      root: support1, direction: "forward", maxDepth: 4, maxRecords: 1, maxLinks: 1, maxBytes: 16_384, cursor: evidence.cursor,
    });
    check(wrongRequest.kind === "invalid_cursor", "a continuation is bound to its request and authority");
  }

  const baseline = PendingKnowledgeSchema.parse(await fixture.maintenance.pending(allowed, { limit: 100, maxBytes: 65_536 }));
  check(baseline.kind === "ok", "baseline work is readable");
  if (baseline.kind === "ok") {
    check((await fixture.maintenance.release(denied, { batch: baseline.batch })).kind === "denied",
      "lease release applies authorization before batch existence is disclosed");
    const released = WorkBatchReleaseResultSchema.parse(await fixture.maintenance.release(allowed, { batch: baseline.batch }));
    check(released.kind === "released" && (await fixture.maintenance.release(allowed, { batch: baseline.batch })).kind === "conflict",
      "release is exact, non-idempotent and cannot release an already released batch");
    const reissued = PendingKnowledgeSchema.parse(await fixture.maintenance.pending(allowed, { limit: 100, maxBytes: 65_536 }));
    check(reissued.kind === "ok" && JSON.stringify(reissued.units.map((unit) => unit.id)) === JSON.stringify(baseline.units.map((unit) => unit.id)),
      "released work remains pending and is reissued without advancing its checkpoint");
    if (reissued.kind === "ok") await fixture.maintenance.publish(allowed, { batch: reissued.batch, proposals: [] });
  }
  const support2 = ref("source", "support", "r2");
  await accept(fixture, { operation: "upsert", expectedRevision: "r1", record: record(support2, "Revised local evidence."), links: [] });
  const retainedSupport1 = await fixture.retrieval.get(allowed, support1);
  check(retainedSupport1.kind === "ok" && retainedSupport1.record?.body === "Local evidence.",
    "pinned old revisions remain readable until explicit deletion");
  const pending = PendingKnowledgeSchema.parse(await fixture.maintenance.pending(allowed, { limit: 1, maxBytes: 16_384 }));
  check(pending.kind === "ok" && pending.units.length === 1 && pending.remaining && pending.units[0]?.affectedClaim,
    "provider-issued work units bound each affected-claim repair and retain remaining units");
  const later = ref("source", "later", "r1");
  await accept(fixture, { operation: "upsert", expectedRevision: null, record: record(later, "Arrived later."), links: [] });
  if (evidence.kind === "ok" && evidence.cursor) {
    const invalidated = await fixture.retrieval.evidence(allowed, {
      root: claim1, direction: "forward", maxDepth: 4, maxRecords: 1, maxLinks: 1, maxBytes: 16_384, cursor: evidence.cursor,
    });
    check(invalidated.kind === "invalidated", "a graph change explicitly invalidates a pinned continuation");
  }
  if (pending.kind === "ok") {
    const proposedRef = ref("claim", "atomic-proposal", "r1");
    const invalidPrevious = { ...ref("claim", "claim", "missing"), type: "claim" as const };
    const atomicConflict = await fixture.maintenance.publish(allowed, {
      batch: pending.batch,
      proposals: [
        { record: record(proposedRef, "Must not leak from a failed batch.", [support2]) as ClaimRecord, expectedRevision: null, links: [{ from: proposedRef, to: support2, relation: "support" }] },
        { record: record(ref("claim", "claim", "r2"), "Invalid second proposal.", [invalidPrevious]) as ClaimRecord, expectedRevision: "missing", previous: invalidPrevious, links: [] },
      ],
    });
    const rejectedProposal = await fixture.retrieval.get(allowed, proposedRef);
    check(atomicConflict.kind === "conflict" && rejectedProposal.kind === "ok" && rejectedProposal.record === undefined,
      "publication validates every proposal before writing any proposal");
    const published = PublicationResultSchema.parse(await fixture.maintenance.publish(allowed, { batch: pending.batch, proposals: [] }));
    check(published.kind === "published" && published.remaining, "publication consumes only its issued batch and preserves later arrivals");
    check((await fixture.maintenance.publish(allowed, { batch: pending.batch, proposals: [] })).kind === "conflict",
      "a consumed batch cannot overlap or publish twice");
  }
  const support3 = ref("source", "support", "r3");
  await accept(fixture, { operation: "withdraw", expectedRevision: "r2", record: withdrawn(support3, "Withdrawn evidence."), links: [] });
  const stale = RecordReadResultSchema.parse(await fixture.retrieval.get(allowed, claim1));
  check(stale.kind === "ok" && stale.record !== undefined && stale.record.ref.type === "claim" && "freshness" in stale.record && stale.record.freshness === "stale",
    "withdrawing linked evidence stales dependent claims while retaining provenance");
  const deletedSupport = ref("source", "support", "r4");
  await accept(fixture, { operation: "delete", expectedRevision: "r3", ref: deletedSupport });
  const deletedPinnedSupport = await fixture.retrieval.get(allowed, support1);
  const staleAfterDelete = await fixture.retrieval.get(allowed, claim1);
  check(deletedPinnedSupport.kind === "ok" && deletedPinnedSupport.record === undefined && staleAfterDelete.kind === "ok" &&
    staleAfterDelete.record !== undefined && "freshness" in staleAfterDelete.record && staleAfterDelete.record.freshness === "stale",
    "linked deletion removes all old bodies after capturing and staling dependents");
  const deleteRef = ref("source", "later", "r2");
  await accept(fixture, { operation: "delete", expectedRevision: "r1", ref: deleteRef });
  const oldBody = await fixture.retrieval.get(allowed, later);
  const tombstone = await fixture.retrieval.get(allowed, deleteRef);
  check(oldBody.kind === "ok" && oldBody.record === undefined && tombstone.kind === "ok" && tombstone.record === undefined,
    "deletion removes every retained logical body and exposes no body as a tombstone");
  check((await fixture.maintenance.pending(denied, { limit: 10, maxBytes: 16_384 })).kind === "denied",
    "maintenance applies authorization before work disclosure");
}

export async function knowledgeAssessmentConformance(fixture: KnowledgeAssessmentConformanceFixture): Promise<void> {
  const request = { requestId: "assessment", payloadFingerprint: "payload-v1", evidence: fixture.evidence };
  const identity = { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint };
  check((await fixture.assessment.assess(fixture.deniedSubject, request)).kind === "denied", "assessment authorization precedes request existence");
  let completed = AssessmentResultSchema.parse(await fixture.assessment.assess(fixture.authorizedSubject, request));
  for (let attempt = 0; attempt < 3 && (completed.kind === "running" || completed.kind === "uncertain"); attempt++) {
    completed = AssessmentResultSchema.parse(await fixture.assessment.reconcile(fixture.authorizedSubject, identity));
  }
  check(completed.kind === "completed" && completed.requestId === request.requestId && completed.payloadFingerprint === request.payloadFingerprint,
    "reconciliation resolves the same request and payload identity");
  if (completed.kind === "completed") {
    const supplied = new Set(fixture.evidence.records.map((item) => JSON.stringify(item.ref)));
    check(completed.proposals.every((proposal) => proposal.record.ref.type === "claim" && proposal.record.provenance.inputs.every((input) => supplied.has(JSON.stringify(input)))),
      "assessment emits claims whose cited inputs are pinned to supplied evidence");
  }
  const conflict = await fixture.assessment.assess(fixture.authorizedSubject, { ...request, payloadFingerprint: "payload-v2" });
  check(conflict.kind === "conflict", "a stable request id rejects a different payload identity");
  const tooLate = AssessmentCancellationResultSchema.parse(await fixture.assessment.cancel(fixture.authorizedSubject, identity));
  check(tooLate.kind === "too_late", "cancellation truthfully reports an already completed request");
  check((await fixture.assessment.reconcile(fixture.deniedSubject, identity)).kind === "denied", "reconciliation is authority-bound");
}

/** Current-revision indexing is independent from curation work and independently checkpointed per immutable configuration. */
export async function knowledgeIndexWorkConformance(fixture: KnowledgeIndexWorkConformanceFixture): Promise<void> {
  const allowed = fixture.authorizedSubject;
  const denied = fixture.deniedSubject;
  const request = { configuration: fixture.configuration, limit: 10, maxBytes: 65_536 };
  check((await fixture.indexWork.pending(denied, request)).kind === "denied", "index work applies authorization before configuration progress or records are disclosed");

  const revision1 = ref("source", "index-work", "r1");
  const inserted = await fixture.intake.ingest(allowed, { operation: "upsert", expectedRevision: null, record: record(revision1, "First index revision."), links: [] });
  check(inserted.kind === "accepted", "index work fixture accepts its first current revision");
  const first = IndexWorkResultSchema.parse(await fixture.indexWork.pending(allowed, request));
  check(first.kind === "ok" && first.updates.some((update) => update.operation === "upsert" && sameRef(update.record.ref, revision1)),
    "a new configuration begins from current searchable record revisions");
  if (first.kind !== "ok") return;
  const replay = IndexWorkResultSchema.parse(await fixture.indexWork.pending(allowed, request));
  check(replay.kind === "ok" && JSON.stringify(replay.updates) === JSON.stringify(first.updates),
    "an unacknowledged batch repeats stable work units after interruption");
  const acknowledged = IndexWorkAcknowledgeResultSchema.parse(await fixture.indexWork.acknowledge(allowed, { batch: first.batch }));
  const duplicateAcknowledgement = IndexWorkAcknowledgeResultSchema.parse(await fixture.indexWork.acknowledge(allowed, { batch: first.batch }));
  check(acknowledged.kind === "acknowledged" && duplicateAcknowledgement.kind === "acknowledged",
    "acknowledgement is harmless when repeated after durable index activation");
  check((await fixture.indexWork.acknowledge(denied, { batch: first.batch })).kind === "denied",
    "index acknowledgement applies authorization before batch existence is disclosed");

  const revision2 = ref("source", "index-work", "r2");
  const changed = await fixture.intake.ingest(allowed, { operation: "upsert", expectedRevision: "r1", record: record(revision2, "Second index revision."), links: [] });
  check(changed.kind === "accepted", "index work fixture accepts a replacement current revision");
  const replacement = IndexWorkResultSchema.parse(await fixture.indexWork.pending(allowed, request));
  check(replacement.kind === "ok" &&
    replacement.updates.some((update) => update.operation === "remove" && sameRef(update.ref, revision1)) &&
    replacement.updates.some((update) => update.operation === "upsert" && sameRef(update.record.ref, revision2)),
    "superseded revisions remain queued as removal plus current-revision upsert until acknowledged");
  if (replacement.kind !== "ok") return;

  const secondConfiguration = { ...fixture.configuration, id: `${fixture.configuration.id}:second`, fingerprint: `${fixture.configuration.fingerprint}:second` };
  const independent = IndexWorkResultSchema.parse(await fixture.indexWork.pending(allowed, { ...request, configuration: secondConfiguration }));
  check(independent.kind === "ok" && independent.updates.some((update) => update.operation === "upsert" && sameRef(update.record.ref, revision2)) &&
    !independent.updates.some((update) => update.operation === "upsert" && sameRef(update.record.ref, revision1)),
    "a replacement configuration starts an independent rebuild from current revisions");
  if (independent.kind === "ok") await fixture.indexWork.acknowledge(allowed, { batch: independent.batch });
  const stillPending = IndexWorkResultSchema.parse(await fixture.indexWork.pending(allowed, request));
  check(stillPending.kind === "ok" && JSON.stringify(stillPending.updates) === JSON.stringify(replacement.updates),
    "acknowledging one configuration never consumes another configuration's index progress");
}

export async function knowledgeEmbeddingConformance(fixture: KnowledgeEmbeddingConformanceFixture): Promise<void> {
  const configuration = fixture.configuration;
  const batch: EmbeddingBatch = {
    configuration, role: "document", items: [
      { id: "passage-1", revision: "r1", text: "first passage" },
      { id: "passage-2", revision: "r1", text: "second passage" },
    ],
  };
  const embedded = embeddingResultSchemaFor(batch).parse(await fixture.embeddings.embed(fixture.authorizedSubject, batch));
  check(embedded.kind === "ok" && embedded.items.map((item) => item.id).join(",") === "passage-1,passage-2" && embedded.items.every((item) => item.vector.length === configuration.dimensions),
    "embedding preserves configuration identity, passage order, and dimensions without silently dropping passages");
  check((await fixture.embeddings.embed(fixture.deniedSubject, {
    configuration, role: "query", items: [{ id: "denied-query", text: "query" }],
  })).kind === "denied", "embedding disclosure is authority-bound");
  if (embedded.kind !== "ok") return;
  const queryBatch: EmbeddingBatch = { configuration, role: "query", items: [{ id: "query", text: "local evidence" }] };
  const queryEmbedding = embeddingResultSchemaFor(queryBatch).parse(await fixture.embeddings.embed(fixture.authorizedSubject, queryBatch));
  check(queryEmbedding.kind === "ok", "the configured provider supports the distinct query role");
  if (queryEmbedding.kind !== "ok") return;
  const queryVector = queryEmbedding.items[0]!.vector;

  const source1 = ref("source", "indexed", "r1");
  const prepared1 = EmbeddingIndexPrepareResultSchema.parse(await fixture.embeddingIndex.prepare({ configuration, generation: 1, expectedActiveGeneration: null }));
  check(prepared1.kind === "ready", "an initial inactive generation can be staged");
  if (prepared1.kind !== "ready") return;
  const dimensionMismatch = await fixture.embeddingIndex.stage({ stageId: prepared1.stageId, entries: [{ id: "bad", ref: source1, vector: Array(configuration.dimensions + 1).fill(1) }], removals: [] });
  check(dimensionMismatch.kind === "dimension_mismatch", "staging validates configured vector dimensions");
  const staged1 = EmbeddingIndexStageResultSchema.parse(await fixture.embeddingIndex.stage({
    stageId: prepared1.stageId,
    entries: embedded.items.map((item) => ({ id: item.id, ref: source1, vector: item.vector })), removals: [],
  }));
  check(staged1.kind === "staged", "multiple provider-private passages can index one authoritative record revision");
  const activated1 = EmbeddingIndexActivateResultSchema.parse(await fixture.embeddingIndex.activate({ stageId: prepared1.stageId, expectedActiveGeneration: null }));
  check(activated1.kind === "activated", "staged generation activates with compare-and-swap");
  const query1 = EmbeddingIndexQueryResultSchema.parse(await fixture.embeddingIndex.query({ configuration, vector: queryVector, limit: 10 }));
  check(query1.kind === "ok" && query1.items.length === 1 && query1.items[0]?.ref.revision === "r1",
    "ranked results deduplicate passages to authoritative record revisions");

  const source2 = ref("source", "indexed", "r2");
  const prepared2 = await fixture.embeddingIndex.prepare({ configuration, generation: 2, expectedActiveGeneration: 1 });
  check(prepared2.kind === "ready", "an incremental replacement generation can be staged");
  if (prepared2.kind !== "ready") return;
  const replacementVector = Array(configuration.dimensions).fill(1 / configuration.dimensions);
  await fixture.embeddingIndex.stage({ stageId: prepared2.stageId, entries: [{ id: "replacement", ref: source2, vector: replacementVector }], removals: [source1] });
  const beforeActivation = await fixture.embeddingIndex.query({ configuration, vector: queryVector, limit: 10 });
  check(beforeActivation.kind === "ok" && beforeActivation.activeGeneration === 1 && beforeActivation.items[0]?.ref.revision === "r1",
    "queries never see a staged or mixed generation");
  await fixture.embeddingIndex.activate({ stageId: prepared2.stageId, expectedActiveGeneration: 1 });
  const afterActivation = await fixture.embeddingIndex.query({ configuration, vector: queryVector, limit: 10 });
  check(afterActivation.kind === "ok" && afterActivation.activeGeneration === 2 && afterActivation.items[0]?.ref.revision === "r2",
    "activation atomically removes obsolete revisions and exposes the replacement generation");
  const mismatch = await fixture.embeddingIndex.query({ configuration: { ...configuration, fingerprint: `${configuration.fingerprint}:mismatch` }, vector: queryVector, limit: 10 });
  check(mismatch.kind === "configuration_mismatch", "configuration identity includes the immutable fingerprint");
  const replacementConfiguration = { ...configuration, id: `${configuration.id}:replacement`, fingerprint: `${configuration.fingerprint}:replacement` };
  const prepared3 = await fixture.embeddingIndex.prepare({ configuration: replacementConfiguration, generation: 3, expectedActiveGeneration: 2 });
  check(prepared3.kind === "ready", "a replacement configuration can stage separately from the active index");
  if (prepared3.kind !== "ready") return;
  const source3 = ref("source", "new-configuration", "r1");
  await fixture.embeddingIndex.stage({ stageId: prepared3.stageId, entries: [{ id: "new-configuration", ref: source3, vector: replacementVector }], removals: [] });
  await fixture.embeddingIndex.activate({ stageId: prepared3.stageId, expectedActiveGeneration: 2 });
  const switched = await fixture.embeddingIndex.query({ configuration: replacementConfiguration, vector: queryVector, limit: 10 });
  check(switched.kind === "ok" && switched.items.length === 1 && switched.items[0]?.ref.id === source3.id,
    "switching configuration starts a clean generation instead of copying incompatible entries");
}

export async function knowledgeConformance(fixture: KnowledgeConformanceFixture): Promise<void> {
  await knowledgeStorageConformance(fixture);
  await knowledgeAssessmentConformance(fixture);
  await knowledgeEmbeddingConformance(fixture);
  await knowledgeIndexWorkConformance(fixture);
}
