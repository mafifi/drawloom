// Opt-in native proof, isolated from user conversations and working files.
import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createCodexDriver } from "@drawloom/codex-agent";
import { createStdioTransport } from "@drawloom/node-host";
import type { AgentSession, AgentSessionSignal } from "@drawloom/agent";
import type { JsonValue } from "@drawloom/host";
import { finishDisposableCodexThread } from "./codex-thread-cleanup.js";

if (process.env.DRAWLOOM_LIVE_PLANNING !== "1")
  throw Error("Explicit native planning proof required");
const directory = await realpath(await mkdtemp(join(tmpdir(), "drawloom-native-planning-")));
const values = new Map<string, JsonValue>();
const events: AgentSessionSignal[] = [];
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
const waitFor = async (operationId: string) => {
  const until = Date.now() + 90_000;
  while (!events.some((e) => e.kind === "operation.completed" && e.operationId === operationId)) {
    if (
      Date.now() >= until ||
      events.some((e) => e.kind === "operation.failed" && e.operationId === operationId)
    )
      throw Error("Native planning proof did not complete; no submission retried");
    await Bun.sleep(100);
  }
};
try {
  const opened = await driver.openSession({
    sessionId: "disposable-plan-proof",
    context: {
      text: "Disposable text-only integration proof. Do not use tools, access files or network, or change anything.",
    },
    tools: { id: "none", tools: [] },
  });
  if (opened.status !== "ok") throw Error(opened.failure.message);
  session = opened.value;
  assert.ok(session.modes?.includes("plan"));
  const current = session;
  const drain = (async () => {
    for await (const event of current.signals()) events.push(event);
  })();
  assert.equal(
    (
      await session.execute({
        operationId: "planning",
        mode: "plan",
        text: "Produce a final proposed plan with one step: reply with the word READY. Do not execute it yet. No research, questions or tools are necessary.",
      })
    ).status,
    "ok",
  );
  await waitFor("planning");
  const proposal = [...events]
    .reverse()
    .find((e) => e.kind === "plan.proposed" && e.state === "complete");
  assert.ok(proposal?.kind === "plan.proposed" && proposal.text.trim());
  assert.equal(
    (
      await session.execute({
        operationId: "implementation",
        mode: "default",
        text: `Implement this text-only plan; do not use tools:\n\n${proposal.text}`,
      })
    ).status,
    "ok",
  );
  await waitFor("implementation");
  await session.close();
  await drain;
  session = undefined;
  const reopened = await driver.openSession({
    sessionId: "disposable-plan-proof",
    context: { text: "Disposable read-only reconnect." },
    tools: { id: "none", tools: [] },
  });
  if (reopened.status !== "ok") throw Error(reopened.failure.message);
  session = reopened.value;
  assert.ok(session.modes?.includes("plan"));
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
