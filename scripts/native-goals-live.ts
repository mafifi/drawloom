// Opt-in disposable native integration. Never targets a user conversation.
import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createCodexDriver } from "@drawloom/codex-agent";
import { createStdioTransport } from "@drawloom/node-host";
import type { AgentSession, AgentSessionSignal } from "@drawloom/agent";
import type { JsonValue } from "@drawloom/host";
import { finishDisposableCodexThread } from "./codex-thread-cleanup.js";

if (process.env.DRAWLOOM_LIVE_GOALS !== "1") throw Error("Explicit live goals consent required");
const directory = await realpath(await mkdtemp(join(tmpdir(), "drawloom-native-goals-")));
const values = new Map<string, JsonValue>();
const events: AgentSessionSignal[] = [];
const beforeFirstTurn = process.env.DRAWLOOM_LIVE_GOAL_BEFORE_FIRST_TURN === "1";
let threadId: string | undefined;
let session: AgentSession | undefined;
let failure: string | undefined;
const connect = () =>
  createStdioTransport({
    command: resolve("node_modules/.bin/codex"),
    args: ["app-server"],
    cwd: directory,
  });
const driver = createCodexDriver({
  workingDirectory: directory,
  store: {
    async get(key) {
      return values.get(key);
    },
    async set(key, value) {
      values.set(key, value);
    },
  },
  connect: async () => {
    const rpc = connect();
    return {
      ...rpc,
      async request(method, params) {
        const result = await rpc.request(method, params);
        if (method === "thread/start") {
          threadId = (result as { thread: { id: string } }).thread.id;
          await writeFile(join(directory, "receipt.json"), JSON.stringify({ threadId, directory }));
        }
        return result;
      },
    };
  },
});
const waitFor = async (predicate: () => boolean) => {
  const until = Date.now() + 90_000;
  while (!predicate()) {
    if (Date.now() >= until) throw Error("Native proof deadline expired; no submission retried");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
try {
  const opened = await driver.openSession(
    {
      sessionId: "disposable-goal-proof",
      context: {
        text: "This is a disposable integration check. No tools, files, web requests or external actions. Keep replies to one word.",
      },
      tools: { id: "none", tools: [] },
    },
    {
      admitContinuation: async () => ({
        status: "ok",
        value: { operationId: crypto.randomUUID() },
      }),
    },
  );
  if (opened.status !== "ok") throw Error(opened.failure.message);
  session = opened.value;
  const drain = (async () => {
    for await (const event of session!.signals()) events.push(event);
  })();
  if (!beforeFirstTurn) {
    assert.equal(
      (await session.execute({ operationId: "initial", text: "Reply READY." })).status,
      "ok",
    );
    await waitFor(() =>
      events.some(
        (event) => event.kind === "operation.completed" && event.operationId === "initial",
      ),
    );
  }
  assert.ok(session.goals);
  const created = await session.goals.create(
    "Reply VERIFIED once, then mark this goal complete. Do not use any tools or perform external actions.",
  );
  if (created.status !== "ok") throw Error(created.failure.message);
  if (!beforeFirstTurn)
    await waitFor(() =>
      events.some((event) => event.kind === "operation.started" && event.operationId !== "initial"),
    );
  const current = await session.goals.read();
  if (current.status !== "ok" || !current.value) throw Error("Native goal was not readable");
  if (current.value.status === "active") {
    const paused = await session.goals.pause({ revision: current.value.revision });
    if (paused.status !== "ok") throw Error(paused.failure.message);
    assert.equal(paused.value.status, "paused");
  } else throw Error("Goal completed before pause could be verified; no automatic repeat");
  const continuing = events.find(
    (event) => event.kind === "operation.started" && event.operationId !== "initial",
  );
  if (!beforeFirstTurn) assert.ok(continuing && "operationId" in continuing);
  if (continuing && "operationId" in continuing)
    await waitFor(() =>
      events.some(
        (event) =>
          "operationId" in event &&
          event.operationId === continuing.operationId &&
          ["operation.completed", "operation.interrupted", "operation.failed"].includes(event.kind),
      ),
    );
  await session.close();
  await drain;
  session = undefined;
  const reopened = await driver.openSession({
    sessionId: "disposable-goal-proof",
    context: { text: "Disposable check" },
    tools: { id: "none", tools: [] },
  });
  if (reopened.status !== "ok") throw Error(reopened.failure.message);
  session = reopened.value;
  const restored = await session.goals?.read();
  assert.equal(restored?.status, "ok");
  assert.ok(restored?.status === "ok" && restored.value?.status === "paused");
  assert.equal(restored.value.objective, created.value.objective);
  console.log(
    JSON.stringify({
      beforeFirstTurn,
      continuation: Boolean(continuing),
      pause: true,
      restartRead: restored,
      receipt: directory,
    }),
  );
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await session?.close();
  const evidence = { failure, events, directory };
  await writeFile(join(directory, "evidence.json"), JSON.stringify(evidence, null, 2));
  const result = await finishDisposableCodexThread(evidence, {
    ...(threadId ? { threadId } : {}),
    connect: async () => connect(),
  });
  console.log(
    JSON.stringify({
      failure,
      cleanup: result.cleanup,
      evidence: join(directory, "evidence.json"),
    }),
  );
  if (failure || result.cleanup.kind === "failed") process.exitCode = 1;
}
