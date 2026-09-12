import { expect, test } from "bun:test";
import {
  knowledgeAssessmentConformance, knowledgeEmbeddingConformance, knowledgeIndexWorkConformance, knowledgeStorageConformance,
  type KnowledgeAssessmentConformanceFixture, type KnowledgeEmbeddingConformanceFixture,
  type KnowledgeIndexWorkConformanceFixture, type KnowledgeStorageConformanceFixture,
} from "./src/conformance.js";
import {
  AssessmentRequestSchema, EmbeddingIndexActivateSchema, EmbeddingIndexPrepareSchema,
  EmbeddingIndexQuerySchema, EmbeddingIndexStageSchema, EmbeddingBatchSchema,
  EvidenceRequestSchema, ExpandRequestSchema, IndexWorkAcknowledgeInputSchema, IndexWorkRequestSchema, IntakeInputSchema, PendingRequestSchema,
  PublicationInputSchema, SearchRequestSchema, WorkBatchReleaseInputSchema,
  type AssessmentResult, type EmbeddingConfiguration, type IndexedEmbedding,
  type KnowledgeAssessment, type KnowledgeEmbeddingIndex, type KnowledgeEmbeddings,
  type KnowledgeIndexWork, type KnowledgeIntake, type KnowledgeLink, type KnowledgeMaintenance, type KnowledgeRecord,
  type KnowledgeRetrieval, type PendingWorkUnit, type RecordRef, type TrustedKnowledgeSubject,
} from "./src/index.js";

const authorizedSubject = { type: "user", id: "allowed", properties: {} } as TrustedKnowledgeSubject;
const deniedSubject = { type: "user", id: "denied", properties: {} } as TrustedKnowledgeSubject;
const allowed = (subject: TrustedKnowledgeSubject) => subject.id === authorizedSubject.id;
const logicalKey = (ref: RecordRef) => `${ref.type}\0${ref.origin}\0${ref.id}`;
const revisionKey = (ref: RecordRef) => `${logicalKey(ref)}\0${ref.revision}`;
const sameRef = (left: RecordRef, right: RecordRef) => revisionKey(left) === revisionKey(right);
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function createMemoryStorageFixture(): KnowledgeStorageConformanceFixture {
  const records = new Map<string, KnowledgeRecord>();
  const current = new Map<string, { ref: RecordRef; operation: "upsert" | "withdraw" | "delete"; fingerprint: string }>();
  const deleted = new Set<string>();
  let links: KnowledgeLink[] = [];
  let epoch = 0;
  let nextEvent = 1;
  let nextBatch = 1;
  const events: Array<{ sequence: number; update: { ref: RecordRef; operation: "upsert" | "withdraw" | "delete" }; targets: RecordRef[]; completed: Set<string> }> = [];
  const batches = new Map<string, { units: Array<{ sequence: number; unit: PendingWorkUnit }> }>();
  const cursors = new Map<string, { kind: "evidence"; request: string; subject: string; epoch: number; recordOffset: number; linkOffset: number }>();

  const currentRecord = (ref: RecordRef) => {
    const latest = current.get(logicalKey(ref));
    return latest && latest.operation !== "delete" && latest.ref.revision === ref.revision ? records.get(revisionKey(ref)) : undefined;
  };
  const retainedRecord = (ref: RecordRef) => deleted.has(logicalKey(ref)) ? undefined : records.get(revisionKey(ref));
  const affectedClaims = (changed: RecordRef) => links
    .filter((link) => logicalKey(link.to) === logicalKey(changed) && link.from.type === "claim")
    .map((link) => link.from)
    .filter((item, index, all) => all.findIndex((candidate) => sameRef(candidate, item)) === index);
  const staleDependents = (claims: readonly RecordRef[]) => {
    for (const claimRef of claims) {
      const stored = records.get(revisionKey(claimRef));
      if (stored?.ref.type === "claim" && stored.status === "active") records.set(revisionKey(claimRef), { ...stored, freshness: "stale" });
    }
  };
  const addEvent = (ref: RecordRef, operation: "upsert" | "withdraw" | "delete", targets = affectedClaims(ref)) => {
    events.push({ sequence: nextEvent++, update: { ref, operation }, targets, completed: new Set() });
  };

  const intake: KnowledgeIntake = {
    async ingest(subject, input) {
      const parsed = IntakeInputSchema.parse(input);
      const reference = parsed.operation === "delete" ? parsed.ref : parsed.record.ref;
      if (!allowed(subject)) return { kind: "denied" };
      const key = logicalKey(reference);
      const prior = current.get(key);
      const dependents = prior ? affectedClaims(reference) : [];
      const fingerprint = JSON.stringify(parsed);
      if (prior?.ref.revision === reference.revision) {
        return prior.fingerprint === fingerprint ? { kind: "duplicate", revision: reference.revision } : { kind: "conflict" };
      }
      if (parsed.expectedRevision === null ? prior !== undefined : prior?.ref.revision !== parsed.expectedRevision) return { kind: "conflict" };
      if (parsed.operation === "delete") {
        deleted.add(key);
        for (const storedKey of [...records.keys()]) if (storedKey.startsWith(`${key}\0`)) records.delete(storedKey);
        links = links.filter((link) => logicalKey(link.from) !== key && logicalKey(link.to) !== key);
      } else {
        deleted.delete(key);
        records.set(revisionKey(reference), parsed.record);
        links = links.filter((link) => logicalKey(link.from) !== key);
        links.push(...parsed.links);
      }
      current.set(key, { ref: reference, operation: parsed.operation, fingerprint });
      if (prior) staleDependents(dependents);
      addEvent(reference, parsed.operation, dependents);
      epoch += 1;
      return { kind: "accepted", revision: reference.revision };
    },
  };

  const retrieval: KnowledgeRetrieval = {
    async search(subject, request) {
      const parsed = SearchRequestSchema.parse(request);
      if (!allowed(subject)) return { kind: "denied" };
      const items = [...current.values()].flatMap((entry) => {
        const stored = currentRecord(entry.ref);
        return stored?.status === "active" && stored.body.toLowerCase().includes(parsed.query.toLowerCase())
          ? [{ record: stored, relevance: 1 }] : [];
      }).slice(0, parsed.limit);
      return { kind: "ok", mode: "lexical", semantic: { status: "unavailable" }, items, bytes: bytes(items) };
    },
    async get(subject, ref) {
      if (!allowed(subject)) return { kind: "denied" };
      const record = retainedRecord(ref);
      return record ? { kind: "ok", record } : { kind: "ok" };
    },
    async expand(subject, request) {
      const parsed = ExpandRequestSchema.parse(request);
      if (!allowed(subject)) return { kind: "denied" };
      const candidates = links.filter((link) => parsed.direction === "forward" ? sameRef(link.from, parsed.ref) : sameRef(link.to, parsed.ref));
      const items = candidates.slice(0, parsed.limit);
      return { kind: "ok", items, bytes: bytes(items) };
    },
    async evidence(subject, request) {
      const parsed = EvidenceRequestSchema.parse(request);
      if (!allowed(subject)) return { kind: "denied" };
      const signature = JSON.stringify({ ...parsed, cursor: undefined });
      let recordOffset = 0;
      let linkOffset = 0;
      if (parsed.cursor) {
        const saved = cursors.get(parsed.cursor);
        if (!saved || saved.kind !== "evidence" || saved.request !== signature || saved.subject !== subject.id) return { kind: "invalid_cursor" };
        if (saved.epoch !== epoch) return { kind: "invalidated" };
        recordOffset = saved.recordOffset;
        linkOffset = saved.linkOffset;
      }
      const seen = new Set<string>();
      const queue: Array<{ ref: RecordRef; depth: number }> = [{ ref: parsed.root, depth: 0 }];
      const traversedRecords: KnowledgeRecord[] = [];
      const traversedLinks: KnowledgeLink[] = [];
      while (queue.length > 0) {
        const next = queue.shift()!;
        if (seen.has(revisionKey(next.ref)) || next.depth > parsed.maxDepth) continue;
        seen.add(revisionKey(next.ref));
        const stored = retainedRecord(next.ref);
        if (stored) traversedRecords.push(stored);
        if (next.depth === parsed.maxDepth) continue;
        for (const link of links) {
          const matches = parsed.direction === "forward" ? sameRef(link.from, next.ref) : sameRef(link.to, next.ref);
          if (!matches) continue;
          if (!traversedLinks.some((candidate) => JSON.stringify(candidate) === JSON.stringify(link))) traversedLinks.push(link);
          queue.push({ ref: parsed.direction === "forward" ? link.to : link.from, depth: next.depth + 1 });
        }
      }
      const pageRecords = traversedRecords.slice(recordOffset, recordOffset + parsed.maxRecords);
      const pageLinks = traversedLinks.slice(linkOffset, linkOffset + parsed.maxLinks);
      if (bytes({ records: pageRecords, links: pageLinks }) > parsed.maxBytes) return { kind: "failure", code: "too_large" };
      const nextRecordOffset = recordOffset + pageRecords.length;
      const nextLinkOffset = linkOffset + pageLinks.length;
      let cursor;
      if (nextRecordOffset < traversedRecords.length || nextLinkOffset < traversedLinks.length) {
        cursor = `cursor-${cursors.size + 1}` as never;
        cursors.set(cursor, { kind: "evidence", request: signature, subject: subject.id, epoch, recordOffset: nextRecordOffset, linkOffset: nextLinkOffset });
      }
      return { kind: "ok", records: pageRecords, links: pageLinks, bytes: bytes({ records: pageRecords, links: pageLinks }), ...(cursor ? { cursor } : {}) };
    },
    async export(subject, request) {
      if (!allowed(subject)) return { kind: "denied" };
      const exportRecords = request.refs.flatMap((ref) => { const item = currentRecord(ref); return item ? [item] : []; });
      const exportLinks = links.filter((link) => request.refs.some((ref) => sameRef(ref, link.from) || sameRef(ref, link.to)));
      return { kind: "ok", records: exportRecords, links: exportLinks, bytes: bytes({ records: exportRecords, links: exportLinks }) };
    },
  };

  const maintenance: KnowledgeMaintenance = {
    async status(subject) {
      if (!allowed(subject)) return { kind: "denied" };
      const pendingUnits = events.reduce((count, event) => count + (event.targets.length || 1) - event.completed.size, 0);
      return { kind: "ok", pendingUnits, ...(pendingUnits ? { oldestPendingAtMs: 1_757_678_400_000 } : {}), checkpoint: `status-${nextEvent - 1}` };
    },
    async pending(subject, request) {
      const parsed = PendingRequestSchema.parse(request);
      if (!allowed(subject)) return { kind: "denied" };
      const id = `batch-${nextBatch++}`;
      const available = events.flatMap((event) => {
        const targets = event.targets.length ? event.targets : [undefined];
        return targets.flatMap((target, index) => {
          const unitKey = target ? revisionKey(target) : "source";
          if (event.completed.has(unitKey)) return [];
          const unit: PendingWorkUnit = {
            id: `unit-${event.sequence}-${index}`,
            update: event.update,
            ...(target?.type === "claim" ? { affectedClaim: { ...target, type: "claim" as const } } : {}),
          };
          return [{ sequence: event.sequence, unit }];
        });
      });
      const selected = available.slice(0, parsed.limit);
      const batch = { id, checkpoint: `unit-${selected.at(-1)?.unit.id ?? "none"}` };
      batches.set(id, { units: selected });
      const units = selected.map((item) => item.unit);
      return { kind: "ok", batch, units, remaining: available.length > selected.length, bytes: bytes(units) };
    },
    async publish(subject, input) {
      const parsed = PublicationInputSchema.parse(input);
      if (!allowed(subject)) return { kind: "denied" };
      const captured = batches.get(parsed.batch.id);
      if (!captured || parsed.batch.checkpoint !== `unit-${captured.units.at(-1)?.unit.id ?? "none"}` ||
        captured.units.some(({ unit }) => current.get(logicalKey(unit.update.ref))?.ref.revision !== unit.update.ref.revision ||
          (unit.affectedClaim !== undefined && current.get(logicalKey(unit.affectedClaim))?.ref.revision !== unit.affectedClaim.revision))) return { kind: "conflict" };
      for (const proposal of parsed.proposals) {
        const prior = current.get(logicalKey(proposal.record.ref));
        if (proposal.expectedRevision === null ? prior !== undefined : prior?.ref.revision !== proposal.expectedRevision) return { kind: "conflict" };
        if (proposal.record.provenance.inputs.some((input) => current.get(logicalKey(input))?.ref.revision !== input.revision)) return { kind: "conflict" };
      }
      for (const proposal of parsed.proposals) {
        records.set(revisionKey(proposal.record.ref), proposal.record);
        current.set(logicalKey(proposal.record.ref), { ref: proposal.record.ref, operation: "upsert", fingerprint: JSON.stringify(proposal) });
        links.push(...proposal.links);
      }
      for (const capturedUnit of captured.units) {
        const event = events.find((candidate) => candidate.sequence === capturedUnit.sequence)!;
        event.completed.add(capturedUnit.unit.affectedClaim ? revisionKey(capturedUnit.unit.affectedClaim) : "source");
      }
      batches.delete(parsed.batch.id);
      const remaining = events.some((event) => (event.targets.length ? event.targets : [undefined]).some((target) => !event.completed.has(target ? revisionKey(target) : "source")));
      return { kind: "published", checkpoint: `published-${parsed.batch.checkpoint}`, remaining };
    },
    async release(subject, input) {
      const parsed = WorkBatchReleaseInputSchema.parse(input);
      if (!allowed(subject)) return { kind: "denied" };
      const captured = batches.get(parsed.batch.id);
      if (!captured || parsed.batch.checkpoint !== `unit-${captured.units.at(-1)?.unit.id ?? "none"}`) return { kind: "conflict" };
      batches.delete(parsed.batch.id);
      return { kind: "released" };
    },
  };
  return { intake, retrieval, maintenance, authorizedSubject, deniedSubject };
}

function assessmentEvidence() {
  const source = {
    ref: { type: "source" as const, origin: "conformance", id: "assessment-source", revision: "r1" },
    body: "Pinned evidence.", status: "active" as const, confidence: { value: "provisional" },
    provenance: { producer: { type: "conformance", id: "fixture" }, inputs: [] },
  };
  return { roots: [{ unitId: "assessment-unit", root: source.ref }], records: [source], links: [], complete: true };
}

function createMemoryAssessmentFixture(): KnowledgeAssessmentConformanceFixture {
  const evidence = assessmentEvidence();
  const requests = new Map<string, { fingerprint: string; result: AssessmentResult; evidence: typeof evidence }>();
  const assessment: KnowledgeAssessment = {
    async assess(subject, input) {
      const parsed = AssessmentRequestSchema.parse(input);
      if (!allowed(subject)) return { kind: "denied" };
      const prior = requests.get(parsed.requestId);
      if (prior) return prior.fingerprint === parsed.payloadFingerprint ? prior.result : { kind: "conflict" };
      const result = { kind: "uncertain" as const, requestId: parsed.requestId, payloadFingerprint: parsed.payloadFingerprint };
      requests.set(parsed.requestId, { fingerprint: parsed.payloadFingerprint, result, evidence });
      return result;
    },
    async reconcile(subject, input) {
      if (!allowed(subject)) return { kind: "denied" };
      const prior = requests.get(input.requestId);
      if (!prior) return { kind: "failure", requestId: input.requestId, payloadFingerprint: input.payloadFingerprint, code: "invalid_input" };
      if (prior.fingerprint !== input.payloadFingerprint) return { kind: "conflict" };
      if (prior.result.kind === "running" || prior.result.kind === "uncertain") {
        const source = prior.evidence.records[0]!;
        const claimRef = { type: "claim" as const, origin: "assessment", id: input.requestId, revision: "r1" };
        prior.result = {
          kind: "completed", requestId: input.requestId, payloadFingerprint: input.payloadFingerprint,
          proposals: [{
            record: {
              ref: claimRef, body: `Assessment of ${source.body}`, status: "active", freshness: "current",
              confidence: { value: "provisional" }, provenance: { producer: { type: "assessment", id: "memory" }, inputs: [source.ref] },
            },
            expectedRevision: null, links: [{ from: claimRef, to: source.ref, relation: "support" }],
          }],
        };
      }
      return prior.result;
    },
    async cancel(subject, input) {
      if (!allowed(subject)) return { kind: "denied" };
      const prior = requests.get(input.requestId);
      if (!prior) return { kind: "failure", requestId: input.requestId, payloadFingerprint: input.payloadFingerprint, code: "invalid_input" };
      if (prior.fingerprint !== input.payloadFingerprint) return { kind: "conflict" };
      if (prior.result.kind === "completed") return { kind: "too_late", requestId: input.requestId, payloadFingerprint: input.payloadFingerprint };
      prior.result = { kind: "cancelled", requestId: input.requestId, payloadFingerprint: input.payloadFingerprint };
      return prior.result;
    },
  };
  return { assessment, authorizedSubject, deniedSubject, evidence };
}

function createMemoryEmbeddingFixture(): KnowledgeEmbeddingConformanceFixture {
  const configuration = { id: "synthetic-conformance", fingerprint: "synthetic:v1", dimensions: 3 };
  const knownConfigurations = new Map<string, EmbeddingConfiguration>();
  const stages = new Map<string, { configuration: EmbeddingConfiguration; generation: number; expected: number | null; entries: Map<string, IndexedEmbedding> }>();
  let active: { configuration: EmbeddingConfiguration; generation: number; entries: Map<string, IndexedEmbedding> } | undefined;
  let nextStage = 1;
  const matchesConfiguration = (left: EmbeddingConfiguration, right: EmbeddingConfiguration) =>
    left.id === right.id && left.fingerprint === right.fingerprint && left.dimensions === right.dimensions;

  const embeddings: KnowledgeEmbeddings = {
    async embed(subject, batch) {
      const parsed = EmbeddingBatchSchema.parse(batch);
      if (!allowed(subject)) return { kind: "denied" };
      return {
        kind: "ok", configuration: parsed.configuration,
        items: parsed.items.map((item, index) => ({ id: item.id, ...(item.revision ? { revision: item.revision } : {}), vector: Array.from({ length: parsed.configuration.dimensions }, (_, dimension) => (index + dimension + 1) / parsed.configuration.dimensions) })),
      };
    },
  };
  const embeddingIndex: KnowledgeEmbeddingIndex = {
    async prepare(input) {
      const parsed = EmbeddingIndexPrepareSchema.parse(input);
      const known = knownConfigurations.get(parsed.configuration.id);
      if (known && !matchesConfiguration(known, parsed.configuration)) return { kind: "configuration_mismatch" };
      if ((active?.generation ?? null) !== parsed.expectedActiveGeneration || parsed.generation <= (active?.generation ?? 0)) return { kind: "conflict" };
      knownConfigurations.set(parsed.configuration.id, parsed.configuration);
      const stageId = `stage-${nextStage++}`;
      const priorEntries = active && matchesConfiguration(active.configuration, parsed.configuration) ? active.entries : [];
      stages.set(stageId, { configuration: parsed.configuration, generation: parsed.generation, expected: parsed.expectedActiveGeneration, entries: new Map(priorEntries) });
      return { kind: "ready", stageId, generation: parsed.generation, activeGeneration: active?.generation ?? null };
    },
    async stage(input) {
      const parsed = EmbeddingIndexStageSchema.parse(input);
      const stage = stages.get(parsed.stageId);
      if (!stage) return { kind: "conflict" };
      if (parsed.entries.some((entry) => entry.vector.length !== stage.configuration.dimensions)) return { kind: "dimension_mismatch" };
      for (const removal of parsed.removals) for (const [id, entry] of stage.entries) if (sameRef(removal, entry.ref)) stage.entries.delete(id);
      for (const entry of parsed.entries) stage.entries.set(entry.id, entry);
      return { kind: "staged", stageId: parsed.stageId };
    },
    async activate(input) {
      const parsed = EmbeddingIndexActivateSchema.parse(input);
      const stage = stages.get(parsed.stageId);
      if (!stage || stage.expected !== parsed.expectedActiveGeneration || (active?.generation ?? null) !== parsed.expectedActiveGeneration) return { kind: "conflict" };
      active = { configuration: stage.configuration, generation: stage.generation, entries: new Map(stage.entries) };
      stages.delete(parsed.stageId);
      return { kind: "activated", generation: active.generation };
    },
    async query(input) {
      const parsed = EmbeddingIndexQuerySchema.parse(input);
      if (!active) return { kind: "unavailable" };
      if (!matchesConfiguration(active.configuration, parsed.configuration)) return { kind: "configuration_mismatch" };
      if (parsed.vector.length !== active.configuration.dimensions) return { kind: "dimension_mismatch" };
      const seen = new Set<string>();
      const items = [...active.entries.values()].flatMap((entry) => {
        const key = revisionKey(entry.ref);
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ref: entry.ref, relevance: entry.vector.reduce((sum, value, index) => sum + value * parsed.vector[index]!, 0) }];
      }).sort((left, right) => right.relevance - left.relevance).slice(0, parsed.limit);
      return { kind: "ok", activeGeneration: active.generation, items };
    },
  };
  return { embeddings, embeddingIndex, configuration, authorizedSubject, deniedSubject };
}

function createMemoryIndexWorkFixture(): KnowledgeIndexWorkConformanceFixture {
  const configuration = { id: "index-work-a", fingerprint: "segments:v1", dimensions: 3 };
  const current = new Map<string, KnowledgeRecord>();
  const events: Array<{ sequence: number; updates: Array<{ id: string; operation: "upsert"; record: Extract<KnowledgeRecord, { status: "active" }> } | { id: string; operation: "remove"; ref: RecordRef }> }> = [];
  const progress = new Map<string, { event: number }>();
  const batches = new Map<string, { configuration: string; checkpoint: string; event: number; updates: (typeof events)[number]["updates"] }>();
  const completed = new Map<string, string>();
  let nextBatch = 1;
  const configurationKey = (value: EmbeddingConfiguration) => JSON.stringify(value);
  const intake: KnowledgeIntake = {
    async ingest(subject, raw) {
      const input = IntakeInputSchema.parse(raw);
      if (!allowed(subject)) return { kind: "denied" };
      if (input.operation !== "upsert") return { kind: "failure", code: "invalid" };
      const key = logicalKey(input.record.ref);
      const prior = current.get(key);
      if (input.expectedRevision === null ? prior !== undefined : prior?.ref.revision !== input.expectedRevision) return { kind: "conflict" };
      const sequence = events.length + 1;
      const updates: (typeof events)[number]["updates"] = [];
      if (prior) updates.push({ id: `event-${sequence}-remove`, operation: "remove", ref: prior.ref });
      updates.push({ id: `event-${sequence}-upsert`, operation: "upsert", record: input.record });
      current.set(key, input.record);
      events.push({ sequence, updates });
      return { kind: "accepted", revision: input.record.ref.revision };
    },
  };
  const indexWork: KnowledgeIndexWork = {
    async pending(subject, raw) {
      const request = IndexWorkRequestSchema.parse(raw);
      if (!allowed(subject)) return { kind: "denied" };
      const key = configurationKey(request.configuration);
      const outstanding = [...batches.entries()].find(([, batch]) => batch.configuration === key);
      if (outstanding) {
        const [id, batch] = outstanding;
        return { kind: "ok", batch: { id, checkpoint: batch.checkpoint }, updates: batch.updates, remaining: false, bytes: bytes(batch.updates) };
      }
      const prior = progress.get(key);
      const allUpdates = prior
        ? events.filter((event) => event.sequence > prior.event).flatMap((event) => event.updates)
        : [...current.values()].flatMap((item, index) => item.status === "active" ? [{ id: `snapshot-${revisionKey(item.ref)}-${index}`, operation: "upsert" as const, record: item }] : []);
      const updates = allUpdates.slice(0, request.limit);
      const event = events.length;
      const id = `index-batch-${nextBatch++}`;
      const checkpoint = `index-event-${event}`;
      batches.set(id, { configuration: key, checkpoint, event, updates });
      return { kind: "ok", batch: { id, checkpoint }, updates, remaining: allUpdates.length > updates.length, bytes: bytes(updates) };
    },
    async acknowledge(subject, raw) {
      const input = IndexWorkAcknowledgeInputSchema.parse(raw);
      if (!allowed(subject)) return { kind: "denied" };
      const priorCheckpoint = completed.get(input.batch.id);
      if (priorCheckpoint) return priorCheckpoint === input.batch.checkpoint ? { kind: "acknowledged", checkpoint: priorCheckpoint } : { kind: "conflict" };
      const batch = batches.get(input.batch.id);
      if (!batch || batch.checkpoint !== input.batch.checkpoint) return { kind: "conflict" };
      progress.set(batch.configuration, { event: batch.event });
      batches.delete(input.batch.id);
      completed.set(input.batch.id, batch.checkpoint);
      return { kind: "acknowledged", checkpoint: batch.checkpoint };
    },
  };
  return { intake, indexWork, configuration, authorizedSubject, deniedSubject };
}

test("storage conformance covers CAS, authorization, evidence, lifecycle, and bounded maintenance", async () => {
  await knowledgeStorageConformance(createMemoryStorageFixture());
});
test("assessment conformance covers stable identity and durable reconciliation", async () => {
  await knowledgeAssessmentConformance(createMemoryAssessmentFixture());
});
test("embedding conformance covers passage identity and staged generation activation", async () => {
  await knowledgeEmbeddingConformance(createMemoryEmbeddingFixture());
});
test("index work conformance covers replay-safe ACK and configuration-scoped current revisions", async () => {
  await knowledgeIndexWorkConformance(createMemoryIndexWorkFixture());
});

test("conformance suites remain independently consumable", () => {
  expect(knowledgeStorageConformance).toBeFunction();
  expect(knowledgeAssessmentConformance).toBeFunction();
  expect(knowledgeEmbeddingConformance).toBeFunction();
  expect(knowledgeIndexWorkConformance).toBeFunction();
});
