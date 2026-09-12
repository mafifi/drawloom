import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createSqliteKnowledge } from "@drawloom/sqlite-knowledge";
import { KnownModelManifests, MlxEmbeddingWorker, createKnowledgeEmbeddings, createModelSetup, embeddingConfiguration, type KnownModelId } from "@drawloom/local-embeddings";
import { createSemanticRetrieval } from "../../packages/knowledge/local-knowledge-runtime/src/semantic.ts";
import type { EmbeddingConfiguration, KnowledgeEmbeddings, KnowledgeAuthorizer, RecordRef, TrustedKnowledgeSubject } from "@drawloom/knowledge";
import { corpusAtSize, corpusVersion, documents, heldOutQuestions, type EvaluationDocument } from "./corpus.ts";
import { scoreRetrieval, scoreRetrievalByCategory, type RetrievalCategoryMetrics, type RetrievalMetrics, type RetrievalQuestionCategory } from "./metrics.ts";

export interface PhaseMeasurement {
  readonly elapsedMs: number;
  readonly cpuMicros: number;
  readonly startRssBytes: number;
  readonly peakRssBytes: number;
}

export interface SQLiteStoreBytes {
  readonly database: number;
  readonly wal: number;
  readonly shm: number;
  readonly total: number;
}

export interface RetrievalQuestionResult {
  readonly category: RetrievalQuestionCategory;
  /** Exact current/stale reference identities returned by retrieval, not answer text. */
  readonly retrieved: readonly string[];
}

export interface RetrievalRun {
  readonly queries: number;
  readonly metrics: RetrievalMetrics;
  readonly categoryMetrics: RetrievalCategoryMetrics;
  readonly questions: Readonly<Record<string, RetrievalQuestionResult>>;
  readonly measurement: PhaseMeasurement;
  readonly latency: Latency;
  /** Database and SQLite sidecar files at the end of this retrieval phase. */
  readonly storeBytes: SQLiteStoreBytes;
}
type Latency = { readonly coldMs: number; readonly warm30MedianMs: number; readonly warm30P95Ms: number; readonly cpuMicros: number; readonly startRssBytes: number; readonly peakRssBytes: number; readonly storeBytes: number; };
type HybridRun =
  | { readonly kind: "not_run"; readonly reason: "no_model_requested" }
  | { readonly kind: "blocked"; readonly reason: "model_not_ready" }
  | ({ readonly kind: "real_vectors"; readonly model: string; readonly indexing: PhaseMeasurement; } & RetrievalRun);

/** Evaluation composition only. Caller owns setup/cleanup; no provider code is loaded by path. */
export interface EvaluationEmbedding {
  readonly label: string;
  readonly configuration: EmbeddingConfiguration;
  readonly implementation: KnowledgeEmbeddings;
}

export interface KnowledgeEvaluationOptions {
  /** A disposable directory for the SQLite store. The runner never downloads weights. */
  readonly root: string;
  readonly size?: number;
  readonly model?: KnownModelId;
  /** Existing verified local-embedding root; defaults to <root>/models. */
  readonly modelRoot?: string;
  readonly embedding?: EvaluationEmbedding;
}

export interface KnowledgeEvaluationReport {
  readonly kind: "deterministic_smoke" | "real_vector_evaluation";
  readonly corpus: { readonly version: string; readonly sha256: string; readonly records: number; };
  /** Ingest performance is separate from retrieval and semantic-indexing phases. */
  readonly ingestion: PhaseMeasurement;
  readonly lexical: RetrievalRun;
  readonly hybrid: HybridRun;
  /** No answering-model contract exists yet; expected answers are never sent to retrieval. */
  readonly answerEvaluation: "not_configured";
}

const subject = Object.freeze({ type: "evaluation", id: "local-owner", properties: { scope: "local-knowledge-evaluation" } }) as unknown as TrustedKnowledgeSubject;
const authorizer: KnowledgeAuthorizer = { authorize: async () => ({ decision: true }) };
const resolveResource = ({ ref }: { readonly ref?: RecordRef }) => ({ type: ref ? "knowledge-record" : "knowledge-store", id: ref ? refKey(ref) : "evaluation", properties: { locality: "local" } });
async function authorizeSearch(ref?: RecordRef): Promise<boolean> {
  try {
    const result = await authorizer.authorize({ subject, action: { name: "knowledge.search" }, resource: resolveResource({ ...(ref ? { ref } : {}) }) });
    return "decision" in result && result.decision === true;
  } catch { return false; }
}

export async function runKnowledgeEvaluation(options: KnowledgeEvaluationOptions): Promise<KnowledgeEvaluationReport> {
  const size = options.size ?? documents.length;
  if (!Number.isSafeInteger(size) || size < documents.length || size > 100_000) throw new Error("size must be between the held-out corpus size and 100000");
  const root = resolve(options.root);
  const databasePath = join(root, "knowledge.sqlite");
  const provider = createSqliteKnowledge({ databasePath, authorizer, resolveResource });
  try {
    const ingestion = await ingest(provider, corpusAtSize(size), size);
    const lexical = await measureLexical(provider, databasePath);
    const hybrid = options.embedding ? await measureEmbedding(provider, size, options.embedding, databasePath)
      : options.model ? await measureHybrid(provider, size, options.model, options.modelRoot ?? join(root, "models"), databasePath) : { kind: "not_run" as const, reason: "no_model_requested" as const };
    return {
      kind: hybrid.kind === "real_vectors" ? "real_vector_evaluation" : "deterministic_smoke",
      corpus: { version: corpusVersion, sha256: await corpusHash(), records: size }, ingestion, lexical, hybrid, answerEvaluation: "not_configured",
    };
  } finally { provider.close(); }
}

async function ingest(provider: ReturnType<typeof createSqliteKnowledge>, records: Iterable<EvaluationDocument>, total: number): Promise<PhaseMeasurement> {
  const measurement = beginPhaseMeasurement();
  const revisions = new Map<string, string>();
  let completed = 0;
  for (const document of records) {
    const ref = recordRef(document);
    const key = `${ref.type}\0${ref.origin}\0${ref.id}`;
    const result = await provider.intake.ingest(subject, {
      operation: "upsert", expectedRevision: revisions.get(key) ?? null,
      record: { ref, body: document.text, status: "active", confidence: { value: "evaluation-fixture" }, provenance: { producer: { type: "evaluation", id: corpusVersion }, inputs: [] } },
      links: document.evidence.map((evidence) => ({ from: ref, to: parseRef(evidence), relation: "support" as const })),
    });
    if (result.kind !== "accepted" && result.kind !== "duplicate") throw new Error(`ingest failed for ${document.id}@${document.revision}: ${result.kind}`);
    revisions.set(key, document.revision);
    measurement.sample();
    reportProgress("ingestion", ++completed, total);
  }
  return measurement.finish();
}

async function measureLexical(provider: ReturnType<typeof createSqliteKnowledge>, databasePath: string): Promise<RetrievalRun> {
  return measure(async (query) => {
    const result = await provider.retrieval.search(subject, { query, mode: "lexical", limit: 10, maxBytes: 256 * 1024 });
    if (result.kind !== "ok") throw new Error(`lexical retrieval failed: ${result.kind}`);
    return result.items.map((item) => refKey(item.record.ref));
  }, databasePath, "lexical retrieval");
}

async function measureHybrid(provider: ReturnType<typeof createSqliteKnowledge>, recordCount: number, model: KnownModelId, modelRoot: string, databasePath: string): Promise<HybridRun> {
  const setup = createModelSetup({ root: modelRoot, manifest: KnownModelManifests[model] });
  if (!await setup.ready()) return { kind: "blocked", reason: "model_not_ready" };
  const worker = new MlxEmbeddingWorker({ root: modelRoot, model });
  try {
    return await measureEmbedding(provider, recordCount, {
      label: model, configuration: embeddingConfiguration(model),
      implementation: createKnowledgeEmbeddings({ model, authorizer, worker }),
    }, databasePath);
  } finally { await worker.close(); }
}

async function measureEmbedding(provider: ReturnType<typeof createSqliteKnowledge>, recordCount: number, embedding: EvaluationEmbedding, databasePath: string): Promise<HybridRun> {
    const embeddings = embedding.implementation;
    const configuration = embedding.configuration;
    const semantic = createSemanticRetrieval({
      subject, retrieval: provider.retrieval, work: provider.indexWork, index: provider.embeddingIndex, embeddings, configuration,
      authorizeSearch,
      revision: async () => {
        const status = await provider.maintenance.status(subject);
        if (status.kind !== "ok") throw new Error("knowledge revision unavailable");
        return status.checkpoint;
      },
    });
    try {
      const indexing = beginPhaseMeasurement();
      for (let step = 0; step < recordCount; step++) {
        await semantic.indexNext(); indexing.sample(); reportProgress("semantic indexing", step + 1, recordCount);
        if (semantic.state === "ready") { reportReady("semantic indexing", step + 1); break; }
        if (semantic.state === "failed") throw new Error("semantic indexing failed");
      }
      if (semantic.state !== "ready") throw new Error(`semantic indexing did not finish within ${recordCount} bounded steps`);
      const indexed = indexing.finish();
      const measured = await measure(async (query) => {
        const result = await semantic.search({ query, mode: "best_available", limit: 10, maxBytes: 256 * 1024 });
        if (result.kind !== "ok") throw new Error(`hybrid retrieval failed: ${result.kind}`);
        return result.items.map((item) => refKey(item.record.ref));
      }, databasePath, "hybrid retrieval");
      return { kind: "real_vectors", model: embedding.label, indexing: indexed, ...measured };
    } finally { semantic.close(); }
}

async function measure(retrieve: (query: string) => Promise<readonly string[]>, databasePath: string, phase: string): Promise<RetrievalRun> {
  const measurement = beginPhaseMeasurement();
  const retrieved: Record<string, readonly string[]> = {};
  let coldMs = 0;
  for (const [index, question] of heldOutQuestions.entries()) {
    const started = performance.now(); retrieved[question.id] = await retrieve(question.query); measurement.sample(); reportProgress(phase, index + 1, heldOutQuestions.length);
    if (index === 0) coldMs = performance.now() - started;
  }
  const warm: number[] = [];
  for (let index = 0; index < 30; index++) { const started = performance.now(); await retrieve(heldOutQuestions[index % heldOutQuestions.length]!.query); measurement.sample(); reportProgress(`${phase} warm queries`, index + 1, 30); warm.push(performance.now() - started); }
  const phaseMeasurement = measurement.finish();
  const bytes = await storeBytes(databasePath);
  return {
    queries: heldOutQuestions.length,
    metrics: scoreRetrieval({ questions: heldOutQuestions, retrieved }),
    categoryMetrics: scoreRetrievalByCategory({ questions: heldOutQuestions, retrieved }),
    questions: Object.fromEntries(heldOutQuestions.map((question) => [question.id, { category: question.kind, retrieved: retrieved[question.id] ?? [] }])),
    measurement: phaseMeasurement,
    latency: {
      coldMs, warm30MedianMs: median(warm), warm30P95Ms: percentile(warm, 0.95), cpuMicros: phaseMeasurement.cpuMicros, startRssBytes: phaseMeasurement.startRssBytes, peakRssBytes: phaseMeasurement.peakRssBytes, storeBytes: bytes.total,
    },
    storeBytes: bytes,
  };
}

type SourceRef = { readonly type: "source"; readonly origin: string; readonly id: string; readonly revision: string; };
function recordRef(document: EvaluationDocument): SourceRef { return { type: "source", origin: "evaluation-public", id: document.id, revision: document.revision }; }
function parseRef(value: string): SourceRef { const [id, revision] = value.split("@"); if (!id || !revision) throw new Error(`invalid corpus reference ${value}`); return { type: "source", origin: "evaluation-public", id, revision }; }
function refKey(ref: RecordRef): string { return `${ref.id}@${ref.revision}`; }
function median(values: readonly number[]): number { const sorted = [...values].sort((left, right) => left - right); return sorted[Math.floor(sorted.length / 2)] ?? 0; }
function percentile(values: readonly number[], quantile: number): number { const sorted = [...values].sort((left, right) => left - right); return sorted[Math.max(0, Math.ceil(sorted.length * quantile) - 1)] ?? 0; }
interface PhaseSampler { sample(): void; finish(): PhaseMeasurement; }
function beginPhaseMeasurement(): PhaseSampler {
  const startRssBytes = process.memoryUsage().rss;
  const cpu = process.cpuUsage();
  const started = performance.now();
  let peakRssBytes = startRssBytes;
  return {
    sample() { peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss); },
    finish() {
      const used = process.cpuUsage(cpu);
      return { elapsedMs: performance.now() - started, cpuMicros: used.user + used.system, startRssBytes, peakRssBytes: Math.max(peakRssBytes, process.memoryUsage().rss) };
    },
  };
}
function reportProgress(phase: string, completed: number, total: number): void {
  if (completed === total || completed % 1_000 === 0) process.stderr.write(`[knowledge-evaluation] ${phase}: ${completed}/${total}\n`);
}
function reportReady(phase: string, workUnits: number): void {
  process.stderr.write(`[knowledge-evaluation] ${phase}: ready after ${workUnits} bounded work units\n`);
}
async function storeBytes(path: string): Promise<SQLiteStoreBytes> {
  const size = async (file: string) => { try { return Number((await stat(file)).size); } catch { return 0; } };
  const [database, wal, shm] = await Promise.all([size(path), size(`${path}-wal`), size(`${path}-shm`)]);
  return { database, wal, shm, total: database + wal + shm };
}
async function corpusHash(): Promise<string> { return createHash("sha256").update(await readFile(new URL("./corpus.ts", import.meta.url))).digest("hex"); }

export function parseCliOptions(arguments_: readonly string[]): KnowledgeEvaluationOptions {
  const value = (name: string) => { const index = arguments_.indexOf(name); return index < 0 ? undefined : arguments_[index + 1]; };
  const root = value("--root"); if (!root) throw new Error("--root is required");
  const scale = arguments_.includes("--scale"); const stress = arguments_.includes("--stress");
  if (scale && stress) throw new Error("--scale and --stress cannot be combined");
  const model = value("--model");
  if (model !== undefined && !(model in KnownModelManifests)) throw new Error("--model must name a known local embedding model");
  return { root, size: stress ? 100_000 : scale ? 10_000 : value("--size") === undefined ? undefined : Number(value("--size")), ...(model ? { model: model as KnownModelId } : {}), ...(value("--models-root") ? { modelRoot: value("--models-root") } : {}) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.stdout.write(`${JSON.stringify(await runKnowledgeEvaluation(parseCliOptions(process.argv.slice(2))), null, 2)}\n`);
}
