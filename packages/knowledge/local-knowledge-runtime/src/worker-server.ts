import { createInterface } from "node:readline";
import type { AuthorizationEvaluationOptions } from "@drawloom/authorization";
import { createWorkerAuthorizer } from "./worker-authorization.js";
import { ContextPreparationRequestSchema } from "@drawloom/context";
import { z } from "zod";
import type { RpcTransport } from "@drawloom/host";
import {
  AssessmentReconcileRequestSchema,
  AssessmentRequestSchema,
  EvidenceRequestSchema,
  ExpandRequestSchema,
  IntakeInputSchema,
  KnowledgeExportRequestSchema,
  PendingRequestSchema,
  PublicationInputSchema,
  RecordRefSchema,
  SearchRequestSchema,
  WorkBatchReleaseInputSchema,
} from "@drawloom/knowledge";
import { createLocalKnowledgeRuntime } from "./runtime.js";
import { LocalKnowledgeConfigurationSchema } from "./protocol.js";

export async function serveLocalKnowledgeWorker(launch: {
  root: string;
  workingDirectory: string;
  connectCodex(): Promise<RpcTransport>;
}) {
  let writes: Promise<void> = Promise.resolve();
  const write = (value: unknown) => {
    writes = writes.then(
      () =>
        new Promise<void>((resolve, reject) =>
          process.stdout.write(`${JSON.stringify(value)}\n`, (error) =>
            error ? reject(error) : resolve(),
          ),
        ),
    );
    return writes;
  };
  const authorization = createWorkerAuthorizer(write);
  const runtime = await createLocalKnowledgeRuntime({
    ...launch,
    authorizer: authorization.authorizer,
  });
  let closing: Promise<void> | undefined;
  const closeRuntime = () => {
    authorization.close();
    return (closing ??= runtime.close());
  };
  const Empty = z.strictObject({});
  const Model = z.strictObject({ model: z.literal("qwen3-embedding-0.6b-gguf") });
  const CleanupObsolete = z.strictObject({
    action: z.literal("cleanup_obsolete"),
    consent: z.literal(true),
  });
  async function dispatch(
    method: string,
    params: unknown,
    operation: AuthorizationEvaluationOptions,
  ): Promise<unknown> {
    if (closing) throw Error("Knowledge runtime is closing");
    if (method === "knowledge.status") {
      Empty.parse(params);
      return runtime.status(operation);
    }
    if (method === "knowledge.warmup") {
      Empty.parse(params);
      return runtime.warmup(operation);
    }
    if (method === "knowledge.prepare")
      return runtime.prepare({ ...ContextPreparationRequestSchema.parse(params), ...operation });
    if (method === "knowledge.index") {
      Empty.parse(params);
      return runtime.index(operation);
    }
    if (method === "knowledge.configure")
      return runtime.configure(LocalKnowledgeConfigurationSchema.parse(params), operation);
    if (method === "knowledge.search")
      return runtime.search(SearchRequestSchema.parse(params), operation);
    if (method === "knowledge.get") return runtime.get(RecordRefSchema.parse(params), operation);
    if (method === "knowledge.expand")
      return runtime.expand(ExpandRequestSchema.parse(params), operation);
    if (method === "knowledge.evidence")
      return runtime.evidence(EvidenceRequestSchema.parse(params), operation);
    if (method === "knowledge.export")
      return runtime.export(KnowledgeExportRequestSchema.parse(params), operation);
    if (method === "knowledge.ingest")
      return runtime.ingest(IntakeInputSchema.parse(params), operation);
    if (method === "knowledge.maintenance.status") {
      Empty.parse(params);
      return runtime.maintenanceStatus(operation);
    }
    if (method === "knowledge.maintenance.pending")
      return runtime.maintenancePending(PendingRequestSchema.parse(params), operation);
    if (method === "knowledge.maintenance.publish")
      return runtime.maintenancePublish(PublicationInputSchema.parse(params), operation);
    if (method === "knowledge.maintenance.release")
      return runtime.maintenanceRelease(WorkBatchReleaseInputSchema.parse(params), operation);
    if (method === "knowledge.assess")
      return runtime.assess(AssessmentRequestSchema.parse(params), operation);
    if (method === "knowledge.reconcile")
      return runtime.reconcile(AssessmentReconcileRequestSchema.parse(params), operation);
    if (method === "knowledge.cancel-assessment")
      return runtime.cancelAssessment(AssessmentReconcileRequestSchema.parse(params), operation);
    if (method === "knowledge.download")
      return runtime.download(Model.parse(params).model, operation);
    if (method === "knowledge.cancel-download")
      return runtime.cancelDownload(Model.parse(params).model, operation);
    if (method === "knowledge.cleanup-obsolete-runtime") {
      CleanupObsolete.parse(params);
      return runtime.cleanupObsoleteRuntime(operation);
    }
    throw Error("Unknown method");
  }

  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const stop = () => {
    lines.close();
    void closeRuntime().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  const Request = z.strictObject({
    id: z.number().int().nonnegative(),
    method: z.string(),
    params: z.unknown(),
  });
  const Notification = z.strictObject({
    method: z.literal("knowledge.cancel-operation"),
    params: z.unknown(),
  });
  const Response = z.strictObject({ id: z.string(), result: z.unknown() });
  for await (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > 1024 * 1024) {
      stop();
      break;
    }
    try {
      const value: unknown = JSON.parse(line);
      const response = Response.safeParse(value);
      if (response.success) {
        authorization.response(response.data.id, response.data.result);
        continue;
      }
      const notification = Notification.safeParse(value);
      if (notification.success) {
        authorization.cancel(notification.data.params);
        continue;
      }
      const message = Request.parse(value);
      const work =
        message.method === "knowledge.close"
          ? (async () => {
              Empty.parse(message.params);
              await closeRuntime();
              return {};
            })()
          : authorization.run(message.params, (params, operation) =>
              dispatch(message.method, params, operation),
            );
      void work
        .then(
          (result) => write({ id: message.id, result }),
          () => write({ id: message.id, error: { code: -32000 } }),
        )
        .catch(() => stop());
    } catch {
      stop();
      break;
    }
  }
  await closeRuntime();
}
