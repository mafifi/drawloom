import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { heldOutQuestions } from "./corpus.ts";
import { parseCliOptions, runKnowledgeEvaluation } from "./runner.ts";

test("default evaluation is a deterministic lexical smoke run without semantic claims", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-evaluation-"));
  try {
    const report = await runKnowledgeEvaluation({ root });
    assert.equal(report.kind, "deterministic_smoke");
    assert.equal(report.corpus.records, 24);
    assert.match(report.corpus.sha256, /^[a-f0-9]{64}$/);
    assert.equal(report.lexical.queries, 24);
    assert.ok(report.lexical.latency.peakRssBytes >= report.lexical.latency.startRssBytes);
    assert.ok(report.lexical.latency.warm30P95Ms >= report.lexical.latency.warm30MedianMs);
    assert.ok(report.ingestion.elapsedMs >= 0);
    assert.ok(report.ingestion.peakRssBytes >= report.ingestion.startRssBytes);
    assert.ok(report.lexical.measurement.cpuMicros >= 0);
    assert.equal(report.lexical.storeBytes.total, report.lexical.storeBytes.database + report.lexical.storeBytes.wal + report.lexical.storeBytes.shm);
    assert.ok(report.lexical.storeBytes.wal > 0);
    assert.ok(report.lexical.storeBytes.shm > 0);
    assert.deepEqual(Object.keys(report.lexical.questions).sort(), heldOutQuestions.map((question) => question.id).sort());
    assert.equal(report.lexical.questions.n4?.category, "irrelevant");
    assert.ok(Array.isArray(report.lexical.questions.n4?.retrieved));
    assert.equal(report.lexical.categoryMetrics.identifier.exactIdentifierRecall >= 0, true);
    assert.equal(report.hybrid.kind, "not_run");
    assert.equal(report.hybrid.reason, "no_model_requested");
    assert.equal(report.answerEvaluation, "not_configured");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("requested but unavailable model weights block hybrid evaluation without downloading", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-evaluation-"));
  try {
    const report = await runKnowledgeEvaluation({ root, model: "qwen3-embedding-0.6b-mlx" });
    assert.equal(report.kind, "deterministic_smoke");
    assert.deepEqual(report.hybrid, { kind: "blocked", reason: "model_not_ready" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("scale and stress flags select their documented corpus sizes", () => {
  assert.deepEqual(parseCliOptions(["--root", "/tmp/evaluation", "--scale"]), { root: "/tmp/evaluation", size: 10_000 });
  assert.deepEqual(parseCliOptions(["--root", "/tmp/evaluation", "--stress"]), { root: "/tmp/evaluation", size: 100_000 });
});

test("an external embedding implementation exercises the unchanged path with separate indexing timing", async (context) => {
  let clock = 0;
  context.mock.method(performance, "now", () => clock++);
  const root = await mkdtemp(join(tmpdir(), "drawloom-external-embedding-"));
  const configuration = { id: "evaluation:external", fingerprint: "deterministic-not-model-quality", dimensions: 2 };
  let documents = 0, queries = 0;
  try {
    const report = await runKnowledgeEvaluation({ root, embedding: {
      label: "deterministic-external-fixture", configuration,
      implementation: { async embed(_subject, batch) {
        if (batch.role === "document") documents += batch.items.length;
        else { queries += batch.items.length; clock += 1000; }
        return { kind: "ok", configuration, items: batch.items.map(item => ({ id: item.id, revision: item.revision, vector: [1, 0] })) };
      } },
    } });
    assert.equal(report.hybrid.kind, "real_vectors");
    assert.equal(report.hybrid.kind === "real_vectors" && report.hybrid.model, "deterministic-external-fixture");
    assert.ok(documents >= 23);
    assert.equal(queries, 54);
    assert.ok(report.hybrid.kind === "real_vectors" && report.hybrid.indexing.elapsedMs < 1000,
      "Index timing must stop before simulated query time advances");
  } finally { await rm(root, { recursive: true, force: true }); }
});
