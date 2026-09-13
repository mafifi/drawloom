import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeAssetStore } from "@drawloom/node-host";
import { z } from "zod";
import { ExecutionFailure, type EvaluationRunner, type Scorer } from "./contract.ts";
import { createSyntheticTarget, createTinyWav, scriptedJudge, syntheticCases } from "./fixtures.ts";
import { autoevalsExactScorer } from "./common.ts";
import { loadResultFile, saveResultFile } from "./result-files.ts";

export type ConformanceCheck = { name: string; passed: boolean; detail?: string };
export type ConformanceReport = { adapter: EvaluationRunner["adapter"]; checks: ConformanceCheck[]; failures: string[] };

export async function runSharedConformance(runner: EvaluationRunner): Promise<ConformanceReport> {
  const checks: ConformanceCheck[] = [];
  const check = (name: string, passed: boolean, detail?: string) => checks.push({ name, passed, ...(detail ? { detail } : {}) });
  let observedTargetInput: Readonly<Record<string, unknown>> | undefined;
  const target = createSyntheticTarget((input) => { observedTargetInput = input; });
  const casesBefore = JSON.stringify(syntheticCases);
  const assess = await runner.run({ experimentId: `${runner.adapter}-assess`, mode: "assess-existing", cases: syntheticCases, scorers: [autoevalsExactScorer, scriptedJudge], repetitions: 1, concurrency: 2 });
  check("assessment makes zero target calls", assess.metrics.targetCalls === 0);
  check("assessment returns every case", assess.results.length === syntheticCases.length);
  check("known regression remains per-case", assess.results.find((item) => item.caseId === "uppercase-regression")?.findings.find((item) => item.scorerId === "autoevals-exact")?.score === 0);
  check("quality failure remains a score", assess.results.find((item) => item.caseId === "uppercase-regression")?.status === "scored");
  check("usage cost remains unknown", assess.results.every((item) => item.usage.costUsd === undefined));
  check("existing artifact remains unchanged", JSON.stringify(syntheticCases) === casesBefore);

  const experiment = await runner.run({ experimentId: `${runner.adapter}-experiment`, mode: "experiment", cases: syntheticCases.slice(0, 1), target, scorers: [autoevalsExactScorer], repetitions: 2, concurrency: 2 });
  check("experiment repeats through vendor runner", experiment.results.length === 2 && experiment.metrics.targetCalls === 2);
  check("repeat identities are distinct", new Set(experiment.results.map((item) => item.id)).size === 2);
  check("case target scorer revisions retained", experiment.results.every((item) => item.caseRevision === "1" && item.targetRevision === "1" && item.findings[0]?.scorerRevision === autoevalsExactScorer.revision));
  check("expected is absent at target", observedTargetInput !== undefined && !("expected" in observedTargetInput));
  const sentinelCase = [{ ...syntheticCases[0]!, id: "sentinel", expected: "EXPECTED-MUST-NOT-REACH-TARGET" }];
  let serializedTargetInput = "";
  await runner.run({ experimentId: `${runner.adapter}-sentinel`, mode: "experiment", cases: sentinelCase, target: createSyntheticTarget((input) => { serializedTargetInput = JSON.stringify(input); }), scorers: [scriptedJudge], repetitions: 1, concurrency: 1 });
  check("expected sentinel bytes never reach target", !serializedTargetInput.includes("EXPECTED-MUST-NOT-REACH-TARGET"));

  let sequence = 0;
  const reverseTarget = {
    id: "reverse-completion", revision: "1", inputSchema: z.object({ text: z.string() }), outputSchema: z.number(),
    async run() { const value = ++sequence; await new Promise((resolve) => setTimeout(resolve, value === 1 ? 15 : 1)); return value; },
  };
  const outputScorer: Scorer = { id: "output-identity", revision: "1", async score({ output }) { return { explanation: `observed:${output}` }; } };
  const reversed = await runner.run({ experimentId: `${runner.adapter}-reverse`, mode: "experiment", cases: syntheticCases.slice(0, 1), target: reverseTarget, scorers: [outputScorer], repetitions: 2, concurrency: 2 });
  check("reverse-completion trials retain their own outputs", reversed.results.every((result) => result.findings[0]?.explanation === `observed:${result.output}`));
  const timedTarget = { ...createSyntheticTarget(), async run(input: Readonly<Record<string, unknown>>) { await new Promise(resolve => setTimeout(resolve, input.text === "fast" ? 5 : 50)); return input.text; } };
  const timed = await runner.run({ experimentId: `${runner.adapter}-per-case-time`, mode: "experiment", cases: ["fast", "slow"].map(id => ({ ...syntheticCases[0]!, id, input: { text: id } })), target: timedTarget, scorers: [scriptedJudge], repetitions: 1, concurrency: 1 });
  check("per-case duration excludes later queued work", timed.results[0]!.durationMs < timed.results[1]!.durationMs);
  const progressEvents: Array<{ type: "case-started" | "case-finished"; caseId: string; trial: number }> = [];
  let releaseProgress!: () => void;
  const progressGate = new Promise<void>((resolve) => { releaseProgress = resolve; });
  const progressTarget = { id: "progress-target", revision: "1", inputSchema: z.object({ text: z.string() }), outputSchema: z.string(), async run() { await progressGate; return "DRAWLOOM"; } };
  const progressing = runner.run({ experimentId: `${runner.adapter}-progress`, mode: "experiment", cases: syntheticCases.slice(0, 1), target: progressTarget, scorers: [autoevalsExactScorer], repetitions: 1, concurrency: 1, onProgress: (event) => progressEvents.push(event) });
  await new Promise((resolve) => setTimeout(resolve, 2));
  const startedWhileRunning = progressEvents.some((event) => event.type === "case-started") && !progressEvents.some((event) => event.type === "case-finished");
  releaseProgress();
  await progressing;
  check("bounded progress reports start while running then finish", startedWhileRunning && progressEvents.map((event) => event.type).join(",") === "case-started,case-finished");

  const failingScorer: Scorer = { id: "throws", revision: "1", async score() { throw new Error("synthetic scorer failure"); } };
  const reportedFailure: Scorer = { id: "reported-failure", revision: "1", async score() { return { error: "explicit synthetic scorer failure" }; } };
  const siblings = await runner.run({ experimentId: `${runner.adapter}-siblings`, mode: "assess-existing", cases: syntheticCases.slice(0, 1), scorers: [autoevalsExactScorer, failingScorer, reportedFailure], repetitions: 1, concurrency: 1 });
  check("successful finding survives sibling failure", siblings.results[0]?.findings.some((item) => item.scorerId === "autoevals-exact" && item.score === 1) === true);
  check("scorer failure is not a zero score", siblings.results[0]?.findings.some((item) => item.scorerId === "throws" && item.error && item.score === undefined) === true);
  check("explicit scorer failure is preserved", siblings.results[0]?.findings.some((item) => item.scorerId === "reported-failure" && item.error && item.score === undefined) === true);

  const malformedScorer = { id: "malformed", revision: "1", async score() { return { score: 2 }; } } as Scorer;
  const malformedFinding = await runner.run({ experimentId: `${runner.adapter}-bad-scorer`, mode: "assess-existing", cases: syntheticCases.slice(0, 1), scorers: [malformedScorer], repetitions: 1, concurrency: 1 });
  check("malformed scorer output becomes an error finding", malformedFinding.results[0]?.findings[0]?.error === "Invalid scorer output" && malformedFinding.results[0]?.findings[0]?.score === undefined);

  const directory = await mkdtemp(join(tmpdir(), "drawloom-wav-"));
  const store = createNodeAssetStore(directory);
  const wav = createTinyWav();
  const key = createHash("sha256").update(wav).digest("hex");
  await store.write(key, wav);
  const reloaded = await store.read(key);
  check("authorized asset roundtrip preserves generated WAV", Buffer.from(reloaded).equals(Buffer.from(wav)) && Buffer.from(reloaded.subarray(0, 12)).toString("ascii") === "RIFF4\u0000\u0000\u0000WAVE");
  check("result projection contains no media bytes", !JSON.stringify(assess).includes(Buffer.from(wav).toString("base64")));
  const permitted = new Set([key]);
  const wavScorer: Scorer = { id: "wav-header-duration", revision: "1", async score({ evidence }) {
    const reference = evidence[0];
    if (!reference || !permitted.has(reference.assetKey)) return { error: "Asset reference not permitted" };
    const bytes = await store.read(reference.assetKey);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const header = Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WAVE";
    const duration = view.getUint32(40, true) / view.getUint32(28, true);
    return { score: header && duration > 0 && duration < 1 ? 1 : 0, explanation: `PCM duration ${duration}s` };
  } };
  const mediaCase = [{ ...syntheticCases[0]!, id: "generated-wav", evidence: [{ assetKey: key, mediaType: "audio/wav", size: wav.byteLength }] }];
  const media = await runner.run({ experimentId: `${runner.adapter}-media`, mode: "assess-existing", cases: mediaCase, scorers: [wavScorer], repetitions: 1, concurrency: 1 });
  check("composed media scorer reads only permitted generated WAV", media.results[0]?.findings[0]?.score === 1 && Buffer.from(await store.read(key)).equals(Buffer.from(wav)));
  const deniedMedia = await runner.run({ experimentId: `${runner.adapter}-media-denied`, mode: "assess-existing", cases: [{ ...mediaCase[0]!, id: "unpermitted-wav", evidence: [{ assetKey: "0".repeat(64), mediaType: "audio/wav", size: wav.byteLength }] }], scorers: [wavScorer], repetitions: 1, concurrency: 1 });
  check("unpermitted media reference is denied without reading", deniedMedia.results[0]?.findings[0]?.error === "Asset reference not permitted");

  const baselineCases = syntheticCases.map((item) => ({ ...item, suppliedOutput: item.expected }));
  const baseline = await runner.run({ experimentId: `${runner.adapter}-baseline`, mode: "assess-existing", cases: baselineCases, scorers: [autoevalsExactScorer], repetitions: 1, concurrency: 1 });
  const persistedPath = join(directory, "comparison.json");
  const feedback = [{ resultId: assess.results[0]!.id, attribution: "synthetic-reviewer", rating: "correct" as const }];
  await saveResultFile(persistedPath, { schemaVersion: 1, results: [...baseline.results, ...assess.results], feedback });
  const persisted = await loadResultFile(persistedPath);
  check("real baseline/current results and exact feedback reload", persisted.results.length === baseline.results.length + assess.results.length && persisted.feedback[0]?.resultId === assess.results[0]!.id);
  const scoreBy = (experimentId: string, caseId: string) => persisted.results.find((result) => result.experimentId === experimentId && result.caseId === caseId)?.findings.find((finding) => finding.scorerId === autoevalsExactScorer.id)?.score;
  const goodDelta = scoreBy(`${runner.adapter}-assess`, "uppercase-good")! - scoreBy(`${runner.adapter}-baseline`, "uppercase-good")!;
  const badDelta = scoreBy(`${runner.adapter}-assess`, "uppercase-regression")! - scoreBy(`${runner.adapter}-baseline`, "uppercase-regression")!;
  check("reloaded matched comparison identifies only affected regression", goodDelta === 0 && badDelta === -1);

  try {
    await runner.run({ experimentId: "invalid", mode: "experiment", cases: syntheticCases.slice(0, 1), target, scorers: [autoevalsExactScorer], repetitions: 0, concurrency: 1 });
    check("invalid bounds rejected", false);
  } catch { check("invalid bounds rejected", true); }
  try {
    await runner.run({ experimentId: "duplicate-cases", mode: "assess-existing", cases: [syntheticCases[0]!, { ...syntheticCases[0]!, revision: "2" }], scorers: [scriptedJudge], repetitions: 1, concurrency: 1 });
    check("duplicate case identities rejected", false);
  } catch { check("duplicate case identities rejected", true); }
  try {
    await runner.run({ experimentId: "duplicate-scorers", mode: "assess-existing", cases: syntheticCases.slice(0, 1), scorers: [scriptedJudge, { ...scriptedJudge, revision: "2" }], repetitions: 1, concurrency: 1 });
    check("duplicate scorer identities rejected", false);
  } catch { check("duplicate scorer identities rejected", true); }
  try {
    await runner.run({ experimentId: "bad-boundary", mode: "unexpected" as "experiment", cases: syntheticCases.slice(0, 1), target, scorers: [], repetitions: 1, concurrency: 1 });
    check("invalid mode and empty scorers rejected before callbacks", false);
  } catch { check("invalid mode and empty scorers rejected before callbacks", true); }

  const controller = new AbortController();
  let starts = 0;
  const cancellationCases = [0, 1, 2, 3].map((index) => ({ ...syntheticCases[0]!, id: `cancel-${index}` }));
  const cancellingTarget = {
    id: "cancelling-target", revision: "1",
    inputSchema: z.object({ text: z.string() }), outputSchema: z.string(),
    async run(input: Readonly<Record<string, unknown>>, signal: AbortSignal) {
      starts += 1;
      if (starts === 2) controller.abort();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 10);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(new ExecutionFailure("cancelled", "Cancelled in flight")); }, { once: true });
      });
      return input.text;
    },
  };
  const cancelled = await runner.run({ experimentId: `${runner.adapter}-cancel`, mode: "experiment", cases: cancellationCases, target: cancellingTarget, scorers: [autoevalsExactScorer], repetitions: 1, concurrency: 2, signal: controller.signal });
  check("native scheduling respects concurrency ceiling", cancelled.metrics.peakConcurrency <= 2);
  check("cancellation stops queued target starts", cancelled.metrics.targetCalls <= 2);
  check("cancelled work is not scored as zero", cancelled.results.filter((item) => item.status === "cancelled").every((item) => item.findings.length === 0));

  for (const status of ["denied", "timed-out", "uncertain"] as const) {
    let calls = 0;
    const typedFailureTarget = { id: `typed-${status}`, revision: "1", inputSchema: z.object({ text: z.string() }), outputSchema: z.string(), async run() { calls += 1; throw new ExecutionFailure(status, status); } };
    const failed = await runner.run({ experimentId: `${runner.adapter}-${status}`, mode: "experiment", cases: syntheticCases.slice(0, 1), target: typedFailureTarget, scorers: [autoevalsExactScorer], repetitions: 1, concurrency: 1 });
    check(`typed ${status} is distinct and not retried/scored`, failed.results[0]?.status === status && failed.results[0]?.findings.length === 0 && calls === 1);
  }
  const malformedTarget = { id: "malformed-output", revision: "1", inputSchema: z.object({ text: z.string() }), outputSchema: z.string(), async run() { return 42; } };
  const malformed = await runner.run({ experimentId: `${runner.adapter}-bad-output`, mode: "experiment", cases: syntheticCases.slice(0, 1), target: malformedTarget, scorers: [autoevalsExactScorer], repetitions: 1, concurrency: 1 });
  check("malformed target output is distinct and unscored", malformed.results[0]?.status === "invalid-output" && malformed.results[0]?.findings.length === 0);
  const malformedInputTarget = { id: "malformed-input", revision: "1", inputSchema: z.object({ required: z.string() }), outputSchema: z.string(), async run() { return "unreachable"; } };
  const malformedInput = await runner.run({ experimentId: `${runner.adapter}-bad-input`, mode: "experiment", cases: syntheticCases.slice(0, 1), target: malformedInputTarget, scorers: [autoevalsExactScorer], repetitions: 1, concurrency: 1 });
  check("malformed target input prevents callback", malformedInput.results[0]?.status === "invalid-input" && malformedInput.metrics.targetCalls === 0 && malformedInput.results[0]?.findings.length === 0);

  const ignoringController = new AbortController();
  let ignoredSettled = false;
  let delayedScorerStarts = 0;
  const delayedAfterAbortScorer: Scorer = { id: "delayed-after-target-abort", revision: "1", async score() { delayedScorerStarts++; await new Promise(resolve => setTimeout(resolve, 100)); return { score: 1 }; } };
  const ignoringTarget = { id: "ignores-abort", revision: "1", inputSchema: z.object({ text: z.string() }), outputSchema: z.string(), async run() { ignoringController.abort(); await new Promise((resolve) => setTimeout(resolve, 15)); ignoredSettled = true; return "settled-after-abort"; } };
  const ignored = await runner.run({ experimentId: `${runner.adapter}-ignore-abort`, mode: "experiment", cases: syntheticCases.slice(0, 1), target: ignoringTarget, scorers: [delayedAfterAbortScorer], repetitions: 1, concurrency: 1, signal: ignoringController.signal });
  const ignoredSnapshot = JSON.stringify(ignored);
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("abort-ignoring target completes but remains explicitly unscored", ignoredSettled && ignored.results[0]?.output === "settled-after-abort" && ignored.results[0]?.status === "unscored" && ignored.results[0]?.findings.length === 0 && JSON.stringify(ignored) === ignoredSnapshot);
  check("cancelled target continuation cannot start a delayed scorer", delayedScorerStarts === 0 && ignored.metrics.scorerCalls === 0);
  const scorerAbort = new AbortController();
  let scorerSettled = false;
  const ignoringScorer: Scorer = { id: "ignores-abort-scorer", revision: "1", async score() { scorerAbort.abort(); await new Promise((resolve) => setTimeout(resolve, 15)); scorerSettled = true; return { score: 1, explanation: "settled after abort" }; } };
  const scoredAfterAbort = await runner.run({ experimentId: `${runner.adapter}-scorer-ignore-abort`, mode: "experiment", cases: syntheticCases.slice(0, 1), target: createSyntheticTarget(), scorers: [ignoringScorer], repetitions: 1, concurrency: 1, signal: scorerAbort.signal });
  const scorerSnapshot = JSON.stringify(scoredAfterAbort);
  await new Promise((resolve) => setTimeout(resolve, 20));
  check("abort-ignoring scorer settles before final projection", scorerSettled && scoredAfterAbort.results[0]?.findings[0]?.score === 1 && JSON.stringify(scoredAfterAbort) === scorerSnapshot);
  return { adapter: runner.adapter, checks, failures: checks.filter((item) => !item.passed).map((item) => item.name) };
}
