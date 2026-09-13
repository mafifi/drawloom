import { writeFile, rename } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createSyntheticTarget, scriptedJudge, syntheticCases } from "./fixtures.ts";
import { autoevalsExactScorer } from "./common.ts";
import { coveredMilliseconds } from "./measurement.mjs";
import type { Scorer } from "./contract.ts";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
const adapterName = argument("--adapter");
if (adapterName !== "promptfoo" && adapterName !== "braintrust") throw new Error("--adapter must be promptfoo or braintrust");
const out = argument("--out");
if (!out.startsWith("/")) throw new Error("--out must be absolute");
const repetitions = Number(argument("--repetitions"));
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100) throw new Error("--repetitions must be 1..100");

process.env.PROMPTFOO_DISABLE_TELEMETRY = "1";
process.env.PROMPTFOO_DISABLE_REMOTE_GENERATION = "1";
process.env.BRAINTRUST_DISABLE_AUTO_INSTRUMENTATION = "1";

const coldStart = performance.now();
const { runSharedConformance } = await import("./conformance.ts");
const runner = adapterName === "promptfoo"
  ? (await import("./promptfoo.ts")).createPromptfooRunner()
  : (await import("./braintrust.ts")).createBraintrustRunner();
const coldInitializationMs = performance.now() - coldStart;
const conformance = await runSharedConformance(runner);
const cpuBefore = process.cpuUsage();
const durations: number[] = [];
const callbackDurations: number[] = [], overheadDurations: number[] = [], directDurations: number[] = [];
let fixtureWorkMs = 0;
let targetCalls = 0, scorerCalls = 0, peakConcurrency = 0, resultBytes = 0;
for (let repetition = 1; repetition <= repetitions; repetition += 1) {
  const fixtureStart = performance.now();
  const unwrappedTarget = createSyntheticTarget();
  const intervals: Array<[number, number]> = [];
  const time = async <T>(call: () => Promise<T>) => {
    const before = performance.now();
    try { return await call(); } finally { intervals.push([before, performance.now()]); }
  };
  const target = { ...unwrappedTarget, run: (...args: Parameters<typeof unwrappedTarget.run>) => time(() => unwrappedTarget.run(...args)) };
  const scorers: Scorer[] = [autoevalsExactScorer, scriptedJudge].map(scorer => ({ ...scorer, score: args => time(() => scorer.score(args)) }));
  const fixtureCases = syntheticCases.map((item) => ({ ...item, input: { ...item.input }, evidence: [...item.evidence] }));
  fixtureWorkMs += performance.now() - fixtureStart;
  const started = performance.now();
  const response = await runner.run({ experimentId: `${adapterName}-warm-${repetition}`, mode: "experiment", cases: fixtureCases, target, scorers, repetitions: 1, concurrency: 1 });
  const wall = performance.now() - started;
  const callbacks = coveredMilliseconds(intervals);
  durations.push(wall); callbackDurations.push(callbacks); overheadDurations.push(wall - callbacks);
  targetCalls += response.metrics.targetCalls; scorerCalls += response.metrics.scorerCalls; peakConcurrency = Math.max(peakConcurrency, response.metrics.peakConcurrency);
  resultBytes += Buffer.byteLength(JSON.stringify(response));
  // The exact same fixture callbacks without a vendor runner, measured separately.
  const directStart = performance.now();
  for (const item of fixtureCases) {
    const signal = new AbortController().signal;
    const output = await unwrappedTarget.run(unwrappedTarget.inputSchema.parse(item.input), signal);
    for (const scorer of [autoevalsExactScorer, scriptedJudge]) await scorer.score({ input: item.input, output, expected: item.expected, evidence: item.evidence, signal });
  }
  directDurations.push(performance.now() - directStart);
}
const percentile = (values: number[], fraction: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)] ?? 0;
const report = {
  schemaVersion: 1, adapter: adapterName, versions: { node: process.version, promptfoo: "0.123.0", braintrust: "3.32.0", autoevals: "0.3.0" },
  checks: conformance.checks, failures: conformance.failures, coldInitializationMs,
  warm: { repetitions, casesPerRun: syntheticCases.length, medianRunnerWallMs: percentile(durations, 0.5), p95RunnerWallMs: percentile(durations, 0.95), medianOverheadMs: percentile(overheadDurations, 0.5), p95OverheadMs: percentile(overheadDurations, 0.95), medianDirectFixtureMs: percentile(directDurations, 0.5), p95DirectFixtureMs: percentile(directDurations, 0.95), totalCallbackCoveredMs: callbackDurations.reduce((sum, value) => sum + value, 0), totalRunnerWallMs: durations.reduce((sum, value) => sum + value, 0), fixtureWorkMs },
  process: { cpu: process.cpuUsage(cpuBefore), peakRssBytes: process.resourceUsage().maxRSS * 1024 },
  calls: { targetCalls, scorerCalls, peakConcurrency }, resultBytes, usageCost: "unknown",
  method: "30 independent sequential runner.run calls, one trial per case, concurrency one. Overhead is runner wall time minus the union of actual target/scorer callback intervals (overlap counted once). A separate direct-call baseline runs identical fixture callbacks without a vendor runner. CPU covers warm runs and direct baselines; peak RSS covers the whole process including conformance. Call counts cover runner callbacks only; the direct baseline performs the same additional calls. Cold initialization excludes statically imported Autoevals; separate cold import probes include each library's import dependencies. No live model calls.",
};
const temporary = `${out}.tmp`;
await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, out);
if (conformance.failures.length) process.exitCode = 1;
