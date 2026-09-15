import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openScaleRun, type ScaleRunResources } from "./scale-run.ts";
import { createEvaluationShutdown } from "./evaluation-shutdown.ts";

const GiB = 1024 ** 3;
const identity = {
  corpus: { version: "public-v1", sha256: "a".repeat(64), records: 100_000 },
  runtime: { sha256: "b".repeat(64) },
  model: { sha256: "c".repeat(64) },
  configuration: { id: "evaluation:qwen", fingerprint: "format-v1" },
};
const safe: ScaleRunResources = {
  diskFreeBytes: 9 * GiB,
  availableMemoryBytes: 5 * GiB,
  memoryPressure: "green",
  swapUsedBytes: 0,
  childRssBytes: 0,
};

test("resume is bound to corpus, runtime, model, configuration and store", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-scale-run-"));
  await rm(root, { recursive: true });
  try {
    const run = await openScaleRun({ root, identity, initialResources: safe });
    const firstSegmentId = await run.startSegment(20_597);
    assert.match(firstSegmentId, /^[a-f0-9-]{36}$/);
    const ingestion = { elapsedMs: 1234, cpuMicros: 100, startRssBytes: 200, peakRssBytes: 300 };
    await run.markIngestionComplete(ingestion);
    await run.stopSegment("cancelled", 20_700, "operator cancellation");
    await assert.rejects(
      openScaleRun({ root, identity, initialResources: safe, resume: true }),
      /owned worker/,
    );
    await run.release();
    const resumed = await openScaleRun({ root, identity, initialResources: safe, resume: true });
    assert.deepEqual(await resumed.resumedIngestion(), ingestion);
    assert.equal(await resumed.resumedProgress(), 20_700);
    await resumed.startSegment(20_700);
    await resumed.stopSegment("completed", 100_000);
    await resumed.release();
    const receipt = JSON.parse(await readFile(join(root, "scale-run-receipt.json"), "utf8"));
    assert.deepEqual(
      receipt.segments.map((segment: { status: string }) => segment.status),
      ["cancelled", "completed"],
    );
    assert.equal(receipt.segments[0].id, firstSegmentId);
    await assert.rejects(
      openScaleRun({
        root,
        identity: { ...identity, runtime: { sha256: "d".repeat(64) } },
        initialResources: safe,
        resume: true,
      }),
      /identity mismatch/,
    );
    await assert.rejects(
      openScaleRun({ root: `${root}-other`, identity, initialResources: safe, resume: true }),
      /receipt is missing/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resource guard enforces initial capacity and monitored stop conditions", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-scale-guard-"));
  await rm(root, { recursive: true });
  try {
    await assert.rejects(
      openScaleRun({ root, identity, initialResources: { ...safe, diskFreeBytes: 7 * GiB } }),
      /at least 8 GiB free disk/,
    );
    const run = await openScaleRun({ root, identity, initialResources: safe });
    await run.startSegment(0, 0);
    assert.equal(run.guard(safe, 1, 1), undefined);
    assert.equal(run.guard(safe, 1, 3 * 60 * 60 * 1000), "three-hour execution cap reached");
    assert.equal(run.guard({ ...safe, diskFreeBytes: 3 * GiB }, 1, 1), "disk below 4 GiB");
    assert.equal(run.guard({ ...safe, memoryPressure: "red" }, 1, 2), "memory pressure is red");
    assert.equal(
      run.guard({ ...safe, childRssBytes: 4 * GiB + 1 }, 1, 3),
      "child RSS exceeds 4 GiB",
    );
    assert.equal(run.guard(safe, 1, 15 * 60 * 1000 + 1), "progress stalled for 15 minutes");
    assert.equal(run.guard({ ...safe, swapUsedBytes: 100 }, 2, 15 * 60 * 1000 + 2), undefined);
    assert.equal(run.guard({ ...safe, swapUsedBytes: 200 }, 3, 15 * 60 * 1000 + 3), undefined);
    assert.equal(
      run.guard({ ...safe, swapUsedBytes: 300 }, 4, 15 * 60 * 1000 + 4),
      "swap grew persistently",
    );
    await run.stopSegment("cancelled", 4, "resource guard test");
    await run.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an interrupted ingestion is explicitly non-resumable", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-scale-ingestion-"));
  await rm(root, { recursive: true });
  try {
    const run = await openScaleRun({ root, identity, initialResources: safe });
    await run.startSegment(0);
    await run.stopSegment("cancelled", 10, "interrupted ingestion");
    await run.release();
    await assert.rejects(
      openScaleRun({ root, identity, initialResources: safe, resume: true }),
      /ingestion was not completed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a malformed receipt is rejected before a resume lock is created", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-scale-malformed-"));
  try {
    await writeFile(join(root, "scale-run-receipt.json"), '{"format":1,"store":"wrong"}\n');
    await assert.rejects(
      openScaleRun({ root, identity, initialResources: safe, resume: true }),
      /receipt is invalid/,
    );
    await assert.rejects(readFile(join(root, "scale-run.lock")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unproven worker idleness records failure and retains the ownership lock", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-scale-uncertain-worker-"));
  await rm(root, { recursive: true });
  try {
    const run = await openScaleRun({ root, identity, initialResources: safe });
    await run.startSegment(10);
    await run.markIngestionComplete({
      elapsedMs: 1,
      cpuMicros: 1,
      startRssBytes: 1,
      peakRssBytes: 1,
    });
    const shutdown = createEvaluationShutdown({
      closeWorker: async () => {
        throw Error("close rejected");
      },
      forceCloseWorker: async () => {
        throw Error("forced exit unconfirmed");
      },
      stopSegment: (status, progress, reason) => run.stopSegment(status, progress, reason),
      releaseLock: () => run.release(),
    });
    await assert.rejects(
      shutdown.finish({ status: "completed", progress: 11 }),
      /worker idle is unproven.*lock retained/s,
    );
    const receipt = JSON.parse(await readFile(join(root, "scale-run-receipt.json"), "utf8"));
    assert.equal(receipt.segments.at(-1).status, "failed");
    assert.match(receipt.segments.at(-1).reason, /manual recovery required/);
    await assert.rejects(
      openScaleRun({ root, identity, initialResources: safe, resume: true }),
      /owned worker/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
