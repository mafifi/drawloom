import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import { createSqliteEvaluationStore } from "@drawloom/sqlite-evaluation";
import { createEvaluationComposer } from "@drawloom/evaluation-orchestration";

const root = await mkdtemp(join(tmpdir(), "drawloom-evaluation-temporal-"));
const packageDirectory = resolve("packages/evaluation/evaluation-orchestration");
const scope = { installationId: "supported-evaluation", projectId: "real-temporal" };
let passingCalls = 0;
let failingCalls = 0;
let targetCalls = 0;
let cancellationScorerCalls = 0;
const passing = {
  id: "passing", revision: "r1", input: z.string(), output: z.string(), expected: z.string(),
  async score() { passingCalls++; return { outcome: "succeeded", findings: [{ id: "passing", name: "Passing", outcome: "scored", score: 1, references: [] }] }; },
};
const failing = {
  id: "failing", revision: "r1", input: z.string(), output: z.string(),
  async score() { failingCalls++; throw new Error("synthetic scorer failure"); },
};
const blocking = {
  id: "blocking", revision: "r1", input: z.string(), output: z.string(),
  async invoke(_args, context) {
    targetCalls++;
    if (!context.signal.aborted) await new Promise((resolve) => context.signal.addEventListener("abort", resolve, { once: true }));
    return { outcome: "cancelled", references: [] };
  },
};
const cancellationScorer = {
  id: "after-cancel", revision: "r1", input: z.string(), output: z.string(),
  async score() { cancellationScorerCalls++; return { outcome: "succeeded", findings: [] }; },
};
const assessment = { async assess(scorer, args, context) { return scorer.score(args, context); } };
const identity = async (value) => `eval-${createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 48)}`;
const clock = { now: () => Date.now() };

async function until(read, predicate) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Expected real Temporal evaluation state was not reached");
}

async function open() {
  const manager = createLocalTemporalManager({ dataDirectory: root });
  const registration = await manager.prepare({ ...scope, packageDirectory, entrypoint: "dist/workflows.js" });
  const store = createSqliteEvaluationStore({ dataDirectory: join(root, "evaluation"), scope });
  const composition = createEvaluationComposer({ store, orchestrator: registration.orchestrator, assessment, readiness: registration.readiness, identity, clock }).compose({
    targets: [blocking], scorers: [passing, failing, cancellationScorer],
  });
  await registration.attach(composition.taskHandlers);
  return { manager, registration, store, service: composition.service };
}

const assessmentDefinition = {
  schemaVersion: 1,
  id: "real-temporal-assessment", revision: "r1", name: "Real Temporal assessment", mode: "assess_existing",
  scorers: [{ id: "passing", revision: "r1" }, { id: "failing", revision: "r1" }],
  cases: [
    { id: "case-one", revision: "r1", input: "one", expected: "one", suppliedOutput: "one", references: [] },
    { id: "case-two", revision: "r1", input: "two", expected: "two", suppliedOutput: "two", references: [] },
  ],
};
const cancellationDefinition = {
  schemaVersion: 1,
  id: "real-temporal-cancellation", revision: "r1", name: "Real Temporal cancellation", mode: "experiment",
  target: { id: "blocking", revision: "r1" },
  scorers: [{ id: "after-cancel", revision: "r1" }],
  cases: [{ id: "cancel-case", revision: "r1", input: "wait", references: [] }],
};

let active;
try {
  active = await open();
  const started = await active.service.assess({ requestId: "real-temporal-stable", definition: assessmentDefinition });
  assert.equal(started.kind, "started");
  await active.registration.orchestrator.result(started.orchestrationRunId);
  assert.deepEqual({ passingCalls, failingCalls }, { passingCalls: 2, failingCalls: 2 });
  const page = await active.store.listResults({ runId: started.evaluationRunId });
  assert.equal(page.items.length, 2);
  for (const item of page.items) {
    const result = await active.store.getResult(item.id);
    assert.deepEqual(result.findings.map((finding) => [finding.id, finding.outcome]), [["passing", "scored"], ["failing", "error"]]);
  }
  const repeated = await active.service.assess({ requestId: "real-temporal-stable", definition: assessmentDefinition });
  assert.equal(repeated.kind, "reconciled");
  assert.deepEqual({ passingCalls, failingCalls }, { passingCalls: 2, failingCalls: 2 });

  await active.manager.close();
  await active.store.close();
  active = await open();
  const restored = await active.service.assess({ requestId: "real-temporal-stable", definition: assessmentDefinition });
  assert.equal(restored.kind, "reconciled");
  assert.equal((await active.service.status(restored.evaluationRunId)).kind, "completed");
  assert.deepEqual({ passingCalls, failingCalls }, { passingCalls: 2, failingCalls: 2 });

  const cancelling = await active.service.run({ requestId: "real-temporal-cancel", definition: cancellationDefinition });
  assert.equal(cancelling.kind, "started");
  await until(() => targetCalls, (calls) => calls === 1);
  assert.equal((await active.service.cancel(cancelling.evaluationRunId)).kind, "requested");
  await assert.rejects(active.registration.orchestrator.result(cancelling.orchestrationRunId));
  const cancellationStatus = await active.service.status(cancelling.evaluationRunId);
  assert.ok(["cancelled", "uncertain"].includes(cancellationStatus.kind));
  assert.equal(cancellationScorerCalls, 0);
  console.log("EVALUATION_TEMPORAL_OK");
} finally {
  await active?.manager.close();
  await active?.store.close();
  await rm(root, { recursive: true, force: true });
}
