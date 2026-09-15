import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createLocalTemporalManager, isLocalExecutionPaused } from "@drawloom/temporal-orchestration";
import { createSqliteKnowledge } from "@drawloom/sqlite-knowledge";
import { createNightloomCoordinator, createNightloomTaskHandlers, DEFAULT_NIGHTLOOM_SETTINGS, nightloomWorkflow } from "@drawloom/nightloom";

const subject = Object.freeze({ type: "user", id: "nightloom-integration", properties: { locality: "test" } });
const resource = ({ ref } = {}) => ({
  type: ref ? "knowledge-record" : "knowledge-store",
  id: ref ? `${ref.type}:${ref.origin}:${ref.id}:${ref.revision}` : "nightloom-integration",
  properties: { locality: "test" },
});
const authorizer = { authorize: async () => ({ decision: true }) };
const fingerprint = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function receiptStore(store) {
  let serial = Promise.resolve();
  const key = (requestId) => `receipt-${fingerprint(requestId)}`;
  return {
    async load(requestId) { return store.get(key(requestId)); },
    compareAndSet(requestId, expectedRevision, next) {
      const operation = serial.then(async () => {
        const current = await store.get(key(requestId));
        if ((current?.revision ?? null) !== expectedRevision) return false;
        await store.set(key(requestId), next);
        return true;
      });
      serial = operation.catch(() => undefined);
      return operation;
    },
  };
}

function coordinatorStore(store) {
  let serial = Promise.resolve();
  return {
    async load() { return store.get("coordinator"); },
    compareAndSet(expectedRevision, next) {
      const operation = serial.then(async () => {
        const current = await store.get("coordinator");
        if ((current?.revision ?? null) !== expectedRevision) return false;
        await store.set("coordinator", next);
        return true;
      });
      serial = operation.catch(() => undefined);
      return operation;
    },
  };
}

async function attach(manager, provider, receipts, assessment) {
  const registration = await manager.prepareHost({
    capabilityId: "knowledge-maintenance",
    packageDirectory: resolve("packages/knowledge/nightloom"),
    entrypoint: "dist/workflows.js",
  });
  await registration.attach(createNightloomTaskHandlers({
    maintenance: provider.maintenance,
    retrieval: provider.retrieval,
    assessment,
    receipts,
    subject,
    fingerprint,
    isHostSuspension: isLocalExecutionPaused,
  }));
  return registration;
}

async function start(registration, identity) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await registration.orchestrator.start(identity, nightloomWorkflow, { batchSize: 1, maxBytes: 65_536 });
    } catch (error) {
      if (!String(error).includes("Failed to query Workflow")) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function resultWithState(registration, runId) {
  try {
    return await registration.orchestrator.result(runId);
  } catch (error) {
    const snapshot = await registration.orchestrator.get(runId);
    const steps = await registration.orchestrator.getSteps(runId, { limit: 100 });
    throw new Error(`Nightloom workflow failed: ${String(error)}; snapshot=${JSON.stringify(snapshot)}; steps=${JSON.stringify(steps.steps)}`, { cause: error });
  }
}

async function waitForLine(child, expected) {
  let output = "";
  let errors = "";
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${expected}; output=${output}; errors=${errors}`)), 60_000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.split("\n").includes(expected)) { clearTimeout(timer); resolveReady(); }
    });
    child.stderr.on("data", (chunk) => { errors += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => reject(new Error(`Fixture exited before ${expected}: ${code}/${signal}; output=${output}; errors=${errors}`)));
  });
}

test("real known-running assessment resumes the same workflow and original deadline after Temporal restart", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-nightloom-running-"));
  let manager, provider;
  try {
    provider = createSqliteKnowledge({ databasePath: join(root, "knowledge.sqlite"), authorizer, resolveResource: resource });
    const ref = { type: "source", origin: "nightloom-integration", id: "running", revision: "r1" };
    await provider.intake.ingest(subject, { operation: "upsert", expectedRevision: null, record: { ref, body: "Public synthetic continuation evidence.", status: "active", confidence: {}, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] } }, links: [] });
    const receipts = receiptStore(createNodeJsonStore(join(root, "receipts")));
    const store = coordinatorStore(createNodeJsonStore(join(root, "coordinator")));
    let submissions = 0, reconciliations = 0, complete = false;
    const identities = [];
    const assessment = {
      async assess(_owner, request) { submissions++; const identity = { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint }; identities.push(identity); return { kind: "running", ...identity }; },
      async reconcile(_owner, identity) { reconciliations++; identities.push(identity); return complete ? { kind: "completed", ...identity, proposals: [] } : { kind: "running", ...identity }; },
      async cancel(_owner, identity) { throw Error(`unexpected cancellation ${identity.requestId}`); },
    };
    const activate = async () => {
      manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
      const registration = await attach(manager, provider, receipts, assessment);
      const coordinator = createNightloomCoordinator({ orchestrator: registration.orchestrator, maintenance: provider.maintenance, subject, store, readiness: () => registration.readiness(), clock: { now: () => Date.UTC(2026, 8, 15) }, settings: { ...DEFAULT_NIGHTLOOM_SETTINGS, maxAutomaticStartsPerDay: 1, assessmentTimeoutMs: 60_000 } });
      return { registration, coordinator };
    };
    let active = await activate();
    let started = await active.coordinator.runNow();
    // Reconcile only an ambiguous orchestration start using its durable identity.
    if (started.kind === "uncertain") started = await active.coordinator.runNow();
    assert.equal(started.kind, "started");
    const runId = started.runId;
    const until = Date.now() + 10_000;
    while (submissions === 0 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(submissions, 1);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await active.registration.orchestrator.get(runId)).status, "running");
    const receipt = await receipts.load(identities[0].requestId);
    assert.ok(receipt.deadlineAtMs > Date.now());
    assert.equal((await active.coordinator.tick()).kind, "busy");
    await manager.close();
    active = await activate();
    assert.equal((await active.coordinator.status()).active.runId, runId);
    assert.equal((await active.coordinator.status()).budget.automaticStarts, 1);
    const resumedUntil = Date.now() + 10_000;
    while (reconciliations === 0 && Date.now() < resumedUntil) await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(reconciliations >= 1);
    assert.equal((await active.coordinator.tick()).kind, "busy");
    complete = true;
    assert.equal((await resultWithState(active.registration, runId)).kind, "completed");
    assert.equal(submissions, 1);
    assert.ok(reconciliations >= 2);
    assert.ok(identities.every(value => JSON.stringify(value) === JSON.stringify(identities[0])));
    assert.equal((await receipts.load(identities[0].requestId)).deadlineAtMs, receipt.deadlineAtMs);
    assert.equal((await active.coordinator.status()).budget.automaticStarts, 1);
    assert.equal((await active.registration.orchestrator.list()).runs.length, 1);
  } finally { await cleanup({ manager, provider, root }); }
});

test("real cancellation during durable assessment sleep retains uncertainty until exact cancellation settles", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-nightloom-cancel-sleep-"));
  let manager, provider, finishCancel;
  try {
    provider = createSqliteKnowledge({ databasePath: join(root, "knowledge.sqlite"), authorizer, resolveResource: resource });
    const ref = { type: "source", origin: "nightloom-integration", id: "cancel-sleep", revision: "r1" };
    await provider.intake.ingest(subject, { operation: "upsert", expectedRevision: null, record: { ref, body: "Public cancellation evidence.", status: "active", confidence: {}, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] } }, links: [] });
    const receipts = receiptStore(createNodeJsonStore(join(root, "receipts")));
    let submissions = 0, cancellations = 0, identity;
    const assessment = {
      async assess(_owner, request) { submissions++; identity = { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint }; return { kind: "running", ...identity }; },
      async reconcile(_owner, request) { assert.deepEqual(request, identity); return { kind: "running", ...request }; },
      async cancel(_owner, request) { cancellations++; assert.deepEqual(request, identity); await new Promise(resolve => { finishCancel = resolve; }); return { kind: "cancelled", ...request }; },
    };
    manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
    const registration = await attach(manager, provider, receipts, assessment);
    const coordinator = createNightloomCoordinator({ orchestrator: registration.orchestrator, maintenance: provider.maintenance, subject, store: coordinatorStore(createNodeJsonStore(join(root, "coordinator"))), readiness: () => registration.readiness(), clock: { now: () => Date.UTC(2026, 8, 15) } });
    let started = await coordinator.runNow();
    if (started.kind === "uncertain") started = await coordinator.runNow();
    assert.equal(started.kind, "started");
    const until = Date.now() + 10_000;
    for (;;) {
      const state = await registration.orchestrator.get(started.runId);
      if (state.steps.some(step => step.status === "completed" && step.result?.kind === "running")) break;
      assert.ok(Date.now() < until); await new Promise(resolve => setTimeout(resolve, 20));
    }
    await registration.orchestrator.cancel(started.runId);
    while (!finishCancel && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(cancellations, 1);
    assert.equal((await receipts.load(identity.requestId)).state, "uncertain");
    await assert.rejects(registration.orchestrator.result(started.runId));
    assert.equal((await coordinator.tick()).kind, "uncertain");
    finishCancel();
    while ((await receipts.load(identity.requestId)).state !== "cancelled" && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await receipts.load(identity.requestId)).state, "cancelled");
    assert.equal(submissions, 1); assert.equal(cancellations, 1);
    assert.equal((await coordinator.status()).budget.automaticStarts, 1);
    assert.equal((await registration.orchestrator.list()).runs.length, 1);
  } finally { finishCancel?.(); await cleanup({ manager, provider, root }); }
});

function descendantsOf(parentPid) {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" }).trim().split("\n");
  const children = new Map();
  for (const row of rows) {
    const [pid, ppid] = row.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid)) continue;
    const values = children.get(ppid) ?? [];
    values.push(pid);
    children.set(ppid, values);
  }
  const found = [];
  const visit = (pid) => { for (const child of children.get(pid) ?? []) { found.push(child); visit(child); } };
  visit(parentPid);
  return found;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function stopOwnedProcessTree(child) {
  if (!child) return;
  const descendants = descendantsOf(child.pid);
  const exited = child.exitCode === null && child.signalCode === null
    ? new Promise((resolveExit) => child.once("exit", resolveExit))
    : Promise.resolve();
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Fixture process did not exit")), 5_000))]);
  const deadline = Date.now() + 5_000;
  while (descendants.some(alive) && Date.now() < deadline) await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  for (const pid of descendants.filter(alive)) { try { process.kill(pid, "SIGTERM"); } catch {} }
  await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  for (const pid of descendants.filter(alive)) { try { process.kill(pid, "SIGKILL"); } catch {} }
  const killedDeadline = Date.now() + 2_000;
  while (descendants.some(alive) && Date.now() < killedDeadline) await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  if (descendants.some(alive)) throw new Error(`Owned fixture descendants did not stop: ${descendants.filter(alive).join(",")}`);
}

async function cleanup({ child, manager, provider, root }) {
  const failures = [];
  try { await stopOwnedProcessTree(child); } catch (error) { failures.push(error); }
  const released = await Promise.allSettled([
    manager?.close(),
    Promise.resolve().then(() => provider?.close()),
  ]);
  for (const result of released) if (result.status === "rejected") failures.push(result.reason);
  try { await rm(root, { recursive: true, force: true }); } catch (error) { failures.push(error); }
  if (failures.length) throw new AggregateError(failures, "Nightloom integration cleanup failed");
}

test("real Nightloom keeps an actively interrupted assessment unknown without resubmission or publication", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-nightloom-recovery-"));
  let manager;
  let provider;
  let child;
  try {
    child = spawn(process.execPath, [resolve("apps/desktop/tests/fixtures/nightloom-interrupted-assessment.mjs"), root], { stdio: ["ignore", "pipe", "pipe"] });
    await waitForLine(child, "ASSESSMENT_STARTED");
    const interruptedRun = (await readFile(join(root, "interrupted-run-id"), "utf8")).trim();
    await stopOwnedProcessTree(child);
    child = undefined;

    provider = createSqliteKnowledge({ databasePath: join(root, "knowledge.sqlite"), authorizer, resolveResource: resource });
    const receipts = receiptStore(createNodeJsonStore(join(root, "assessment-receipts")));
    let submissions = 0;
    let publications = 0;
    const maintenance = { ...provider.maintenance, async publish(owner, input) { publications += 1; return provider.maintenance.publish(owner, input); } };
    const assessment = {
      async assess() { submissions += 1; throw new Error("recovery must not submit the assessment again"); },
      async reconcile(_owner, identity) { return { kind: "uncertain", ...identity }; },
      async cancel(_owner, identity) { return { kind: "too_late", ...identity }; },
    };
    const state = coordinatorStore(createNodeJsonStore(join(root, "coordinator-state")));
    const activate = async () => {
      manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
      const registration = await manager.prepareHost({ capabilityId: "knowledge-maintenance", packageDirectory: resolve("packages/knowledge/nightloom"), entrypoint: "dist/workflows.js" });
      await registration.attach(createNightloomTaskHandlers({ maintenance, retrieval: provider.retrieval, assessment, receipts, subject, fingerprint, isHostSuspension: isLocalExecutionPaused }));
      const coordinator = createNightloomCoordinator({ orchestrator: registration.orchestrator, maintenance, subject, store: state, readiness: () => registration.readiness(), clock: { now: () => Date.UTC(2026, 8, 15) }, settings: { ...DEFAULT_NIGHTLOOM_SETTINGS, pendingThreshold: 1, batchSize: 1 } });
      return { registration, coordinator };
    };
    let active = await activate();
    const registration = active.registration;
    await assert.rejects(registration.orchestrator.result(interruptedRun));
    const interrupted = await registration.orchestrator.get(interruptedRun);
    assert.equal(interrupted.status, "failed");
    assert.ok(interrupted.unresolvedEffects.length > 0);
    assert.equal(submissions, 0);
    assert.equal(publications, 0);
    assert.equal((await readFile(join(root, "assessment-submissions"), "utf8")).trim(), "1");
    const automatic = await active.coordinator.tick();
    assert.equal(automatic.kind, "uncertain");
    assert.equal(submissions, 0);
    assert.equal(publications, 0);
    assert.equal((await registration.orchestrator.list()).runs.length, 1);

    await manager.close();
    active = await activate();
    const manual = await active.coordinator.runNow(true);
    assert.equal(manual.kind, "uncertain");
    assert.deepEqual(manual, automatic);
    assert.equal(submissions, 0);
    assert.equal(publications, 0);
    assert.equal((await active.registration.orchestrator.list()).runs.length, 1);
  } finally {
    await cleanup({ child, manager, provider, root });
  }
});

test("real Nightloom safely reconciles a durable receipt and publishes one exact claim across reopen", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-nightloom-reconcile-"));
  let manager;
  let provider;
  try {
    provider = createSqliteKnowledge({ databasePath: join(root, "knowledge.sqlite"), authorizer, resolveResource: resource });
    const sourceRef = { type: "source", origin: "nightloom-integration", id: "reconcile", revision: "r1" };
    const claimRef = { type: "claim", origin: "nightloom-integration", id: "recovered-claim", revision: "r1" };
    assert.equal((await provider.intake.ingest(subject, {
      operation: "upsert", expectedRevision: null,
      record: { ref: sourceRef, body: "public evidence to reconcile", status: "active", confidence: { value: "fixture" }, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] } }, links: [],
    })).kind, "accepted");
    const receipts = receiptStore(createNodeJsonStore(join(root, "assessment-receipts")));
    let submissions = 0;
    let reconciliations = 0;
    let publications = 0;
    const maintenance = { ...provider.maintenance, async publish(owner, input) { publications += 1; return provider.maintenance.publish(owner, input); } };
    const assessment = {
      async assess(_owner, request) { submissions += 1; return { kind: "uncertain", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint }; },
      async reconcile(_owner, identity) { reconciliations += 1; return { kind: "completed", ...identity, proposals: [{
        record: { ref: claimRef, body: "Recovered from one interrupted assessment.", status: "active", freshness: "current", confidence: { value: "deterministic" }, provenance: { producer: { type: "assessment", id: "nightloom-integration" }, inputs: [sourceRef] } },
        expectedRevision: null, links: [{ from: claimRef, to: sourceRef, relation: "support" }],
      }] }; },
      async cancel(_owner, identity) { return { kind: "too_late", ...identity }; },
    };
    const activate = async () => {
      manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
      const registration = await manager.prepareHost({ capabilityId: "knowledge-maintenance", packageDirectory: resolve("packages/knowledge/nightloom"), entrypoint: "dist/workflows.js" });
      await registration.attach(createNightloomTaskHandlers({ maintenance, retrieval: provider.retrieval, assessment, receipts, subject, fingerprint }));
      return registration;
    };
    let registration = await activate();
    const firstRun = await start(registration, "durable-reconcile-first");
    assert.deepEqual(await resultWithState(registration, firstRun), { kind: "deferred", processed: 0, remaining: true });
    await manager.close();
    registration = await activate();
    const recoveryRun = await start(registration, "durable-reconcile-second");
    const result = await resultWithState(registration, recoveryRun);
    assert.deepEqual(result, { kind: "completed", processed: 1, remaining: false, checkpoint: result.checkpoint });
    assert.equal(submissions, 1);
    assert.equal(reconciliations, 1);
    assert.equal(publications, 1);
    assert.deepEqual(await provider.retrieval.get(subject, claimRef), { kind: "ok", record: {
      ref: claimRef, body: "Recovered from one interrupted assessment.", status: "active", freshness: "current", confidence: { value: "deterministic" }, provenance: { producer: { type: "assessment", id: "nightloom-integration" }, inputs: [sourceRef] },
    } });
    await manager.close();
    registration = await activate();
    assert.equal(await start(registration, "durable-reconcile-second"), recoveryRun);
    assert.deepEqual(await registration.orchestrator.result(recoveryRun), result);
    assert.equal(publications, 1);
    assert.equal(reconciliations, 1);
  } finally { await cleanup({ manager, provider, root }); }
});

test("real Nightloom controller persists pause across service restart and resumes explicit work", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-nightloom-pause-"));
  let manager;
  let provider;
  try {
    provider = createSqliteKnowledge({ databasePath: join(root, "knowledge.sqlite"), authorizer, resolveResource: resource });
    assert.equal((await provider.intake.ingest(subject, {
      operation: "upsert", expectedRevision: null,
      record: { ref: { type: "source", origin: "nightloom-integration", id: "paused", revision: "r1" }, body: "paused public evidence", status: "active", confidence: { value: "fixture" }, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] } }, links: [],
    })).kind, "accepted");
    const receipts = receiptStore(createNodeJsonStore(join(root, "assessment-receipts")));
    const state = coordinatorStore(createNodeJsonStore(join(root, "coordinator-state")));
    const assessment = {
      async assess(_owner, request) { return { kind: "completed", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint, proposals: [] }; },
      async reconcile(_owner, identity) { return { kind: "completed", ...identity, proposals: [] }; },
      async cancel(_owner, identity) { return { kind: "too_late", ...identity }; },
    };
    const activate = async () => {
      manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
      const registration = await attach(manager, provider, receipts, assessment);
      const coordinator = createNightloomCoordinator({ orchestrator: registration.orchestrator, maintenance: provider.maintenance, subject, store: state, readiness: () => registration.readiness(), clock: { now: () => Date.UTC(2026, 8, 15) }, settings: { ...DEFAULT_NIGHTLOOM_SETTINGS, pendingThreshold: 1 } });
      return { registration, coordinator };
    };
    let active = await activate();
    await active.coordinator.pause();
    assert.equal((await active.coordinator.tick()).kind, "paused");
    await manager.close();
    active = await activate();
    assert.equal((await active.coordinator.status()).paused, true);
    assert.equal((await active.coordinator.runNow(true)).kind, "paused");
    await active.coordinator.resume();
    const started = await active.coordinator.runNow(true);
    assert.equal(started.kind, "started");
    const result = await resultWithState(active.registration, started.runId);
    assert.deepEqual(result, { kind: "completed", processed: 1, remaining: false, checkpoint: result.checkpoint });
    assert.equal((await provider.maintenance.status(subject)).pendingUnits, 0);
  } finally { await cleanup({ manager, provider, root }); }
});

test("real Nightloom preserves a terminal uncertain assessment without reconciliation, publication or resubmission", { timeout: 120_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-nightloom-uncertain-"));
  let manager;
  let provider;
  try {
    provider = createSqliteKnowledge({ databasePath: join(root, "knowledge.sqlite"), authorizer, resolveResource: resource });
    const accepted = await provider.intake.ingest(subject, {
      operation: "upsert",
      expectedRevision: null,
      record: { ref: { type: "source", origin: "nightloom-integration", id: "uncertain", revision: "r1" }, body: "uncertain public evidence", status: "active", confidence: { value: "fixture" }, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] } },
      links: [],
    });
    assert.equal(accepted.kind, "accepted");
    const receipts = receiptStore(createNodeJsonStore(join(root, "assessment-receipts")));
    let submissions = 0;
    let reconciliations = 0;
    const assessment = {
      async assess(_owner, request) {
        submissions += 1;
        return { kind: "uncertain", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint };
      },
      async reconcile(_owner, identity) {
        reconciliations += 1;
        return { kind: "uncertain", ...identity };
      },
      async cancel(_owner, identity) { return { kind: "too_late", ...identity }; },
    };
    manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
    let registration = await attach(manager, provider, receipts, assessment);
    const runId = await start(registration, "uncertain-assessment");
    assert.deepEqual(await resultWithState(registration, runId), { kind: "deferred", processed: 0, remaining: true });
    assert.equal(submissions, 1);
    assert.equal((await provider.maintenance.status(subject)).pendingUnits, 1);

    await manager.close();
    manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
    registration = await attach(manager, provider, receipts, assessment);
    const reopened = await start(registration, "uncertain-assessment");
    assert.equal(reopened, runId);
    assert.deepEqual(await registration.orchestrator.result(reopened), { kind: "deferred", processed: 0, remaining: true });
    assert.equal(submissions, 1);
    assert.equal(reconciliations, 0);
    assert.equal((await provider.maintenance.status(subject)).pendingUnits, 1);
  } finally {
    await cleanup({ manager, provider, root });
  }
});
