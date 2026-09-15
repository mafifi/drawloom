import { z } from "zod";
import {
  AssessmentResultSchema, ClaimProposalSchema, EvidencePackageSchema, PendingKnowledgeSchema,
  PendingWorkUnitSchema, PublicationInputSchema, PublicationResultSchema, WorkBatchReleaseInputSchema,
  WorkBatchReleaseResultSchema, WorkBatchSchema,
  type AssessmentResult, type ClaimProposal, type EvidencePackage, type KnowledgeAssessment,
  type KnowledgeMaintenance, type KnowledgeRetrieval, type PendingWorkUnit,
  type RecordRef, type TrustedKnowledgeSubject,
} from "@drawloom/knowledge";
import {
  canonical, defineWorkflowModule, registerTaskHandler, registerWorkflow, StepFailure,
  type Json, type Orchestrator, type RegisteredTaskHandler, type TaskContext, type Workflow,
} from "@drawloom/orchestration";

export const DEFAULT_NIGHTLOOM_SETTINGS = Object.freeze({
  assessmentTimeoutMs: 300_000,
  maxAutomaticStartsPerDay: 6,
  maxAutomaticMillisecondsPerDay: 1_800_000,
  pendingThreshold: 50,
  oldestPendingAgeMs: 3_600_000,
  batchSize: 50,
  maxBytes: 900_000,
});

export const NightloomSettingsSchema = z.strictObject({
  assessmentTimeoutMs: z.number().int().min(1).max(300_000),
  maxAutomaticStartsPerDay: z.number().int().min(1).max(100),
  maxAutomaticMillisecondsPerDay: z.number().int().min(1).max(86_400_000),
  pendingThreshold: z.number().int().min(1).max(10_000),
  oldestPendingAgeMs: z.number().int().min(1).max(86_400_000),
  // One provider-issued batch becomes one bounded assessment. Aggregate evidence
  // remains subject to the record/link/byte limits of EvidencePackageSchema.
  batchSize: z.number().int().min(1).max(50),
  maxBytes: z.number().int().min(1024).max(1_048_576),
});
export type NightloomSettings = z.infer<typeof NightloomSettingsSchema>;

const ActiveRunSchema = z.strictObject({
  identity: z.string().min(1).max(256),
  mode: z.enum(["automatic", "manual"]),
  state: z.enum(["reserved", "started"]),
  reservedAt: z.number().int().nonnegative(),
  runId: z.string().min(1).max(2048).optional(),
});
export const NightloomCoordinatorStateSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  settings: NightloomSettingsSchema,
  paused: z.boolean(),
  budget: z.strictObject({
    utcDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    automaticStarts: z.number().int().nonnegative(),
    automaticReservedMilliseconds: z.number().int().nonnegative(),
  }),
  nextSequence: z.number().int().positive(),
  active: ActiveRunSchema.optional(),
});
export type NightloomCoordinatorState = z.infer<typeof NightloomCoordinatorStateSchema>;
export interface NightloomCoordinatorStore {
  load(): Promise<NightloomCoordinatorState | undefined>;
  compareAndSet(expectedRevision: number | null, next: NightloomCoordinatorState): Promise<boolean>;
}

export type NightloomReadiness = { status: "ready" } | { status: "unavailable"; code?: string };
export type NightloomStartResult =
  | { kind: "idle" | "paused" | "busy" | "budget_exhausted" | "unavailable" }
  | { kind: "uncertain"; identity: string }
  | { kind: "started"; identity: string; runId: string };

function utcDay(milliseconds: number): string { return new Date(milliseconds).toISOString().slice(0, 10); }
function initialState(now: number, settings: NightloomSettings): NightloomCoordinatorState {
  return { revision: 0, settings, paused: false, budget: { utcDay: utcDay(now), automaticStarts: 0, automaticReservedMilliseconds: 0 }, nextSequence: 1 };
}

export function createNightloomCoordinator(input: {
  orchestrator: Orchestrator;
  maintenance: KnowledgeMaintenance;
  subject: TrustedKnowledgeSubject;
  store: NightloomCoordinatorStore;
  readiness(): NightloomReadiness;
  clock: { now(): number };
  settings?: NightloomSettings;
}) {
  const configured = NightloomSettingsSchema.parse(input.settings ?? DEFAULT_NIGHTLOOM_SETTINGS);
  let serial: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const result = serial.then(work, work);
    serial = result.catch(() => undefined);
    return result;
  };
  async function load(): Promise<NightloomCoordinatorState> {
    for (;;) {
      const saved = await input.store.load();
      if (saved) return NightloomCoordinatorStateSchema.parse(saved);
      const created = initialState(input.clock.now(), configured);
      if (await input.store.compareAndSet(null, created)) return created;
    }
  }
  async function save(prior: NightloomCoordinatorState, update: Omit<NightloomCoordinatorState, "revision">): Promise<NightloomCoordinatorState | undefined> {
    const next = NightloomCoordinatorStateSchema.parse({ ...update, revision: prior.revision + 1 });
    return await input.store.compareAndSet(prior.revision, next) ? next : undefined;
  }
  const normalizeDay = async (state: NightloomCoordinatorState): Promise<NightloomCoordinatorState> => {
    const day = utcDay(input.clock.now());
    if (state.budget.utcDay === day) return state;
    return await save(state, { ...state, budget: { utcDay: day, automaticStarts: 0, automaticReservedMilliseconds: 0 } }) ?? load();
  };
  async function dispatchReserved(state: NightloomCoordinatorState): Promise<NightloomStartResult> {
    if (!state.active) return { kind: "idle" };
    try {
      const runId = await input.orchestrator.start(state.active.identity, nightloomWorkflow, {
        batchSize: state.settings.batchSize, maxBytes: state.settings.maxBytes, assessmentTimeoutMs: state.settings.assessmentTimeoutMs,
      });
      const saved = await save(state, { ...state, active: { ...state.active, state: "started", runId } });
      if (!saved) return dispatchReserved(await load());
      return { kind: "started", identity: state.active.identity, runId };
    } catch {
      return { kind: "uncertain", identity: state.active.identity };
    }
  }
  async function clearTerminal(state: NightloomCoordinatorState): Promise<NightloomCoordinatorState | "uncertain" | undefined> {
    if (!state.active) return state;
    if (state.active.state === "reserved") return undefined;
    const snapshot = await input.orchestrator.get(state.active.runId!);
    if (snapshot.status === "running") return undefined;
    if (snapshot.unresolvedEffects.length) return "uncertain";
    // Cancellation/failure does not prove a previously accepted assessment ended.
    if (snapshot.status !== "completed") return "uncertain";
    if (snapshot.status === "completed" && NightloomWorkflowResultSchema.parse(await input.orchestrator.result(snapshot.runId)).kind === "deferred") return "uncertain";
    const { active: _active, ...withoutActive } = state;
    return await save(state, withoutActive) ?? load();
  }
  async function start(mode: "automatic" | "manual", feed?: { pendingCount: number; oldestPendingAt?: number }, overrideBudget = false): Promise<NightloomStartResult> {
    let state = await normalizeDay(await load());
    if (state.paused) return { kind: "paused" };
    if (state.active) {
      if (state.active.state === "reserved") {
        if (input.readiness().status !== "ready") return { kind: "unavailable" };
        return dispatchReserved(state);
      }
      let cleared: NightloomCoordinatorState | "uncertain" | undefined;
      try { cleared = await clearTerminal(state); }
      catch { return { kind: "unavailable" }; }
      if (cleared === "uncertain") return { kind: "uncertain", identity: state.active.identity };
      if (!cleared) return { kind: "busy" };
      state = cleared;
    }
    if (input.readiness().status !== "ready") return { kind: "unavailable" };
    if (mode === "automatic") {
      const now = input.clock.now();
      const due = (feed?.pendingCount ?? 0) >= state.settings.pendingThreshold ||
        (feed?.oldestPendingAt !== undefined && now - feed.oldestPendingAt >= state.settings.oldestPendingAgeMs);
      if (!due) return { kind: "idle" };
    }
    const usesBudget = mode === "automatic" || !overrideBudget;
    if (usesBudget) {
      if (state.budget.automaticStarts >= state.settings.maxAutomaticStartsPerDay ||
        state.budget.automaticReservedMilliseconds + state.settings.assessmentTimeoutMs > state.settings.maxAutomaticMillisecondsPerDay) return { kind: "budget_exhausted" };
    }
    const identity = `${state.budget.utcDay}-${state.nextSequence}`;
    const active = { identity, mode, state: "reserved" as const, reservedAt: input.clock.now() };
    const budget = usesBudget ? {
      ...state.budget,
      automaticStarts: state.budget.automaticStarts + 1,
      automaticReservedMilliseconds: state.budget.automaticReservedMilliseconds + state.settings.assessmentTimeoutMs,
    } : state.budget;
    const reserved = await save(state, { ...state, active, budget, nextSequence: state.nextSequence + 1 });
    return reserved ? dispatchReserved(reserved) : start(mode, feed, overrideBudget);
  }
  const setPaused = (paused: boolean) => exclusive(async () => {
    for (;;) {
      const state = await load();
      if (state.paused === paused) return;
      if (await save(state, { ...state, paused })) return;
    }
  });
  return {
    tick(): Promise<NightloomStartResult> {
      return exclusive(async () => {
        if (input.readiness().status !== "ready") return { kind: "unavailable" };
        const status = await input.maintenance.status(input.subject);
        if (status.kind !== "ok") return { kind: "unavailable" };
        return start("automatic", { pendingCount: status.pendingUnits, ...(status.oldestPendingAtMs === undefined ? {} : { oldestPendingAt: status.oldestPendingAtMs }) });
      });
    },
    runNow(overrideBudget = false): Promise<NightloomStartResult> { return exclusive(() => start("manual", undefined, overrideBudget)); },
    pause(): Promise<void> { return setPaused(true); },
    resume(): Promise<void> { return setPaused(false); },
    configure(settings: NightloomSettings): Promise<void> {
      const next = NightloomSettingsSchema.parse(settings);
      return exclusive(async () => {
        for (;;) {
          const state = await load();
          if (canonical(state.settings) === canonical(next)) return;
          if (state.active) throw Error("Wait for active knowledge maintenance before changing settings");
          if (await save(state, { ...state, settings: next })) return;
        }
      });
    },
    async status(): Promise<NightloomCoordinatorState> { return load(); },
  };
}

const BatchAssessmentSchema = z.union([
  z.strictObject({ kind: z.literal("completed"), proposals: z.array(ClaimProposalSchema).max(100) }),
  z.strictObject({ kind: z.literal("running"), waitMs: z.number().int().min(1).max(1000) }),
  z.strictObject({ kind: z.literal("deferred") }),
  z.strictObject({ kind: z.literal("blocked"), reason: z.enum(["denied", "unavailable", "invalid_evidence", "evidence_too_large", "assessment_failed", "cancelled"]) }),
]);
type BatchAssessment = z.infer<typeof BatchAssessmentSchema>;
const AssessBatchInputSchema = z.strictObject({
  batch: WorkBatchSchema,
  units: z.array(PendingWorkUnitSchema).min(1).max(50),
  maxRecords: z.number().int().min(1).max(100).default(100),
  maxLinks: z.number().int().min(1).max(100).default(100),
  maxBytes: z.number().int().min(1024).max(1_048_576).default(1_048_576),
  assessmentTimeoutMs: z.number().int().min(1).max(300_000).optional(),
});
const PendingTaskInputSchema = z.strictObject({ limit: z.number().int().min(1).max(100), maxBytes: z.number().int().min(1024).max(1_048_576) });
export const nightloomPendingTask = { id: "nightloom.pending", version: "1", input: PendingTaskInputSchema, output: PendingKnowledgeSchema };
export const nightloomAssessBatchTask = { id: "nightloom.assess-batch", version: "2", input: AssessBatchInputSchema, output: BatchAssessmentSchema, limits: { startToCloseTimeoutMs: DEFAULT_NIGHTLOOM_SETTINGS.assessmentTimeoutMs } };
export const nightloomReleaseTask = { id: "nightloom.release", version: "1", input: WorkBatchReleaseInputSchema, output: WorkBatchReleaseResultSchema };
export const nightloomPublishTask = { id: "nightloom.publish", version: "1", input: PublicationInputSchema, output: PublicationResultSchema };

export const NightloomWorkflowInputSchema = z.strictObject({ batchSize: z.number().int().min(1).max(50), maxBytes: z.number().int().min(1024).max(1_048_576), assessmentTimeoutMs: z.number().int().min(1).max(300_000).optional() });
export const NightloomWorkflowResultSchema = z.union([
  z.strictObject({ kind: z.literal("completed"), processed: z.number().int().nonnegative(), remaining: z.boolean(), checkpoint: z.string() }),
  z.strictObject({ kind: z.enum(["deferred", "conflict"]), processed: z.number().int().nonnegative(), remaining: z.literal(true) }),
  z.strictObject({ kind: z.enum(["denied", "unavailable"]), processed: z.literal(0), remaining: z.boolean() }),
  z.strictObject({ kind: z.literal("blocked"), processed: z.number().int().nonnegative(), remaining: z.literal(true), reason: z.string() }),
]);
export type NightloomWorkflowResult = z.infer<typeof NightloomWorkflowResultSchema>;

export const nightloomWorkflow: Workflow<z.infer<typeof NightloomWorkflowInputSchema>, NightloomWorkflowResult> = {
  id: "nightloom.maintenance", version: "3", input: NightloomWorkflowInputSchema, output: NightloomWorkflowResultSchema,
  async run(context, input): Promise<NightloomWorkflowResult> {
    let limit = input.batchSize;
    for (;;) {
      const pending = await context.task(`pending-${limit}`, nightloomPendingTask, { limit, maxBytes: input.maxBytes });
      if (pending.kind === "denied") return { kind: "denied", processed: 0, remaining: false };
      if (pending.kind !== "ok") {
        if (pending.kind === "failure" && pending.code === "too_large" && limit > 1) { limit = Math.max(1, Math.floor(limit / 2)); continue; }
        return pending.kind === "failure" && pending.code === "too_large"
          ? { kind: "blocked", processed: 0, remaining: true, reason: "pending_too_large" }
          : { kind: "unavailable", processed: 0, remaining: true };
      }
      if (!pending.units.length) return { kind: "completed", processed: 0, remaining: pending.remaining, checkpoint: pending.batch.checkpoint };
      const assessmentInput = {
        batch: pending.batch, units: pending.units, maxRecords: 100, maxLinks: 100, maxBytes: input.maxBytes,
        ...(input.assessmentTimeoutMs === undefined ? {} : { assessmentTimeoutMs: input.assessmentTimeoutMs }),
      };
      let assessed = await context.task(`assess-${limit}`, nightloomAssessBatchTask, assessmentInput);
      for (let poll = 1; assessed.kind === "running"; poll++) {
        await context.sleep(`assessment-wait-${limit}-${poll}`, assessed.waitMs);
        assessed = await context.task(`reconcile-${limit}-${poll}`, nightloomAssessBatchTask, assessmentInput);
      }
      if (assessed.kind === "deferred") return { kind: "deferred", processed: 0, remaining: true };
      if (assessed.kind === "blocked") {
        if (assessed.reason === "evidence_too_large" && pending.units.length > 1) {
          const released = await context.task(`release-${limit}`, nightloomReleaseTask, { batch: pending.batch });
          if (released.kind === "conflict") return { kind: "conflict", processed: 0, remaining: true };
          if (released.kind === "denied") return { kind: "denied", processed: 0, remaining: true };
          if (released.kind !== "released") return { kind: "unavailable", processed: 0, remaining: true };
          limit = Math.max(1, Math.floor(pending.units.length / 2));
          continue;
        }
        return { kind: "blocked", processed: 0, remaining: true, reason: assessed.reason };
      }
      const publication = await context.task("publish", nightloomPublishTask, { batch: pending.batch, proposals: assessed.proposals });
      if (publication.kind === "conflict") return { kind: "conflict", processed: 0, remaining: true };
      if (publication.kind === "denied") return { kind: "denied", processed: 0, remaining: true };
      if (publication.kind !== "published") return { kind: "unavailable", processed: 0, remaining: true };
      return { kind: "completed", processed: pending.units.length, remaining: publication.remaining, checkpoint: publication.checkpoint };
    }
  },
};

const ReceiptStateSchema = z.enum(["intent", "running", "uncertain", "completed", "cancelled", "failed"]);
export const NightloomAssessmentReceiptSchema = z.strictObject({
  revision: z.number().int().nonnegative(), requestId: z.string().min(1).max(256), payloadFingerprint: z.string().min(1).max(256),
  state: ReceiptStateSchema, proposals: z.array(ClaimProposalSchema).max(100).optional(),
  // Optional for retained v1 receipts. Never invent a fresh deadline for old work.
  deadlineAtMs: z.number().int().nonnegative().optional(),
});
export type NightloomAssessmentReceipt = z.infer<typeof NightloomAssessmentReceiptSchema>;
export interface NightloomAssessmentReceiptStore {
  load(requestId: string): Promise<NightloomAssessmentReceipt | undefined>;
  compareAndSet(requestId: string, expectedRevision: number | null, next: NightloomAssessmentReceipt): Promise<boolean>;
}

function sameRef(left: RecordRef, right: RecordRef): boolean {
  return left.type === right.type && left.origin === right.origin && left.id === right.id && left.revision === right.revision;
}
/** One assessment owns its reads. Only a fully exhausted identical root traversal
 * can be reused; finding a nested record does not establish its graph completeness.
 * maxBytes bounds the serialized UTF-8 package actually sent to the assessor. */
async function collectEvidence(retrieval: KnowledgeRetrieval, subject: TrustedKnowledgeSubject, input: z.infer<typeof AssessBatchInputSchema>): Promise<EvidencePackage | BatchAssessment> {
  const roots = input.units.map((unit) => ({ unitId: unit.id, root: unit.affectedClaim ?? unit.update.ref }));
  const records: EvidencePackage["records"] = [];
  const links: EvidencePackage["links"] = [];
  const completeRoots: RecordRef[] = [];
  const transmittedBytes = () => new TextEncoder().encode(JSON.stringify({ roots, records, links, complete: true })).byteLength;
  for (const unit of input.units) {
    const root = unit.affectedClaim ?? unit.update.ref;
    if (!(unit.update.operation === "delete" && !unit.affectedClaim)) {
      let cursor;
      const seenCursors = new Set<string>();
      if (!completeRoots.some(prior => sameRef(prior, root))) do {
        const page = await retrieval.evidence(subject, {
          root, direction: "forward", maxDepth: 8,
          // Cursor identity binds these dimensions. Aggregate limits are checked
          // after each page; they must never change on a continuation request.
          maxRecords: input.maxRecords, maxLinks: input.maxLinks, maxBytes: input.maxBytes,
          ...(cursor ? { cursor } : {}),
        });
        if (page.kind === "denied") return { kind: "blocked", reason: "denied" };
        if (page.kind !== "ok") return { kind: "blocked", reason: page.kind === "failure" && page.code === "too_large" ? "evidence_too_large" : "unavailable" };
        const addedRecords = page.records.filter((record) => !records.some((prior) => sameRef(prior.ref, record.ref)));
        const addedLinks = page.links.filter((link) => !links.some((prior) => canonical(prior) === canonical(link)));
        if (records.length + addedRecords.length > input.maxRecords || links.length + addedLinks.length > input.maxLinks) return { kind: "blocked", reason: "evidence_too_large" };
        records.push(...addedRecords); links.push(...addedLinks);
        if (transmittedBytes() > input.maxBytes) return { kind: "blocked", reason: "evidence_too_large" };
        cursor = page.cursor;
        if (cursor) {
          if (seenCursors.has(cursor)) return { kind: "blocked", reason: "invalid_evidence" };
          seenCursors.add(cursor);
        }
      } while (cursor);
      completeRoots.push(root);
      if (records.some(prior => sameRef(prior.ref, unit.update.ref))) continue;
      const update = await retrieval.get(subject, unit.update.ref);
      if (update.kind === "denied") return { kind: "blocked", reason: "denied" };
      if (update.kind !== "ok") return { kind: "blocked", reason: "unavailable" };
      if (update.record && !records.some((prior) => sameRef(prior.ref, update.record!.ref))) records.push(update.record);
      if (records.length > input.maxRecords) return { kind: "blocked", reason: "evidence_too_large" };
    }
  }
  const retained = (ref: RecordRef) => records.some((record) => sameRef(record.ref, ref));
  if (input.units.some(unit => !(unit.update.operation === "delete" && !unit.affectedClaim) && !retained(unit.affectedClaim ?? unit.update.ref)) ||
    records.some((record) => record.provenance.inputs.some((ref) => !retained(ref))) ||
    links.some((link) => !retained(link.from) || !retained(link.to))) return { kind: "blocked", reason: "invalid_evidence" };
  const evidence = EvidencePackageSchema.safeParse({ roots, records, links, complete: true });
  return evidence.success && transmittedBytes() <= input.maxBytes ? evidence.data : { kind: "blocked", reason: "evidence_too_large" };
}
function validateProposals(result: Extract<AssessmentResult, { kind: "completed" }>, evidence: EvidencePackage): ClaimProposal[] | undefined {
  if (result.proposals.length > 100) return undefined;
  const refs = evidence.records.map((record) => record.ref);
  for (const proposal of result.proposals) {
    if (!proposal.record.provenance.inputs.every((ref) => refs.some((candidate) => sameRef(candidate, ref)))) return undefined;
    if (proposal.expectedRevision !== null && !refs.some((candidate) => sameRef(candidate, proposal.previous))) return undefined;
    if (!proposal.links.every((link) => sameRef(link.from, proposal.record.ref) && refs.some((candidate) => sameRef(candidate, link.to)))) return undefined;
  }
  return result.proposals;
}

export function createNightloomTaskHandlers(input: {
  maintenance: KnowledgeMaintenance;
  retrieval: KnowledgeRetrieval;
  assessment: KnowledgeAssessment;
  receipts: NightloomAssessmentReceiptStore;
  subject: TrustedKnowledgeSubject;
  fingerprint(value: Json): string | Promise<string>;
  /** Trusted host-only pause test. Suspension retains accepted receipts; it is
   * not operator cancellation. Omission treats every abort as cancellation. */
  isHostSuspension?(reason: unknown): boolean;
}): readonly RegisteredTaskHandler[] {
  const owners = new Map<string, {
    listener?: { signal: AbortSignal; abort(): void };
    cancellation?: Promise<BatchAssessment>;
  }>();
  function releaseOwner(requestId: string) {
    const owner = owners.get(requestId);
    if (owner?.listener) {
      owner.listener.signal.removeEventListener("abort", owner.listener.abort);
      delete owner.listener;
    }
    // The current task must still join cancellation initiated by the retained
    // listener, even after that listener has been detached.
    if (!owner?.cancellation) owners.delete(requestId);
  }
  async function writeReceipt(prior: NightloomAssessmentReceipt, update: Omit<NightloomAssessmentReceipt, "revision">): Promise<NightloomAssessmentReceipt> {
    const next = NightloomAssessmentReceiptSchema.parse({ ...(prior.deadlineAtMs === undefined ? {} : { deadlineAtMs: prior.deadlineAtMs }), ...update, revision: prior.revision + 1 });
    if (await input.receipts.compareAndSet(prior.requestId, prior.revision, next)) return next;
    const current = await input.receipts.load(prior.requestId);
    if (!current || current.payloadFingerprint !== prior.payloadFingerprint) throw new StepFailure("unknown", "Assessment receipt changed");
    const { revision: _currentRevision, ...currentValue } = current;
    const { revision: _nextRevision, ...nextValue } = next;
    if (canonical(currentValue) !== canonical(nextValue)) throw new StepFailure("unknown", "Assessment receipt changed");
    return current;
  }
  async function applyAssessment(receipt: NightloomAssessmentReceipt, evidence: EvidencePackage, result: AssessmentResult): Promise<BatchAssessment> {
    if (result.kind === "completed") {
      releaseOwner(receipt.requestId);
      const proposals = validateProposals(result, evidence);
      if (!proposals) {
        await writeReceipt(receipt, { requestId: receipt.requestId, payloadFingerprint: receipt.payloadFingerprint, state: "failed" });
        return { kind: "blocked", reason: "invalid_evidence" };
      }
      await writeReceipt(receipt, { requestId: receipt.requestId, payloadFingerprint: receipt.payloadFingerprint, state: "completed", proposals });
      return { kind: "completed", proposals };
    }
    if (result.kind === "running" || result.kind === "uncertain") {
      await writeReceipt(receipt, { requestId: receipt.requestId, payloadFingerprint: receipt.payloadFingerprint, state: result.kind });
      if (result.kind === "running" && receipt.deadlineAtMs !== undefined) return { kind: "running", waitMs: Math.max(1, Math.min(1000, receipt.deadlineAtMs - Date.now())) };
      return { kind: "deferred" };
    }
    const state = result.kind === "cancelled" ? "cancelled" : "failed";
    releaseOwner(receipt.requestId);
    await writeReceipt(receipt, { requestId: receipt.requestId, payloadFingerprint: receipt.payloadFingerprint, state });
    return { kind: "blocked", reason: result.kind === "cancelled" ? "cancelled" : result.kind === "denied" ? "denied" : "assessment_failed" };
  }
  async function assessBatch(raw: unknown, context: TaskContext, allowSubmit: boolean): Promise<BatchAssessment> {
    const request = AssessBatchInputSchema.parse(raw);
    const evidence = await collectEvidence(input.retrieval, input.subject, request);
    if ("kind" in evidence) return evidence;
    const retainedEvidence: EvidencePackage = evidence;
    const requestId = request.batch.id;
    const payloadFingerprint = z.string().min(1).max(256).parse(await input.fingerprint({ batch: request.batch, evidence }));
    let receipt = await input.receipts.load(requestId);
    let createdIntent = false;
    if (receipt && receipt.payloadFingerprint !== payloadFingerprint) return { kind: "blocked", reason: "invalid_evidence" };
    if (receipt?.state === "completed") return { kind: "completed", proposals: receipt.proposals ?? [] };
    if (!receipt) {
      if (!allowSubmit) throw new StepFailure("unknown", "Missing assessment intent");
      const intent = NightloomAssessmentReceiptSchema.parse({ revision: 0, requestId, payloadFingerprint, state: "intent",
        deadlineAtMs: Date.now() + (request.assessmentTimeoutMs ?? DEFAULT_NIGHTLOOM_SETTINGS.assessmentTimeoutMs) });
      if (await input.receipts.compareAndSet(requestId, null, intent)) { receipt = intent; createdIntent = true; }
      else receipt = await input.receipts.load(requestId);
      if (!receipt || receipt.payloadFingerprint !== payloadFingerprint) throw new StepFailure("unknown", "Assessment intent conflict");
    }
    const identity = { requestId, payloadFingerprint };
    // Bound each owner-side wait by the ORIGINAL persisted deadline. A late
    // provider result has no write callback and cannot publish after timeout.
    async function bounded<T>(operation: () => Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T | undefined> {
      if (milliseconds <= 0 || signal?.aborted) return undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let aborted: (() => void) | undefined;
      try {
        return await Promise.race([Promise.resolve().then(operation), new Promise<undefined>(resolve => {
          timer = setTimeout(() => resolve(undefined), milliseconds);
          aborted = () => resolve(undefined);
          signal?.addEventListener("abort", aborted, { once: true });
        })]);
      } finally {
        clearTimeout(timer);
        if (aborted) signal?.removeEventListener("abort", aborted);
      }
    }
    function cancelOwned(): Promise<BatchAssessment> {
      const owner = owners.get(requestId) ?? {};
      if (owner.cancellation) return owner.cancellation;
      owners.set(requestId, owner);
      // Install the shared operation synchronously, before its first receipt I/O.
      const cancellation = Promise.resolve().then(async (): Promise<BatchAssessment> => {
        releaseOwner(requestId);
        // Publish uncertainty BEFORE awaiting cancellation. No new start may infer
        // that an external effect ended merely because its workflow was cancelled.
        const current = (await input.receipts.load(requestId))!;
        if (current.state === "completed") return { kind: "completed", proposals: current.proposals ?? [] };
        if (current.state === "cancelled") return { kind: "blocked", reason: "cancelled" };
        const held = await writeReceipt(current, { requestId, payloadFingerprint, state: "uncertain" });
        const cancelled = await bounded(() => input.assessment.cancel(input.subject, identity), 1000).catch(() => undefined);
        let terminal: AssessmentResult | undefined = cancelled?.kind === "cancelled" ? cancelled : undefined;
        if (cancelled?.kind === "too_late") {
          const reconciled = await bounded(() => input.assessment.reconcile(input.subject, identity), 1000).catch(() => undefined);
          if (reconciled?.kind === "completed" || reconciled?.kind === "cancelled") terminal = reconciled;
        }
        return applyAssessment(held, retainedEvidence, terminal ?? { kind: "uncertain", ...identity });
      });
      owner.cancellation = cancellation;
      void cancellation.finally(() => {
        if (owners.get(requestId) === owner) owners.delete(requestId);
      }).catch(() => undefined);
      return cancellation;
    }
    const remaining = receipt.deadlineAtMs === undefined ? DEFAULT_NIGHTLOOM_SETTINGS.assessmentTimeoutMs : receipt.deadlineAtMs - Date.now();
    const result = await bounded(() => !createdIntent || !allowSubmit
      ? input.assessment.reconcile(input.subject, identity)
      : input.assessment.assess(input.subject, { ...identity, evidence }), remaining, context.signal);
    if (context.signal.aborted && input.isHostSuspension?.(context.signal.reason)) throw new StepFailure("unknown", "Assessment host suspended");
    if (result === undefined) return cancelOwned();
    const applied = await applyAssessment(receipt, evidence, AssessmentResultSchema.parse(result));
    if (applied.kind === "running" && !owners.has(requestId)) {
      // TaskContext's run signal remains live AFTER this task returns. Retain
      // exactly one owner across durable workflow sleeps and reconciliation steps.
      const abort = () => {
        if (input.isHostSuspension?.(context.signal.reason)) { releaseOwner(requestId); return; }
        void cancelOwned().catch(() => undefined); // receipt remains held on failure
      };
      owners.set(requestId, { listener: { signal: context.signal, abort } });
      context.signal.addEventListener("abort", abort, { once: true });
      if (context.signal.aborted) abort();
    }
    return applied;
  }
  return Object.freeze([
    registerTaskHandler(nightloomPendingTask, { run: (request) => input.maintenance.pending(input.subject, request) }),
    registerTaskHandler(nightloomAssessBatchTask, {
      run: (request, context) => assessBatch(request, context, true),
      async recover(request, context) {
        try { return { status: "completed", output: await assessBatch(request, context, false) }; }
        catch { return { status: "unknown" }; }
      },
    }),
    registerTaskHandler(nightloomReleaseTask, { run: (request) => input.maintenance.release(input.subject, request) }),
    registerTaskHandler(nightloomPublishTask, { run: (request) => input.maintenance.publish(input.subject, request) }),
  ]);
}

export const nightloomRegistry = defineWorkflowModule({
  workflows: [registerWorkflow(nightloomWorkflow)],
  tasks: [nightloomPendingTask, nightloomAssessBatchTask, nightloomReleaseTask, nightloomPublishTask],
});
