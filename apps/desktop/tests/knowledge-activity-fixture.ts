import type { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import type { RunSnapshot } from "@drawloom/orchestration";
import type { NightloomKnowledgeService } from "../host/knowledge-nightloom.js";

/** Synthetic, read-only workflow history; no model or runtime is started. */
export function createKnowledgeActivityFixture() {
  const calls = { prepared: 0, attached: 0, started: 0, reads: 0 };
  const run: RunSnapshot = {
    runId: "synthetic-nightloom-run",
    identity: "synthetic-request",
    workflow: "nightloom.maintenance",
    version: "2",
    status: "completed",
    steps: [
      {
        stepId: "synthetic-nightloom-run/assess-50",
        attempts: 1,
        status: "completed",
        result: { content: "RAW_EVIDENCE_SENTINEL" },
      },
    ],
    output: { content: "RAW_OUTPUT_SENTINEL" },
    pendingInputs: [],
    childRunIds: [],
    unresolvedEffects: [],
    cancellationRequested: false,
    stepsTruncated: true,
  };
  const manager: ReturnType<typeof createLocalTemporalManager> = {
    prepare: async () => {
      throw Error("No plugin fixture registered");
    },
    prepareHost: async (owner) => {
      if (owner.capabilityId !== "knowledge-maintenance") throw Error("Wrong owner");
      calls.prepared++;
      return {
        registry: { workflows: [], tasks: [] },
        readiness: () => ({ status: "ready" }),
        attach: async () => {
          calls.attached++;
        },
        close: async () => {},
        orchestrator: {
          start: async () => {
            calls.started++;
            throw Error("Fixture cannot start");
          },
          list: async (input) => {
            calls.reads++;
            return { runs: [run], ...(input?.cursor ? {} : { cursor: "older" }) };
          },
          get: async (id) => {
            if (id !== run.runId) throw Error("UNKNOWN_RUN_SENTINEL");
            calls.reads++;
            return run;
          },
          getSteps: async (_id, input) => ({
            steps: input?.cursor
              ? [{ stepId: "synthetic-nightloom-run/publish", attempts: 1, status: "completed" }]
              : run.steps,
            ...(input?.cursor ? {} : { cursor: "later-steps" }),
          }),
          result: async () => ({ kind: "deferred", processed: 0, remaining: true }),
          cancel: async () => {
            throw Error("Fixture cannot cancel");
          },
          respond: async () => {
            throw Error("Fixture cannot respond");
          },
        },
      };
    },
    listOwners: async () => [],
    listHostOwners: async () => [],
    hasUnfinishedInstallation: async () => false,
    close: async () => {},
  };
  return { manager, calls };
}

export const syntheticNightloomMethods = {
  maintenanceStatus: async () => ({ kind: "ok", pendingUnits: 0, checkpoint: "empty" }),
  maintenancePending: async () => ({ kind: "failure", code: "unavailable" }),
  maintenancePublish: async () => ({ kind: "failure", code: "unavailable" }),
  maintenanceRelease: async () => ({ kind: "failure", code: "unavailable" }),
  get: async () => ({ kind: "failure", code: "unavailable" }),
  expand: async () => ({ kind: "failure", code: "unavailable" }),
  assess: async (input) => ({
    kind: "failure",
    code: "unavailable",
    requestId: input.requestId,
    payloadFingerprint: input.payloadFingerprint,
  }),
  reconcile: async (input) => ({
    kind: "failure",
    code: "unavailable",
    requestId: input.requestId,
    payloadFingerprint: input.payloadFingerprint,
  }),
  cancelAssessment: async (input) => ({
    kind: "failure",
    code: "unavailable",
    requestId: input.requestId,
    payloadFingerprint: input.payloadFingerprint,
  }),
} satisfies Omit<NightloomKnowledgeService, "search" | "evidence" | "export">;
