// Opt-in, synthetic disposable integration. Never opens a user conversation.
import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  createCodexDriver,
  createCodexToolBridge,
} from "../packages/agent/codex-agent/src/index.ts";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { defineTool } from "@drawloom/tools";
import { toolAuthorizationFixture } from "@drawloom/tools/conformance";
import {
  codexCommand,
  createStdioTransport,
  createNodeJsonStore,
  createMcpToolServer,
} from "@drawloom/node-host";
import type { AgentSession, AgentSessionSignal, AgentDelegation } from "@drawloom/agent";
import { mcpReviewConfiguration } from "../apps/desktop/host/composition.ts";
import { finishDisposableCodexThread } from "./codex-thread-cleanup.ts";

if (process.env.DRAWLOOM_LIVE_DELEGATION !== "1")
  throw Error("Explicit native proof consent required");
const directory = await realpath(await mkdtemp(join(tmpdir(), "drawloom-native-delegation-")));
const identities = new Set<string>();
const admitted = new Map<string, string>();
const signals: AgentSessionSignal[] = [];
const wire: { method: string; threadId?: string; turnId?: unknown }[] = [];
const calls: string[] = [];
const interruptProof = process.env.DRAWLOOM_LIVE_INTERRUPT === "1";
let forkVerified = false,
  reconnectVerified = false;
let nativeSubmissions = 0;
let session: AgentSession | undefined;
let forkSource: AgentSession | undefined;
let failure: string | undefined;
let drain: Promise<void> | undefined;
const gateway = createLocalToolGateway({
  tools: [
    defineTool({
      name: "test.observe",
      description: "Read a synthetic integration-check value. No files or external effects.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      input: z.strictObject({}),
      output: z.strictObject({ value: z.string() }),
      execute: () => {
        calls.push("observed");
        return { value: "SYNTHETIC_OK" };
      },
    }),
  ],
  authorization: toolAuthorizationFixture({
    authorize: async () => ({ decision: true }),
  }),
  nextInvocationId: () => crypto.randomUUID(),
  evidence: { async record() {} },
});
const bridge = createCodexToolBridge(gateway);
const mcp = await createMcpToolServer({
  exposure: gateway.exposure,
  invoke: (metadata, name, args, signal) => bridge.call(metadata, name, args, signal),
});
const connect = () => createStdioTransport({ ...codexCommand(), cwd: directory });
const driver = createCodexDriver({
  workingDirectory: directory,
  store: createNodeJsonStore(join(directory, "state")),
  connect: async () => {
    const rpc = connect();
    return {
      ...rpc,
      async request(method, params) {
        if (method === "turn/start") nativeSubmissions++;
        const result = await rpc.request(method, params);
        if (method === "thread/start" || method === "thread/fork") {
          const id = z.object({ thread: z.object({ id: z.string() }) }).parse(result).thread.id;
          identities.add(id);
          await writeFile(
            join(directory, "receipt.json"),
            JSON.stringify({ identities: [...identities], directory }),
          );
        }
        return result;
      },
      subscribe(next, failed) {
        return rpc.subscribe((message) => {
          const p = z.record(z.string(), z.unknown()).safeParse(message.params);
          wire.push({
            method: message.method,
            ...(p.success && typeof p.data.threadId === "string"
              ? { threadId: p.data.threadId, turnId: p.data.turnId }
              : {}),
          });
          next(message);
        }, failed);
      },
    };
  },
  projection: (exposure) => ({
    drawloom: {
      url: mcp.url,
      http_headers: { Authorization: `Bearer ${mcp.token}` },
      ...mcpReviewConfiguration(exposure),
      // Exercise native review even though the synthetic tool is read-only.
      tools: { "test.observe": { approval_mode: "prompt" } },
    },
  }),
  onTurnAccepted(thread, turn, operation) {
    bridge.publish(thread, turn, gateway.bind(operation));
  },
  onTurnFinished(thread, turn) {
    bridge.retire(thread, turn);
  },
});
const waitFor = async (predicate: () => boolean) => {
  const deadline = Date.now() + 120_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw Error("Native proof deadline expired; no submission retried");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
};
try {
  const opened = await driver.openSession(
    {
      sessionId: "disposable-delegation-proof",
      context: {
        text: "Disposable integration check. Use native delegation and the single drawloom MCP test.observe tool only. No files, shell, web, installs, media or other external actions. Never retry a denied action.",
      },
      tools: gateway.exposure,
    },
    {
      admitChild: async (child) => {
        const operationId = `child-${crypto.randomUUID()}`;
        admitted.set(child.childId, operationId);
        return { status: "ok", value: { operationId } };
      },
    },
  );
  if (opened.status !== "ok") throw Error(opened.failure.message);
  session = opened.value;
  drain = (async () => {
    for await (const event of session!.signals()) {
      signals.push(event);
      if (event.kind === "approval.requested") {
        const choice = event.request.options.find((option) => option.label === "Approve once");
        if (![...admitted.values()].includes(event.request.operationId) || !choice)
          throw Error("Approval did not belong to an admitted child MCP request");
        if (interruptProof) {
          const listed = await session!.delegations!.list();
          assert.equal(listed.status, "ok");
          const child: AgentDelegation | undefined =
            listed.status === "ok"
              ? listed.value.find((item) => item.operationId === event.request.operationId)
              : undefined;
          assert.ok(child);
          assert.equal(
            (await session!.delegations!.interrupt({ id: child.id, revision: child.revision }))
              .status,
            "ok",
          );
          continue;
        }
        assert.equal(
          (
            await session!.resolveApproval({
              approvalId: event.request.approvalId,
              optionId: choice.optionId,
            })
          ).status,
          "ok",
        );
      }
    }
  })();
  // Observe failure immediately rather than leave a rejected pump unhandled.
  let pumpFailure: unknown;
  void drain.catch((error) => {
    pumpFailure = error;
  });
  assert.equal(
    (
      await session.execute({
        operationId: "parent-proof",
        text: "Delegate exactly one small task using your native delegation tool: ask the child to discover and call drawloom test.observe exactly once with {}, then report the returned value. Do not call test.observe yourself. Wait for that child and report its result. If delegation is unavailable, say so and stop. Do not use any other tools except native child management and discovery needed to find test.observe.",
      })
    ).status,
    "ok",
  );
  await waitFor(
    () =>
      Boolean(pumpFailure) ||
      signals.some((event) =>
        interruptProof
          ? event.kind === "operation.interrupted" && event.operationId !== "parent-proof"
          : event.kind === "operation.completed" && event.operationId === "parent-proof",
      ),
  );
  if (pumpFailure) throw pumpFailure;
  if (interruptProof) {
    // Child interruption is not parent cancellation. End this test's separate
    // parent wait explicitly, without changing the product lifecycle.
    assert.ok(session.interrupt);
    assert.equal((await session.interrupt("parent-proof")).status, "ok");
    await waitFor(() =>
      signals.some(
        (event) => event.kind === "operation.interrupted" && event.operationId === "parent-proof",
      ),
    );
  }
  assert.ok(admitted.size > 0, "No native child operation was admitted");
  assert.equal(
    calls.length,
    interruptProof ? 0 : 1,
    "Only approved child work may reach the gateway",
  );
  assert.ok(
    signals.some((event) => event.kind === "approval.requested"),
    "Child approval not observed",
  );
  assert.ok(session.delegations);
  const children = await session.delegations.list();
  assert.equal(children.status, "ok");
  assert.ok(
    children.status === "ok" &&
      children.value.some((child) =>
        interruptProof ? child.status === "interrupted" : child.result.state === "available",
      ),
  );
  const emptyHistory = { checkpoint: async () => undefined, get: async () => undefined };
  assert.ok(session.history);
  const sourceHistory = await session.history.read(emptyHistory, {
    direction: "latest",
    limit: 200,
  });
  assert.equal((await session.close()).status, "ok");
  await drain;
  drain = undefined;
  const settings = {
    sessionId: "disposable-delegation-proof",
    context: { text: "Disposable verification. Do not execute any work without explicit input." },
    tools: gateway.exposure,
  };
  const reopened = await driver.openSession(settings, {
    admitChild: async () => {
      throw Error("Completed child work must not be recreated on reconnect");
    },
  });
  if (reopened.status !== "ok") throw Error(reopened.failure.message);
  session = reopened.value;
  session.signals();
  const restored = await session.delegations!.list();
  assert.equal(restored.status, "ok");
  assert.ok(restored.status === "ok" && restored.value.length > 0);
  reconnectVerified = true;
  const beforeFork = nativeSubmissions;
  const fork = await session.forks!.create({
    requestId: "fork-proof",
    sessionId: "disposable-independent-fork",
  });
  assert.equal(fork.status, "ok");
  assert.ok(fork.status === "ok" && fork.value.state === "created");
  assert.deepEqual(await session.forks!.read("fork-proof"), fork);
  forkSource = session;
  const independent = await driver.openSession({
    ...settings,
    sessionId: "disposable-independent-fork",
  });
  if (independent.status !== "ok") throw Error(independent.failure.message);
  session = independent.value;
  session.signals();
  const goal = await session.goals!.read();
  assert.deepEqual(goal, { status: "ok", value: null });
  assert.ok(session.history);
  const forkHistory = await session.history.read(emptyHistory, { direction: "latest", limit: 200 });
  assert.deepEqual(
    forkHistory.entries.map((entry) => entry.id),
    sourceHistory.entries.map((entry) => entry.id),
  );
  assert.equal(nativeSubmissions, beforeFork, "Forking and reopening cannot submit a turn");
  forkVerified = true;
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  const closed = await session?.close();
  const sourceClosed = await forkSource?.close();
  await drain?.catch((error) => {
    failure ??= String(error);
  });
  await mcp.close();
  await writeFile(
    join(directory, "evidence.json"),
    JSON.stringify(
      {
        failure,
        interruptProof,
        forkVerified,
        reconnectVerified,
        calls,
        admitted: [...admitted],
        signals,
        wire,
      },
      null,
      2,
    ),
  );
  const cleanups = [];
  if ((!session || closed?.status === "ok") && (!forkSource || sourceClosed?.status === "ok"))
    for (const threadId of identities)
      cleanups.push(
        (await finishDisposableCodexThread({}, { threadId, connect: async () => connect() }))
          .cleanup,
      );
  else failure ??= "Owner connection closure unconfirmed; cleanup deferred";
  await writeFile(join(directory, "cleanup.json"), JSON.stringify(cleanups, null, 2));
  console.log(
    JSON.stringify({
      failure,
      calls: calls.length,
      children: admitted.size,
      interruptProof,
      forkVerified,
      reconnectVerified,
      directory,
      cleanups,
    }),
  );
  if (failure || cleanups.some((item) => item.kind === "failed")) process.exitCode = 1;
}
