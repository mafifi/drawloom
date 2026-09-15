/** Opt-in local proof using an already audited build; NOT installation/release proof. */
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  KnownModelManifests,
  LlamaEmbeddingWorker,
  createKnowledgeEmbeddings,
  embeddingConfiguration,
} from "@drawloom/local-embeddings";
import { runKnowledgeEvaluation } from "./runner.ts";

if (process.env.DRAWLOOM_GGUF_EVALUATION !== "1")
  throw Error("Explicit DRAWLOOM_GGUF_EVALUATION=1 required");
const [rootArg, buildArg, sizeArg = "24"] = process.argv.slice(2);
if (!rootArg || !buildArg)
  throw Error("Usage: gguf-local.ts NEW_EVALUATION_ROOT AUDITED_BUILD_ROOT [24|10000|100000]");
const root = resolve(rootArg),
  build = resolve(buildArg),
  size = Number(sizeArg);
if (![24, 10_000, 100_000].includes(size)) throw Error("Unsupported proof size");
await mkdir(root); // Deliberately refuse an existing store: do not relabel cached indexing as fresh.
const model = "qwen3-embedding-0.6b-gguf";
const manifest = KnownModelManifests[model];
const hash = createHash("sha256");
for await (const chunk of createReadStream(join(build, manifest.artifacts[0]!.path)))
  hash.update(chunk);
if (hash.digest("hex") !== manifest.artifacts[0]!.sha256) throw Error("Model hash mismatch");
let pid: number | undefined,
  peakChildRssBytes = 0;
const metalLines: string[] = [];
const timer = setInterval(() => {
  if (!pid) return;
  try {
    peakChildRssBytes = Math.max(
      peakChildRssBytes,
      Number(
        execFileSync("/bin/ps", ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" }).trim(),
      ) * 1024,
    );
  } catch {
    /* exited child */
  }
}, 1000);
const worker = new LlamaEmbeddingWorker({
  root,
  model,
  ready: async () => ({ manifest, directory: build, runtimeDirectory: build }),
  spawn: (command, args, options) => {
    const child = spawn(command, [...args], {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...options.env, LLAMA_ARG_LOG_VERBOSITY: "4" },
    });
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
try {
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
      configuration: embeddingConfiguration(model),
      implementation: createKnowledgeEmbeddings({
        model,
        worker,
        authorizer: { authorize: async () => ({ decision: true }) },
      }),
    },
  });
  await writeFile(
    join(root, "report.json"),
    JSON.stringify(
      {
        ...report,
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
} finally {
  clearInterval(timer);
  await worker.close();
}
