import { expect, test } from "bun:test";
import { z } from "zod";
import type {
  AssessmentResult, EvidencePackage, KnowledgeAssessment, KnowledgeMaintenance,
  KnowledgeRetrieval, PendingWorkUnit, TrustedKnowledgeSubject,
} from "@drawloom/knowledge";
import { OpaqueCursorSchema } from "@drawloom/knowledge";
import type { Orchestrator, RunSnapshot, TaskContext } from "@drawloom/orchestration";
import {
  DEFAULT_NIGHTLOOM_SETTINGS, createNightloomCoordinator, createNightloomTaskHandlers,
  nightloomWorkflow, type NightloomAssessmentReceipt, type NightloomAssessmentReceiptStore,
  type NightloomCoordinatorState, type NightloomCoordinatorStore,
} from "./src/index.js";

const subject = { type: "user", id: "local", properties: {} } as TrustedKnowledgeSubject;
const source = {
  ref: { type: "source" as const, origin: "conformance", id: "source", revision: "r1" },
  body: "Evidence", status: "active" as const, confidence: { value: "observed" },
  provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
};
const unit = (id: string): PendingWorkUnit => ({ id, update: { ref: source.ref, operation: "upsert" } });
const context = (signal = new AbortController().signal): TaskContext => ({
  taskVersion: "1", runId: "host/run", stepId: "host/run/assess", attemptId: "host/run/assess/attempt/1", attempt: 1, signal,
});

function memoryCoordinatorStore(initial?: NightloomCoordinatorState): NightloomCoordinatorStore {
  let state = initial;
  return {
    async load() { return state; },
    async compareAndSet(expected, next) {
      if ((state?.revision ?? null) !== expected) return false;
      state = structuredClone(next);
      return true;
    },
  };
}

function scriptedOrchestrator() {
  const runs = new Map<string, RunSnapshot>();
  const engine: Orchestrator = {
    async start(identity, workflow, input) {
      const runId = `host/${identity}`;
      const prior = runs.get(runId);
      if (prior) return runId;
      runs.set(runId, { runId, identity, workflow: workflow.id, version: workflow.version, status: "running", cancellationRequested: false, childRunIds: [], unresolvedEffects: [], stepsTruncated: false, pendingInputs: [], steps: [] });
      z.unknown().parse(input);
      return runId;
    },
    async get(runId) { const run = runs.get(runId); if (!run) throw Error("missing"); return run; },
    async getSteps() { return { steps: [] }; }, async list() { return { runs: [...runs.values()] }; },
    async result() { throw Error("running"); }, async respond() {},
    async cancel(runId) { const run = runs.get(runId)!; run.cancellationRequested = true; },
  };
  return { engine, runs, complete(runId: string) { runs.get(runId)!.status = "completed"; } };
}

function backlogMaintenance(read: () => { pendingCount: number; oldestPendingAt?: number }): KnowledgeMaintenance {
  return {
    async status() {
      const value = read();
      return { kind: "ok", pendingUnits: value.pendingCount, ...(value.oldestPendingAt === undefined ? {} : { oldestPendingAtMs: value.oldestPendingAt }), checkpoint: "status" };
    },
    async pending() { throw Error("workflow handler not attached"); },
    async publish() { throw Error("workflow handler not attached"); },
    async release() { throw Error("workflow handler not attached"); },
  };
}

test("automatic coordination starts at count or age threshold and stays serial", async () => {
  let now = Date.UTC(2026, 8, 12, 12);
  let feed: { pendingCount: number; oldestPendingAt?: number } = { pendingCount: 49, oldestPendingAt: now - 3_599_999 };
  const scripted = scriptedOrchestrator();
  const coordinator = createNightloomCoordinator({ orchestrator: scripted.engine, maintenance: backlogMaintenance(() => feed), subject, store: memoryCoordinatorStore(), readiness: () => ({ status: "ready" }), clock: { now: () => now } });
  expect(await coordinator.tick()).toMatchObject({ kind: "idle" });
  feed = { pendingCount: 50, oldestPendingAt: now };
  const started = await coordinator.tick();
  expect(started.kind).toBe("started");
  feed = { pendingCount: 100, oldestPendingAt: now - 7_200_000 };
  expect((await coordinator.tick()).kind).toBe("busy");
  expect(scripted.runs.size).toBe(1);
  if (started.kind === "started") scripted.complete(started.runId);
  now += 1;
  feed = { pendingCount: 1, oldestPendingAt: now - 3_600_000 };
  expect((await coordinator.tick()).kind).toBe("started");
});

test("pause blocks new dispatch and exhausted automatic budgets require Run now override", async () => {
  let now = Date.UTC(2026, 8, 12, 12);
  const feed = { pendingCount: 100, oldestPendingAt: 0 };
  const scripted = scriptedOrchestrator();
  const store = memoryCoordinatorStore();
  const coordinator = createNightloomCoordinator({ orchestrator: scripted.engine, maintenance: backlogMaintenance(() => feed), subject, store, readiness: () => ({ status: "ready" }), clock: { now: () => now } });
  await coordinator.pause();
  expect((await coordinator.tick()).kind).toBe("paused");
  expect((await coordinator.runNow(false)).kind).toBe("paused");
  await coordinator.resume();
  for (let index = 0; index < 6; index++) {
    const started = await coordinator.tick();
    expect(started.kind).toBe("started");
    if (started.kind === "started") scripted.complete(started.runId);
    now += 1;
  }
  expect((await coordinator.tick()).kind).toBe("budget_exhausted");
  expect((await coordinator.runNow(false)).kind).toBe("budget_exhausted");
  expect((await coordinator.runNow(true)).kind).toBe("started");
});

test("Run now bypasses the automatic threshold but consumes budget unless explicitly overridden", async () => {
  const scripted = scriptedOrchestrator();
  const coordinator = createNightloomCoordinator({ orchestrator: scripted.engine,
    maintenance: backlogMaintenance(() => ({ pendingCount: 1 })), subject,
    store: memoryCoordinatorStore(), readiness: () => ({ status: "ready" }),
    clock: { now: () => Date.UTC(2026, 8, 12, 12) } });
  expect((await coordinator.runNow(false)).kind).toBe("started");
  expect((await coordinator.status()).budget.automaticStarts).toBe(1);
});

test("unavailable Temporal has no fallback and a reserved start resumes without duplication after restart", async () => {
  const base = scriptedOrchestrator();
  let loseFirstResponse = true;
  const uncertain: Orchestrator = { ...base.engine, async start(identity, workflow, input) {
    const runId = await base.engine.start(identity, workflow, input);
    if (loseFirstResponse) { loseFirstResponse = false; throw Error("lost response"); }
    return runId;
  } };
  const store = memoryCoordinatorStore();
  const maintenance = backlogMaintenance(() => ({ pendingCount: 50, oldestPendingAt: 0 }));
  const unavailable = createNightloomCoordinator({ orchestrator: uncertain, maintenance, subject, store, readiness: () => ({ status: "unavailable" }), clock: { now: () => Date.UTC(2026, 8, 12) } });
  expect((await unavailable.tick()).kind).toBe("unavailable");
  const first = createNightloomCoordinator({ orchestrator: uncertain, maintenance, subject, store, readiness: () => ({ status: "ready" }), clock: { now: () => Date.UTC(2026, 8, 12) } });
  expect((await first.tick()).kind).toBe("uncertain");
  const restarted = createNightloomCoordinator({ orchestrator: uncertain, maintenance, subject, store, readiness: () => ({ status: "ready" }), clock: { now: () => Date.UTC(2026, 8, 12) } });
  expect((await restarted.tick()).kind).toBe("started");
  expect(base.runs.size).toBe(1);
});

test("a Temporal status read failure is explicit unavailability, not an escaped coordinator error", async () => {
  const base = scriptedOrchestrator();
  const store = memoryCoordinatorStore();
  const maintenance = backlogMaintenance(() => ({ pendingCount: 50, oldestPendingAt: 0 }));
  const coordinator = createNightloomCoordinator({ orchestrator: base.engine, maintenance, subject, store, readiness: () => ({ status: "ready" }), clock: { now: () => Date.UTC(2026, 8, 12) } });
  const started = await coordinator.tick();
  expect(started.kind).toBe("started");
  const unavailableEngine: Orchestrator = { ...base.engine, async get() { throw Error("service disconnected"); } };
  const restarted = createNightloomCoordinator({ orchestrator: unavailableEngine, maintenance, subject, store, readiness: () => ({ status: "ready" }), clock: { now: () => Date.UTC(2026, 8, 12) } });
  expect(await restarted.tick()).toEqual({ kind: "unavailable" });
});

test("automatic budget resets by UTC day after coordinator restart", async () => {
  let now = Date.UTC(2026, 8, 12, 23, 59);
  const base = scriptedOrchestrator();
  const store = memoryCoordinatorStore();
  const maintenance = backlogMaintenance(() => ({ pendingCount: 50, oldestPendingAt: 0 }));
  let coordinator = createNightloomCoordinator({ orchestrator: base.engine, maintenance, subject, store, readiness: () => ({ status: "ready" }), clock: { now: () => now } });
  for (let index = 0; index < 6; index++) {
    const started = await coordinator.tick();
    expect(started.kind).toBe("started");
    if (started.kind === "started") base.complete(started.runId);
    now += 1;
  }
  expect((await coordinator.tick()).kind).toBe("budget_exhausted");
  now = Date.UTC(2026, 8, 13);
  coordinator = createNightloomCoordinator({ orchestrator: base.engine, maintenance, subject, store, readiness: () => ({ status: "ready" }), clock: { now: () => now } });
  expect((await coordinator.tick()).kind).toBe("started");
  expect((await coordinator.status()).budget).toMatchObject({ utcDay: "2026-09-13", automaticStarts: 1, automaticReservedMilliseconds: 300_000 });
});

function receiptStore(): NightloomAssessmentReceiptStore {
  const receipts = new Map<string, NightloomAssessmentReceipt>();
  return {
    async load(requestId) { return receipts.get(requestId); },
    async compareAndSet(requestId, expected, next) {
      if ((receipts.get(requestId)?.revision ?? null) !== expected) return false;
      receipts.set(requestId, structuredClone(next));
      return true;
    },
  };
}

function dependencies(assessment: KnowledgeAssessment, receipts = receiptStore()) {
  const pending = { kind: "ok" as const, batch: { id: "batch", checkpoint: "cp" }, units: [unit("unit-1")], remaining: false, bytes: 100 };
  const maintenance: KnowledgeMaintenance = {
    async status() { return { kind: "ok", pendingUnits: pending.units.length, oldestPendingAtMs: 0, checkpoint: "status" }; },
    async pending() { return pending; },
    async publish(_subject, input) { return { kind: "published", checkpoint: input.batch.checkpoint, remaining: true }; },
    async release() { return { kind: "released" }; },
  };
  const evidence: EvidencePackage = { roots: [{ unitId: "unit-1", root: source.ref }], records: [source], links: [], complete: true };
  const retrieval: KnowledgeRetrieval = {
    async evidence() { return { kind: "ok", records: evidence.records, links: [], bytes: 100 }; },
    async get(_subject, ref) { return JSON.stringify(ref) === JSON.stringify(source.ref) ? { kind: "ok", record: source } : { kind: "ok" }; },
    async search() { return { kind: "ok", mode: "lexical", semantic: { status: "unavailable" }, items: [], bytes: 0 }; },
    async expand() { return { kind: "ok", items: [], bytes: 0 }; },
    async export() { return { kind: "ok", records: [], links: [], bytes: 0 }; },
  };
  return { maintenance, retrieval, assessment, receipts, subject, fingerprint: () => "evidence-fingerprint" };
}

const assessInput = (id: string, units: PendingWorkUnit[] = [unit(id)]) => ({
  batch: { id: `batch-${id}`, checkpoint: `checkpoint-${id}` }, units,
});

test("uncertain assessment is durably reconciled on the next run and never submitted twice", async () => {
  let submissions = 0;
  let reconciliations = 0;
  const completed = (requestId: string, payloadFingerprint: string): AssessmentResult => ({ kind: "completed", requestId, payloadFingerprint, proposals: [] });
  const assessment: KnowledgeAssessment = {
    async assess(_subject, request) { submissions++; return { kind: "uncertain", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint }; },
    async reconcile(_subject, request) { reconciliations++; return completed(request.requestId, request.payloadFingerprint); },
    async cancel(_subject, request) { return { kind: "cancelled", ...request }; },
  };
  const configured = dependencies(assessment);
  const first = createNightloomTaskHandlers(configured).find((handler) => handler.id === "nightloom.assess-batch")!;
  expect(await first.run(assessInput("unit-1"), context())).toMatchObject({ kind: "deferred" });
  const restarted = createNightloomTaskHandlers(configured).find((handler) => handler.id === "nightloom.assess-batch")!;
  expect(await restarted.run(assessInput("unit-1"), context())).toMatchObject({ kind: "completed", proposals: [] });
  expect({ submissions, reconciliations }).toEqual({ submissions: 1, reconciliations: 1 });
});

test("a conflicting receipt writer cannot turn an unpersisted model outcome into completed work", async () => {
  let stored: NightloomAssessmentReceipt | undefined;
  const racing: NightloomAssessmentReceiptStore = {
    async load() { return stored; },
    async compareAndSet(_requestId, expected, next) {
      if (expected === null && !stored) { stored = structuredClone(next); return true; }
      if (expected === 0 && stored?.revision === 0) {
        stored = { revision: 1, requestId: next.requestId, payloadFingerprint: next.payloadFingerprint, state: "uncertain" };
        return false;
      }
      return false;
    },
  };
  const assessment: KnowledgeAssessment = {
    async assess(_subject, request) { return { kind: "completed", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint, proposals: [] }; },
    async reconcile(_subject, request) { return { kind: "uncertain", ...request }; },
    async cancel(_subject, request) { return { kind: "cancelled", ...request }; },
  };
  const assess = createNightloomTaskHandlers(dependencies(assessment, racing)).find((handler) => handler.id === "nightloom.assess-batch")!;
  await expect(assess.run(assessInput("receipt-race"), context())).rejects.toThrow("Assessment receipt changed");
  expect(stored?.state).toBe("uncertain");
});

test("a cancelled assessment is recorded without a submission or publication-ready result", async () => {
  let submissions = 0;
  let cancellations = 0;
  const assessment: KnowledgeAssessment = {
    async assess(_subject, request) { submissions++; return { kind: "running", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint }; },
    async reconcile(_subject, request) { return { kind: "running", ...request }; },
    async cancel(_subject, request) { cancellations++; return { kind: "cancelled", ...request }; },
  };
  const handlers = createNightloomTaskHandlers(dependencies(assessment));
  const assess = handlers.find((handler) => handler.id === "nightloom.assess-batch")!;
  const controller = new AbortController();
  controller.abort();
  expect(await assess.run(assessInput("cancelled-unit"), context(controller.signal))).toEqual({ kind: "blocked", reason: "cancelled" });
  expect({ submissions, cancellations }).toEqual({ submissions: 0, cancellations: 1 });
});

test("assessment rejects references outside its bounded evidence package", async () => {
  const assessment: KnowledgeAssessment = {
    async assess(_subject, request) {
      const outside = { type: "source" as const, origin: "outside", id: "hidden", revision: "r1" };
      const claim = { type: "claim" as const, origin: "assessment", id: "claim", revision: "r1" };
      return {
        kind: "completed" as const, requestId: request.requestId, payloadFingerprint: request.payloadFingerprint,
        proposals: [{
          record: { ref: claim, body: "Unsupported", status: "active" as const, freshness: "current" as const, confidence: {}, provenance: { producer: { type: "assessment", id: "scripted" }, inputs: [outside] } },
          expectedRevision: null, links: [{ from: claim, to: outside, relation: "support" as const }],
        }],
      };
    },
    async reconcile(_subject, request) { return { kind: "failure", code: "unavailable", ...request }; },
    async cancel(_subject, request) { return { kind: "cancelled", ...request }; },
  };
  const handlers = createNightloomTaskHandlers(dependencies(assessment));
  const assess = handlers.find((handler) => handler.id === "nightloom.assess-batch")!;
  expect(await assess.run(assessInput("invalid-reference"), context())).toEqual({ kind: "blocked", reason: "invalid_evidence" });
});

test("assessment stops at the evidence page bound instead of silently truncating", async () => {
  let calls = 0;
  const assessment: KnowledgeAssessment = {
    async assess(_subject, request) { calls++; return { kind: "completed", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint, proposals: [] }; },
    async reconcile(_subject, request) { return { kind: "failure", code: "unavailable", ...request }; },
    async cancel(_subject, request) { return { kind: "cancelled", ...request }; },
  };
  const configured = dependencies(assessment);
  configured.retrieval = {
    ...configured.retrieval,
    async evidence() { return { kind: "ok", records: [source], links: [], bytes: 100, cursor: OpaqueCursorSchema.parse("more") }; },
  };
  const assess = createNightloomTaskHandlers(configured).find((handler) => handler.id === "nightloom.assess-batch")!;
  expect(await assess.run({ ...assessInput("bounded"), maxRecords: 1 }, context())).toEqual({ kind: "blocked", reason: "evidence_too_large" });
  expect(calls).toBe(0);
});

test("a repeating empty evidence cursor is rejected before another provider page", async () => {
  let pages = 0;
  const configured = dependencies({
    async assess() { throw Error("must not assess incomplete evidence"); },
    async reconcile() { throw Error("must not reconcile"); },
    async cancel() { throw Error("must not cancel"); },
  });
  configured.retrieval = { ...configured.retrieval, async evidence() {
    pages++;
    // The finite fallback makes the regression fail without hanging old code.
    if (pages > 2) return { kind: "failure", code: "unavailable" };
    return { kind: "ok", records: [], links: [], bytes: 0, cursor: OpaqueCursorSchema.parse("repeated") };
  } };
  const assess = createNightloomTaskHandlers(configured).find(handler => handler.id === "nightloom.assess-batch")!;
  expect(await assess.run(assessInput("repeated-cursor"), context())).toEqual({ kind: "blocked", reason: "invalid_evidence" });
  expect(pages).toBe(2);
});

test("one receipt and assessment request cover every unit root in a bounded batch", async () => {
  let request: Parameters<KnowledgeAssessment["assess"]>[1] | undefined;
  const assessment: KnowledgeAssessment = {
    async assess(_subject, value) { request = value; return { kind: "completed", requestId: value.requestId, payloadFingerprint: value.payloadFingerprint, proposals: [] }; },
    async reconcile(_subject, value) { return { kind: "failure", code: "unavailable", ...value }; },
    async cancel(_subject, value) { return { kind: "cancelled", ...value }; },
  };
  const assess = createNightloomTaskHandlers(dependencies(assessment)).find((handler) => handler.id === "nightloom.assess-batch")!;
  const result = await assess.run(assessInput("multi", [unit("one"), unit("two")]), context());
  expect(result).toEqual({ kind: "completed", proposals: [] });
  expect(request).toMatchObject({ requestId: "batch-multi", evidence: { roots: [
    { unitId: "one", root: source.ref }, { unitId: "two", root: source.ref },
  ], records: [source], complete: true } });
});

test("oversized aggregate evidence releases the whole lease and retries a smaller exact batch", async () => {
  const first = { kind: "ok" as const, batch: { id: "large", checkpoint: "large-cp" }, units: [unit("one"), unit("two"), unit("three"), unit("four")], remaining: true, bytes: 200 };
  const second = { kind: "ok" as const, batch: { id: "small", checkpoint: "small-cp" }, units: [unit("one"), unit("two")], remaining: true, bytes: 100 };
  const seen: string[] = [];
  const result = await nightloomWorkflow.run({
    runId: "host/workflow", async task(step, task, input) {
      seen.push(`${step}:${task.id}`);
      if (step === "pending-50") return first as never;
      if (step === "assess-50") return { kind: "blocked", reason: "evidence_too_large" } as never;
      if (step === "release-50") { expect(input).toEqual({ batch: first.batch } as never); return { kind: "released" } as never; }
      if (step === "pending-2") return second as never;
      if (step === "assess-2") return { kind: "completed", proposals: [] } as never;
      if (task.id === "nightloom.publish") { expect(input).toEqual({ batch: second.batch, proposals: [] } as never); return { kind: "published", checkpoint: "done", remaining: true } as never; }
      throw Error("unexpected task");
    },
    async child() { throw Error("unexpected child"); }, async input() { throw Error("unexpected input"); }, async sleep() { throw Error("unexpected sleep"); },
  }, { batchSize: 50, maxBytes: 65_536 });
  expect(seen).toEqual(["pending-50:nightloom.pending", "assess-50:nightloom.assess-batch", "release-50:nightloom.release", "pending-2:nightloom.pending", "assess-2:nightloom.assess-batch", "publish:nightloom.publish"]);
  expect(result).toEqual({ kind: "completed", processed: 2, remaining: true, checkpoint: "done" });
});

test("workflow publishes one multi-root assessment for the exact issued batch and preserves remaining arrivals", async () => {
  const pending = { kind: "ok" as const, batch: { id: "batch", checkpoint: "captured" }, units: [unit("one"), unit("two")], remaining: true, bytes: 100 };
  let active = 0;
  let maximum = 0;
  const seen: string[] = [];
  const result = await nightloomWorkflow.run({
    runId: "host/workflow",
    async task(step, task, input) {
      seen.push(`${step}:${task.id}`);
      if (task.id === "nightloom.pending") return pending as never;
      if (task.id === "nightloom.assess-batch") {
        active++; maximum = Math.max(maximum, active);
        await Promise.resolve();
        active--;
        expect(input).toMatchObject({ batch: pending.batch, units: pending.units } as never);
        return { kind: "completed", proposals: [] } as never;
      }
      expect(input).toEqual({ batch: pending.batch, proposals: [] } as never);
      return { kind: "published", checkpoint: "published", remaining: true } as never;
    },
    async child() { throw Error("unexpected child"); }, async input() { throw Error("unexpected input"); }, async sleep() { throw Error("unexpected sleep"); },
  }, { batchSize: 50, maxBytes: 65_536 });
  expect(maximum).toBe(1);
  expect(seen).toEqual(["pending-50:nightloom.pending", "assess-50:nightloom.assess-batch", "publish:nightloom.publish"]);
  expect(result).toEqual({ kind: "completed", processed: 2, remaining: true, checkpoint: "published" });
});

test("stale publication conflicts without retry or completion claim", async () => {
  const pending = { kind: "ok" as const, batch: { id: "batch", checkpoint: "captured" }, units: [], remaining: false, bytes: 0 };
  let publishes = 0;
  const result = await nightloomWorkflow.run({
    runId: "host/workflow", async task(_step, task) {
      if (task.id === "nightloom.pending") return pending as never;
      publishes++;
      return { kind: "conflict" } as never;
    },
    async child() { throw Error("unexpected"); }, async input() { throw Error("unexpected"); }, async sleep() { throw Error("unexpected"); },
  }, { batchSize: 50, maxBytes: 65_536 });
  expect({ result, publishes }).toEqual({ result: { kind: "completed", processed: 0, remaining: false, checkpoint: "captured" }, publishes: 0 });
});

test("default limits are five minutes, six starts, thirty minutes, threshold 50 and one hour", () => {
  expect(DEFAULT_NIGHTLOOM_SETTINGS).toEqual({ assessmentTimeoutMs: 300_000, maxAutomaticStartsPerDay: 6, maxAutomaticMillisecondsPerDay: 1_800_000, pendingThreshold: 50, oldestPendingAgeMs: 3_600_000, batchSize: 50, maxBytes: 900_000 });
});
