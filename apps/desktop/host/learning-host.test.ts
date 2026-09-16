import { expect, test } from "bun:test";
import { createDeterministicLearningService } from "@drawloom/replacement-examples";
import { createKnowledgeHost } from "./knowledge-host.js";
import { createLearningConsentStore, DEFAULT_LOCAL_LEARNING_SCOPE } from "./learning-consent.js";
import { createLearningPermission } from "./learning-permission.js";
import type { JsonStore, JsonValue } from "@drawloom/host";
import { learningConformance } from "@drawloom/knowledge/learning-conformance";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAuthorizedKnowledgeFixture } from "../tests/knowledge-authority-fixture.js";
import { createLocalLearningService } from "./local-learning.js";
import { createDesktopApplication } from "./application.js";

const contribution = {
  operation: "upsert" as const,
  expectedRevision: null,
  record: {
    ref: { type: "source" as const, origin: "public-fixture", id: "note", revision: "r1" },
    body: "Conformance retained evidence",
    status: "active" as const,
    confidence: {},
    provenance: { producer: { type: "test", id: "public" }, inputs: [] },
  },
  links: [],
};
function conformance(service: import("@drawloom/knowledge/learning").LearningService) {
  return learningConformance({
    service,
    contribution,
    search: { query: "Conformance", mode: "lexical", limit: 5, maxBytes: 4096 },
    evidence: {
      root: contribution.record.ref,
      direction: "forward",
      maxLinks: 8,
      maxRecords: 8,
      maxDepth: 2,
      maxBytes: 4096,
    },
    export: { refs: [contribution.record.ref], format: "okf", maxBytes: 4096 },
  });
}
test("local and contrasting learning implementations pass the same retained-record conformance", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-learning-conformance-"));
  const local = createLocalLearningService(
    createAuthorizedKnowledgeFixture({ root, workingDirectory: root }),
  );
  const contrasting = fixture().service;
  try {
    await conformance(local);
    await conformance(contrasting);
  } finally {
    await local.close();
    await contrasting.close();
    await rm(root, { recursive: true, force: true });
  }
});
test("actual desktop composes the contrasting service without local setup or local scheduling", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-learning-host-"));
  const service = fixture().service;
  const app = await createDesktopApplication(root, {
    knowledge: {
      service,
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
      scheduleNightloomTick: () => {
        throw Error("alternative must not start local scheduler");
      },
    },
  });
  try {
    await app.restore();
    expect(await app.localLearningSetupCommand({ action: "status" })).toEqual({
      kind: "unavailable",
    });
    expect(await app.knowledgeCommand({ action: "status" })).toMatchObject({
      availability: "ready",
      retrieval: "lexical",
    });
    expect(await service.ingest(contribution)).toMatchObject({ kind: "accepted" });
    expect(
      await app.knowledgeCommand({
        action: "search",
        request: { query: "Conformance", mode: "lexical", limit: 5, maxBytes: 4096 },
      }),
    ).toMatchObject({ kind: "ok", items: [{ record: { body: contribution.record.body } }] });
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

function fixture() {
  const values = new Map<string, JsonValue>();
  const store: JsonStore = {
    get: async (key) => values.get(key),
    set: async (key, value) => {
      values.set(key, value);
    },
  };
  const service = createDeterministicLearningService({
    subject: { type: "user", id: "example", properties: {} },
    authorizer: { authorize: async () => ({ decision: true }) },
  });
  const permission = createLearningPermission(
    createLearningConsentStore({ store, declaration: DEFAULT_LOCAL_LEARNING_SCOPE }),
  );
  const host = createKnowledgeHost({
    service,
    store,
    permission,
    selectedProjectId: () => undefined,
    sourceForProject: async () => {
      throw Error("not configured");
    },
  });
  return { host, service, permission };
}
test("a contrasting learning provider powers shared host status without local setup", async () => {
  const { host } = fixture();
  const status = await host.command({ action: "status" });
  expect(status).toMatchObject({
    availability: "ready",
    retrieval: "lexical",
    consent: { features: { automaticContext: { state: "disabled" } } },
  });
  expect(status).not.toHaveProperty("models");
  expect(status).not.toHaveProperty("configuration");
  expect(await host.command({ action: "run", overrideBudget: false })).toEqual({
    kind: "unavailable",
  });
  expect(await host.command({ action: "pause", paused: true })).toEqual({ kind: "unavailable" });
  expect(await host.warmup()).toEqual({ kind: "unavailable" });
  await host.close();
});
test("preference enablement alone cannot authorize context preparation", async () => {
  const { host } = fixture();
  await host.command({
    action: "preferences",
    preferences: { automaticContext: true, captureOutcomes: false, automaticCuration: false },
  });
  expect(await host.command({ action: "status" })).toMatchObject({
    consent: { features: { automaticContext: { state: "consent_required" } } },
  });
  expect(
    await host.prepare(
      {
        request: "query",
        binding: { executionId: "run", conversationId: "thread" },
        budget: { maxRecords: 8, maxBytes: 12288 },
      },
      () => true,
    ),
  ).toMatchObject({ summary: { kind: "disabled" } });
  await host.close();
});
