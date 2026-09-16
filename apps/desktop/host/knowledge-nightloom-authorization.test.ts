import { expect, test } from "bun:test";
import { createKnowledgeNightloom, type NightloomKnowledgeService } from "./knowledge-nightloom.js";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import type { AuthorizationEvaluationOptions } from "@drawloom/authorization";
import type { Orchestrator, RegisteredTaskHandler } from "@drawloom/orchestration";
import type { JsonValue, JsonStore } from "@drawloom/host";
import { createConfirmedLearningPermission } from "../tests/learning-consent-fixture.js";

test.each(
  (
    [
      ["automatic", false, false],
      ["manual", false, false],
      ["automatic", true, false],
      ["manual", true, false],
      ["automatic", false, true],
      ["manual", false, true],
    ] as const
  ).map(([mode, revokeBefore, revokeDuring]) => ({ mode, revokeBefore, revokeDuring })),
)(
  "host Nightloom binds scoped consent across revocation: %j",
  async ({ mode, revokeBefore, revokeDuring }) => {
    let permission!: Awaited<ReturnType<typeof createConfirmedLearningPermission>>;
    const source = {
      ref: { type: "source" as const, origin: "synthetic", id: "note", revision: "r1" },
      body: "Synthetic evidence",
      status: "active" as const,
      confidence: {},
      provenance: { producer: { type: "fixture", id: "test" }, inputs: [] },
    };
    const unavailable = async () => ({ kind: "failure" as const, code: "unavailable" as const });
    const unexpected = async (): Promise<never> => {
      throw Error("Foreground or unrelated operation called");
    };
    let admitted: AuthorizationEvaluationOptions | undefined,
      pages = 0,
      assessed = false;
    const background: NightloomKnowledgeService = {
      maintenanceStatus: async () => ({ kind: "ok", pendingUnits: 50, checkpoint: "public" }),
      maintenancePending: unavailable,
      maintenancePublish: unavailable,
      maintenanceRelease: unavailable,
      search: unexpected,
      get: unexpected,
      expand: unexpected,
      export: unexpected,
      async evidence(_request, operation) {
        expect(operation).toBeDefined();
        admitted ??= operation;
        expect(operation).toBe(admitted);
        pages++;
        if (revokeBefore && pages === 2)
          await permission.preferences({
            automaticCuration: false,
            automaticContext: false,
            captureOutcomes: false,
          });
        return {
          kind: "ok",
          records: [source],
          links: [],
          bytes: 100,
          ...(pages === 1 ? { cursor: "next" as never } : {}),
        };
      },
      async assess(request, operation) {
        expect(operation?.remainingMs).toBe(admitted!.remainingMs);
        expect(operation?.signal.aborted).toBe(false);
        assessed = true;
        if (revokeDuring) {
          await permission.preferences({
            automaticCuration: false,
            automaticContext: false,
            captureOutcomes: false,
          });
          expect(operation!.signal.aborted).toBe(mode === "automatic");
          if (mode === "automatic")
            return {
              kind: "cancelled",
              requestId: request.requestId,
              payloadFingerprint: request.payloadFingerprint,
            };
        }
        return {
          kind: "completed",
          requestId: request.requestId,
          payloadFingerprint: request.payloadFingerprint,
          proposals: [],
        };
      },
      reconcile: unexpected,
      cancelAssessment: unexpected,
    };
    const service = { ...background, evidence: unexpected, assess: unexpected, background };
    let handlers: readonly RegisteredTaskHandler[] = [];
    const values = new Map<string, JsonValue>();
    const engine: Orchestrator = {
      start: async () => "public-run",
      get: unexpected,
      getSteps: unexpected,
      list: unexpected,
      result: unexpected,
      respond: unexpected,
      cancel: unexpected,
    };
    const store: JsonStore = {
      get: async (key) => values.get(key),
      set: async (key, value) => {
        values.set(key, value);
      },
    };
    permission = await createConfirmedLearningPermission(store, {
      automaticCuration: mode === "automatic",
      automaticContext: false,
      captureOutcomes: false,
    });
    const nightloom = createKnowledgeNightloom({
      service,
      store,
      permission,
      packageDirectory: "/synthetic",
      settings: async () => DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
      prepareHost: async () => ({
        orchestrator: engine,
        registry: { workflows: [], tasks: [] },
        readiness: () => ({ status: "ready" }),
        attach: async (value) => {
          handlers = value;
        },
        close: async () => {},
      }),
    });
    try {
      expect(await nightloom.initialize()).toEqual({ status: "ready" });
      expect((await (mode === "manual" ? nightloom.runNow(true) : nightloom.tick())).kind).toBe(
        "started",
      );
      const signal = new AbortController().signal;
      const result = await handlers
        .find((handler) => handler.id === "nightloom.assess-batch")!
        .run(
          {
            batch: { id: "batch", checkpoint: "checkpoint" },
            units: [{ id: "one", update: { ref: source.ref, operation: "upsert" } }],
            maxBytes: 8192,
            assessmentTimeoutMs: 1000,
          },
          {
            taskVersion: "1",
            runId: "run",
            stepId: "assess",
            attemptId: "attempt",
            attempt: 1,
            signal,
          },
        );
      expect(result).toEqual(
        revokeDuring && mode === "automatic"
          ? { kind: "blocked", reason: "cancelled" }
          : revokeBefore && mode === "automatic"
            ? { kind: "blocked", reason: "denied" }
            : { kind: "completed", proposals: [] },
      );
      expect(pages).toBe(2);
      expect(assessed).toBe(!(revokeBefore && mode === "automatic"));
      expect(admitted!.signal).toBe(signal);
    } finally {
      await nightloom.close();
    }
  },
);
