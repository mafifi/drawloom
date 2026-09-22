#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import {
  readProviderState,
  validateRecoveryRoot,
  waitForControl,
  writeProviderState,
  writeReceipt,
} from "./native-recovery-fixture.mjs";

const expectedArguments = [
  "app-server",
  "--stdio",
  "-c",
  "mcp_servers={}",
  "-c",
  "plugins={}",
  "-c",
  "apps={}",
  "--disable",
  "memories",
];
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(expectedArguments)) {
  process.stderr.write("This deterministic fixture supports only app-server --stdio.\n");
  process.exit(2);
}
const root = validateRecoveryRoot(process.env.DRAWLOOM_NATIVE_RECOVERY_ROOT ?? "");
const project = process.env.DRAWLOOM_NATIVE_RECOVERY_PROJECT;
if (!project) throw Error("Missing synthetic recovery project");
let state = (await readProviderState(root)) ?? {
  threadId: `thread-${randomUUID()}`,
  turnId: `turn-${randomUUID()}`,
  startCount: 0,
  mcpCallCount: 0,
};
let drawloom;
let approvalId = 73001;
let closing = false;

function send(value) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...value }) + "\n");
}

async function dispatch(admission) {
  await writeReceipt(root, "turn-admitted", {
    kind: "turn-admitted",
    threadId: state.threadId,
    turnId: state.turnId,
    operationId: admission.operationId,
  });
  state = { ...state, mcpCallCount: state.mcpCallCount + 1 };
  await writeProviderState(root, state);
  if (state.mcpCallCount !== 1) throw Error("Duplicate MCP call");
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...drawloom.http_headers,
  };
  void fetch(drawloom.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: admission.toolName,
        arguments: {
          runId: admission.runId ?? "native-recovery",
          threadId: state.threadId,
          turnId: state.turnId,
          operationId: admission.operationId,
        },
        _meta: {
          callId: `call-${state.turnId}`,
          "x-codex-turn-metadata": {
            thread_id: state.threadId,
            turn_id: state.turnId,
          },
        },
      },
    }),
  }).catch(() => {});
  send({
    id: approvalId,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: state.threadId,
      turnId: state.turnId,
      itemId: `approval-${state.turnId}`,
      command: "printf synthetic-native-recovery",
      cwd: project,
      availableDecisions: ["accept", "decline"],
    },
  });
  await writeReceipt(root, "approval-requested", {
    kind: "approval-requested",
    rpcId: approvalId,
    threadId: state.threadId,
    turnId: state.turnId,
    operationId: admission.operationId,
  });
}

async function request(message) {
  const { id, method, params = {} } = message;
  if (method === "initialized") {
    state = { ...state, initialized: true };
    await writeProviderState(root, state);
    return;
  }
  if (id === undefined) return;
  if (method === "initialize") return send({ id, result: { userAgent: "codex/0.153.4" } });
  if (method === "model/list" || method === "collaborationMode/list")
    return send({ id, result: { data: [], nextCursor: null } });
  if (method === "thread/turns/list") return send({ id, result: { data: [], nextCursor: null } });
  if (method === "thread/start") {
    if (params.cwd !== project)
      return send({ id, error: { code: -32602, message: "Invalid params" } });
    drawloom = params.config?.mcp_servers?.drawloom;
    if (!drawloom?.url || !drawloom?.http_headers)
      return send({ id, error: { code: -32602, message: "Invalid params" } });
    await writeProviderState(root, state);
    return send({
      id,
      result: {
        thread: { id: state.threadId, cwd: project },
        approvalsReviewer: "user",
      },
    });
  }
  if (method === "thread/read") {
    if (params.threadId !== state.threadId)
      return send({ id, error: { code: -32602, message: "Invalid params" } });
    return send({
      id,
      result: {
        thread: {
          id: state.threadId,
          cwd: project,
          ...(params.includeTurns && state.startCount
            ? { turns: [{ id: state.turnId, status: "inProgress", items: [] }] }
            : {}),
        },
      },
    });
  }
  if (method === "thread/resume") {
    if (params.threadId !== state.threadId)
      return send({ id, error: { code: -32602, message: "Invalid params" } });
    drawloom = params.config?.mcp_servers?.drawloom ?? drawloom;
    return send({
      id,
      result: {
        thread: { id: state.threadId, cwd: project },
        approvalsReviewer: "user",
      },
    });
  }
  if (method === "turn/start") {
    if (params.threadId !== state.threadId || state.startCount)
      return send({ id, error: { code: -32602, message: "Invalid params" } });
    state = { ...state, startCount: 1 };
    await writeProviderState(root, state);
    send({ id, result: { turn: { id: state.turnId } } });
    await writeReceipt(root, "turn-start-replied", {
      kind: "turn-start-replied",
      threadId: state.threadId,
      turnId: state.turnId,
      startCount: 1,
    });
    void waitForControl(
      root,
      "admission-release",
      (control) => control.threadId === state.threadId && control.turnId === state.turnId,
    ).then(dispatch);
    return;
  }
  if (method === "turn/interrupt") {
    state = { ...state, interrupted: true };
    await writeProviderState(root, state);
    return send({ id, result: {} });
  }
  send({ id, error: { code: -32601, message: "Method not found" } });
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  void (async () => {
    const message = JSON.parse(line);
    if (message.id === approvalId && message.method === undefined) {
      await writeReceipt(root, "approval-decision", {
        kind: "approval-decision",
        rpcId: approvalId,
        decision: message.result?.decision,
      });
      return;
    }
    await request(message);
  })().catch(() => (process.exitCode = 1));
});
async function terminate(kind) {
  if (closing) return;
  closing = true;
  await writeReceipt(root, "termination", { kind, pid: process.pid });
  process.exit();
}
lines.once("close", () => void terminate("stdio-eof"));
process.once("SIGTERM", () => void terminate("sigterm"));
process.once("SIGINT", () => void terminate("sigint"));
