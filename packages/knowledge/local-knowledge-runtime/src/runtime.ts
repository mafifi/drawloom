import {
  AuthorizationResultSchema,
  type AuthorizationEvaluationOptions,
  type Authorizer,
} from "@drawloom/authorization";
import { join } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createSqliteKnowledge } from "@drawloom/sqlite-knowledge";
import { createCodexAssessment } from "@drawloom/codex-assessment";
import {
  createKnowledgeEmbeddings,
  createModelSetup,
  embeddingConfiguration,
  KnownLlamaRuntime,
  KnownModelManifests,
  LlamaEmbeddingWorker,
  type EmbeddingWorker,
  type KnownModelId,
  type ModelSetup,
  type ReadyModel,
  type TrustedRuntimeArtifact,
} from "@drawloom/local-embeddings";
import {
  type AssessmentReconcileRequest,
  type AssessmentRequest,
  type EvidenceRequest,
  type ExpandRequest,
  type IntakeInput,
  type KnowledgeExportRequest,
  type PublicationInput,
  type RecordRef,
  type SearchRequest,
  type TrustedKnowledgeSubject,
  type WorkBatchReleaseInput,
} from "@drawloom/knowledge";
import type { RpcTransport } from "@drawloom/host";
import {
  DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
  LocalKnowledgeConfigurationSchema,
  LocalKnowledgeStatusSchema,
  parseStoredLocalKnowledgeConfiguration,
  type LocalKnowledgeConfiguration,
  type LocalKnowledgeStatus,
} from "./protocol.js";
import { createSemanticRetrieval } from "./semantic.js";
import { createKnowledgeContextPreparer } from "@drawloom/knowledge-context";
import {
  ContextPreparationRequestSchema,
  type ContextPreparationRequest,
  type ContextPreparationResult,
} from "@drawloom/context";

const subject = Object.freeze({
  type: "user",
  id: "local-owner",
  properties: { locality: "device", scope: "global-knowledge" },
}) as unknown as TrustedKnowledgeSubject;
const resource = (request: {
  action: string;
  ref?: { type: string; origin: string; id: string; revision: string };
}) => ({
  type: request.ref ? "knowledge-record" : "knowledge-store",
  id: request.ref
    ? `${request.ref.type}:${request.ref.origin}:${request.ref.id}:${request.ref.revision}`
    : "local-global",
  properties: { locality: "device", scope: "global-knowledge", action: request.action },
});
export interface LocalKnowledgeRuntimeOptions {
  root: string;
  workingDirectory: string;
  connectCodex(): Promise<RpcTransport>;
  /** Trusted composition only. The supervised worker supplies reverse host RPC. */
  authorizer: Authorizer;
  /** Provider-local deterministic seam for tests; production uses ModelSetup. */
  createEmbeddingSetup?: (
    root: string,
    model: KnownModelId,
  ) => Pick<
    ModelSetup,
    | "ready"
    | "status"
    | "install"
    | "cancel"
    | "obsoleteRuntimePresent"
    | "cleanupObsoleteMlxRuntime"
  >;
  /** Explicitly trusted host composition override; never accepted from browser configuration. */
  runtimeArtifact?: TrustedRuntimeArtifact;
  /** Provider-local deterministic seam for tests; production uses llama-server. */
  createEmbeddingWorker?: (
    root: string,
    model: KnownModelId,
    ready: () => Promise<ReadyModel | undefined>,
  ) => EmbeddingWorker & { close(): Promise<void> };
}

export async function createLocalKnowledgeRuntime(options: LocalKnowledgeRuntimeOptions) {
  const authorizer = options.authorizer;
  const authorizeSearch = async (
    ref: RecordRef | undefined,
    operation: AuthorizationEvaluationOptions,
  ) => {
    try {
      const result = await authorizer.authorize(
        {
          subject,
          action: { name: "knowledge.search" },
          resource: resource({ action: "knowledge.search", ...(ref ? { ref } : {}) }),
        },
        operation,
      );
      return AuthorizationResultSchema.parse(result);
    } catch {
      return { kind: "failure" as const, code: "rejected" as const };
    }
  };

  const state = createNodeJsonStore(join(options.root, "state"));
  const storedConfiguration = await state.get("configuration");
  const configured = parseStoredLocalKnowledgeConfiguration(
    storedConfiguration ?? DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
  );
  if (
    storedConfiguration &&
    typeof storedConfiguration === "object" &&
    (storedConfiguration as { embeddingModel?: unknown }).embeddingModel ===
      "qwen3-embedding-0.6b-mlx"
  )
    await state.set("configuration", configured);
  let configuration: LocalKnowledgeConfiguration = configured;
  const sqlite = createSqliteKnowledge({
    databasePath: join(options.root, "knowledge.sqlite"),
    authorizer,
    maintenanceAuthorizer: authorizer,
    resolveResource: ({ action, ref }) => resource({ action, ...(ref ? { ref } : {}) }),
  });
  const modelRoot = join(options.root, "models");
  const setups = new Map<
    KnownModelId,
    Pick<
      ModelSetup,
      | "ready"
      | "status"
      | "install"
      | "cancel"
      | "obsoleteRuntimePresent"
      | "cleanupObsoleteMlxRuntime"
    >
  >(
    (Object.keys(KnownModelManifests) as KnownModelId[]).map((id) => [
      id,
      options.createEmbeddingSetup?.(modelRoot, id) ??
        createModelSetup({
          root: modelRoot,
          manifest: KnownModelManifests[id],
          ...(options.runtimeArtifact ? { runtimeArtifact: options.runtimeArtifact } : {}),
        }),
    ]),
  );
  let assessment = assessmentFor(configuration);
  let closed = false;
  type Semantic = {
    model: KnownModelId;
    worker: EmbeddingWorker & { close(): Promise<void> };
    retrieval: ReturnType<typeof createSemanticRetrieval>;
  };
  let activeSemantic: Semantic | undefined;
  let candidateSemantic: Semantic | undefined;
  let indexing: Promise<void> | undefined;
  let preparing: Promise<void> | undefined;
  const installs = new Set<Promise<unknown>>();
  const preparations = new Set<AbortController>();
  const preparer = createKnowledgeContextPreparer({
    retrieval: {
      ...sqlite.retrieval,
      search: (_subject, request, operation) =>
        activeSemantic?.retrieval.search(request, operation) ??
        sqlite.retrieval.search(subject, request, operation),
    },
    authorizer,
    subject,
    destination: { type: "agent-provider", id: "codex", properties: {} },
    resolveDisclosureResource: async ({ ref, destination }) => ({
      ...resource({ action: "knowledge.disclose", ref }),
      properties: { locality: "device", scope: "global-knowledge", destination },
    }),
  });

  function assessmentFor(value: LocalKnowledgeConfiguration) {
    return createCodexAssessment({
      model: value.assessmentModel,
      effort: "low",
      timeoutMs: value.assessmentTimeoutMs,
      workingDirectory: options.workingDirectory,
      store: state,
      connect: options.connectCodex,
      authorizer: authorizer,
      resolveResource: async ({ action, ref, destination }) => ({
        ...resource({ action, ...(ref ? { ref } : {}) }),
        properties: { locality: "device", scope: "global-knowledge", destination },
      }),
    });
  }
  const ensureOpen = () => {
    if (closed) throw Error("Knowledge runtime is closed");
  };
  async function semanticFor(model: KnownModelId): Promise<Semantic | undefined> {
    const setup = setups.get(model)!;
    if (!(await setup.ready())) return undefined;
    const ready = () => setup.ready();
    const worker =
      options.createEmbeddingWorker?.(modelRoot, model, ready) ??
      new LlamaEmbeddingWorker({ root: modelRoot, model, ready });
    return {
      model,
      worker,
      retrieval: createSemanticRetrieval({
        subject,
        retrieval: sqlite.retrieval,
        work: sqlite.indexWork,
        index: sqlite.embeddingIndex,
        embeddings: createKnowledgeEmbeddings({ model, authorizer, worker }),
        backgroundEmbeddings: createKnowledgeEmbeddings({
          model,
          authorizer: authorizer,
          worker,
        }),
        configuration: embeddingConfiguration(model),
        authorizeSearch,
        revision: async (operation) => {
          const status = await sqlite.maintenance.status(subject, operation);
          if (status.kind !== "ok") throw Error("Knowledge revision unavailable");
          return status.checkpoint;
        },
      }),
    };
  }
  async function prepareSelectedSemantic() {
    const model = configuration.embeddingModel;
    if (activeSemantic?.model === model || candidateSemantic?.model === model) return;
    if (preparing) return preparing;
    preparing = (async () => {
      if (candidateSemantic) {
        candidateSemantic.retrieval.close();
        await candidateSemantic.worker.close();
        candidateSemantic = undefined;
      }
      const prepared = await semanticFor(model);
      if (closed && prepared) {
        prepared.retrieval.close();
        await prepared.worker.close();
        return;
      }
      candidateSemantic = prepared;
    })().finally(() => {
      preparing = undefined;
    });
    return preparing;
  }
  function pumpSemantic(parent?: AuthorizationEvaluationOptions) {
    if (indexing || closed) return indexing;
    const deadline = performance.now() + 30_000;
    const operation = parent ?? {
      signal: new AbortController().signal,
      remainingMs: () => deadline - performance.now(),
    };
    indexing = (async () => {
      await prepareSelectedSemantic();
      const target = candidateSemantic ?? activeSemantic;
      if (!target) return;
      do {
        await target.retrieval.indexNext(operation);
        if (closed || (candidateSemantic && candidateSemantic !== target)) return;
        if (target.retrieval.state === "pending")
          await new Promise<void>((resolve) => setImmediate(resolve));
      } while (target.retrieval.state === "pending");
      if (candidateSemantic === target && target.retrieval.state === "ready") {
        const prior = activeSemantic;
        activeSemantic = target;
        candidateSemantic = undefined;
        if (prior) {
          prior.retrieval.close();
          await prior.worker.close();
        }
      }
    })().finally(() => {
      indexing = undefined;
    });
    return indexing;
  }
  async function modelState(id: KnownModelId) {
    const setup = setups.get(id)!;
    if (await setup.ready()) return { state: "ready" as const };
    const status = setup.status();
    if (status.kind === "installing_runtime")
      return {
        state: "installing_runtime" as const,
        message:
          status.step === "extracting"
            ? "Installing verified llama.cpp runtime"
            : "Verifying llama.cpp runtime",
      };
    if (status.kind === "downloading")
      return {
        state: "downloading" as const,
        receivedBytes: status.received,
        expectedBytes: status.expected,
        message: `Downloading ${status.path}`,
      };
    if (status.kind === "verifying")
      return { state: "verifying" as const, message: `Verifying ${status.path}` };
    if (status.kind === "failed") return { state: "failed" as const, message: status.code };
    if (status.kind === "cancelled")
      return {
        state: "cancelled" as const,
        message: "Installation cancelled. Existing knowledge and indexes were not changed.",
      };
    if (!KnownLlamaRuntime.url && !options.runtimeArtifact?.url)
      return { state: "failed" as const, message: "runtime_unavailable" };
    return { state: "missing" as const };
  }
  async function status(operation?: AuthorizationEvaluationOptions): Promise<LocalKnowledgeStatus> {
    ensureOpen();
    const backlog = await sqlite.maintenance.status(subject, operation);
    if (backlog.kind !== "ok") throw Error("Knowledge maintenance status unavailable");
    await prepareSelectedSemantic();
    const models = await Promise.all(
      (Object.keys(KnownModelManifests) as KnownModelId[]).map(async (id) => {
        const manifest = KnownModelManifests[id];
        const runtime = manifest.runtimeProvenance!;
        return {
          id,
          title: "Qwen3 Embedding 0.6B · GGUF Q8_0",
          licence: `${manifest.provenance?.baseLicense ?? "Unknown"} model and conversion`,
          source: `https://huggingface.co/${manifest.provenance?.repository}/tree/${manifest.revision}`,
          modelDirectory: join(modelRoot, "active", id),
          runtimeDirectory: join(modelRoot, "runtime", `llama.cpp-${KnownLlamaRuntime.revision}`),
          prerequisites:
            "Requires macOS on Apple Silicon with Metal. Text search remains available without these prerequisites.",
          runtime: { package: runtime.package, version: runtime.version, licence: runtime.license },
          weightsBytes: manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
          runtimeBytes: options.runtimeArtifact?.bytes ?? KnownLlamaRuntime.bytes,
          runtimeDownloadAvailable: Boolean(options.runtimeArtifact?.url ?? KnownLlamaRuntime.url),
          ...(await modelState(id)),
        };
      }),
    );
    const pendingUpdates = backlog.pendingUnits;
    const semanticState =
      candidateSemantic?.retrieval.state ??
      (activeSemantic?.model === configuration.embeddingModel
        ? activeSemantic.retrieval.state
        : undefined);
    const indexState = semanticState ?? "unavailable";
    const priorActive = activeSemantic && activeSemantic.model !== configuration.embeddingModel;
    return LocalKnowledgeStatusSchema.parse({
      availability: "ready",
      message:
        indexState === "unavailable"
          ? "Local text search is ready. Semantic indexing requires a verified downloaded model."
          : priorActive
            ? "Local text search and the previous verified semantic index are ready while the selected model rebuilds."
            : indexState === "ready"
              ? "Local text and semantic search are ready."
              : "Local text search is ready while semantic indexing continues.",
      configuration,
      models,
      obsoleteRuntimePresent: await setups.values().next().value!.obsoleteRuntimePresent(),
      indexing: indexState,
      maintenance: {
        state: "idle",
        pendingUpdates,
        message: `${pendingUpdates} maintenance updates pending.`,
        automaticStartsToday: 0,
        automaticMillisecondsToday: 0,
      },
    });
  }
  return {
    status,
    async index(operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      await pumpSemantic(operation);
      return {};
    },
    async warmup(
      operation?: AuthorizationEvaluationOptions,
    ): Promise<{ kind: "ready" | "unavailable" }> {
      ensureOpen();
      try {
        await prepareSelectedSemantic();
        const worker = (candidateSemantic ?? activeSemantic)?.worker;
        if (!worker?.warmup) return { kind: "unavailable" };
        await worker.warmup({
          timeoutMs: Math.floor(Math.min(30_000, operation?.remainingMs() ?? 30_000)),
          ...(operation ? { signal: operation.signal } : {}),
        });
        return { kind: "ready" };
      } catch {
        return { kind: "unavailable" };
      }
    },
    async prepare(value: ContextPreparationRequest): Promise<ContextPreparationResult> {
      ensureOpen();
      const { signal, remainingMs, ...data } = value;
      const request = ContextPreparationRequestSchema.parse(data);
      // Effective consent is bound to this admitted operation by the trusted host.
      // Retrieval and disclosure still pass the runtime's independent authorizer.
      const controller = new AbortController();
      preparations.add(controller);
      const cancel = () => controller.abort();
      signal.addEventListener("abort", cancel, { once: true });
      if (signal.aborted) cancel();
      try {
        return await preparer.prepare({ ...request, signal: controller.signal, remainingMs });
      } finally {
        preparations.delete(controller);
        signal.removeEventListener("abort", cancel);
      }
    },
    async configure(
      value: LocalKnowledgeConfiguration,
      operation?: AuthorizationEvaluationOptions,
    ) {
      ensureOpen();
      const next = LocalKnowledgeConfigurationSchema.parse(value);
      // Stop foreground additions immediately, including while assessment config is stable.
      if (!next.automaticContext) for (const pending of preparations) pending.abort();
      await state.set("configuration", next);
      const assessmentChanged =
        next.assessmentModel !== configuration.assessmentModel ||
        next.assessmentTimeoutMs !== configuration.assessmentTimeoutMs;
      configuration = next;
      if (assessmentChanged) {
        await assessment.close();
        assessment = assessmentFor(next);
      }
      return status(operation);
    },
    search(request: SearchRequest, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return (
        activeSemantic?.retrieval.search(request, operation) ??
        sqlite.retrieval.search(subject, request, operation)
      );
    },
    get(ref: RecordRef, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return sqlite.retrieval.get(subject, ref, operation);
    },
    expand(request: ExpandRequest, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return sqlite.retrieval.expand(subject, request, operation);
    },
    evidence(request: EvidenceRequest, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return sqlite.retrieval.evidence(subject, request, operation);
    },
    export(request: KnowledgeExportRequest, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return sqlite.retrieval.export(subject, request, operation);
    },
    async ingest(input: IntakeInput, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      const result = await sqlite.intake.ingest(subject, input, operation);
      return result;
    },
    maintenanceStatus(operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return sqlite.maintenance.status(subject, operation);
    },
    maintenancePending(
      request: Parameters<typeof sqlite.maintenance.pending>[1],
      operation?: AuthorizationEvaluationOptions,
    ) {
      ensureOpen();
      return sqlite.maintenance.pending(subject, request, operation);
    },
    maintenancePublish(input: PublicationInput, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return sqlite.maintenance.publish(subject, input, operation);
    },
    maintenanceRelease(input: WorkBatchReleaseInput, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return sqlite.maintenance.release(subject, input, operation);
    },
    assess(request: AssessmentRequest, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return assessment.assess(subject, request, operation);
    },
    reconcile(request: AssessmentReconcileRequest, operation?: AuthorizationEvaluationOptions) {
      ensureOpen();
      return assessment.reconcile(subject, request, operation);
    },
    cancelAssessment(
      request: AssessmentReconcileRequest,
      operation?: AuthorizationEvaluationOptions,
    ) {
      ensureOpen();
      return assessment.cancel(subject, request, operation);
    },
    async download(
      model: KnownModelId,
      operation?: AuthorizationEvaluationOptions,
    ): Promise<LocalKnowledgeStatus> {
      ensureOpen();
      const setup = setups.get(model)!;
      const install = setup.install({ consent: true }).then(
        () => undefined,
        () => undefined,
      );
      installs.add(install);
      void install.finally(() => installs.delete(install));
      return status(operation);
    },
    async cancelDownload(
      model: KnownModelId,
      operation?: AuthorizationEvaluationOptions,
    ): Promise<LocalKnowledgeStatus> {
      ensureOpen();
      setups.get(model)!.cancel();
      return status(operation);
    },
    async cleanupObsoleteRuntime(
      operation?: AuthorizationEvaluationOptions,
    ): Promise<LocalKnowledgeStatus> {
      ensureOpen();
      const result = await setups.values().next().value!.cleanupObsoleteMlxRuntime();
      if (result.kind === "refused")
        throw Error(`Obsolete runtime cleanup refused: ${result.code}`);
      return status(operation);
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const setup of setups.values()) setup.cancel();
      for (const pending of preparations) pending.abort();
      activeSemantic?.retrieval.close();
      candidateSemantic?.retrieval.close();
      const workers = await Promise.allSettled([
        activeSemantic?.worker.close(),
        candidateSemantic?.worker.close(),
      ]);
      const remainder = await Promise.allSettled([
        preparing,
        indexing,
        ...installs,
        assessment.close(),
      ]);
      sqlite.close();
      const failed = [...workers, ...remainder].find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failed) throw failed.reason;
    },
  };
}

export type LocalKnowledgeRuntime = Awaited<ReturnType<typeof createLocalKnowledgeRuntime>>;
