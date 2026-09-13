import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createNodeAssetStore } from "@drawloom/node-host";
import { createBraintrustRunner } from "./braintrust.ts";
import { evaluationCaseSchema, type EvaluationCase } from "./contract.ts";
import { createPcmDeliveryScorer } from "./audio-delivery.ts";
import { pcmFixture, previewRequirements } from "./audio-fixtures.ts";
import { saveResultFile, loadResultFile } from "./result-files.ts";

const out = process.argv[2];
if (!out || resolve(out) !== out)
  throw Error("Absolute proof output directory required");
const store = createNodeAssetStore(resolve(out, "assets")),
  allowed = new Set<string>();
const originals = new Map<string, string>();
const cases: EvaluationCase[] = [];
for (const [id, amplitude, samples] of [
  ["ready-preview", 0.2, 16000],
  ["overdriven-preview", 1, 16000],
  ["short-preview", 0.2, 8000],
  ["silent-preview", 0, 16000],
] as const) {
  const bytes = pcmFixture(amplitude, samples),
    assetKey = createHash("sha256").update(bytes).digest("hex");
  await store.write(assetKey, bytes);
  allowed.add(assetKey);
  originals.set(assetKey, assetKey);
  cases.push(
    evaluationCaseSchema.parse({
      id,
      revision: "1",
      input: { purpose: "podcast audio preview" },
      expected: previewRequirements,
      suppliedOutput: { assetKey },
      evidence: [{ assetKey, mediaType: "audio/wav", size: bytes.length }],
    }),
  );
}
let opens = 0,
  closes = 0,
  bytesDelivered = 0;
const scorer = createPcmDeliveryScorer(async (key) => {
  if (!allowed.has(key)) throw Error("Reference not permitted");
  opens++;
  const reader = await store.open(key);
  return {
    size: reader.size,
    async close() {
      closes++;
      await reader.close();
    },
    stream(options) {
      return {
        async *[Symbol.asyncIterator]() {
          for await (const chunk of reader.stream(options)) {
            bytesDelivered += chunk.length;
            yield chunk;
          }
        },
      };
    },
  };
});
const runner = createBraintrustRunner(),
  start = performance.now(),
  cpu = process.cpuUsage();
const results = await runner.run({
  experimentId: "public-podcast-preview-v1",
  mode: "assess-existing",
  cases,
  scorers: [scorer],
  repetitions: 1,
  concurrency: 2,
});
const elapsedMs = performance.now() - start;
const assessmentCpu = process.cpuUsage(cpu);
const revoked = cases[0]!;
allowed.delete(revoked.evidence[0]!.assetKey);
const revokedResult = await runner.run({
  experimentId: "public-revoked-reference-v1",
  mode: "assess-existing",
  cases: [revoked],
  scorers: [scorer],
  repetitions: 1,
  concurrency: 1,
});
const path = resolve(out, "results.json");
await saveResultFile(path, {
  schemaVersion: 1,
  results: [...results.results, ...revokedResult.results],
  feedback: [
    {
      resultId: results.results[0]!.id,
      attribution: "synthetic-fixture-author",
      rating: "correct",
    },
  ],
});
const reloaded = await loadResultFile(path);
let unchanged = true;
for (const [key, hash] of originals)
  unchanged &&=
    createHash("sha256")
      .update(await store.read(key))
      .digest("hex") === hash;
const checks = {
  zeroTargetCalls:
    results.metrics.targetCalls + revokedResult.metrics.targetCalls === 0,
  expectedScores:
    results.results.map((r) => r.findings[0]?.score).join(",") === "1,0,0,0",
  revokedReadDenied:
    revokedResult.results[0]?.findings[0]?.error ===
      "Reference not permitted" && opens === 4,
  closedAllReaders: opens === closes,
  sourceBytesUnchanged: unchanged,
  reloadedFeedback: reloaded.feedback[0]?.resultId === results.results[0]?.id,
};
const report = {
  schemaVersion: 1,
  scenario: "independently generated public PCM podcast previews",
  checks,
  elapsedMs,
  cpu: assessmentCpu,
  peakRssBytes: process.resourceUsage().maxRSS * 1024,
  bytesDeliveredToScorer: bytesDelivered,
  opens,
  closes,
  metrics: results.metrics,
  results: reloaded,
  limits:
    "Canonical mono PCM16 fixtures only, at most 1 MiB; not general WAV support or voice/intelligibility scoring. Asset access is caller-permitted; media preparation occurs before assessment. Bytes delivered are logical reader output, not physical disk I/O.",
};
await writeFile(
  resolve(out, "report.json"),
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
if (Object.values(checks).some((v) => !v)) process.exitCode = 1;
