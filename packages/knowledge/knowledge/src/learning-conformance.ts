import {
  IntakeResultSchema,
  SearchResultSchema,
  EvidenceResultSchema,
  KnowledgeExportResultSchema,
  type IntakeInput,
  type EvidenceRequest,
  type KnowledgeExportRequest,
  type SearchRequest,
} from "./index.js";
import {
  LearningAvailabilitySchema,
  LearningCurationStatusSchema,
  type LearningService,
} from "./learning.js";

/** A disposable authorized fixture supplied by each implementation. Never use user data.
 * This tests the shared application surface, not installation or enterprise-policy semantics. */
export interface LearningConformanceFixture {
  service: LearningService;
  contribution: Extract<IntakeInput, { operation: "upsert" }>;
  search: SearchRequest;
  evidence: EvidenceRequest;
  export: KnowledgeExportRequest;
}
export async function learningConformance(fixture: LearningConformanceFixture): Promise<void> {
  const check = (condition: unknown, message: string) => {
    if (!condition) throw Error(`Learning conformance: ${message}`);
  };
  const status = LearningAvailabilitySchema.parse(await fixture.service.status());
  check(status.availability === "ready", "fixture must be available");
  const result = IntakeResultSchema.parse(await fixture.service.ingest(fixture.contribution));
  check(result.kind === "accepted" || result.kind === "duplicate", "contribution was not retained");
  const search = SearchResultSchema.parse(await fixture.service.search(fixture.search));
  check(search.kind === "ok", "retrieval unavailable");
  if (search.kind === "ok") {
    const expected = fixture.contribution.record;
    check(
      search.items.some(
        ({ record }) =>
          record.ref.type === expected.ref.type &&
          record.ref.origin === expected.ref.origin &&
          record.ref.id === expected.ref.id &&
          record.ref.revision === expected.ref.revision &&
          record.body === expected.body,
      ),
      "retained contribution missing or changed",
    );
  }
  check(
    EvidenceResultSchema.parse(await fixture.service.evidence(fixture.evidence)).kind === "ok",
    "evidence unavailable",
  );
  check(
    KnowledgeExportResultSchema.parse(await fixture.service.export(fixture.export)).kind === "ok",
    "export unavailable",
  );
  if (fixture.service.capabilities.curation)
    LearningCurationStatusSchema.parse(await fixture.service.capabilities.curation.status());
  await learningRevisionConformance(fixture);
  await learningDeletionConformance(fixture);
}

/** Exact references remain immutable as the current revision advances. */
async function learningRevisionConformance(fixture: LearningConformanceFixture) {
  const { service, contribution } = fixture;
  const check = (condition: unknown, message: string) => {
    if (!condition) throw Error(`Learning revision conformance: ${message}`);
  };
  const linked = structuredClone(contribution);
  linked.record.ref.id += "-linked";
  linked.links = [{ from: linked.record.ref, to: contribution.record.ref, relation: "support" }];
  check((await service.ingest(linked)).kind === "accepted", "linked record not retained");
  const request = { ...fixture.export, refs: [contribution.record.ref, linked.record.ref] };
  const before = KnowledgeExportResultSchema.parse(await service.export(request));
  check(
    before.kind === "ok" &&
      before.links.some((link) => JSON.stringify(link) === JSON.stringify(linked.links[0])),
    "original evidence link missing",
  );
  const next = structuredClone(contribution);
  next.expectedRevision = contribution.record.ref.revision;
  next.record.ref.revision += "-next";
  next.record.body = "Updated public conformance material";
  check((await service.ingest(next)).kind === "accepted", "next revision not retained");
  const reused = structuredClone(contribution);
  reused.expectedRevision = next.record.ref.revision;
  reused.record.body = "This must never replace the pinned original";
  const result = IntakeResultSchema.parse(await service.ingest(reused));
  check(result.kind === "conflict" || result.kind === "failure", "historical revision was reused");
  const after = KnowledgeExportResultSchema.parse(await service.export(request));
  check(
    before.kind === "ok" &&
      after.kind === "ok" &&
      JSON.stringify(before.records) === JSON.stringify(after.records) &&
      JSON.stringify(before.links) === JSON.stringify(after.links),
    "pinned original body or links changed",
  );
}

/** Deletion is a new CAS revision whose identical replay is still recognized. */
async function learningDeletionConformance(fixture: LearningConformanceFixture) {
  const { service, contribution } = fixture;
  const check = (condition: unknown, message: string) => {
    if (!condition) throw Error(`Learning deletion conformance: ${message}`);
  };
  const deletion: IntakeInput = {
    operation: "delete",
    ref: { ...contribution.record.ref, revision: contribution.record.ref.revision + "-deleted" },
    expectedRevision: contribution.record.ref.revision + "-next",
  };
  const result = IntakeResultSchema.parse(await service.ingest(deletion));
  check(result.kind === "accepted", "new deletion revision was rejected");
  const replay = IntakeResultSchema.parse(await service.ingest(structuredClone(deletion)));
  check(replay.kind === "duplicate", "deletion replay identity was lost");
  const exported = KnowledgeExportResultSchema.parse(
    await service.export({
      ...fixture.export,
      refs: [
        contribution.record.ref,
        { ...contribution.record.ref, revision: contribution.record.ref.revision + "-next" },
        { ...contribution.record.ref, id: contribution.record.ref.id + "-linked" },
      ],
    }),
  );
  check(
    exported.kind === "ok" && exported.records.length === 1 && exported.links.length === 0,
    "deletion retained a body or incident link",
  );
  const search = SearchResultSchema.parse(await service.search(fixture.search));
  check(
    search.kind === "ok" &&
      !search.items.some(
        ({ record }) =>
          record.ref.id === contribution.record.ref.id &&
          record.ref.origin === contribution.record.ref.origin,
      ),
    "deleted material remains searchable",
  );
  const stale = IntakeResultSchema.parse(await service.ingest(contribution));
  check(stale.kind === "conflict", "stale contribution bypassed the tombstone");
}
