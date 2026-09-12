import { createInterface } from "node:readline";
import { z } from "zod";
import { createStdioTransport, codexCommand } from "@drawloom/node-host";
import {
  AssessmentReconcileRequestSchema, AssessmentRequestSchema, EvidenceRequestSchema, ExpandRequestSchema, IntakeInputSchema,
  KnowledgeExportRequestSchema, PendingRequestSchema, PublicationInputSchema, RecordRefSchema, SearchRequestSchema, WorkBatchReleaseInputSchema,
} from "@drawloom/knowledge";
import { createLocalKnowledgeRuntime } from "./runtime.js";
import { LocalKnowledgeConfigurationSchema } from "./protocol.js";

const launch = z.strictObject({ root: z.string().min(1), workingDirectory: z.string().min(1) }).parse(JSON.parse(process.argv[2] ?? "null"));
const runtime = await createLocalKnowledgeRuntime({ ...launch, connectCodex: async () => createStdioTransport({ ...codexCommand(), cwd: launch.workingDirectory, maxMessageBytes: 1024 * 1024, requestTimeoutMs: 300_000 }) });
const Empty = z.strictObject({});
const Model = z.strictObject({ model: z.literal("qwen3-embedding-0.6b-mlx") });
async function dispatch(method: string, params: unknown): Promise<unknown> {
  if (method === "knowledge.status") { Empty.parse(params); return runtime.status(); }
  if (method === "knowledge.configure") return runtime.configure(LocalKnowledgeConfigurationSchema.parse(params));
  if (method === "knowledge.search") return runtime.search(SearchRequestSchema.parse(params));
  if (method === "knowledge.get") return runtime.get(RecordRefSchema.parse(params));
  if (method === "knowledge.expand") return runtime.expand(ExpandRequestSchema.parse(params));
  if (method === "knowledge.evidence") return runtime.evidence(EvidenceRequestSchema.parse(params));
  if (method === "knowledge.export") return runtime.export(KnowledgeExportRequestSchema.parse(params));
  if (method === "knowledge.ingest") return runtime.ingest(IntakeInputSchema.parse(params));
  if (method === "knowledge.maintenance.status") { Empty.parse(params); return runtime.maintenanceStatus(); }
  if (method === "knowledge.maintenance.pending") return runtime.maintenancePending(PendingRequestSchema.parse(params));
  if (method === "knowledge.maintenance.publish") return runtime.maintenancePublish(PublicationInputSchema.parse(params));
  if (method === "knowledge.maintenance.release") return runtime.maintenanceRelease(WorkBatchReleaseInputSchema.parse(params));
  if (method === "knowledge.assess") return runtime.assess(AssessmentRequestSchema.parse(params));
  if (method === "knowledge.reconcile") return runtime.reconcile(AssessmentReconcileRequestSchema.parse(params));
  if (method === "knowledge.cancel-assessment") return runtime.cancelAssessment(AssessmentReconcileRequestSchema.parse(params));
  if (method === "knowledge.download") return runtime.download(Model.parse(params).model);
  if (method === "knowledge.cancel-download") return runtime.cancelDownload(Model.parse(params).model);
  throw Error("Unknown method");
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
let writes: Promise<void> = Promise.resolve();
const write = (value: unknown) => { writes = writes.then(() => new Promise<void>((resolve, reject) => process.stdout.write(`${JSON.stringify(value)}\n`, (error) => error ? reject(error) : resolve()))); return writes; };
for await (const line of lines) {
  if (Buffer.byteLength(line, "utf8") > 1024 * 1024) break;
  let id: number | undefined;
  try {
    const message = z.strictObject({ id: z.number().int().nonnegative(), method: z.string(), params: z.unknown() }).parse(JSON.parse(line));
    id = message.id;
    void dispatch(message.method, message.params).then((result) => write({ id: message.id, result }), () => write({ id: message.id, error: { code: -32000 } }));
  } catch { if (id !== undefined) await write({ id, error: { code: -32600 } }); }
}
await runtime.close();
