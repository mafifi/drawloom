import { createHash } from "node:crypto";
import type { JsonStore, JsonValue } from "@drawloom/host";
import type {
  AssessmentReconcileRequest,
  AssessmentRequest,
  EvidenceRequest,
  ExpandRequest,
  KnowledgeExportRequest,
  PendingRequestSchema,
  PublicationInput,
  RecordRef,
  SearchRequest,
  TrustedKnowledgeSubject,
  WorkBatchReleaseInput,
} from "@drawloom/knowledge";
import { canonical } from "@drawloom/orchestration";
import type { LocalTemporalRegistration, PrepareHostOwner } from "@drawloom/temporal-orchestration";
import { isLocalExecutionPaused } from "@drawloom/temporal-orchestration";
import {
  createNightloomCoordinator,
  createNightloomTaskHandlers,
  DEFAULT_NIGHTLOOM_SETTINGS,
  NightloomWorkflowResultSchema,
  type NightloomAssessmentReceipt,
  type NightloomCoordinatorState,
} from "@drawloom/nightloom";
import type { z } from "zod";
import type { LocalKnowledgeConfiguration } from "@drawloom/local-knowledge-runtime";

export interface NightloomKnowledgeService {
  maintenanceStatus(): ReturnType<import("@drawloom/knowledge").KnowledgeMaintenance["status"]>;
  maintenancePending(
    value: z.input<typeof PendingRequestSchema>,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeMaintenance["pending"]>;
  maintenancePublish(
    value: PublicationInput,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeMaintenance["publish"]>;
  maintenanceRelease(
    value: WorkBatchReleaseInput,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeMaintenance["release"]>;
  search(
    value: SearchRequest,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeRetrieval["search"]>;
  get(value: RecordRef): ReturnType<import("@drawloom/knowledge").KnowledgeRetrieval["get"]>;
  expand(
    value: ExpandRequest,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeRetrieval["expand"]>;
  evidence(
    value: EvidenceRequest,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeRetrieval["evidence"]>;
  export(
    value: KnowledgeExportRequest,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeRetrieval["export"]>;
  assess(
    value: AssessmentRequest,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeAssessment["assess"]>;
  reconcile(
    value: AssessmentReconcileRequest,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeAssessment["reconcile"]>;
  cancelAssessment(
    value: AssessmentReconcileRequest,
  ): ReturnType<import("@drawloom/knowledge").KnowledgeAssessment["cancel"]>;
}

const subject = Object.freeze({
  type: "user",
  id: "local-owner",
  properties: { locality: "device", scope: "global-knowledge" },
}) as unknown as TrustedKnowledgeSubject;

export function isNightloomKnowledgeService(value: object): value is NightloomKnowledgeService {
  return [
    "maintenanceStatus",
    "maintenancePending",
    "maintenancePublish",
    "maintenanceRelease",
    "get",
    "expand",
    "assess",
    "reconcile",
    "cancelAssessment",
  ].every((name) => typeof Reflect.get(value, name) === "function");
}

export function createKnowledgeNightloom(options: {
  service: NightloomKnowledgeService;
  store: JsonStore;
  packageDirectory: string;
  settings(): Promise<LocalKnowledgeConfiguration>;
  prepareHost(owner: PrepareHostOwner): Promise<LocalTemporalRegistration>;
  /** Trusted host lifetime seam, never browser/model configuration. */
  scheduleTick?(tick: () => Promise<void>, milliseconds: number): () => void;
}) {
  let registration: LocalTemporalRegistration | undefined;
  let coordinator: ReturnType<typeof createNightloomCoordinator> | undefined;
  let preparing:
    | Promise<{ status: "ready" } | { status: "unavailable"; message: string }>
    | undefined;
  let readiness: { status: "ready" } | { status: "unavailable"; message: string } = {
    status: "unavailable",
    message: "Automatic maintenance has not started.",
  };
  let coordinatorSerial: Promise<unknown> = Promise.resolve();
  let receiptSerial: Promise<unknown> = Promise.resolve();
  const serialize = <T>(kind: "coordinator" | "receipt", work: () => Promise<T>) => {
    const prior = kind === "coordinator" ? coordinatorSerial : receiptSerial;
    const result = prior.then(work, work);
    if (kind === "coordinator") coordinatorSerial = result.catch(() => undefined);
    else receiptSerial = result.catch(() => undefined);
    return result;
  };
  const maintenance = {
    status: () => options.service.maintenanceStatus(),
    pending: (_subject: TrustedKnowledgeSubject, request: z.input<typeof PendingRequestSchema>) =>
      options.service.maintenancePending(request),
    publish: (_subject: TrustedKnowledgeSubject, request: PublicationInput) =>
      options.service.maintenancePublish(request),
    release: (_subject: TrustedKnowledgeSubject, request: WorkBatchReleaseInput) =>
      options.service.maintenanceRelease(request),
  };
  const retrieval = {
    search: (_subject: TrustedKnowledgeSubject, request: SearchRequest) =>
      options.service.search(request),
    get: (_subject: TrustedKnowledgeSubject, ref: RecordRef) => options.service.get(ref),
    expand: (_subject: TrustedKnowledgeSubject, request: ExpandRequest) =>
      options.service.expand(request),
    evidence: (_subject: TrustedKnowledgeSubject, request: EvidenceRequest) =>
      options.service.evidence(request),
    export: (_subject: TrustedKnowledgeSubject, request: KnowledgeExportRequest) =>
      options.service.export(request),
  };
  const assessment = {
    assess: (_subject: TrustedKnowledgeSubject, request: AssessmentRequest) =>
      options.service.assess(request),
    reconcile: (_subject: TrustedKnowledgeSubject, request: AssessmentReconcileRequest) =>
      options.service.reconcile(request),
    cancel: (_subject: TrustedKnowledgeSubject, request: AssessmentReconcileRequest) =>
      options.service.cancelAssessment(request),
  };
  const coordinatorStore = {
    async load() {
      return (await options.store.get("knowledge-nightloom-coordinator")) as
        | NightloomCoordinatorState
        | undefined;
    },
    compareAndSet(expectedRevision: number | null, next: NightloomCoordinatorState) {
      return serialize("coordinator", async () => {
        const current = (await options.store.get("knowledge-nightloom-coordinator")) as
          | { revision?: number }
          | undefined;
        if ((current?.revision ?? null) !== expectedRevision) return false;
        await options.store.set("knowledge-nightloom-coordinator", next as unknown as JsonValue);
        return true;
      });
    },
  };
  const receiptKey = (requestId: string) =>
    `knowledge-nightloom-receipt-${createHash("sha256").update(requestId).digest("hex")}`;
  const receipts = {
    async load(requestId: string) {
      return (await options.store.get(receiptKey(requestId))) as
        | NightloomAssessmentReceipt
        | undefined;
    },
    compareAndSet(
      requestId: string,
      expectedRevision: number | null,
      next: NightloomAssessmentReceipt,
    ) {
      return serialize("receipt", async () => {
        const key = receiptKey(requestId);
        const current = (await options.store.get(key)) as { revision?: number } | undefined;
        if ((current?.revision ?? null) !== expectedRevision) return false;
        await options.store.set(key, next as unknown as JsonValue);
        return true;
      });
    },
  };
  async function initialize() {
    if (preparing) return preparing;
    preparing = (async () => {
      try {
        const prepared = await options.prepareHost({
          capabilityId: "knowledge-maintenance",
          packageDirectory: options.packageDirectory,
          entrypoint: "dist/workflows.js",
        });
        const handlers = createNightloomTaskHandlers({
          maintenance,
          retrieval,
          assessment,
          receipts,
          subject,
          isHostSuspension: isLocalExecutionPaused,
          fingerprint: (value) => createHash("sha256").update(canonical(value)).digest("hex"),
        });
        await prepared.attach(handlers);
        registration = prepared;
        const configured = await options.settings();
        coordinator = createNightloomCoordinator({
          orchestrator: prepared.orchestrator,
          maintenance,
          subject,
          store: coordinatorStore,
          readiness: () => {
            const current = prepared.readiness();
            return current.status === "ready"
              ? { status: "ready" }
              : { status: "unavailable", ...(current.code ? { code: current.code } : {}) };
          },
          clock: { now: () => Date.now() },
        });
        await coordinator.configure({
          ...DEFAULT_NIGHTLOOM_SETTINGS,
          assessmentTimeoutMs: configured.assessmentTimeoutMs,
          maxAutomaticStartsPerDay: configured.maxAutomaticStartsPerDay,
          maxAutomaticMillisecondsPerDay: configured.maxAutomaticMillisecondsPerDay,
        });
        readiness = { status: "ready" };
        return readiness;
      } catch (error) {
        const detail = error instanceof Error ? error.message : "";
        const message = /ENOENT|spawn|executable|version/i.test(detail)
          ? "Install a compatible Temporal CLI and Node, or configure their executable paths, then restart Drawloom."
          : /bundle|containment|workflow/i.test(detail)
            ? "The installed knowledge maintenance workflow could not be prepared. Text search remains available."
            : "Automatic maintenance is unavailable. Text search remains available.";
        readiness = { status: "unavailable", message };
        return readiness;
      }
    })();
    return preparing;
  }
  const ready = async () => ((await initialize()).status === "ready" ? coordinator : undefined);
  async function tick() {
    // Old configuration, default model selection and unpaused state are not consent.
    if (!(await options.settings()).automaticCuration) return { kind: "idle" as const };
    const current = await ready();
    return current ? current.tick() : { kind: "unavailable" as const };
  }
  let scheduling = false,
    stopped = false;
  let cancelTick: (() => void) | undefined;
  let ticking: Promise<void> | undefined;
  const scheduleTick =
    options.scheduleTick ??
    ((callback, milliseconds) => {
      const timer = setTimeout(() => {
        void callback();
      }, milliseconds);
      timer.unref?.();
      return () => clearTimeout(timer);
    });
  function schedule() {
    if (stopped) return;
    cancelTick = scheduleTick(async () => {
      cancelTick = undefined;
      if (stopped) return;
      ticking = tick().then(
        () => undefined,
        () => undefined,
      );
      await ticking;
      ticking = undefined;
      schedule();
    }, 1000);
  }
  async function stopScheduling() {
    stopped = true;
    cancelTick?.();
    cancelTick = undefined;
    await ticking;
  }
  return {
    initialize,
    tick,
    startScheduling() {
      if (scheduling || stopped) return;
      scheduling = true;
      schedule();
    },
    stopScheduling,
    async runNow(overrideBudget: boolean) {
      const current = await ready();
      return current ? current.runNow(overrideBudget) : { kind: "unavailable" as const };
    },
    async pause() {
      const current = await ready();
      if (!current)
        throw Error(
          readiness.status === "unavailable"
            ? readiness.message
            : "Automatic maintenance is unavailable.",
        );
      await current.pause();
    },
    async resume() {
      const current = await ready();
      if (!current)
        throw Error(
          readiness.status === "unavailable"
            ? readiness.message
            : "Automatic maintenance is unavailable.",
        );
      await current.resume();
    },
    async configure(config: LocalKnowledgeConfiguration) {
      const current = await ready();
      if (!current)
        throw Error(
          readiness.status === "unavailable"
            ? readiness.message
            : "Automatic maintenance is unavailable.",
        );
      await current.configure({
        ...DEFAULT_NIGHTLOOM_SETTINGS,
        assessmentTimeoutMs: config.assessmentTimeoutMs,
        maxAutomaticStartsPerDay: config.maxAutomaticStartsPerDay,
        maxAutomaticMillisecondsPerDay: config.maxAutomaticMillisecondsPerDay,
      });
    },
    async status() {
      const state = coordinator ? await coordinator.status() : undefined;
      let phase: "idle" | "running" | "uncertain" | "failed" | "unavailable" =
        readiness.status === "ready" ? "idle" : "unavailable";
      let message = readiness.status === "unavailable" ? readiness.message : "";
      const active = state?.active;
      if (active && registration) {
        if (!active.runId) phase = "uncertain";
        else
          try {
            const run = await registration.orchestrator.get(active.runId);
            if (run.unresolvedEffects.length || run.cancellationRequested) phase = "uncertain";
            else if (run.status === "running") phase = "running";
            else if (run.status === "completed") {
              const result = NightloomWorkflowResultSchema.parse(
                await registration.orchestrator.result(run.runId),
              );
              phase =
                result.kind === "completed"
                  ? "idle"
                  : result.kind === "deferred"
                    ? "uncertain"
                    : result.kind === "unavailable"
                      ? "unavailable"
                      : "failed";
            } else phase = "failed";
          } catch {
            phase = "unavailable";
          }
        if (phase === "uncertain")
          message =
            "The assessment outcome is uncertain. Work is held for reconciliation; no replacement assessment has been submitted.";
        else if (phase === "failed")
          message = "Knowledge curation could not finish. Existing knowledge remains available.";
        else if (phase === "unavailable")
          message =
            "The curation status could not be confirmed. Refresh status when the local runtime is available.";
        else if (phase === "running") message = "Knowledge curation is running.";
        else message = "Knowledge curation finished.";
      }
      // The phase is presentation; active remains durable coordinator ownership.
      // Configuration must respect that ownership even after a terminal result.
      return {
        available: readiness.status === "ready",
        state: phase,
        paused: state?.paused ?? false,
        ...(active ? { active } : {}),
        budget: state?.budget ?? { automaticStarts: 0, automaticReservedMilliseconds: 0 },
        ...(message ? { message } : {}),
      };
    },
    async close() {
      await stopScheduling();
      await preparing?.catch(() => undefined);
      await registration?.close();
    },
  };
}
