import { expect, test } from "bun:test";
import type { JsonStore, JsonValue } from "@drawloom/host";
import type { LocalTemporalRegistration } from "@drawloom/temporal-orchestration";
import type { Orchestrator, RegisteredTaskHandler } from "@drawloom/orchestration";
import { createKnowledgeNightloom, type NightloomKnowledgeService } from "./knowledge-nightloom.js";

function memoryStore(): JsonStore {
  const values = new Map<string, JsonValue>();
  return { async get(key) { return values.get(key); }, async set(key, value) { values.set(key, structuredClone(value)); } };
}

test("Nightloom registers once as a host capability and attaches only its bounded handlers", async () => {
  const starts: string[] = [];
  const engine: Orchestrator = {
    async start(identity) { starts.push(identity); return `host/${identity}`; },
    async get(runId) { return { runId, identity: "identity", workflow: "nightloom.maintenance", version: "1", status: "running", cancellationRequested: false, childRunIds: [], unresolvedEffects: [], stepsTruncated: false, pendingInputs: [], steps: [] }; },
    async getSteps() { return { steps: [] }; }, async list() { return { runs: [] }; }, async result() { return {}; }, async respond() {}, async cancel() {},
  };
  const attached: RegisteredTaskHandler[][] = [];
  const registration: LocalTemporalRegistration = { orchestrator: engine, registry: { workflows: [], tasks: [] }, readiness: () => ({ status: "ready" }),
    async attach(handlers) { attached.push([...handlers]); }, async close() {} };
  const owners: unknown[] = [];
  const service = {
    async maintenanceStatus() { return { kind: "ok" as const, pendingUnits: 50, checkpoint: "status" }; },
    async maintenancePending() { return { kind: "failure" as const, code: "unavailable" as const }; },
    async maintenancePublish() { return { kind: "failure" as const, code: "unavailable" as const }; },
    async maintenanceRelease() { return { kind: "failure" as const, code: "unavailable" as const }; },
    async search() { return { kind: "failure" as const, code: "unavailable" as const }; },
    async get() { return { kind: "failure" as const, code: "unavailable" as const }; },
    async expand() { return { kind: "failure" as const, code: "unavailable" as const }; },
    async evidence() { return { kind: "failure" as const, code: "unavailable" as const }; },
    async export() { return { kind: "failure" as const, code: "unavailable" as const }; },
    async assess(value) { return { kind: "failure" as const, requestId: value.requestId, payloadFingerprint: value.payloadFingerprint, code: "unavailable" as const }; },
    async reconcile(value) { return { kind: "failure" as const, requestId: value.requestId, payloadFingerprint: value.payloadFingerprint, code: "unavailable" as const }; },
    async cancelAssessment(value) { return { kind: "failure" as const, requestId: value.requestId, payloadFingerprint: value.payloadFingerprint, code: "unavailable" as const }; },
  } satisfies NightloomKnowledgeService;
  const nightloom = createKnowledgeNightloom({ service, store: memoryStore(), packageDirectory: "/installed/nightloom",
    settings: async () => ({ embeddingModel: "qwen3-embedding-0.6b-mlx", assessmentModel: "gpt-5.6-terra", assessmentTimeoutMs: 300_000, maxAutomaticStartsPerDay: 6, maxAutomaticMillisecondsPerDay: 1_800_000 }),
    prepareHost: async owner => { owners.push(owner); return registration; } });
  expect(await nightloom.initialize()).toEqual({ status: "ready" });
  expect(await nightloom.initialize()).toEqual({ status: "ready" });
  expect(owners).toEqual([{ capabilityId: "knowledge-maintenance", packageDirectory: "/installed/nightloom", entrypoint: "dist/workflows.js" }]);
  expect(attached).toHaveLength(1);
  expect(attached[0]?.map(handler => handler.id).sort()).toEqual(["nightloom.assess-batch", "nightloom.pending", "nightloom.publish", "nightloom.release"]);
  expect((await nightloom.tick()).kind).toBe("started");
  expect(starts).toHaveLength(1);
  await nightloom.close();
});
