// Opt-in public browser fixture. All state and content are disposable/synthetic.
import { mkdtemp, mkdir, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import { createDesktopApplication } from "../host/application.js";
import { serveDesktop } from "../host/server.js";
import {
  WorkflowCommandSchema,
  WorkflowReadSchema,
  WorkflowRunSchema,
} from "../src/lib/orchestration-protocol.js";
import { setTimeout as sleep } from "node:timers/promises";

const root = await realpath(await mkdtemp(join(tmpdir(), "drawloom-journeys-")));
const data = join(root, "data");
const writing = join(root, "writing"),
  research = join(root, "research");
await mkdir(writing);
await mkdir(research);
let app = await createDesktopApplication(data);
await app.command({ kind: "add_project", directory: writing, name: "Writing" });
const first = await app.command({
  kind: "create_conversation",
  workbenchId: "text",
  provider: "synthetic",
});
await app.command({
  kind: "send",
  conversationId: first.selectedId,
  text: "A clear introduction for our synthetic writing project.",
  attachmentKeys: [],
  contextArtifactIds: [],
});
for (let i = 0; i < 100 && (await app.snapshot()).activeOperation; i++) await sleep(10);
if ((await app.snapshot()).activeOperation) throw Error("Synthetic operation did not settle");
await app.command({ kind: "add_project", directory: research, name: "Research" });
const second = await app.command({
  kind: "create_conversation",
  workbenchId: "text",
  provider: "synthetic",
});
await app.command({
  kind: "rename_conversation",
  conversationId: second.selectedId,
  title: "Reference notes",
});
await app.close();
const history = createSqliteConversationHistory(join(data, "history.sqlite"));
try {
  for (let offset = 0; offset < 350; offset += 50) {
    await history.commit(second.selectedId, {
      expectedRevision: (await history.status(second.selectedId)).revision,
      entries: Array.from({ length: 50 }, (_, index) => {
        const ordinal = offset + index;
        return {
          id: `reference-${ordinal}`,
          position: [0, ordinal] as const,
          role: ordinal % 2 ? ("assistant" as const) : ("user" as const),
          text:
            ordinal === 120
              ? "The amber lighthouse is the exact older search anchor."
              : `Synthetic reference note ${ordinal}.`,
          state: "complete" as const,
          assets: [],
        };
      }),
    });
  }
} finally {
  await history.close();
}
app = await createDesktopApplication(data);
await app.restore();
// Opt-in presentation fixtures only: no worker, generation, or real execution.
if (process.env.DRAWLOOM_UI_ACTIVITY_FIXTURE === "1") {
  const projectId = (await app.snapshot()).selectedProjectId;
  let run = WorkflowRunSchema.parse({
    runId: "public-review-fixture",
    identity: "public-review",
    workflow: "Prepare reference documents",
    version: "1",
    status: "running",
    cancellationRequested: false,
    pendingInputs: ["review"],
    childRunIds: [],
    unresolvedEffects: [],
    stepsTruncated: false,
    steps: [
      { stepId: "Inspect references", status: "completed", attempts: 1 },
      { stepId: "Prepare draft", status: "completed", attempts: 2 },
    ],
  });
  app.workflowOwners = async (id) =>
    id === projectId
      ? [{ installationId: "public-documents", title: "Documents", readiness: { status: "ready" } }]
      : [];
  const checkOwner = (input: { projectId: string; installationId: string }) => {
    if (input.projectId !== projectId || input.installationId !== "public-documents")
      throw Error("Unknown fixture owner");
  };
  app.workflowRuns = async (raw) => {
    const input = WorkflowReadSchema.parse(raw);
    checkOwner(input);
    return { runs: [run] };
  };
  app.workflowSteps = async (raw) => {
    const input = WorkflowReadSchema.parse(raw);
    checkOwner(input);
    return { steps: run.steps };
  };
  app.workflowCommand = async (raw) => {
    const input = WorkflowCommandSchema.parse(raw);
    checkOwner(input);
    if (input.runId !== run.runId) throw Error("Unknown fixture run");
    if (input.action === "respond")
      throw Error("This is a display fixture; no review was submitted.");
    run = { ...run, cancellationRequested: true };
    return run;
  };
}
const host = await serveDesktop(app, resolve("apps/desktop/build"));
const metadata = {
  root,
  data,
  origin: host.origin,
  url: host.url,
  writingConversationId: first.selectedId,
  researchConversationId: second.selectedId,
};
await writeFile(join(root, "host.json"), JSON.stringify(metadata), { mode: 0o600 });
console.log(JSON.stringify(metadata));
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    if (stopping) return;
    stopping = true;
    await host.close();
    process.exit(0);
  });
