// Node host composition for interrupted Nightloom recovery, outside the portable package.
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import { createSqliteKnowledge } from "@drawloom/sqlite-knowledge";
import { createNightloomCoordinator, createNightloomTaskHandlers, DEFAULT_NIGHTLOOM_SETTINGS } from "@drawloom/nightloom";

const root = resolve(process.argv[2]);
const subject = Object.freeze({ type: "user", id: "nightloom-integration", properties: { locality: "test" } });
const resource = ({ ref } = {}) => ({ type: ref ? "knowledge-record" : "knowledge-store", id: ref ? `${ref.type}:${ref.origin}:${ref.id}:${ref.revision}` : "nightloom-integration", properties: { locality: "test" } });
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
const provider = createSqliteKnowledge({ databasePath: join(root, "knowledge.sqlite"), authorizer: { authorize: async () => ({ decision: true }) }, resolveResource: resource });
const accepted = await provider.intake.ingest(subject, {
  operation: "upsert", expectedRevision: null,
  record: { ref: { type: "source", origin: "nightloom-integration", id: "interrupted", revision: "r1" }, body: "interrupted public evidence", status: "active", confidence: { value: "fixture" }, provenance: { producer: { type: "test", id: "fixture" }, inputs: [] } },
  links: [],
});
if (accepted.kind !== "accepted") throw new Error(`Fixture intake failed: ${accepted.kind}`);
const manager = createLocalTemporalManager({ dataDirectory: join(root, "temporal") });
const registration = await manager.prepareHost({ capabilityId: "knowledge-maintenance", packageDirectory: resolve("packages/knowledge/nightloom"), entrypoint: "dist/workflows.js" });
let releaseAssessment;
const runRecorded = new Promise((resolveRun) => { releaseAssessment = resolveRun; });
await registration.attach(createNightloomTaskHandlers({
  maintenance: provider.maintenance,
  retrieval: provider.retrieval,
  assessment: {
    async assess(_owner, request) {
      await runRecorded;
      await writeFile(join(root, "assessment-submissions"), "1\n", { flag: "wx" });
      process.stdout.write("ASSESSMENT_STARTED\n");
      return new Promise(() => {});
    },
    async reconcile(_owner, request) { return { kind: "uncertain", ...request }; },
    async cancel(_owner, request) { return { kind: "too_late", ...request }; },
  },
  receipts: receiptStore(createNodeJsonStore(join(root, "assessment-receipts"))), subject, fingerprint,
}));
const coordinator = createNightloomCoordinator({
  orchestrator: registration.orchestrator,
  maintenance: provider.maintenance,
  subject,
  store: coordinatorStore(createNodeJsonStore(join(root, "coordinator-state"))),
  readiness: () => registration.readiness(),
  clock: { now: () => Date.UTC(2026, 8, 15) },
  settings: { ...DEFAULT_NIGHTLOOM_SETTINGS, pendingThreshold: 1, batchSize: 1 },
});
const started = await coordinator.tick();
if (started.kind !== "started") throw new Error(`Expected started coordinator, received ${JSON.stringify(started)}`);
const runId = started.runId;
await writeFile(join(root, "interrupted-run-id"), `${runId}\n`, { flag: "wx" });
releaseAssessment();
await new Promise(() => {});
