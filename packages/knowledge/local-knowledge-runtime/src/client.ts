import {
  AssessmentCancellationResultSchema, AssessmentReconcileRequestSchema, AssessmentResultSchema, AssessmentRequestSchema,
  EvidenceRequestSchema, EvidenceResultSchema, ExpandRequestSchema, ExpandResultSchema, IntakeInputSchema, IntakeResultSchema, KnowledgeExportRequestSchema, KnowledgeExportResultSchema,
  MaintenanceStatusResultSchema, PendingKnowledgeSchema, PendingRequestSchema, PublicationInputSchema, PublicationResultSchema,
  WorkBatchReleaseInputSchema, WorkBatchReleaseResultSchema, type WorkBatchReleaseInput,
  RecordReadResultSchema, RecordRefSchema, SearchRequestSchema, SearchResultSchema,
  type AssessmentReconcileRequest, type AssessmentRequest, type EvidenceRequest, type ExpandRequest, type IntakeInput, type KnowledgeExportRequest,
  type PublicationInput, type RecordRef, type SearchRequest,
} from "@drawloom/knowledge";
import type { RpcTransport } from "@drawloom/host";
import { createStdioTransport } from "@drawloom/node-host";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { LocalKnowledgeConfigurationSchema, LocalKnowledgeStatusSchema, type LocalKnowledgeConfiguration } from "./protocol.js";

export function createLocalKnowledgeClient(rpc: RpcTransport) {
  const request = async <T>(method: string, value: unknown, schema: z.ZodType<T>): Promise<T> => schema.parse(await rpc.request(method, value));
  return {
    status: () => request("knowledge.status", {}, LocalKnowledgeStatusSchema),
    configure: (value: LocalKnowledgeConfiguration) => request("knowledge.configure", LocalKnowledgeConfigurationSchema.parse(value), LocalKnowledgeStatusSchema),
    search: (value: SearchRequest) => request("knowledge.search", SearchRequestSchema.parse(value), SearchResultSchema),
    get: (value: RecordRef) => request("knowledge.get", RecordRefSchema.parse(value), RecordReadResultSchema),
    expand: (value: ExpandRequest) => request("knowledge.expand", ExpandRequestSchema.parse(value), ExpandResultSchema),
    evidence: (value: EvidenceRequest) => request("knowledge.evidence", EvidenceRequestSchema.parse(value), EvidenceResultSchema),
    export: (value: KnowledgeExportRequest) => request("knowledge.export", KnowledgeExportRequestSchema.parse(value), KnowledgeExportResultSchema),
    ingest: (value: IntakeInput) => request("knowledge.ingest", IntakeInputSchema.parse(value), IntakeResultSchema),
    maintenanceStatus: () => request("knowledge.maintenance.status", {}, MaintenanceStatusResultSchema),
    maintenancePending: (value: z.input<typeof PendingRequestSchema>) => request("knowledge.maintenance.pending", PendingRequestSchema.parse(value), PendingKnowledgeSchema),
    maintenancePublish: (value: PublicationInput) => request("knowledge.maintenance.publish", PublicationInputSchema.parse(value), PublicationResultSchema),
    maintenanceRelease: (value: WorkBatchReleaseInput) => request("knowledge.maintenance.release", WorkBatchReleaseInputSchema.parse(value), WorkBatchReleaseResultSchema),
    assess: (value: AssessmentRequest) => request("knowledge.assess", AssessmentRequestSchema.parse(value), AssessmentResultSchema),
    reconcile: (value: AssessmentReconcileRequest) => request("knowledge.reconcile", AssessmentReconcileRequestSchema.parse(value), AssessmentResultSchema),
    cancelAssessment: (value: AssessmentReconcileRequest) => request("knowledge.cancel-assessment", AssessmentReconcileRequestSchema.parse(value), AssessmentCancellationResultSchema),
    download: (model: "qwen3-embedding-0.6b-mlx") => request("knowledge.download", { model }, LocalKnowledgeStatusSchema),
    cancelDownload: (model: "qwen3-embedding-0.6b-mlx") => request("knowledge.cancel-download", { model }, LocalKnowledgeStatusSchema),
    close: () => rpc.close(),
  };
}
export type LocalKnowledgeClient = ReturnType<typeof createLocalKnowledgeClient>;
export function createManagedLocalKnowledgeClient(options: {
  root: string;
  workingDirectory: string;
  nodePath?: string;
  runtimeEntrypoint?: string;
}) {
  // Source imports deliberately use .js specifiers, so Node cannot execute the
  // TypeScript sidecar graph directly. Development uses the canonical package
  // build; packaged hosts pass the separately staged entrypoint explicitly.
  const entrypoint = options.runtimeEntrypoint ?? fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../dist/sidecar.js" : "./sidecar.js", import.meta.url));
  const rpc = createStdioTransport({
    command: options.nodePath ?? "node",
    args: ["--experimental-strip-types", entrypoint, JSON.stringify({ root: options.root, workingDirectory: options.workingDirectory })],
    requestTimeoutMs: 310_000,
    maxMessageBytes: 1024 * 1024,
  });
  return createLocalKnowledgeClient(rpc);
}
export { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, LocalKnowledgeConfigurationSchema, LocalKnowledgeStatusSchema } from "./protocol.js";
export type { LocalKnowledgeConfiguration, LocalKnowledgeStatus } from "./protocol.js";
