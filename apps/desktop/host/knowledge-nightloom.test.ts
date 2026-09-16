import { createAuthorizedKnowledgeFixture as createManagedLocalKnowledgeClient } from "../tests/knowledge-authority-fixture.js";
import { expect, test } from "bun:test";
import type { JsonStore, JsonValue } from "@drawloom/host";
import type { LocalTemporalRegistration } from "@drawloom/temporal-orchestration";
import type { Orchestrator, RegisteredTaskHandler } from "@drawloom/orchestration";
import { createKnowledgeNightloom, type NightloomKnowledgeService } from "./knowledge-nightloom.js";
import { createLocalLearningSetup, createLocalLearningSetupHost } from "./local-learning.js";
import { createConfirmedLearningPermission } from "../tests/learning-consent-fixture.js";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

function memoryStore(): JsonStore {
  const values = new Map<string, JsonValue>();
  return {
    async get(key) {
      return values.get(key);
    },
    async set(key, value) {
      values.set(key, structuredClone(value));
    },
  };
}

test("Nightloom registers once as a host capability and attaches only its bounded handlers", async () => {
  const starts: string[] = [];
  let phase: "running" | "completed" | "failed" = "running";
  let unresolved = false;
  let deferred = false;
  const engine: Orchestrator = {
    async start(identity) {
      starts.push(identity);
      return `host/${identity}`;
    },
    async get(runId) {
      return {
        runId,
        identity: "identity",
        workflow: "nightloom.maintenance",
        version: "1",
        status: phase,
        cancellationRequested: false,
        childRunIds: [],
        unresolvedEffects: unresolved ? ["assessment"] : [],
        stepsTruncated: false,
        pendingInputs: [],
        steps: [],
      };
    },
    async getSteps() {
      return { steps: [] };
    },
    async list() {
      return { runs: [] };
    },
    async result(): Promise<JsonValue> {
      if (deferred) return { kind: "deferred", processed: 0, remaining: true };
      return { kind: "completed", processed: 1, remaining: false, checkpoint: "done" };
    },
    async respond() {},
    async cancel() {},
  };
  const attached: RegisteredTaskHandler[][] = [];
  const registration: LocalTemporalRegistration = {
    orchestrator: engine,
    registry: { workflows: [], tasks: [] },
    readiness: () => ({ status: "ready" }),
    async attach(handlers) {
      attached.push([...handlers]);
    },
    async close() {},
  };
  const owners: unknown[] = [];
  const service = {
    async maintenanceStatus() {
      return { kind: "ok" as const, pendingUnits: 50, checkpoint: "status" };
    },
    async maintenancePending() {
      return { kind: "failure" as const, code: "unavailable" as const };
    },
    async maintenancePublish() {
      return { kind: "failure" as const, code: "unavailable" as const };
    },
    async maintenanceRelease() {
      return { kind: "failure" as const, code: "unavailable" as const };
    },
    async search() {
      return { kind: "failure" as const, code: "unavailable" as const };
    },
    async get() {
      return { kind: "failure" as const, code: "unavailable" as const };
    },
    async expand() {
      return { kind: "failure" as const, code: "unavailable" as const };
    },
    async evidence() {
      return { kind: "failure" as const, code: "unavailable" as const };
    },
    async export() {
      return { kind: "failure" as const, code: "unavailable" as const };
    },
    async assess(value) {
      return {
        kind: "failure" as const,
        requestId: value.requestId,
        payloadFingerprint: value.payloadFingerprint,
        code: "unavailable" as const,
      };
    },
    async reconcile(value) {
      return {
        kind: "failure" as const,
        requestId: value.requestId,
        payloadFingerprint: value.payloadFingerprint,
        code: "unavailable" as const,
      };
    },
    async cancelAssessment(value) {
      return {
        kind: "failure" as const,
        requestId: value.requestId,
        payloadFingerprint: value.payloadFingerprint,
        code: "unavailable" as const,
      };
    },
  } satisfies NightloomKnowledgeService;
  const coordinatorStore = memoryStore();
  const permission = await createConfirmedLearningPermission(memoryStore(), {
    automaticCuration: true,
    automaticContext: false,
    captureOutcomes: false,
  });
  const nightloom = createKnowledgeNightloom({
    service,
    store: coordinatorStore,
    permission,
    packageDirectory: "/installed/nightloom",
    settings: async () => ({
      automaticContext: false,
      captureOutcomes: false,
      automaticCuration: true,
      embeddingModel: "qwen3-embedding-0.6b-gguf",
      assessmentModel: "gpt-5.6-terra",
      assessmentTimeoutMs: 300_000,
      maxAutomaticStartsPerDay: 6,
      maxAutomaticMillisecondsPerDay: 1_800_000,
    }),
    prepareHost: async (owner) => {
      owners.push(owner);
      return registration;
    },
  });
  expect(await nightloom.initialize()).toEqual({ status: "ready" });
  expect(await nightloom.initialize()).toEqual({ status: "ready" });
  expect(owners).toEqual([
    {
      capabilityId: "knowledge-maintenance",
      packageDirectory: "/installed/nightloom",
      entrypoint: "dist/workflows.js",
    },
  ]);
  expect(attached).toHaveLength(1);
  expect(attached[0]?.map((handler) => handler.id).sort()).toEqual([
    "nightloom.assess-batch",
    "nightloom.pending",
    "nightloom.publish",
    "nightloom.release",
  ]);
  const started = await nightloom.tick();
  expect(started.kind).toBe("started");
  if (started.kind !== "started") throw Error("Expected the initial Nightloom run to start");
  expect(starts).toHaveLength(1);
  expect(await nightloom.status()).toMatchObject({ state: "running" });
  phase = "failed";
  unresolved = true;
  expect(await nightloom.status()).toMatchObject({ state: "uncertain" });
  unresolved = false;
  expect(await nightloom.status()).toMatchObject({ state: "failed" });
  phase = "completed";
  deferred = true;
  expect(await nightloom.status()).toMatchObject({ state: "uncertain" });
  deferred = false;
  expect(await nightloom.status()).toMatchObject({ state: "idle" });
  expect((await nightloom.status()).active).toMatchObject({
    state: "started",
    runId: started.runId,
  });
  expect(starts).toHaveLength(1);
  const root = await mkdtemp(join(tmpdir(), "drawloom-terminal-settings-"));
  const client = createManagedLocalKnowledgeClient({
    root: join(root, "knowledge"),
    workingDirectory: root,
  });
  const host = createLocalLearningSetupHost(createLocalLearningSetup(client, nightloom));
  try {
    const before = await coordinatorStore.get("knowledge-nightloom-coordinator");
    for (const changed of [
      { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, assessmentTimeoutMs: 60_000 },
      { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION, maxAutomaticStartsPerDay: 3 },
    ]) {
      await expect(host.command({ action: "configure", configuration: changed })).rejects.toThrow();
      expect((await client.status()).configuration).toEqual(DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION);
      expect(await coordinatorStore.get("knowledge-nightloom-coordinator")).toEqual(before);
      expect(starts).toHaveLength(1);
    }
  } finally {
    await nightloom.close();
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("owned scheduling is serial, default-off, pause-aware and stopped before close", async () => {
  let configuration = { ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION };
  let starts = 0,
    closes = 0;
  let phase: "running" | "completed" = "running";
  let scheduled: (() => Promise<void>) | undefined;
  let releaseStatus: (() => void) | undefined;
  const unavailable = async () => ({ kind: "failure" as const, code: "unavailable" as const });
  const service: NightloomKnowledgeService = {
    async maintenanceStatus() {
      if (releaseStatus)
        await new Promise<void>((resolve) => {
          releaseStatus = resolve;
        });
      return { kind: "ok", pendingUnits: 50, checkpoint: "status" };
    },
    maintenancePending: unavailable,
    maintenancePublish: unavailable,
    maintenanceRelease: unavailable,
    search: unavailable,
    get: unavailable,
    expand: unavailable,
    evidence: unavailable,
    export: unavailable,
    async assess() {
      throw Error("external double must not be submitted by fake workflow");
    },
    async reconcile() {
      throw Error("external double must not be called by fake workflow");
    },
    async cancelAssessment() {
      throw Error("external double must not be cancelled by fake workflow");
    },
  };
  const engine: Orchestrator = {
    async start(identity) {
      starts++;
      return `host/${identity}`;
    },
    async get(runId) {
      return {
        runId,
        identity: "same",
        workflow: "nightloom.maintenance",
        version: "3",
        status: phase,
        cancellationRequested: false,
        childRunIds: [],
        unresolvedEffects: [],
        stepsTruncated: false,
        pendingInputs: [],
        steps: [],
      };
    },
    async result() {
      return { kind: "completed", processed: 1, remaining: false, checkpoint: "done" };
    },
    async getSteps() {
      return { steps: [] };
    },
    async list() {
      return { runs: [] };
    },
    async respond() {},
    async cancel() {},
  };
  const permission = await createConfirmedLearningPermission(memoryStore());
  const host = createKnowledgeNightloom({
    permission,
    service,
    store: memoryStore(),
    packageDirectory: "/public/double",
    settings: async () => configuration,
    scheduleTick(callback) {
      expect(scheduled).toBeUndefined();
      scheduled = callback;
      return () => {
        scheduled = undefined;
      };
    },
    prepareHost: async () => ({
      orchestrator: engine,
      registry: { workflows: [], tasks: [] },
      readiness: () => ({ status: "ready" }),
      async attach() {},
      async close() {
        closes++;
      },
    }),
  });
  const fire = async () => {
    const callback = scheduled!;
    scheduled = undefined;
    await callback();
  };
  host.startScheduling();
  host.startScheduling();
  await fire();
  expect(starts).toBe(0);
  configuration = { ...configuration, automaticCuration: true };
  await permission.preferences({
    automaticContext: false,
    captureOutcomes: false,
    automaticCuration: true,
  });
  await fire();
  expect(starts).toBe(1);
  await fire();
  expect(starts).toBe(1);
  phase = "completed";
  configuration = { ...configuration, automaticCuration: false };
  await permission.preferences({
    automaticContext: false,
    captureOutcomes: false,
    automaticCuration: false,
  });
  await fire();
  expect(starts).toBe(1);
  configuration = { ...configuration, automaticCuration: true };
  await permission.preferences({
    automaticContext: false,
    captureOutcomes: false,
    automaticCuration: true,
  });
  await host.pause();
  await fire();
  expect(starts).toBe(1);
  await host.resume();
  releaseStatus = () => {};
  const pending = fire();
  for (let count = 0; count < 10; count++) await Promise.resolve();
  const closing = host.close();
  await Promise.resolve();
  expect(closes).toBe(0);
  releaseStatus();
  await pending;
  await closing;
  expect(closes).toBe(1);
  expect(scheduled).toBeUndefined();
  host.startScheduling();
  expect(scheduled).toBeUndefined();
});
