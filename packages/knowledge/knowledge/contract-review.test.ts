import { expect, test } from "bun:test";
import * as contract from "./src/index.js";

test("ranked record identities cannot collide through embedded separators", () => {
  const ref = { type: 'source', origin: 'one', id: 'two\0three', revision: 'r1' };
  expect(contract.EmbeddingIndexQueryResultSchema.safeParse({ kind: 'ok', activeGeneration: 1, items: [
    { ref, relevance: 1 }, { ref: { ...ref, origin: 'one\0two', id: 'three' }, relevance: 0.5 },
  ] }).success).toBe(true);
});

function schema(name: string) {
  const value = Reflect.get(contract, name) as { safeParse(value: unknown): { success: boolean } } | undefined;
  expect(value, `${name} must be exported`).toBeDefined();
  return value!;
}

const source = {
  ref: { type: "source", origin: "git", id: "guide", revision: "r1" },
  body: "Public guidance",
  status: "active",
  confidence: { domain: "test", value: "observed" },
  provenance: { producer: { type: "plugin", id: "git-source" }, inputs: [] },
};

test("intake requires an explicit create/update precondition and lifecycle-consistent withdrawal", () => {
  expect(contract.IntakeInputSchema.safeParse({ operation: "upsert", record: source }).success).toBe(false);
  expect(contract.IntakeInputSchema.safeParse({ operation: "upsert", expectedRevision: null, record: source }).success).toBe(true);
  expect(contract.IntakeInputSchema.safeParse({ operation: "withdraw", expectedRevision: "r1", record: { ...source, ref: { ...source.ref, revision: "r2" } } }).success).toBe(false);
  expect(contract.IntakeInputSchema.safeParse({ operation: "withdraw", expectedRevision: "r1", record: { ...source, ref: { ...source.ref, revision: "r2" }, status: "withdrawn" } }).success).toBe(true);
});

test("agent contribution accepts only new host-attributed observation or claim bodies", () => {
  const contribution = schema("KnowledgeContributionRequestSchema");
  expect(contribution.safeParse({ body: "Remember this result." }).success).toBe(true);
  expect(contribution.safeParse({ body: "A derived conclusion.", kind: "claim" }).success).toBe(true);
  expect(contribution.safeParse({ body: "Untrusted source", kind: "source" }).success).toBe(false);
  expect(contribution.safeParse({ body: "Overwrite", expectedRevision: "r1" }).success).toBe(false);
  expect(contribution.safeParse({ body: "Choose identity", ref: source.ref }).success).toBe(false);
});

test("evidence traversal accepts a byte-bounded directional continuation and returns an opaque continuation", () => {
  const request = schema("EvidenceRequestSchema");
  expect(request.safeParse({ root: source.ref, direction: "forward", maxDepth: 3, maxRecords: 10, maxLinks: 10, maxBytes: 65_536, cursor: "opaque-next" }).success).toBe(true);
  const result = schema("EvidenceResultSchema");
  expect(result.safeParse({ kind: "ok", records: [source], links: [], bytes: 128, cursor: "opaque-next" }).success).toBe(true);
});

test("a record read can report that authorization raced a graph revision", () => {
  const result = schema("RecordReadResultSchema");
  expect(result.safeParse({ kind: "invalidated" }).success).toBe(true);
});

test("retrieval reports its effective mode separately from semantic readiness", () => {
  const result = schema("SearchResultSchema");
  expect(result.safeParse({ kind: "ok", mode: "lexical", semantic: { status: "rebuilding", configurationId: "embed-v2" }, items: [{ record: source, relevance: 0.75 }], bytes: 128 }).success).toBe(true);
  expect(result.safeParse({ kind: "ok", mode: "hybrid", semantic: { status: "unavailable" }, items: [], bytes: 0 }).success).toBe(false);
});

test("aggregate schemas enforce UTF-8 payload bounds", () => {
  const multibyteBody = "😀".repeat(131_070);
  expect(contract.SourceRecordSchema.safeParse({ ...source, body: multibyteBody }).success).toBe(false);
  expect(schema("AuthorizationResultSchema").safeParse({ kind: "failure", code: "unavailable" }).success).toBe(true);
});

test("maintenance publication consumes a provider-issued batch instead of choosing a checkpoint", () => {
  const pending = schema("PendingKnowledgeSchema");
  expect(schema("PendingRequestSchema").safeParse({ limit: 10, maxBytes: 65_536 }).success).toBe(true);
  expect(schema("PendingWorkUnitSchema").safeParse({ id: "unit-1", update: { ref: source.ref, operation: "upsert" }, affectedClaim: { type: "claim", origin: "assessment", id: "claim", revision: "r1" } }).success).toBe(true);
  expect(pending.safeParse({ kind: "ok", batch: { id: "batch-1", checkpoint: "cp-1" }, units: [{ id: "unit-1", update: { ref: source.ref, operation: "upsert" } }], remaining: true, bytes: 128 }).success).toBe(true);
  const publication = schema("PublicationInputSchema");
  expect(publication.safeParse({ batch: { id: "batch-1", checkpoint: "cp-1" }, proposals: [] }).success).toBe(true);
  expect(publication.safeParse({ snapshot: { checkpoint: "cp-1", records: [] }, proposals: [], nextCheckpoint: "caller-choice" }).success).toBe(false);
});

test("maintenance exposes authorization-bound backlog age and count without draining work", () => {
  expect(schema("MaintenanceStatusResultSchema").safeParse({ kind: "ok", pendingUnits: 50, oldestPendingAtMs: 1_757_678_400_000, checkpoint: "cp-1" }).success).toBe(true);
});

test("index work is a configuration-scoped bounded current-revision feed with batch-only acknowledgement", () => {
  const configuration = { id: "embed", fingerprint: "segmentation-v1", dimensions: 2 };
  expect(schema("IndexWorkRequestSchema").safeParse({ configuration, limit: 10, maxBytes: 65_536 }).success).toBe(true);
  expect(schema("IndexWorkResultSchema").safeParse({
    kind: "ok", batch: { id: "index-batch-1", checkpoint: "index-cp-1" },
    updates: [{ id: "index-unit-1", operation: "upsert", record: source }], remaining: true, bytes: 128,
  }).success).toBe(true);
  expect(schema("IndexWorkAcknowledgeInputSchema").safeParse({ batch: { id: "index-batch-1", checkpoint: "index-cp-1" } }).success).toBe(true);
  expect(schema("IndexWorkAcknowledgeInputSchema").safeParse({ batch: { id: "index-batch-1", checkpoint: "index-cp-1" }, activeGeneration: 2 }).success).toBe(false);
  expect(schema("IndexWorkAcknowledgeResultSchema").safeParse({ kind: "acknowledged", checkpoint: "index-cp-1" }).success).toBe(true);
});

test("claim edits pin their exact prior revision in authoritative provenance", () => {
  const prior = { type: "claim", origin: "assessment", id: "claim", revision: "r1" };
  const next = {
    ...source,
    ref: { ...prior, revision: "r2" },
    freshness: "current",
    provenance: { ...source.provenance, inputs: [prior] },
  };
  expect(schema("ClaimProposalSchema").safeParse({ record: next, expectedRevision: "r1", links: [] }).success).toBe(false);
  expect(schema("ClaimProposalSchema").safeParse({ record: next, expectedRevision: "r1", previous: prior, links: [] }).success).toBe(true);
});

test("assessment carries stable payload identity through reconciliation and truthful cancellation", () => {
  const identity = { requestId: "assessment-1", payloadFingerprint: "sha256:1234" };
  const assessment = schema("AssessmentRequestSchema");
  expect(assessment.safeParse({ ...identity, evidence: { roots: [{ unitId: "one", root: source.ref }, { unitId: "two", root: source.ref }], records: [source], links: [], complete: true } }).success).toBe(true);
  expect(assessment.safeParse({ ...identity, evidence: { root: source.ref, records: [source], links: [], complete: true } }).success).toBe(false);
  expect(assessment.safeParse({ ...identity, evidence: { roots: [{ unitId: "same", root: source.ref }, { unitId: "same", root: source.ref }], records: [source], links: [], complete: true } }).success).toBe(false);
  expect(schema("AssessmentResultSchema").safeParse({ kind: "uncertain", ...identity }).success).toBe(true);
  expect(schema("AssessmentReconcileRequestSchema").safeParse(identity).success).toBe(true);
  expect(schema("AssessmentCancellationResultSchema").safeParse({ kind: "too_late", ...identity }).success).toBe(true);
});

test("embedding index stages one immutable configuration and activates it with CAS", () => {
  const configuration = { id: "embed", fingerprint: "artifact-format-pooling-normalization", dimensions: 2 };
  expect(schema("EmbeddingConfigurationSchema").safeParse(configuration).success).toBe(true);
  expect(schema("EmbeddingIndexPrepareSchema").safeParse({ configuration, generation: 2, expectedActiveGeneration: 1 }).success).toBe(true);
  expect(schema("EmbeddingIndexStageSchema").safeParse({ stageId: "stage-2", entries: [{ id: "guide:passage:1", ref: source.ref, vector: [0.5, 0.5] }], removals: [] }).success).toBe(true);
  expect(schema("EmbeddingIndexActivateSchema").safeParse({ stageId: "stage-2", expectedActiveGeneration: 1 }).success).toBe(true);
});

test("embedding response validation binds count, order, identity, and dimensions to the request", () => {
  const configuration = { id: "embed", fingerprint: "segmentation-and-pooling-v1", dimensions: 2 };
  const batch = contract.EmbeddingBatchSchema.parse({ configuration, role: "document", items: [{ id: "one", text: "first" }, { id: "two", text: "second" }] });
  const response = contract.embeddingResultSchemaFor(batch);
  expect(response.safeParse({ kind: "ok", configuration, items: [{ id: "two", vector: [0.5, 0.5] }, { id: "one", vector: [0.5, 0.5] }] }).success).toBe(false);
  expect(response.safeParse({ kind: "ok", configuration, items: [{ id: "one", vector: [0.5, 0.5] }, { id: "two", vector: [0.5, 0.5] }] }).success).toBe(true);
});
