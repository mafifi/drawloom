import {
  AssessmentCancellationResultSchema,
  AssessmentReconcileRequestSchema,
  AssessmentResultSchema,
  AssessmentRequestSchema,
  EvidenceRequestSchema,
  EvidenceResultSchema,
  ExpandRequestSchema,
  ExpandResultSchema,
  IntakeInputSchema,
  IntakeResultSchema,
  KnowledgeExportRequestSchema,
  KnowledgeExportResultSchema,
  MaintenanceStatusResultSchema,
  PendingKnowledgeSchema,
  PendingRequestSchema,
  PublicationInputSchema,
  PublicationResultSchema,
  WorkBatchReleaseInputSchema,
  WorkBatchReleaseResultSchema,
  type WorkBatchReleaseInput,
  RecordReadResultSchema,
  RecordRefSchema,
  SearchRequestSchema,
  SearchResultSchema,
  type AssessmentReconcileRequest,
  type AssessmentRequest,
  type EvidenceRequest,
  type ExpandRequest,
  type IntakeInput,
  type KnowledgeExportRequest,
  type PublicationInput,
  type RecordRef,
  type SearchRequest,
} from "@drawloom/knowledge";
import type { RpcTransport } from "@drawloom/host";
import type { AuthorizationEvaluationOptions } from "@drawloom/authorization";
import type { KnowledgeWorkerAuthority } from "@drawloom/knowledge";
import { createWorkerAuthorizationHost } from "./host-authorization.js";
import { createNodeJsonStore } from "@drawloom/node-host";
import { join } from "node:path";
import {
  DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
  parseStoredLocalKnowledgeConfiguration,
} from "./protocol.js";
import { createStdioTransport } from "@drawloom/node-host";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ContextPreparationRequestSchema,
  ContextPreparationResultSchema,
  type ContextPreparationRequest,
  type ContextPreparationResult,
} from "@drawloom/context";
import { LocalWarmupResultSchema } from "./protocol.js";
import {
  LocalKnowledgeConfigurationSchema,
  LocalKnowledgeStatusSchema,
  type LocalKnowledgeConfiguration,
} from "./protocol.js";

export function createLocalKnowledgeClient(
  rpc: RpcTransport,
  authority: KnowledgeWorkerAuthority,
  options: {
    assessmentDestination?: () => Promise<string>;
    /** Trusted host storage, never a worker status projection. */
    readConfiguration?: () => Promise<LocalKnowledgeConfiguration>;
  } = {},
) {
  let configuration = DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION;
  let configuring = false,
    fenced = false;
  const readConfiguration = async () =>
    LocalKnowledgeConfigurationSchema.parse(
      options.readConfiguration ? await options.readConfiguration() : configuration,
    );
  const host = createWorkerAuthorizationHost(rpc, authority, async (method) => {
    if (fenced && method !== "knowledge.configure") throw Error("Configuration unavailable");
    const destination = options.assessmentDestination
      ? await options.assessmentDestination()
      : (await readConfiguration()).assessmentModel;
    if (fenced && method !== "knowledge.configure") throw Error("Configuration unavailable");
    return destination;
  });
  let closing: Promise<void> | undefined, indexing: Promise<unknown> | undefined;
  const startIndexing = () => {
    if (!closing)
      indexing ??= host.request("knowledge.index", {}, undefined, true).finally(() => {
        indexing = undefined;
      });
  };
  const service = (background: boolean) => {
    const request = async <T>(
      method: string,
      value: unknown,
      schema: z.ZodType<T>,
      operation?: AuthorizationEvaluationOptions,
    ): Promise<T> => {
      const result = schema.parse(await host.request(method, value, operation, background));
      if (
        !closing &&
        ["knowledge.status", "knowledge.ingest", "knowledge.download"].includes(method)
      ) {
        startIndexing();
      }
      return result;
    };
    return {
      warmup: (operation?: AuthorizationEvaluationOptions) =>
        request("knowledge.warmup", {}, LocalWarmupResultSchema, operation),
      prepare(value: ContextPreparationRequest): Promise<ContextPreparationResult> {
        const { signal, remainingMs, ...data } = value;
        const parsed = ContextPreparationRequestSchema.parse(data);
        let remaining = 0;
        try {
          remaining = Math.min(5000, remainingMs());
        } catch {}
        const deadline = performance.now() + remaining;
        return request("knowledge.prepare", parsed, ContextPreparationResultSchema, {
          signal,
          remainingMs: () => Math.min(deadline - performance.now(), remainingMs()),
        });
      },
      status: (operation?: AuthorizationEvaluationOptions) =>
        request("knowledge.status", {}, LocalKnowledgeStatusSchema, operation),
      async configure(
        value: LocalKnowledgeConfiguration,
        operation?: AuthorizationEvaluationOptions,
      ) {
        const parsed = LocalKnowledgeConfigurationSchema.parse(value);
        if (configuring || fenced || closing || !options.readConfiguration)
          throw Error("Configuration unavailable");
        configuring = true;
        let dispatched = false,
          settled = false;
        let reconciliation: Promise<void> | undefined;
        const started = performance.now();
        const controller = new AbortController();
        let available = 30_000;
        try {
          if (operation) available = Math.min(available, operation.remainingMs());
        } catch {
          available = 0;
        }
        const cancel = () => controller.abort();
        operation?.signal.addEventListener("abort", cancel, { once: true });
        if (operation?.signal.aborted || !Number.isFinite(available) || available <= 0) cancel();
        const timer = setTimeout(cancel, Number.isFinite(available) ? Math.max(0, available) : 0);
        const bounded = {
          signal: controller.signal,
          remainingMs: () =>
            Math.min(
              available - (performance.now() - started),
              operation?.remainingMs() ?? Infinity,
            ),
        };
        const interruptible = <T>(work: Promise<T>) =>
          new Promise<T>((resolve, reject) => {
            const aborted = () => reject(Error("Configuration cancelled"));
            if (controller.signal.aborted) {
              void work.catch(() => {});
              aborted();
              return;
            }
            controller.signal.addEventListener("abort", aborted, { once: true });
            void work
              .then(resolve, reject)
              .finally(() => controller.signal.removeEventListener("abort", aborted));
          });
        try {
          // Loading host storage is also interruptible. No write has been sent yet.
          configuration = await interruptible(readConfiguration());
          fenced = JSON.stringify(parsed) !== JSON.stringify(configuration);
          if (fenced) authority.invalidate();
          const result = await host.request("knowledge.configure", parsed, bounded, background, {
            dispatched() {
              dispatched = true;
            },
            settled(completed) {
              settled = true;
              reconciliation = (async () => {
                if (!completed) {
                  // Transport failure is not a write barrier. Require a new client
                  // lifetime rather than reading a potentially still-settling file.
                  fenced = true;
                  authority.invalidate();
                  return;
                }
                try {
                  const effective = await readConfiguration();
                  if (JSON.stringify(effective) !== JSON.stringify(configuration))
                    authority.invalidate();
                  configuration = effective;
                  fenced = false;
                  configuring = false;
                } catch {
                  fenced = true;
                  authority.invalidate();
                }
              })();
            },
          });
          if (settled && reconciliation) await interruptible(reconciliation);
          if (fenced) throw Error("Configuration unavailable");
          const status = LocalKnowledgeStatusSchema.parse(result);
          startIndexing();
          return status;
        } finally {
          clearTimeout(timer);
          operation?.signal.removeEventListener("abort", cancel);
          if (!dispatched) {
            configuring = false;
            fenced = false;
          }
          // Cancellation returns promptly; the raw invocation still owns the
          // transition until its completion and host-store reconciliation.
        }
      },
      search: (value: SearchRequest, operation?: AuthorizationEvaluationOptions) =>
        request(
          "knowledge.search",
          SearchRequestSchema.parse(value),
          SearchResultSchema,
          operation,
        ),
      get: (value: RecordRef, operation?: AuthorizationEvaluationOptions) =>
        request("knowledge.get", RecordRefSchema.parse(value), RecordReadResultSchema, operation),
      expand: (value: ExpandRequest, operation?: AuthorizationEvaluationOptions) =>
        request(
          "knowledge.expand",
          ExpandRequestSchema.parse(value),
          ExpandResultSchema,
          operation,
        ),
      evidence: (value: EvidenceRequest, operation?: AuthorizationEvaluationOptions) =>
        request(
          "knowledge.evidence",
          EvidenceRequestSchema.parse(value),
          EvidenceResultSchema,
          operation,
        ),
      export: (value: KnowledgeExportRequest, operation?: AuthorizationEvaluationOptions) =>
        request(
          "knowledge.export",
          KnowledgeExportRequestSchema.parse(value),
          KnowledgeExportResultSchema,
          operation,
        ),
      ingest: (value: IntakeInput, operation?: AuthorizationEvaluationOptions) =>
        request("knowledge.ingest", IntakeInputSchema.parse(value), IntakeResultSchema, operation),
      maintenanceStatus: (operation?: AuthorizationEvaluationOptions) =>
        request("knowledge.maintenance.status", {}, MaintenanceStatusResultSchema, operation),
      maintenancePending: (
        value: z.input<typeof PendingRequestSchema>,
        operation?: AuthorizationEvaluationOptions,
      ) =>
        request(
          "knowledge.maintenance.pending",
          PendingRequestSchema.parse(value),
          PendingKnowledgeSchema,
          operation,
        ),
      maintenancePublish: (value: PublicationInput, operation?: AuthorizationEvaluationOptions) =>
        request(
          "knowledge.maintenance.publish",
          PublicationInputSchema.parse(value),
          PublicationResultSchema,
          operation,
        ),
      maintenanceRelease: (
        value: WorkBatchReleaseInput,
        operation?: AuthorizationEvaluationOptions,
      ) =>
        request(
          "knowledge.maintenance.release",
          WorkBatchReleaseInputSchema.parse(value),
          WorkBatchReleaseResultSchema,
          operation,
        ),
      assess: (value: AssessmentRequest, operation?: AuthorizationEvaluationOptions) =>
        request(
          "knowledge.assess",
          AssessmentRequestSchema.parse(value),
          AssessmentResultSchema,
          operation,
        ),
      reconcile: (value: AssessmentReconcileRequest, operation?: AuthorizationEvaluationOptions) =>
        request(
          "knowledge.reconcile",
          AssessmentReconcileRequestSchema.parse(value),
          AssessmentResultSchema,
          operation,
        ),
      cancelAssessment: (
        value: AssessmentReconcileRequest,
        operation?: AuthorizationEvaluationOptions,
      ) =>
        request(
          "knowledge.cancel-assessment",
          AssessmentReconcileRequestSchema.parse(value),
          AssessmentCancellationResultSchema,
          operation,
        ),
      download: (model: "qwen3-embedding-0.6b-gguf", operation?: AuthorizationEvaluationOptions) =>
        request("knowledge.download", { model }, LocalKnowledgeStatusSchema, operation),
      cancelDownload: (
        model: "qwen3-embedding-0.6b-gguf",
        operation?: AuthorizationEvaluationOptions,
      ) => request("knowledge.cancel-download", { model }, LocalKnowledgeStatusSchema, operation),
      cleanupObsoleteRuntime: (operation?: AuthorizationEvaluationOptions) =>
        request(
          "knowledge.cleanup-obsolete-runtime",
          { action: "cleanup_obsolete", consent: true },
          LocalKnowledgeStatusSchema,
          operation,
        ),
    };
  };
  return {
    ...service(false),
    /** Trusted host view for nested Nightloom reads; never serialized. */
    background: service(true),
    close: () =>
      (closing ??= (async () => {
        host.shutdown();
        try {
          await rpc.request("knowledge.close", {});
        } finally {
          await rpc.close();
        }
      })()),
  };
}
export type LocalKnowledgeClient = ReturnType<typeof createLocalKnowledgeClient>;
export function createManagedLocalKnowledgeClient(options: {
  root: string;
  workingDirectory: string;
  authority: KnowledgeWorkerAuthority;
  nodePath?: string;
  runtimeEntrypoint?: string;
}) {
  // Source imports deliberately use .js specifiers, so Node cannot execute the
  // TypeScript sidecar graph directly. Development uses the canonical package
  // build; packaged hosts pass the separately staged entrypoint explicitly.
  const entrypoint =
    options.runtimeEntrypoint ??
    fileURLToPath(
      new URL(
        import.meta.url.endsWith(".ts") ? "../dist/sidecar.js" : "./sidecar.js",
        import.meta.url,
      ),
    );
  const rpc = createStdioTransport({
    command: options.nodePath ?? "node",
    args: [
      "--experimental-strip-types",
      entrypoint,
      JSON.stringify({ root: options.root, workingDirectory: options.workingDirectory }),
    ],
    requestTimeoutMs: 310_000,
    maxMessageBytes: 1024 * 1024,
    shutdownTimeoutMs: 10_000,
  });
  const stored = createNodeJsonStore(join(options.root, "state"));
  return createLocalKnowledgeClient(rpc, options.authority, {
    readConfiguration: async () =>
      parseStoredLocalKnowledgeConfiguration(
        (await stored.get("configuration")) ?? DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
      ),
  });
}
export {
  DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
  LocalKnowledgeConfigurationSchema,
  LocalKnowledgeStatusSchema,
} from "./protocol.js";
export type { LocalKnowledgeConfiguration, LocalKnowledgeStatus } from "./protocol.js";
