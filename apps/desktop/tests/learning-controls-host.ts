// Disposable UI fixture: real desktop/server/history, public alternative learning service.
// Does not establish capture, retrieval quality, or provider acceptance.
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDeterministicLearningService } from "@drawloom/replacement-examples";
import { DEFAULT_LOCAL_LEARNING_SCOPE } from "../host/learning-consent.js";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import { createDesktopApplication } from "../host/application.js";
import { serveDesktop } from "../host/server.js";
import { createKnowledgeActivityFixture } from "./knowledge-activity-fixture.js";
import { createAuthorizedKnowledgeFixture } from "./knowledge-authority-fixture.js";

const root = await realpath(await mkdtemp(join(tmpdir(), "drawloom-learning-ui-")));
const work = join(root, "project");
await mkdir(work);
const data = join(root, "data");
const ref = {
  type: "claim" as const,
  origin: "public-example",
  id: "delivery-guidance",
  revision: "2",
};
async function knowledge() {
  if (process.env.DRAWLOOM_UI_LEARNING === "local") return {};
  const service = createDeterministicLearningService({
    subject: { type: "user", id: "public-ui", properties: {} },
    authorizer: {
      async authorize() {
        return { decision: true };
      },
    },
  });
  const result = await service.ingest({
    operation: "upsert",
    expectedRevision: null,
    links: [],
    record: {
      ref,
      body: "Confirm the delivery address before dispatch.",
      status: "active",
      confidence: {},
      provenance: { producer: { type: "fixture", id: "public-example" }, inputs: [] },
      freshness: "current",
    },
  });
  if (result.kind !== "accepted") throw Error("Could not seed public UI fixture");
  return { knowledge: { service, declaration: DEFAULT_LOCAL_LEARNING_SCOPE } };
}
const fixture = createKnowledgeActivityFixture();
// Manual-repeat lane uses real consent, coordinator and curation adapter with a
// completed synthetic workflow; it cannot submit a model call or start Temporal.
if (process.env.DRAWLOOM_UI_MANUAL_REPEAT === "1") {
  const prepareHost = fixture.manager.prepareHost;
  let starts = 0;
  fixture.manager.prepareHost = async (owner) => {
    const registration = await prepareHost(owner);
    return {
      ...registration,
      orchestrator: {
        ...registration.orchestrator,
        start: async () => `manual-repeat-${++starts}`,
        get: async (runId) => ({
          runId,
          identity: runId,
          workflow: "nightloom.maintenance",
          version: "3",
          status: "completed",
          cancellationRequested: false,
          childRunIds: [],
          unresolvedEffects: [],
          pendingInputs: [],
          steps: [],
          stepsTruncated: false,
        }),
        result: async () => ({
          kind: "completed",
          processed: 1,
          remaining: false,
          checkpoint: "done",
        }),
      },
    };
  };
}
let app = await createDesktopApplication(data, {
  ...(await knowledge()),
  orchestration: { manager: async () => fixture.manager },
});
await app.command({ kind: "add_project", directory: work, name: "Learning controls" });
const state = await app.command({
  kind: "create_conversation",
  workbenchId: "text",
  provider: "synthetic",
});
await app.close();
if (process.env.DRAWLOOM_UI_LEARNING === "local") {
  const local = createAuthorizedKnowledgeFixture({
    root: join(data, "knowledge"),
    workingDirectory: root,
  });
  try {
    const seeded = await local.ingest({
      operation: "upsert",
      expectedRevision: null,
      links: [],
      record: {
        ref,
        body: "Confirm the delivery address before dispatch.",
        status: "active",
        confidence: {},
        provenance: { producer: { type: "fixture", id: "public-example" }, inputs: [] },
        freshness: "current",
      },
    });
    if (seeded.kind !== "accepted") throw Error("Could not seed local UI fixture");
  } finally {
    await local.close();
  }
}
const history = createSqliteConversationHistory(join(data, "history.sqlite"));
await history.commit(state.selectedId, {
  expectedRevision: 0,
  entries: [
    {
      id: "learning-disclosure-fixture",
      position: [0, 0],
      role: "user",
      state: "complete",
      text: "Help me prepare the delivery.",
      assets: [],
      preparation: {
        kind: "ready",
        receipt: { executionId: "fixture-execution", submissionId: "fixture-submission" },
        references: [{ ref, status: "active", inclusion: "reference_only" }],
      },
    },
  ],
});
await history.close();
app = await createDesktopApplication(data, {
  ...(await knowledge()),
  orchestration: { manager: async () => fixture.manager },
});
await app.restore();
const host = await serveDesktop(app, resolve("apps/desktop/build"));
console.log(JSON.stringify({ root, url: host.url, origin: host.origin, pid: process.pid }));
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    await host.close();
    await rm(root, { recursive: true, force: true });
    process.exit(0);
  });
