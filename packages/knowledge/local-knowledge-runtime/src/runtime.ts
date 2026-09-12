import { join } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createSqliteKnowledge } from "@drawloom/sqlite-knowledge";
import { createCodexAssessment } from "@drawloom/codex-assessment";
import { createKnowledgeEmbeddings, createModelSetup, embeddingConfiguration, KnownModelManifests, MlxEmbeddingWorker, type EmbeddingWorker, type KnownModelId, type ModelSetup } from "@drawloom/local-embeddings";
import {
  type AssessmentReconcileRequest, type AssessmentRequest, type AuthZenRequest,
  type EvidenceRequest, type ExpandRequest, type IntakeInput, type KnowledgeExportRequest, type PublicationInput,
  type RecordRef, type SearchRequest, type TrustedKnowledgeSubject, type WorkBatchReleaseInput,
} from "@drawloom/knowledge";
import type { RpcTransport } from "@drawloom/host";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, LocalKnowledgeConfigurationSchema, LocalKnowledgeStatusSchema, type LocalKnowledgeConfiguration, type LocalKnowledgeStatus } from "./protocol.js";
import { createSemanticRetrieval } from "./semantic.js";

const subject = Object.freeze({ type: "user", id: "local-owner", properties: { locality: "device", scope: "global-knowledge" } }) as unknown as TrustedKnowledgeSubject;
const resource = (request: { action: string; ref?: { type: string; origin: string; id: string; revision: string } }) => ({
  type: request.ref ? "knowledge-record" : "knowledge-store",
  id: request.ref ? `${request.ref.type}:${request.ref.origin}:${request.ref.id}:${request.ref.revision}` : "local-global",
  properties: { locality: "device", scope: "global-knowledge", action: request.action },
});
const authorizer = { async authorize(request: AuthZenRequest) {
  const embedding = request.resource.type === "embedding-destination" && request.resource.properties.local === true;
  return { decision: request.subject.type === subject.type && request.subject.id === subject.id && (request.resource.properties.scope === "global-knowledge" || embedding) };
} };
const authorizeSearch = async (ref?: RecordRef): Promise<boolean> => {
  try {
    const result = await authorizer.authorize({ subject, action: { name: "knowledge.search" }, resource: resource({ action: "knowledge.search", ...(ref ? { ref } : {}) }) });
    return "decision" in result && result.decision === true;
  } catch { return false; }
};

export interface LocalKnowledgeRuntimeOptions {
  root: string;
  workingDirectory: string;
  connectCodex(): Promise<RpcTransport>;
  /** Provider-local deterministic seam for tests; production uses ModelSetup. */
  createEmbeddingSetup?: (root: string, model: KnownModelId) => Pick<ModelSetup, "ready" | "status" | "install" | "cancel">;
  /** Provider-local deterministic seam for tests; production uses the MLX worker. */
  createEmbeddingWorker?: (root: string, model: KnownModelId) => EmbeddingWorker & { close(): Promise<void> };
}

export async function createLocalKnowledgeRuntime(options: LocalKnowledgeRuntimeOptions) {
  const state = createNodeJsonStore(join(options.root, "state"));
  const configured = LocalKnowledgeConfigurationSchema.parse((await state.get("configuration")) ?? DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION);
  let configuration: LocalKnowledgeConfiguration = configured;
  const sqlite = createSqliteKnowledge({ databasePath: join(options.root, "knowledge.sqlite"), authorizer,
    resolveResource: ({ action, ref }) => resource({ action, ...(ref ? { ref } : {}) }) });
  const modelRoot = join(options.root, "models");
  const setups = new Map<KnownModelId, Pick<ModelSetup, "ready" | "status" | "install" | "cancel">>(
    (Object.keys(KnownModelManifests) as KnownModelId[]).map((id) => [id, options.createEmbeddingSetup?.(modelRoot, id) ?? createModelSetup({ root: modelRoot, manifest: KnownModelManifests[id] })]),
  );
  let assessment = assessmentFor(configuration);
  let closed = false;
  type Semantic = { model: KnownModelId; worker: EmbeddingWorker & { close(): Promise<void> }; retrieval: ReturnType<typeof createSemanticRetrieval> };
  let activeSemantic: Semantic | undefined;
  let candidateSemantic: Semantic | undefined;
  let indexing: Promise<void> | undefined;
  let preparing: Promise<void> | undefined;
  const installs = new Set<Promise<unknown>>();

  function assessmentFor(value: LocalKnowledgeConfiguration) {
    return createCodexAssessment({ model: value.assessmentModel, effort: "low", timeoutMs: value.assessmentTimeoutMs,
      workingDirectory: options.workingDirectory, store: state, connect: options.connectCodex, authorizer,
      resolveResource: async ({ action, ref, destination }) => ({ ...resource({ action, ...(ref ? { ref } : {}) }), properties: { locality: "device", scope: "global-knowledge", destination } }),
    });
  }
  const ensureOpen = () => { if (closed) throw Error("Knowledge runtime is closed"); };
  async function semanticFor(model: KnownModelId): Promise<Semantic | undefined> {
    if (!await setups.get(model)!.ready()) return undefined;
    const worker = options.createEmbeddingWorker?.(modelRoot, model) ?? new MlxEmbeddingWorker({ root: modelRoot, model });
    return { model, worker, retrieval: createSemanticRetrieval({ subject, retrieval: sqlite.retrieval, work: sqlite.indexWork,
      index: sqlite.embeddingIndex, embeddings: createKnowledgeEmbeddings({ model, authorizer, worker }), configuration: embeddingConfiguration(model),
      authorizeSearch,
      revision: async () => { const status = await sqlite.maintenance.status(subject); if (status.kind !== "ok") throw Error("Knowledge revision unavailable"); return status.checkpoint; },
    }) };
  }
  async function prepareSelectedSemantic() {
    const model = configuration.embeddingModel;
    if (activeSemantic?.model === model || candidateSemantic?.model === model) return;
    if (preparing) return preparing;
    preparing = (async () => {
      if (candidateSemantic) { candidateSemantic.retrieval.close(); await candidateSemantic.worker.close(); candidateSemantic = undefined; }
      const prepared = await semanticFor(model);
      if (closed && prepared) { prepared.retrieval.close(); await prepared.worker.close(); return; }
      candidateSemantic = prepared;
    })().finally(() => { preparing = undefined; });
    return preparing;
  }
  function pumpSemantic() {
    if (indexing || closed) return;
    indexing = (async () => {
      await prepareSelectedSemantic();
      const target = candidateSemantic ?? activeSemantic;
      if (!target) return;
      do {
        await target.retrieval.indexNext();
        if (closed || (candidateSemantic && candidateSemantic !== target)) return;
        if (target.retrieval.state === "pending") await new Promise<void>(resolve => setImmediate(resolve));
      } while (target.retrieval.state === "pending");
      if (candidateSemantic === target && target.retrieval.state === "ready") {
        const prior = activeSemantic; activeSemantic = target; candidateSemantic = undefined;
        if (prior) { prior.retrieval.close(); await prior.worker.close(); }
      }
    })().finally(() => { indexing = undefined; });
  }
  async function modelState(id: KnownModelId) {
    const setup = setups.get(id)!;
    if (await setup.ready()) return { state: "ready" as const };
    const status = setup.status();
    if (status.kind === "installing_runtime") return { state: "installing_runtime" as const, message: status.step === "python" ? "Installing isolated Python runtime" : status.step === "packages" ? "Installing hash-locked MLX packages" : "Verifying MLX and Metal support" };
    if (status.kind === "downloading") return { state: "downloading" as const, receivedBytes: status.received, expectedBytes: status.expected, message: `Downloading ${status.path}` };
    if (status.kind === "verifying") return { state: "verifying" as const, message: `Verifying ${status.path}` };
    if (status.kind === "failed") return { state: "failed" as const, message: status.code };
    if (status.kind === "cancelled") return { state: "cancelled" as const, message: "Installation cancelled. Existing knowledge and indexes were not changed." };
    return { state: "missing" as const };
  }
  async function status(): Promise<LocalKnowledgeStatus> {
    ensureOpen();
    const backlog = await sqlite.maintenance.status(subject);
    if (backlog.kind !== "ok") throw Error("Knowledge maintenance status unavailable");
    await prepareSelectedSemantic(); pumpSemantic();
    const models = await Promise.all((Object.keys(KnownModelManifests) as KnownModelId[]).map(async (id) => {
      const manifest = KnownModelManifests[id];
      const runtime = manifest.runtimeProvenance!;
      return { id, title: "Qwen3 Embedding 0.6B · MLX 8-bit", licence: `${manifest.provenance?.baseLicense ?? "Unknown"} model and conversion`,
        source: `https://huggingface.co/${manifest.provenance?.repository}/tree/${manifest.revision}`,
        modelDirectory: join(modelRoot, "active", id), runtimeDirectory: join(modelRoot, "runtime", "mlx"),
        prerequisites: "Requires macOS on Apple Silicon and uv. Text search remains available without these prerequisites.",
        runtime: { package: runtime.package, version: runtime.version, licence: runtime.license },
        weightsBytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0), ...await modelState(id) };
    }));
    const pendingUpdates = backlog.pendingUnits;
    const semanticState = candidateSemantic?.retrieval.state ?? (activeSemantic?.model === configuration.embeddingModel ? activeSemantic.retrieval.state : undefined);
    const indexState = semanticState ?? "unavailable";
    const priorActive = activeSemantic && activeSemantic.model !== configuration.embeddingModel;
    return LocalKnowledgeStatusSchema.parse({ availability: "ready", message: indexState === "unavailable"
      ? "Local text search is ready. Semantic indexing requires a verified downloaded model."
      : priorActive ? "Local text search and the previous verified semantic index are ready while the selected model rebuilds."
      : indexState === "ready" ? "Local text and semantic search are ready." : "Local text search is ready while semantic indexing continues.",
      configuration, models, indexing: indexState,
      maintenance: { state: "idle", pendingUpdates,
        message: `${pendingUpdates} maintenance updates pending.`,
        automaticStartsToday: 0, automaticMillisecondsToday: 0 },
    });
  }
  return {
    status,
    async configure(value: LocalKnowledgeConfiguration) {
      ensureOpen(); const next = LocalKnowledgeConfigurationSchema.parse(value);
      await state.set("configuration", next); await assessment.close(); configuration = next; assessment = assessmentFor(next); return status();
    },
    search(request: SearchRequest) { ensureOpen(); return activeSemantic?.retrieval.search(request) ?? sqlite.retrieval.search(subject, request); },
    get(ref: RecordRef) { ensureOpen(); return sqlite.retrieval.get(subject, ref); },
    expand(request: ExpandRequest) { ensureOpen(); return sqlite.retrieval.expand(subject, request); },
    evidence(request: EvidenceRequest) { ensureOpen(); return sqlite.retrieval.evidence(subject, request); },
    export(request: KnowledgeExportRequest) { ensureOpen(); return sqlite.retrieval.export(subject, request); },
    async ingest(input: IntakeInput) { ensureOpen(); const result = await sqlite.intake.ingest(subject, input); if (result.kind === "accepted") pumpSemantic(); return result; },
    maintenanceStatus() { ensureOpen(); return sqlite.maintenance.status(subject); },
    maintenancePending(request: Parameters<typeof sqlite.maintenance.pending>[1]) { ensureOpen(); return sqlite.maintenance.pending(subject, request); },
    maintenancePublish(input: PublicationInput) { ensureOpen(); return sqlite.maintenance.publish(subject, input); },
    maintenanceRelease(input: WorkBatchReleaseInput) { ensureOpen(); return sqlite.maintenance.release(subject, input); },
    assess(request: AssessmentRequest) { ensureOpen(); return assessment.assess(subject, request); },
    reconcile(request: AssessmentReconcileRequest) { ensureOpen(); return assessment.reconcile(subject, request); },
    cancelAssessment(request: AssessmentReconcileRequest) { ensureOpen(); return assessment.cancel(subject, request); },
    async download(model: KnownModelId): Promise<LocalKnowledgeStatus> {
      ensureOpen(); const setup = setups.get(model)!;
      const install = setup.install({ consent: true }).then(result => { if (result.kind === "ready") pumpSemantic(); }, () => undefined);
      installs.add(install); void install.finally(() => installs.delete(install));
      return status();
    },
    async cancelDownload(model: KnownModelId): Promise<LocalKnowledgeStatus> { ensureOpen(); setups.get(model)!.cancel(); return status(); },
    async close() { if (closed) return; closed = true; for (const setup of setups.values()) setup.cancel();
      activeSemantic?.retrieval.close(); candidateSemantic?.retrieval.close();
      const workers = await Promise.allSettled([activeSemantic?.worker.close(), candidateSemantic?.worker.close()]);
      const remainder = await Promise.allSettled([preparing, indexing, ...installs, assessment.close()]);
      sqlite.close();
      const failed = [...workers, ...remainder].find((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failed) throw failed.reason;
    },
};
}

export type LocalKnowledgeRuntime = Awaited<ReturnType<typeof createLocalKnowledgeRuntime>>;
