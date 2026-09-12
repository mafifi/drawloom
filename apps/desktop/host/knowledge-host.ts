import { z } from "zod";
import type { JsonStore, JsonValue } from "@drawloom/host";
import {
  type EvidenceRequest, type EvidenceResult, type IntakeInput, type IntakeResult,
  type KnowledgeExportRequest, type KnowledgeExportResult, type SearchRequest, type SearchResult,
} from "@drawloom/knowledge";
import { GitBatchSchema, type GitBatch } from "@drawloom/git-knowledge-source/protocol";
import { LocalKnowledgeStatusSchema, type LocalKnowledgeConfiguration, type LocalKnowledgeStatus } from "@drawloom/local-knowledge-runtime";
import { KnowledgeCommandSchema, KnowledgeStatusSchema, type KnowledgeCommand, type KnowledgeStatus } from "../src/lib/knowledge-protocol.js";

export interface KnowledgeService {
  status(): Promise<LocalKnowledgeStatus>;
  configure(configuration: LocalKnowledgeConfiguration): Promise<LocalKnowledgeStatus>;
  search(request: SearchRequest): Promise<SearchResult>;
  evidence(request: EvidenceRequest): Promise<EvidenceResult>;
  export(request: KnowledgeExportRequest): Promise<KnowledgeExportResult>;
  ingest(input: IntakeInput): Promise<IntakeResult>;
  download(model: LocalKnowledgeConfiguration["embeddingModel"]): Promise<LocalKnowledgeStatus>;
  cancelDownload(model: LocalKnowledgeConfiguration["embeddingModel"]): Promise<LocalKnowledgeStatus>;
  close(): Promise<void>;
}
export interface InstalledGitKnowledgeFeed {
  readonly sourceId: string;
  changes(): Promise<GitBatch>;
  acknowledge(token: string): Promise<void>;
}
export interface NightloomControl {
  initialize?(): Promise<{ status: "ready" } | { status: "unavailable"; message: string }>;
  tick(): Promise<{ kind: string }>;
  runNow(overrideBudget: boolean): Promise<{ kind: string }>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  configure?(configuration: LocalKnowledgeConfiguration): Promise<void>;
  status(): Promise<{ available?: boolean; message?: string; paused: boolean; active?: unknown; budget: { automaticStarts: number; automaticReservedMilliseconds: number } }>;
  close?(): Promise<void>;
}

const SourceStateSchema = z.strictObject({
  projectId: z.string().min(1).max(256), sourceId: z.string().min(1).max(256),
  enabled: z.boolean().default(true),
  pendingAck: z.strictObject({ token: z.string().min(1).max(256) }).optional(),
});
type SourceState = z.infer<typeof SourceStateSchema>;

function sourceIntake(sourceId: string, update: GitBatch["updates"][number]): IntakeInput {
  const ref = { type: "source" as const, origin: sourceId, id: update.id, revision: update.revision };
  const common = {
    ref, body: update.text,
    confidence: { value: "observed", source: "committed-git" },
    provenance: { producer: { type: "installed-git-source", id: sourceId }, inputs: [] },
  };
  if (update.state === "withdrawn") {
    if (!update.previous) throw Error("Source withdrawal has no prior revision");
    return { operation: "withdraw", expectedRevision: update.previous,
      record: { ...common, status: "withdrawn" }, links: [] };
  }
  return { operation: "upsert", expectedRevision: update.previous,
    record: { ...common, status: "active" }, links: [] };
}

export function createKnowledgeHost(options: {
  service: KnowledgeService;
  store: JsonStore;
  selectedProjectId(): string | undefined;
  sourceForProject(projectId: string): Promise<InstalledGitKnowledgeFeed>;
  nightloom?: NightloomControl;
}) {
  let serial: Promise<unknown> = Promise.resolve();
  let sourceWarning = "";
  const exclusive = <T>(work: () => Promise<T>) => {
    const result = serial.then(work, work); serial = result.catch(() => undefined); return result;
  };
  const loadSource = async (): Promise<SourceState | undefined> => {
    const value = await options.store.get("knowledge-source");
    return value === undefined ? undefined : SourceStateSchema.parse(value);
  };
  const saveSource = (value: SourceState) => options.store.set("knowledge-source", value as unknown as JsonValue);
  async function mappedStatus(base?: LocalKnowledgeStatus): Promise<KnowledgeStatus> {
    const parsed = LocalKnowledgeStatusSchema.parse(base ?? await options.service.status());
    const source = await loadSource();
    const sourceMessages = !source
      ? ["No installed Git source is configured."]
      : !source.enabled
        ? ["Installed Git source collection is stopped."]
        : [];
    if (sourceWarning && !sourceMessages.includes(sourceWarning) && !parsed.message.includes(sourceWarning)) sourceMessages.push(sourceWarning);
    const message = [parsed.message, ...sourceMessages].join(" ");
    let maintenance = parsed.maintenance;
    if (options.nightloom) {
      const state = await options.nightloom.status();
      maintenance = state.available === false
        ? { ...maintenance, state: "unavailable", message: state.message ?? "Automatic maintenance is unavailable.",
          automaticStartsToday: state.budget.automaticStarts, automaticMillisecondsToday: state.budget.automaticReservedMilliseconds }
        : { ...maintenance, state: state.paused ? "paused" : state.active ? "running" : maintenance.state,
          automaticStartsToday: state.budget.automaticStarts, automaticMillisecondsToday: state.budget.automaticReservedMilliseconds };
    } else maintenance = { ...maintenance, state: "unavailable", message: "Automatic maintenance requires the configured Temporal runtime." };
    return KnowledgeStatusSchema.parse({ ...parsed, message: message.slice(0, 1024), ...(source ? { source: { projectId: source.projectId, enabled: source.enabled } } : {}), maintenance });
  }
  async function pollSourceUnlocked(prepared?: InstalledGitKnowledgeFeed): Promise<void> {
    const saved = await loadSource();
    if (!saved) throw Error("No installed Git source is configured");
    if (!saved.enabled) return;
    const feed = prepared ?? await options.sourceForProject(saved.projectId);
    if (feed.sourceId !== saved.sourceId) throw Error("Configured Git source identity changed");
    if (saved.pendingAck) {
      await feed.acknowledge(saved.pendingAck.token);
      await saveSource({ projectId: saved.projectId, sourceId: saved.sourceId, enabled: true });
      return;
    }
    const batch = GitBatchSchema.parse(await feed.changes());
    for (const update of batch.updates) {
      const result = await options.service.ingest(sourceIntake(saved.sourceId, update));
      if (result.kind !== "accepted" && result.kind !== "duplicate") throw Error("Source intake unavailable");
    }
    await saveSource({ ...saved, pendingAck: { token: batch.token } });
    await feed.acknowledge(batch.token);
    await saveSource({ projectId: saved.projectId, sourceId: saved.sourceId, enabled: true });
  }
  async function configureSource(): Promise<void> {
    const projectId = options.selectedProjectId();
    if (!projectId) { sourceWarning = "Choose a project containing the configured Git source."; return; }
    try {
      const prior = await loadSource();
      if (prior?.pendingAck) {
        const priorFeed = await options.sourceForProject(prior.projectId);
        if (priorFeed.sourceId !== prior.sourceId) throw Error("Configured Git source identity changed");
        await priorFeed.acknowledge(prior.pendingAck.token);
        await saveSource({ projectId: prior.projectId, sourceId: prior.sourceId, enabled: prior.enabled });
      }
      const feed = await options.sourceForProject(projectId);
      await saveSource({ projectId, sourceId: feed.sourceId, enabled: true });
      sourceWarning = "";
      await pollSourceUnlocked(feed);
    } catch (error) {
      const expectedFailure = error instanceof Error && (error.message === "Source intake unavailable" || error.message === "Configured Git source identity changed");
      sourceWarning = expectedFailure && error instanceof Error ? error.message : "Installed Git source is unavailable.";
      if (expectedFailure) throw error;
    }
  }
  return {
    reportObservationFailure() { sourceWarning = "A completed tool outcome could not be added to local knowledge; the recorded tool result was preserved."; },
    pollSource: () => exclusive(() => pollSourceUnlocked()),
    async command(raw: unknown): Promise<KnowledgeStatus | SearchResult | EvidenceResult | KnowledgeExportResult> {
      const command: KnowledgeCommand = KnowledgeCommandSchema.parse(raw);
      if (command.action === "search") return options.service.search(command.request);
      if (command.action === "evidence") return options.service.evidence(command.request);
      if (command.action === "export") return options.service.export(command.request);
      return exclusive(async () => {
        if (command.action === "status") return mappedStatus();
        if (command.action === "configure") {
          if ((await options.nightloom?.status())?.active) throw Error("Wait for the active knowledge assessment before changing its configuration");
          const base = await options.service.configure(command.configuration);
          await options.nightloom?.configure?.(command.configuration);
          return mappedStatus(base);
        }
        if (command.action === "source") {
          if (command.enabled) await configureSource();
          else {
            const saved = await loadSource();
            if (saved?.pendingAck) {
              const feed = await options.sourceForProject(saved.projectId);
              if (feed.sourceId !== saved.sourceId) throw Error("Configured Git source identity changed");
              await feed.acknowledge(saved.pendingAck.token);
            }
            if (saved) await saveSource({ projectId: saved.projectId, sourceId: saved.sourceId, enabled: false });
          }
          return mappedStatus();
        }
        if (command.action === "download") return mappedStatus(await options.service.download(command.model));
        if (command.action === "cancel_download") return mappedStatus(await options.service.cancelDownload(command.model));
        if (command.action === "pause") {
          if (options.nightloom) await (command.paused ? options.nightloom.pause() : options.nightloom.resume());
          return mappedStatus();
        }
        if (options.nightloom) await options.nightloom.runNow(command.overrideBudget);
        return mappedStatus();
      });
    },
    async close() { await options.nightloom?.close?.(); await options.service.close(); },
  };
}
