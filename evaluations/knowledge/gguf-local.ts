/** Opt-in local proof using an already audited build; NOT installation/release proof. */
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  LlamaEmbeddingWorker,
  createKnowledgeEmbeddings,
  embeddingConfiguration,
} from "@drawloom/local-embeddings";
import { evaluationCorpusIdentity, runKnowledgeEvaluation } from "./runner.ts";
import { openScaleRun, readScaleRunResources } from "./scale-run.ts";
import { verifyEvaluationCandidate } from "./candidate-runtime.ts";
import { createEvaluationShutdown, forceEvaluationChildExit } from "./evaluation-shutdown.ts";

if (process.env.DRAWLOOM_GGUF_EVALUATION !== "1")
  throw Error("Explicit DRAWLOOM_GGUF_EVALUATION=1 required");
const [rootArg, buildArg, sizeArg = "24"] = process.argv.slice(2);
if (!rootArg || !buildArg)
  throw Error(
    "Usage: gguf-local.ts EVALUATION_ROOT AUDITED_BUILD_ROOT [24|10000|100000] [--resume]",
  );
const root = resolve(rootArg),
  build = resolve(buildArg),
  size = Number(sizeArg);
if (![24, 10_000, 100_000].includes(size)) throw Error("Unsupported proof size");
const resume = process.argv.includes("--resume");
if (resume && size !== 100_000)
  throw Error("Resume is supported only for the 100000-record stress proof");
const model = "qwen3-embedding-0.6b-gguf";
const expectedRuntimeSha256 = process.env.DRAWLOOM_GGUF_RUNTIME_SHA256;
if (!expectedRuntimeSha256 || !/^[a-f0-9]{64}$/.test(expectedRuntimeSha256))
  throw Error("Explicit DRAWLOOM_GGUF_RUNTIME_SHA256 candidate identity required");
const candidate = await verifyEvaluationCandidate({
  build,
  expectedRuntimeSha256,
});
const { manifest, runtimeSha256: actualRuntimeSha256 } = candidate;
const configuration = embeddingConfiguration(model);
const scaleRun =
  size === 100_000
    ? await openScaleRun({
        root,
        identity: {
          corpus: await evaluationCorpusIdentity(size),
          runtime: { sha256: actualRuntimeSha256 },
          model: { sha256: manifest.artifacts[0]!.sha256 },
          configuration: { id: configuration.id, fingerprint: configuration.fingerprint },
        },
        initialResources: await readScaleRunResources(dirname(root)),
        resume,
      })
    : (await mkdir(root), undefined); // Smaller cases remain fresh, disposable evaluations.
let pid: number | undefined,
  peakChildRssBytes = 0,
  progress = 0,
  indexedOffset = 0,
  stopReason: string | undefined;
const metalLines: string[] = [];
let childProcess: ReturnType<typeof spawn> | undefined;
const worker = await (async () => {
  try {
    return new LlamaEmbeddingWorker({
      root,
      model,
      ready: async () => candidate,
      spawn: (command, args, options) => {
        const child = spawn(command, [...args], {
          ...options,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...options.env, LLAMA_ARG_LOG_VERBOSITY: "4" },
        });
        childProcess = child;
        pid = child.pid;
        child.stderr.on("data", (chunk: Buffer) => {
          if (process.env.DRAWLOOM_GGUF_DEBUG === "1") process.stderr.write(chunk);
          for (const line of chunk.toString().split("\n"))
            if (/buffer size|offloaded|Metal.*device/.test(line) && metalLines.length < 80)
              metalLines.push(line);
        });
        return child;
      },
    });
  } catch (error) {
    await scaleRun?.release();
    throw error;
  }
})();
let segmentStarted = false;
const shutdown = createEvaluationShutdown({
  closeWorker: () => worker.close(),
  forceCloseWorker: async () => {
    const child = childProcess;
    if (!child) return;
    await forceEvaluationChildExit({
      pid: child.pid,
      exited: () => child.exitCode !== null || child.signalCode !== null,
      kill: (signal) => child.kill(signal),
      waitForExit: (timeoutMs) =>
        new Promise((resolveExit) => {
          if (child.exitCode !== null || child.signalCode !== null) {
            resolveExit(true);
            return;
          }
          const exited = () => {
            clearTimeout(timeout);
            resolveExit(true);
          };
          const timeout = setTimeout(() => {
            child.off("exit", exited);
            resolveExit(false);
          }, timeoutMs);
          child.once("exit", exited);
        }),
    });
  },
  stopSegment: async (status, completed, reason) =>
    scaleRun?.stopSegment(status, completed, reason),
  releaseLock: async () => scaleRun?.release(),
  segmentStarted: () => segmentStarted,
});
let monitor = Promise.resolve();
const timer = setInterval(() => {
  monitor = monitor
    .then(async () => {
      if (!pid) return;
      try {
        peakChildRssBytes = Math.max(
          peakChildRssBytes,
          Number(
            execFileSync("/bin/ps", ["-o", "rss=", "-p", String(pid)], {
              encoding: "utf8",
            }).trim(),
          ) * 1024,
        );
      } catch {
        /* exited child */
      }
      if (scaleRun) {
        const reason = scaleRun.guard(await readScaleRunResources(root, pid), progress);
        if (reason) shutdown.requestStop(reason);
      }
    })
    .catch((error) =>
      shutdown.requestStop(
        `resource monitor failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
}, 1000);
const cancel = () => {
  shutdown.requestStop("operator cancellation");
};
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
let segmentId: string | undefined;
let outcome: "completed" | "cancelled" | "failed" = "completed";
let failure: unknown;
try {
  progress = resume ? await scaleRun!.resumedProgress() : 0;
  indexedOffset = resume ? Math.max(0, progress - size) : 0;
  segmentId = await scaleRun?.startSegment(progress);
  segmentStarted = Boolean(scaleRun);
  const startup = performance.now();
  await worker.embed({
    role: "document",
    items: ["Startup probe, separate from measured indexing."],
  });
  const startupAndFirstInferenceMs = performance.now() - startup;
  const report = await runKnowledgeEvaluation({
    root,
    size,
    embedding: {
      label: model,
      configuration,
      implementation: createKnowledgeEmbeddings({
        model,
        worker,
        authorizer: { authorize: async () => ({ decision: true }) },
      }),
    },
    ...(resume
      ? { resume: { ingestion: (await scaleRun!.resumedIngestion())! } }
      : {
          onIngestionComplete: async (measurement) => scaleRun?.markIngestionComplete(measurement),
        }),
    onProgress: (phase, completed) => {
      progress = phase === "semantic indexing" ? size + indexedOffset + completed : completed;
    },
  });
  await writeFile(
    join(root, "report.json"),
    JSON.stringify(
      {
        ...report,
        attempt: {
          resumed: resume,
          segmentId: segmentId ?? null,
          startedProgress: resume ? indexedOffset + size : 0,
          completedProgress: progress,
          startupMeasurement: "current_attempt",
          indexingMeasurement: "current_attempt",
          searchMeasurements: "current_attempt",
          ingestionMeasurement: resume ? "retained_prior_segment" : "current_attempt",
        },
        startupAndFirstInferenceMs,
        peakChildRssBytes,
        metalLines,
        limitation:
          "Audited local build injected; not installed artifact proof. Default embedding prefix cache may be active. No downstream answering-model evaluation.",
      },
      null,
      2,
    ),
  );
} catch (error) {
  failure = error;
  stopReason = shutdown.reason;
  outcome = stopReason ? "cancelled" : "failed";
} finally {
  clearInterval(timer);
  await monitor;
  stopReason = shutdown.reason;
  if (stopReason) outcome = "cancelled";
  try {
    await shutdown.finish({ status: outcome, progress, reason: stopReason });
    segmentStarted = false;
  } catch (shutdownError) {
    failure = failure
      ? new AggregateError([failure, shutdownError], "Evaluation and shutdown failed")
      : shutdownError;
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
if (failure) throw failure;
