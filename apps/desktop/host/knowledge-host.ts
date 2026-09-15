import { z } from "zod";
import { ContextPreparationRequestSchema, ContextPreparationResultSchema, type ContextPreparationRequest, type ContextPreparationResult, type ContextPreparationSummary } from "@drawloom/context";
import type { JsonStore, JsonValue } from "@drawloom/host";
import {
  type EvidenceRequest, type EvidenceResult, type IntakeInput, type IntakeResult,
  type KnowledgeExportRequest, type KnowledgeExportResult, type SearchRequest, type SearchResult,
} from "@drawloom/knowledge";
import { GitBatchSchema, type GitBatch } from "@drawloom/git-knowledge-source/protocol";
import { LocalKnowledgeStatusSchema, type LocalKnowledgeConfiguration, type LocalKnowledgeStatus } from "@drawloom/local-knowledge-runtime";
import { KnowledgeCommandSchema, KnowledgeStatusSchema, type KnowledgeCommand, type KnowledgeStatus } from "../src/lib/knowledge-protocol.js";

export interface KnowledgeService {
  prepare?(request: ContextPreparationRequest): Promise<ContextPreparationResult>;
  warmup?(): Promise<{ kind: "ready" | "unavailable" }>;
  status(): Promise<LocalKnowledgeStatus>;
  configure(configuration: LocalKnowledgeConfiguration): Promise<LocalKnowledgeStatus>;
  search(request: SearchRequest): Promise<SearchResult>;
  evidence(request: EvidenceRequest): Promise<EvidenceResult>;
  export(request: KnowledgeExportRequest): Promise<KnowledgeExportResult>;
  ingest(input: IntakeInput): Promise<IntakeResult>;
  download(model: LocalKnowledgeConfiguration["embeddingModel"]): Promise<LocalKnowledgeStatus>;
  cancelDownload(model: LocalKnowledgeConfiguration["embeddingModel"]): Promise<LocalKnowledgeStatus>;
  cleanupObsoleteRuntime?(): Promise<LocalKnowledgeStatus>;
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
  status(): Promise<{ available?: boolean; state?: "idle" | "running" | "uncertain" | "failed" | "unavailable"; message?: string; paused: boolean; active?: unknown; budget: { automaticStarts: number; automaticReservedMilliseconds: number } }>;
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
  captureQueues?(): Promise<readonly { conversationId: string; pendingObservations: number }[]>;
  nightloom?: NightloomControl;
  schedulePreparationDeadline?: (expire: () => void, milliseconds: number) => () => void;
}) {
  let serial: Promise<unknown> = Promise.resolve();
  let sourceWarning = "";
  const captureFailures = new Set<string>();
  let contextEpoch = 0;
  let referenceGeneration = new AbortController();
  let automaticSuppressed = false;
  const pendingDisables = new Set<symbol>();
  const preparing = new Map<string, AbortController>();
  const attempted = new Set<string>();
  const invalidatePreparation = () => { contextEpoch++; referenceGeneration.abort(); referenceGeneration = new AbortController(); for (const request of preparing.values()) request.abort(); };
  const assessmentSettings = (c: LocalKnowledgeConfiguration) => JSON.stringify([c.assessmentModel, c.assessmentTimeoutMs, c.maxAutomaticStartsPerDay, c.maxAutomaticMillisecondsPerDay, c.embeddingModel]);
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
    let maintenance = { ...parsed.maintenance, paused: false };
    if (options.nightloom) {
      const state = await options.nightloom.status();
      maintenance = state.available === false
        ? { ...maintenance, paused: state.paused, state: "unavailable", message: state.message ?? "Automatic maintenance is unavailable.",
          automaticStartsToday: state.budget.automaticStarts, automaticMillisecondsToday: state.budget.automaticReservedMilliseconds }
        : { ...maintenance, paused: state.paused, state: state.state === "uncertain" || state.state === "failed" || state.state === "unavailable" ? state.state : state.paused ? "paused" : state.state ?? (state.active ? "running" : maintenance.state),
          ...(state.message ? { message: state.message } : {}),
          automaticStartsToday: state.budget.automaticStarts, automaticMillisecondsToday: state.budget.automaticReservedMilliseconds };
    } else maintenance = { ...maintenance, state: "unavailable", message: "Automatic maintenance requires the configured Temporal runtime." };
    const captureQueues = await options.captureQueues?.() ?? [];
    const pendingByConversation = new Map(captureQueues.map(queue => [queue.conversationId, queue.pendingObservations]));
    const unknownPending = [...captureFailures].some(conversationId => !pendingByConversation.get(conversationId));
    const pendingObservations = [...pendingByConversation.values()].reduce((total, count) => total + count, 0);
    const capture = unknownPending
      ? { state: "pending" as const, pendingObservations: null,
        message: "Tool observations are waiting to be added to local knowledge. Recovery will not rerun the original tools. Reconnect or reopen Drawloom, then refresh status." }
      : pendingObservations
      ? { state: "pending" as const, pendingObservations,
        message: `${pendingObservations} tool observation${pendingObservations === 1 ? " is" : "s are"} waiting to be added to local knowledge. Recovery will not rerun the original tool${pendingObservations === 1 ? "" : "s"}. Reconnect or reopen Drawloom, then refresh status.` }
      : { state: "idle" as const, pendingObservations: 0 as const, message: "" as const };
    return KnowledgeStatusSchema.parse({ ...parsed, message: message.slice(0, 1024), ...(sourceWarning ? { sourceWarning } : {}), capture, ...(source ? { source: {
      projectId: source.projectId, enabled: source.enabled,
      state: !source.enabled ? "stopped" : sourceWarning ? "unavailable" : "ready",
      message: !source.enabled ? "Installed Git source collection is stopped." : sourceWarning,
    } } : {}), maintenance });
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
    if (!projectId) { sourceWarning = "Choose a project containing the configured Git source."; throw Error(sourceWarning); }
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
      throw Error("Installed Git source is unavailable.");
    }
  }
  return {
    get preparationEpoch() { return contextEpoch; },
    get referenceSignal() { return referenceGeneration.signal; },
    /** Admission revokes pending additions; durable configuration stays serialized. */
    suppressAutomaticContext() {
      const intent = Symbol(); pendingDisables.add(intent); invalidatePreparation();
      return () => { pendingDisables.delete(intent); };
    },
    invalidatePreparation,
    warmup() { void options.service.warmup?.().catch(() => undefined); },
    async prepare(raw: Omit<ContextPreparationRequest, "signal">, allowed: () => boolean): Promise<{ summary: ContextPreparationSummary; references?: Extract<ContextPreparationResult, { kind: "ready" }> }> {
      const conversation = raw.binding.conversationId;
      preparing.get(conversation)?.abort();
      const controller = new AbortController(); preparing.set(conversation, controller);
      const epoch = contextEpoch;
      const timeout = attempted.has(conversation) ? 2000 : 5000;
      let timedOut = false;
      const expire = () => { timedOut = true; controller.abort(); };
      const cancelDeadline = options.schedulePreparationDeadline
        ? options.schedulePreparationDeadline(expire, timeout)
        : (() => { const timer = setTimeout(expire, timeout); return () => clearTimeout(timer); })();
      const summary = (kind: ContextPreparationSummary["kind"]) => ({ summary: { kind, references: [] } });
      const work = async () => {
        const configuration = (await options.service.status()).configuration;
        if (controller.signal.aborted || epoch !== contextEpoch) return summary(timedOut ? "timeout" : "cancelled");
        if (pendingDisables.size || automaticSuppressed || !configuration.automaticContext) return summary("disabled");
        if (!allowed()) return summary("denied");
        if (!options.service.prepare) return summary("unavailable");
        const parsed = ContextPreparationRequestSchema.parse(raw);
        attempted.add(conversation);
        const result = ContextPreparationResultSchema.parse(await options.service.prepare({ ...parsed, signal: controller.signal }));
        if (controller.signal.aborted || epoch !== contextEpoch) return summary(timedOut ? "timeout" : "cancelled");
        if (!allowed()) return summary("denied");
        if (result.kind !== "ready") return summary(result.kind);
        if (new TextEncoder().encode(result.text).length !== result.bytes || result.bytes > parsed.budget.maxBytes || result.references.length > parsed.budget.maxRecords) return summary("unavailable");
        return { summary: { kind: "ready" as const, references: result.references }, references: result };
      };
      try {
        return await Promise.race([work().catch(() => summary("unavailable")), new Promise<ReturnType<typeof summary>>(resolve => controller.signal.addEventListener("abort", () => resolve(summary(timedOut ? "timeout" : "cancelled")), { once: true }))]);
      } finally { cancelDeadline(); if (preparing.get(conversation) === controller) preparing.delete(conversation); }
    },
    reportObservationFailure(conversationId: string) { captureFailures.add(conversationId); },
    reportObservationRecovery(conversationId: string) { captureFailures.delete(conversationId); },
    pollSource: () => exclusive(async () => {
      try { await pollSourceUnlocked(); if ((await loadSource())?.enabled) sourceWarning = ""; }
      catch (error) {
        if ((await loadSource())?.enabled) sourceWarning = "Installed Git source is unavailable. Check the configured project and source, then reconnect or reopen Drawloom.";
        throw error;
      }
    }),
    async command(raw: unknown): Promise<KnowledgeStatus | SearchResult | EvidenceResult | KnowledgeExportResult> {
      const command: KnowledgeCommand = KnowledgeCommandSchema.parse(raw);
      if (command.action === "configure") { if (!command.configuration.automaticContext) automaticSuppressed = true; invalidatePreparation(); }
      if (command.action === "search") return options.service.search(command.request);
      if (command.action === "evidence") return options.service.evidence(command.request);
      if (command.action === "export") return options.service.export(command.request);
      return exclusive(async () => {
        if (command.action === "status") return mappedStatus();
        if (command.action === "configure") {
          const prior = (await options.service.status()).configuration;
          const changed = assessmentSettings(prior) !== assessmentSettings(command.configuration);
          if (changed && (await options.nightloom?.status())?.active) throw Error("Wait for the active knowledge assessment before changing its configuration");
          const base = await options.service.configure(command.configuration);
          automaticSuppressed = !base.configuration.automaticContext;
          if (changed) await options.nightloom?.configure?.(command.configuration);
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
            sourceWarning = "";
          }
          return mappedStatus();
        }
        if (command.action === "download") return mappedStatus(await options.service.download(command.model));
        if (command.action === "cancel_download") return mappedStatus(await options.service.cancelDownload(command.model));
        if (command.action === "cleanup_obsolete") {
          if (!options.service.cleanupObsoleteRuntime) throw Error("Previous runtime cleanup is unavailable.");
          return mappedStatus(await options.service.cleanupObsoleteRuntime());
        }
        if (command.action === "pause") {
          if (options.nightloom) await (command.paused ? options.nightloom.pause() : options.nightloom.resume());
          return mappedStatus();
        }
        if (options.nightloom) await options.nightloom.runNow(command.overrideBudget);
        return mappedStatus();
      });
    },
    async close() { invalidatePreparation(); await options.nightloom?.close?.(); await options.service.close(); },
  };
}
