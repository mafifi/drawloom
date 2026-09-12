import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import { createSqliteKnowledge } from "@drawloom/sqlite-knowledge";
import { createNightloomTaskHandlers, nightloomWorkflow } from "@drawloom/nightloom";

if (process.env.DRAWLOOM_TEMPORAL_TEST !== "1") {
  process.stdout.write("SKIPPED: set DRAWLOOM_TEMPORAL_TEST=1 to run the local Temporal Nightloom integration.\n");
  process.exit(0);
}

const subject = Object.freeze({ type: "user", id: "nightloom-evaluation", properties: { locality: "test" } });
const resource = ({ ref } = {}) => ({ type: ref ? "knowledge-record" : "knowledge-store", id: ref ? `${ref.type}:${ref.origin}:${ref.id}:${ref.revision}` : "nightloom-evaluation", properties: { locality: "test" } });
const authorizer = { authorize: async () => ({ decision: true }) };

function receiptStore(store) {
  let serial = Promise.resolve();
  const key = (requestId) => `receipt-${createHash("sha256").update(requestId).digest("hex")}`;
  return {
    async load(requestId) { return await store.get(key(requestId)); },
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
    fingerprint: (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex"),
  }));
  return registration;
}

const root = await mkdtemp(join(tmpdir(), "drawloom-temporal-nightloom-evaluation-"));
let manager;
let provider;
try {
  provider = createSqliteKnowledge({ databasePath: join(root, "knowledge.sqlite"), authorizer, resolveResource: resource });
  for (const [id, body] of [["first", "public first source"], ["second", "public second source"]]) {
    const accepted = await provider.intake.ingest(subject, {
      operation: "upsert", expectedRevision: null,
      record: { ref: { type: "source", origin: "public-nightloom-evaluation", id, revision: "r1" }, body, status: "active", confidence: { value: "fixture" }, provenance: { producer: { type: "evaluation", id: "public" }, inputs: [] } },
      links: [],
    });
    assert.equal(accepted.kind, "accepted");
  }
  let assessments = 0;
  const assessment = {
    async assess(_owner, request) { assessments += 1; return { kind: "completed", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint, proposals: [] }; },
    async reconcile(_owner, request) { return { kind: "completed", requestId: request.requestId, payloadFingerprint: request.payloadFingerprint, proposals: [] }; },
    async cancel() { return { kind: "too_late", requestId: "not-used", payloadFingerprint: "not-used" }; },
  };
  const receipts = receiptStore(createNodeJsonStore(join(root, "receipts")));
  const input = { batchSize: 2, maxBytes: 65_536 };
  manager = createLocalTemporalManager({ dataDirectory: root });
  let registration = await attach(manager, provider, receipts, assessment);
  const firstRun = await registration.orchestrator.start("owned-nightloom-run", nightloomWorkflow, input);
  const first = await registration.orchestrator.result(firstRun);
  assert.deepEqual(first, { kind: "completed", processed: 2, remaining: false, checkpoint: first.checkpoint });
  assert.equal(assessments, 1);
  await manager.close(); manager = createLocalTemporalManager({ dataDirectory: root });
  registration = await attach(manager, provider, receipts, assessment);
  const reopenedRun = await registration.orchestrator.start("owned-nightloom-run", nightloomWorkflow, input);
  assert.equal(reopenedRun, firstRun);
  assert.deepEqual(await registration.orchestrator.result(reopenedRun), first);
  assert.equal(assessments, 1);
  process.stdout.write(`${JSON.stringify({ kind: "passed", processed: first.processed, assessments, runId: firstRun })}\n`);
} finally {
  await manager?.close();
  provider?.close();
  await rm(root, { recursive: true, force: true });
}
