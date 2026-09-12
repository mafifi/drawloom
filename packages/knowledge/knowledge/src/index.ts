import { z } from "zod";

const Id = z.string().trim().min(1).max(256);
const MAX_RECORD_BYTES = 512 * 1024;
const MAX_PAGE_BYTES = 1024 * 1024;
const MAX_AUXILIARY_JSON_BYTES = 64 * 1024;

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

function boundedJson<T extends z.ZodType>(schema: T, bytes: number, message: string) {
  return schema.superRefine((value, context) => {
    if (utf8Bytes(JSON.stringify(value)) > bytes) context.addIssue({ code: "custom", message });
  });
}

export const PageLimitSchema = z.number().int().min(1).max(100);
export const PageByteLimitSchema = z.number().int().min(1024).max(MAX_PAGE_BYTES);
export const OpaqueCursorSchema = z.string().min(1).max(4096).brand<"KnowledgeCursor">();
export type OpaqueCursor = z.infer<typeof OpaqueCursorSchema>;

/** AuthZEN-shaped facts are resolved by trusted composition/provider code, never from operation payloads. */
export const AuthZenEntitySchema = z.strictObject({ type: Id, id: Id, properties: z.record(z.string().min(1).max(128), z.json()) });
export type AuthZenEntity = z.infer<typeof AuthZenEntitySchema>;
declare const trustedSubjectBrand: unique symbol;
export type TrustedKnowledgeSubject = Readonly<AuthZenEntity> & { readonly [trustedSubjectBrand]: true };
export const AuthZenRequestSchema = boundedJson(z.strictObject({
  subject: AuthZenEntitySchema,
  action: z.strictObject({ name: Id }),
  resource: AuthZenEntitySchema,
  context: z.record(z.string().min(1).max(128), z.json()).optional(),
}), MAX_AUXILIARY_JSON_BYTES, "Authorization request is too large");
export type AuthZenRequest = z.infer<typeof AuthZenRequestSchema>;
export const AuthorizationDecisionSchema = z.strictObject({ decision: z.boolean() });
export const AuthorizationResultSchema = z.union([
  AuthorizationDecisionSchema,
  z.strictObject({ kind: z.literal("failure"), code: z.enum(["invalid_facts", "unavailable"]) }),
]);
export type AuthorizationResult = z.infer<typeof AuthorizationResultSchema>;
/** A missing, invalid, unavailable, or non-affirmative authorization result denies the operation. */
export interface KnowledgeAuthorizer { authorize(request: AuthZenRequest): Promise<AuthorizationResult>; }

export const KnowledgeRecordTypeSchema = z.enum(["source", "observation", "claim"]);
export type KnowledgeRecordType = z.infer<typeof KnowledgeRecordTypeSchema>;
export const RecordRefSchema = z.strictObject({ type: KnowledgeRecordTypeSchema, origin: Id, id: Id, revision: Id });
export type RecordRef = z.infer<typeof RecordRefSchema>;
const ProducerRefSchema = z.strictObject({ type: Id, id: Id });
export const RecordProvenanceSchema = z.strictObject({ producer: ProducerRefSchema, inputs: z.array(RecordRefSchema).max(100) });
export type RecordProvenance = z.infer<typeof RecordProvenanceSchema>;
const ConfidenceSchema = boundedJson(z.json(), MAX_AUXILIARY_JSON_BYTES, "Confidence data is too large");
const BodySchema = z.string().min(1).max(262_144);
const CommonRecord = { body: BodySchema, confidence: ConfidenceSchema, provenance: RecordProvenanceSchema };
/** Deliberate agent contribution is create-only. Trusted host composition assigns
 * record identity, provenance and lifecycle fields; callers cannot impersonate a
 * source or overwrite an existing revision. */
export const KnowledgeContributionRequestSchema = boundedJson(z.strictObject({
  body: BodySchema,
  kind: z.enum(["observation", "claim"]).default("observation"),
}), MAX_RECORD_BYTES, "Knowledge contribution is too large");
export type KnowledgeContributionRequest = z.infer<typeof KnowledgeContributionRequestSchema>;
export const SourceRecordSchema = boundedJson(z.union([
  z.strictObject({ ref: RecordRefSchema.extend({ type: z.literal("source") }), ...CommonRecord, status: z.literal("active") }),
  z.strictObject({ ref: RecordRefSchema.extend({ type: z.literal("source") }), ...CommonRecord, status: z.literal("withdrawn") }),
]), MAX_RECORD_BYTES, "Knowledge record is too large");
export const ObservationRecordSchema = boundedJson(z.union([
  z.strictObject({ ref: RecordRefSchema.extend({ type: z.literal("observation") }), ...CommonRecord, status: z.literal("active") }),
  z.strictObject({ ref: RecordRefSchema.extend({ type: z.literal("observation") }), ...CommonRecord, status: z.literal("withdrawn") }),
]), MAX_RECORD_BYTES, "Knowledge record is too large");
export const ClaimFreshnessSchema = z.enum(["current", "stale", "withdrawn"]);
export type ClaimFreshness = z.infer<typeof ClaimFreshnessSchema>;
export const ClaimRecordSchema = boundedJson(z.union([
  z.strictObject({ ref: RecordRefSchema.extend({ type: z.literal("claim") }), ...CommonRecord, status: z.literal("active"), freshness: z.enum(["current", "stale"]) }),
  z.strictObject({ ref: RecordRefSchema.extend({ type: z.literal("claim") }), ...CommonRecord, status: z.literal("withdrawn"), freshness: z.literal("withdrawn") }),
]), MAX_RECORD_BYTES, "Knowledge record is too large");
export const KnowledgeRecordSchema = z.union([SourceRecordSchema, ObservationRecordSchema, ClaimRecordSchema]);
export type KnowledgeRecord = z.infer<typeof KnowledgeRecordSchema>;
export type ClaimRecord = z.infer<typeof ClaimRecordSchema>;
export const EvidenceRelationSchema = z.enum(["support", "contrary", "history"]);
export type EvidenceRelation = z.infer<typeof EvidenceRelationSchema>;
export const KnowledgeLinkSchema = z.strictObject({ from: RecordRefSchema, to: RecordRefSchema, relation: EvidenceRelationSchema });
export type KnowledgeLink = z.infer<typeof KnowledgeLinkSchema>;

export const ExpectedRevisionSchema = z.union([z.null(), Id]);
export const IntakeOperationSchema = z.enum(["upsert", "withdraw", "delete"]);
export type IntakeOperation = z.infer<typeof IntakeOperationSchema>;
const ActiveRecordSchema = z.union([
  SourceRecordSchema.refine((record) => record.status === "active"),
  ObservationRecordSchema.refine((record) => record.status === "active"),
  ClaimRecordSchema.refine((record) => record.status === "active"),
]);
const WithdrawnRecordSchema = z.union([
  SourceRecordSchema.refine((record) => record.status === "withdrawn"),
  ObservationRecordSchema.refine((record) => record.status === "withdrawn"),
  ClaimRecordSchema.refine((record) => record.status === "withdrawn"),
]);
export const IntakeInputSchema = boundedJson(z.union([
  z.strictObject({ operation: z.literal("upsert"), record: ActiveRecordSchema, expectedRevision: ExpectedRevisionSchema, links: z.array(KnowledgeLinkSchema).max(100).default([]) }),
  z.strictObject({ operation: z.literal("withdraw"), record: WithdrawnRecordSchema, expectedRevision: Id, links: z.array(KnowledgeLinkSchema).max(100).default([]) }),
  z.strictObject({ operation: z.literal("delete"), ref: RecordRefSchema, expectedRevision: Id }),
]), MAX_PAGE_BYTES, "Intake request is too large");
export type IntakeInput = z.infer<typeof IntakeInputSchema>;
const BoundaryFailureCodeSchema = z.enum(["invalid", "too_large", "unavailable"]);
const BoundaryFailureSchema = z.strictObject({ kind: z.literal("failure"), code: BoundaryFailureCodeSchema });
const DeniedSchema = z.strictObject({ kind: z.literal("denied") });
export const IntakeResultSchema = z.union([
  z.strictObject({ kind: z.literal("accepted"), revision: Id }),
  z.strictObject({ kind: z.literal("duplicate"), revision: Id }),
  z.strictObject({ kind: z.literal("conflict") }), DeniedSchema, BoundaryFailureSchema,
]);
export type IntakeResult = z.infer<typeof IntakeResultSchema>;
export interface KnowledgeIntake {
  /** Authorization precedes existence, duplicate and conflict checks. Null means create-only; a revision means exact update CAS. */
  ingest(subject: TrustedKnowledgeSubject, input: IntakeInput): Promise<IntakeResult>;
}

const CursorFailureSchema = z.union([
  z.strictObject({ kind: z.literal("invalid_cursor") }),
  z.strictObject({ kind: z.literal("invalidated") }),
]);
const PageWindow = { limit: PageLimitSchema, maxBytes: PageByteLimitSchema, cursor: OpaqueCursorSchema.optional() };
export const SearchRequestSchema = boundedJson(z.strictObject({ query: z.string().trim().min(1).max(10_000), mode: z.enum(["best_available", "lexical"]).default("best_available"), ...PageWindow }), 32 * 1024, "Search request is too large");
export type SearchRequest = z.infer<typeof SearchRequestSchema>;
/** Search indexes current retained source, observation, and claim records; assessment is not a prerequisite for retrieval. */
export const SearchHitSchema = z.strictObject({ record: ActiveRecordSchema, relevance: z.number().finite() });
export type SearchHit = z.infer<typeof SearchHitSchema>;
export const SemanticReadinessSchema = z.union([
  z.strictObject({ status: z.literal("ready"), configurationId: Id }),
  z.strictObject({ status: z.literal("rebuilding"), configurationId: Id }),
  z.strictObject({ status: z.literal("unavailable") }),
]);
export const SearchResultSchema = boundedJson(z.union([
  z.strictObject({ kind: z.literal("ok"), mode: z.enum(["lexical", "hybrid"]), semantic: SemanticReadinessSchema, items: z.array(SearchHitSchema).max(100), bytes: z.number().int().nonnegative().max(MAX_PAGE_BYTES), cursor: OpaqueCursorSchema.optional() }),
  DeniedSchema, BoundaryFailureSchema, CursorFailureSchema,
]).superRefine((result, context) => {
  if (result.kind === "ok" && result.mode === "hybrid" && result.semantic.status !== "ready") {
    context.addIssue({ code: "custom", path: ["semantic"], message: "Hybrid mode requires a ready semantic index" });
  }
}), MAX_PAGE_BYTES, "Search result is too large");
export type SearchResult = z.infer<typeof SearchResultSchema>;
/** A record read invalidates when the authoritative graph changes across asynchronous authorization. */
export const RecordReadResultSchema = z.union([
  z.strictObject({ kind: z.literal("ok"), record: KnowledgeRecordSchema.optional() }), DeniedSchema, BoundaryFailureSchema, CursorFailureSchema,
]);
export type RecordReadResult = z.infer<typeof RecordReadResultSchema>;
export const TraversalDirectionSchema = z.enum(["forward", "reverse"]);
export const ExpandRequestSchema = z.strictObject({ ref: RecordRefSchema, direction: TraversalDirectionSchema, ...PageWindow });
export type ExpandRequest = z.infer<typeof ExpandRequestSchema>;
export const ExpandResultSchema = boundedJson(z.union([
  z.strictObject({ kind: z.literal("ok"), items: z.array(KnowledgeLinkSchema).max(100), bytes: z.number().int().nonnegative().max(MAX_PAGE_BYTES), cursor: OpaqueCursorSchema.optional() }),
  DeniedSchema, BoundaryFailureSchema, CursorFailureSchema,
]), MAX_PAGE_BYTES, "Evidence links are too large");
export type ExpandResult = z.infer<typeof ExpandResultSchema>;
export const EvidenceRequestSchema = z.strictObject({ root: RecordRefSchema, direction: TraversalDirectionSchema, maxDepth: z.number().int().min(1).max(32), maxRecords: PageLimitSchema, maxLinks: PageLimitSchema, maxBytes: PageByteLimitSchema, cursor: OpaqueCursorSchema.optional() });
export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>;
export const EvidenceResultSchema = boundedJson(z.union([
  z.strictObject({ kind: z.literal("ok"), records: z.array(KnowledgeRecordSchema).max(100), links: z.array(KnowledgeLinkSchema).max(100), bytes: z.number().int().nonnegative().max(MAX_PAGE_BYTES), cursor: OpaqueCursorSchema.optional() }),
  DeniedSchema, BoundaryFailureSchema, CursorFailureSchema,
]), MAX_PAGE_BYTES, "Evidence result is too large");
export type EvidenceResult = z.infer<typeof EvidenceResultSchema>;
export const EvidencePackageRootSchema = z.strictObject({ unitId: Id, root: RecordRefSchema });
export const EvidencePackageSchema = boundedJson(z.strictObject({
  roots: z.array(EvidencePackageRootSchema).min(1).max(50).superRefine((roots, context) => {
    const seen = new Set<string>();
    for (const [index, item] of roots.entries()) {
      if (seen.has(item.unitId)) context.addIssue({ code: "custom", path: [index, "unitId"], message: "Evidence package unit identities must be unique" });
      seen.add(item.unitId);
    }
  }),
  records: z.array(KnowledgeRecordSchema).max(100), links: z.array(KnowledgeLinkSchema).max(100), complete: z.boolean(),
}), MAX_PAGE_BYTES, "Evidence package is too large");
export type EvidencePackage = z.infer<typeof EvidencePackageSchema>;
export const KnowledgeExportRequestSchema = z.strictObject({ refs: z.array(RecordRefSchema).min(1).max(100), format: z.literal("okf"), maxBytes: PageByteLimitSchema });
export type KnowledgeExportRequest = z.infer<typeof KnowledgeExportRequestSchema>;
export const KnowledgeExportResultSchema = boundedJson(z.union([
  z.strictObject({ kind: z.literal("ok"), records: z.array(KnowledgeRecordSchema).max(100), links: z.array(KnowledgeLinkSchema).max(100), bytes: z.number().int().nonnegative().max(MAX_PAGE_BYTES) }),
  DeniedSchema, BoundaryFailureSchema,
]), MAX_PAGE_BYTES, "Knowledge export is too large");
export type KnowledgeExportResult = z.infer<typeof KnowledgeExportResultSchema>;
/** Cursors bind the request, pinned graph revisions and authority. Invalidated cursors fail explicitly and never restart silently. */
export interface KnowledgeRetrieval {
  search(subject: TrustedKnowledgeSubject, request: SearchRequest): Promise<SearchResult>;
  get(subject: TrustedKnowledgeSubject, ref: RecordRef): Promise<RecordReadResult>;
  expand(subject: TrustedKnowledgeSubject, request: ExpandRequest): Promise<ExpandResult>;
  evidence(subject: TrustedKnowledgeSubject, request: EvidenceRequest): Promise<EvidenceResult>;
  export(subject: TrustedKnowledgeSubject, request: KnowledgeExportRequest): Promise<KnowledgeExportResult>;
}

export const PendingWorkUnitSchema = z.strictObject({
  id: Id,
  update: z.strictObject({ ref: RecordRefSchema, operation: IntakeOperationSchema }),
  affectedClaim: RecordRefSchema.extend({ type: z.literal("claim") }).optional(),
});
export type PendingWorkUnit = z.infer<typeof PendingWorkUnitSchema>;
export const PendingRequestSchema = z.strictObject({ limit: PageLimitSchema, maxBytes: PageByteLimitSchema });
export const WorkBatchSchema = z.strictObject({ id: Id, checkpoint: Id });
export type WorkBatch = z.infer<typeof WorkBatchSchema>;
export const PendingKnowledgeSchema = boundedJson(z.union([
  z.strictObject({ kind: z.literal("ok"), batch: WorkBatchSchema, units: z.array(PendingWorkUnitSchema).max(100), remaining: z.boolean(), bytes: z.number().int().nonnegative().max(MAX_PAGE_BYTES) }),
  DeniedSchema, BoundaryFailureSchema,
]), MAX_PAGE_BYTES, "Pending knowledge batch is too large");
export type PendingKnowledge = z.infer<typeof PendingKnowledgeSchema>;
export const MaintenanceStatusResultSchema = z.union([
  z.strictObject({
    kind: z.literal("ok"),
    pendingUnits: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    oldestPendingAtMs: z.number().int().nonnegative().optional(),
    checkpoint: Id,
  }),
  DeniedSchema, BoundaryFailureSchema,
]);
export type MaintenanceStatusResult = z.infer<typeof MaintenanceStatusResultSchema>;
const sameRef = (left: RecordRef, right: RecordRef) => left.type === right.type && left.origin === right.origin && left.id === right.id && left.revision === right.revision;
const sameLogicalRef = (left: RecordRef, right: RecordRef) => left.type === right.type && left.origin === right.origin && left.id === right.id;
export const ClaimProposalSchema = boundedJson(z.union([
  z.strictObject({ record: ClaimRecordSchema, expectedRevision: z.null(), links: z.array(KnowledgeLinkSchema).max(100) }),
  z.strictObject({ record: ClaimRecordSchema, expectedRevision: Id, previous: RecordRefSchema.extend({ type: z.literal("claim") }), links: z.array(KnowledgeLinkSchema).max(100) }),
]).superRefine((proposal, context) => {
  if (proposal.expectedRevision !== null) {
    if (proposal.previous.revision !== proposal.expectedRevision || !sameLogicalRef(proposal.previous, proposal.record.ref)) {
      context.addIssue({ code: "custom", path: ["previous"], message: "Edited claim must identify the exact prior logical revision" });
    }
    if (!proposal.record.provenance.inputs.some((input) => sameRef(input, proposal.previous))) {
      context.addIssue({ code: "custom", path: ["record", "provenance", "inputs"], message: "Edited claim revision must be retained in provenance" });
    }
  }
  for (const [index, link] of proposal.links.entries()) {
    if (!sameRef(link.from, proposal.record.ref)) context.addIssue({ code: "custom", path: ["links", index, "from"], message: "Proposal links must originate at the proposed claim revision" });
    if (!proposal.record.provenance.inputs.some((input) => sameRef(input, link.to))) context.addIssue({ code: "custom", path: ["links", index, "to"], message: "Cited evidence must be retained in claim provenance" });
  }
}), MAX_PAGE_BYTES, "Claim proposal is too large");
export type ClaimProposal = z.infer<typeof ClaimProposalSchema>;
export const PublicationInputSchema = boundedJson(z.strictObject({ batch: WorkBatchSchema, proposals: z.array(ClaimProposalSchema).max(100) }), MAX_PAGE_BYTES, "Publication request is too large");
export type PublicationInput = z.infer<typeof PublicationInputSchema>;
export const PublicationResultSchema = z.union([
  z.strictObject({ kind: z.literal("published"), checkpoint: Id, remaining: z.boolean() }),
  z.strictObject({ kind: z.literal("conflict") }), DeniedSchema, BoundaryFailureSchema,
]);
export type PublicationResult = z.infer<typeof PublicationResultSchema>;
export const WorkBatchReleaseInputSchema = z.strictObject({ batch: WorkBatchSchema });
export type WorkBatchReleaseInput = z.infer<typeof WorkBatchReleaseInputSchema>;
export const WorkBatchReleaseResultSchema = z.union([
  z.strictObject({ kind: z.literal("released") }),
  z.strictObject({ kind: z.literal("conflict") }), DeniedSchema, BoundaryFailureSchema,
]);
export type WorkBatchReleaseResult = z.infer<typeof WorkBatchReleaseResultSchema>;
export interface KnowledgeMaintenance {
  /** Each provider-issued unit represents one bounded repair. Publishing completes only the issued units; the provider retains every remaining unit. */
  status(subject: TrustedKnowledgeSubject): Promise<MaintenanceStatusResult>;
  pending(subject: TrustedKnowledgeSubject, request: z.infer<typeof PendingRequestSchema>): Promise<PendingKnowledge>;
  publish(subject: TrustedKnowledgeSubject, input: PublicationInput): Promise<PublicationResult>;
  /** Releases only this exact subject-owned lease. It advances no checkpoint and every unit remains pending. */
  release(subject: TrustedKnowledgeSubject, input: WorkBatchReleaseInput): Promise<WorkBatchReleaseResult>;
}

export const AssessmentIdentitySchema = z.strictObject({ requestId: Id, payloadFingerprint: Id });
export const AssessmentRequestSchema = boundedJson(AssessmentIdentitySchema.extend({ evidence: EvidencePackageSchema }), MAX_PAGE_BYTES, "Assessment request is too large");
export type AssessmentRequest = z.infer<typeof AssessmentRequestSchema>;
export const AssessmentReconcileRequestSchema = AssessmentIdentitySchema;
export type AssessmentReconcileRequest = z.infer<typeof AssessmentReconcileRequestSchema>;
const AssessmentIdentified = AssessmentIdentitySchema.shape;
export const AssessmentResultSchema = boundedJson(z.union([
  z.strictObject({ kind: z.literal("running"), ...AssessmentIdentified }),
  z.strictObject({ kind: z.literal("completed"), ...AssessmentIdentified, proposals: z.array(ClaimProposalSchema).max(100) }),
  z.strictObject({ kind: z.literal("uncertain"), ...AssessmentIdentified }),
  z.strictObject({ kind: z.literal("cancelled"), ...AssessmentIdentified }),
  z.strictObject({ kind: z.literal("failure"), ...AssessmentIdentified, code: z.enum(["stale_reference", "invalid_reference", "invalid_input", "too_large", "unavailable"]) }),
  z.strictObject({ kind: z.literal("conflict") }), DeniedSchema,
]), MAX_PAGE_BYTES, "Assessment result is too large");
export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;
export const AssessmentCancellationResultSchema = z.union([
  z.strictObject({ kind: z.literal("cancelled"), ...AssessmentIdentified }),
  z.strictObject({ kind: z.literal("too_late"), ...AssessmentIdentified }),
  z.strictObject({ kind: z.literal("uncertain"), ...AssessmentIdentified }),
  z.strictObject({ kind: z.literal("failure"), ...AssessmentIdentified, code: z.enum(["invalid_input", "unavailable"]) }),
  z.strictObject({ kind: z.literal("conflict") }), DeniedSchema,
]);
export type AssessmentCancellationResult = z.infer<typeof AssessmentCancellationResultSchema>;
/** The provider authorizes disclosure to its configured model destination before submission. */
export interface KnowledgeAssessment {
  assess(subject: TrustedKnowledgeSubject, request: AssessmentRequest): Promise<AssessmentResult>;
  reconcile(subject: TrustedKnowledgeSubject, request: AssessmentReconcileRequest): Promise<AssessmentResult>;
  cancel(subject: TrustedKnowledgeSubject, request: AssessmentReconcileRequest): Promise<AssessmentCancellationResult>;
}

/** Fingerprint covers artifacts, text formatting, segmentation, pooling and normalization. */
export const EmbeddingConfigurationSchema = z.strictObject({ id: Id, fingerprint: Id, dimensions: z.number().int().positive().max(16_384) });
export type EmbeddingConfiguration = z.infer<typeof EmbeddingConfigurationSchema>;
export const IndexWorkRequestSchema = z.strictObject({ configuration: EmbeddingConfigurationSchema, limit: PageLimitSchema, maxBytes: PageByteLimitSchema });
export type IndexWorkRequest = z.infer<typeof IndexWorkRequestSchema>;
export const IndexWorkUpdateSchema = z.union([
  z.strictObject({ id: Id, operation: z.literal("upsert"), record: ActiveRecordSchema }),
  z.strictObject({ id: Id, operation: z.literal("remove"), ref: RecordRefSchema }),
]);
export type IndexWorkUpdate = z.infer<typeof IndexWorkUpdateSchema>;
export const IndexWorkResultSchema = boundedJson(z.union([
  z.strictObject({ kind: z.literal("ok"), batch: WorkBatchSchema, updates: z.array(IndexWorkUpdateSchema).max(100), remaining: z.boolean(), bytes: z.number().int().nonnegative().max(MAX_PAGE_BYTES) }),
  DeniedSchema, BoundaryFailureSchema,
]), MAX_PAGE_BYTES, "Index work batch is too large");
export type IndexWorkResult = z.infer<typeof IndexWorkResultSchema>;
export const IndexWorkAcknowledgeInputSchema = z.strictObject({ batch: WorkBatchSchema });
export type IndexWorkAcknowledgeInput = z.infer<typeof IndexWorkAcknowledgeInputSchema>;
export const IndexWorkAcknowledgeResultSchema = z.union([
  z.strictObject({ kind: z.literal("acknowledged"), checkpoint: Id }),
  z.strictObject({ kind: z.literal("conflict") }), DeniedSchema, BoundaryFailureSchema,
]);
export type IndexWorkAcknowledgeResult = z.infer<typeof IndexWorkAcknowledgeResultSchema>;
/**
 * Supplies current searchable record revisions independently for each embedding
 * configuration. Acknowledgement advances only this feed after durable index
 * activation; repeating a batch or its acknowledgement is harmless.
 */
export interface KnowledgeIndexWork {
  pending(subject: TrustedKnowledgeSubject, request: IndexWorkRequest): Promise<IndexWorkResult>;
  acknowledge(subject: TrustedKnowledgeSubject, input: IndexWorkAcknowledgeInput): Promise<IndexWorkAcknowledgeResult>;
}
export const EmbeddingRoleSchema = z.enum(["document", "query"]);
export const EmbeddingInputSchema = boundedJson(z.strictObject({ id: Id, revision: Id.optional(), text: z.string().min(1).max(100_000) }), 256 * 1024, "Embedding input is too large");
export type EmbeddingInput = z.infer<typeof EmbeddingInputSchema>;
export const EmbeddingBatchSchema = boundedJson(z.strictObject({ configuration: EmbeddingConfigurationSchema, role: EmbeddingRoleSchema, items: z.array(EmbeddingInputSchema).min(1).max(100) }), MAX_PAGE_BYTES, "Embedding batch is too large");
export type EmbeddingBatch = z.infer<typeof EmbeddingBatchSchema>;
export const EmbeddedVectorSchema = z.strictObject({ id: Id, revision: Id.optional(), vector: z.array(z.number().finite()).min(1).max(16_384) });
export const EmbeddingResultSchema = boundedJson(z.union([
  z.strictObject({ kind: z.literal("ok"), configuration: EmbeddingConfigurationSchema, items: z.array(EmbeddedVectorSchema).max(100) }),
  DeniedSchema, BoundaryFailureSchema,
]), MAX_PAGE_BYTES, "Embedding result is too large");
export type EmbeddingResult = z.infer<typeof EmbeddingResultSchema>;
/** Bind provider output validation to the exact request; schemas alone cannot compare count, order, identity, and dimensions. */
export function embeddingResultSchemaFor(batch: EmbeddingBatch) {
  return EmbeddingResultSchema.superRefine((result, context) => {
    if (result.kind !== "ok") return;
    if (result.configuration.id !== batch.configuration.id || result.configuration.fingerprint !== batch.configuration.fingerprint || result.configuration.dimensions !== batch.configuration.dimensions) {
      context.addIssue({ code: "custom", path: ["configuration"], message: "Embedding configuration does not match the request" });
    }
    if (result.items.length !== batch.items.length) context.addIssue({ code: "custom", path: ["items"], message: "Embedding result count does not match the request" });
    for (const [index, item] of result.items.entries()) {
      const input = batch.items[index];
      if (!input || item.id !== input.id || item.revision !== input.revision) context.addIssue({ code: "custom", path: ["items", index], message: "Embedding result identity or order does not match the request" });
      if (item.vector.length !== batch.configuration.dimensions) context.addIssue({ code: "custom", path: ["items", index, "vector"], message: "Embedding vector dimensions do not match the request" });
    }
  });
}
export interface KnowledgeEmbeddings { embed(subject: TrustedKnowledgeSubject, batch: EmbeddingBatch): Promise<EmbeddingResult>; }

/** `id` is a provider-private passage identity; multiple passages may point at one authoritative record revision. */
export const IndexedEmbeddingSchema = z.strictObject({ id: Id, ref: RecordRefSchema, vector: z.array(z.number().finite()).min(1).max(16_384) });
export type IndexedEmbedding = z.infer<typeof IndexedEmbeddingSchema>;
export const EmbeddingIndexPrepareSchema = z.strictObject({ configuration: EmbeddingConfigurationSchema, generation: z.number().int().positive(), expectedActiveGeneration: z.number().int().nonnegative().nullable() });
export const EmbeddingIndexPrepareResultSchema = z.union([
  z.strictObject({ kind: z.literal("ready"), stageId: Id, generation: z.number().int().positive(), activeGeneration: z.number().int().nonnegative().nullable() }),
  z.strictObject({ kind: z.literal("conflict") }), z.strictObject({ kind: z.literal("configuration_mismatch") }), BoundaryFailureSchema,
]);
export const EmbeddingIndexStageSchema = boundedJson(z.strictObject({ stageId: Id, entries: z.array(IndexedEmbeddingSchema).max(100), removals: z.array(RecordRefSchema).max(100) }), MAX_PAGE_BYTES, "Embedding index update is too large");
export const EmbeddingIndexStageResultSchema = z.union([
  z.strictObject({ kind: z.literal("staged"), stageId: Id }), z.strictObject({ kind: z.literal("conflict") }),
  z.strictObject({ kind: z.literal("configuration_mismatch") }), z.strictObject({ kind: z.literal("dimension_mismatch") }), BoundaryFailureSchema,
]);
export const EmbeddingIndexActivateSchema = z.strictObject({ stageId: Id, expectedActiveGeneration: z.number().int().nonnegative().nullable() });
export const EmbeddingIndexActivateResultSchema = z.union([
  z.strictObject({ kind: z.literal("activated"), generation: z.number().int().positive() }), z.strictObject({ kind: z.literal("conflict") }), BoundaryFailureSchema,
]);
export const EmbeddingIndexQuerySchema = z.strictObject({ configuration: EmbeddingConfigurationSchema, vector: z.array(z.number().finite()).min(1).max(16_384), limit: PageLimitSchema });
export type EmbeddingIndexQuery = z.infer<typeof EmbeddingIndexQuerySchema>;
export const RankedRecordSchema = z.strictObject({ ref: RecordRefSchema, relevance: z.number().finite() });
export const EmbeddingIndexQueryResultSchema = z.union([
  z.strictObject({ kind: z.literal("ok"), activeGeneration: z.number().int().positive(), items: z.array(RankedRecordSchema).max(100).superRefine((items, context) => {
    const logical = new Set<string>();
    for (const [index, item] of items.entries()) {
      const key = JSON.stringify([item.ref.type, item.ref.origin, item.ref.id, item.ref.revision]);
      if (logical.has(key)) context.addIssue({ code: "custom", path: [index, "ref"], message: "Ranked results must deduplicate record revisions" });
      logical.add(key);
    }
  }) }),
  z.strictObject({ kind: z.literal("dimension_mismatch") }), z.strictObject({ kind: z.literal("configuration_mismatch") }),
  z.strictObject({ kind: z.literal("unavailable") }), BoundaryFailureSchema,
]);
export type EmbeddingIndexQueryResult = z.infer<typeof EmbeddingIndexQueryResultSchema>;
/** Staging is incrementally writable; activation is a separate CAS and queries see only the active generation. */
export interface KnowledgeEmbeddingIndex {
  prepare(input: z.infer<typeof EmbeddingIndexPrepareSchema>): Promise<z.infer<typeof EmbeddingIndexPrepareResultSchema>>;
  stage(input: z.infer<typeof EmbeddingIndexStageSchema>): Promise<z.infer<typeof EmbeddingIndexStageResultSchema>>;
  activate(input: z.infer<typeof EmbeddingIndexActivateSchema>): Promise<z.infer<typeof EmbeddingIndexActivateResultSchema>>;
  query(input: EmbeddingIndexQuery): Promise<EmbeddingIndexQueryResult>;
}
