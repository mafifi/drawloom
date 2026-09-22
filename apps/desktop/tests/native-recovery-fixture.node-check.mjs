import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createRecoveryMcpServer } from "./native-recovery-mcp.mjs";
import {
  assertRecoveryReceipts,
  createRecoveryLayout,
  discoverOperationId,
  prepareRecoveryPackage,
  readReceipt,
  recordNativeLaunch,
  startSetupHost,
  verifyNativeCleanup,
  writeControl,
  writeReceipt,
} from "./native-recovery-fixture.mjs";

const codex = new URL("./native-recovery-codex.mjs", import.meta.url);

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw Error(message);
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function provider(root, project) {
  const child = spawn(
    process.execPath,
    [
      codex.pathname,
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
    ],
    {
      env: {
        PATH: process.env.PATH,
        DRAWLOOM_NATIVE_RECOVERY_ROOT: root,
        DRAWLOOM_NATIVE_RECOVERY_PROJECT: project,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const messages = [];
  createInterface({ input: child.stdout }).on("line", (line) => messages.push(JSON.parse(line)));
  let id = 0;
  const request = async (method, params = {}) => {
    const current = ++id;
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: current, method, params }) + "\n");
    return waitFor(
      () => messages.find((message) => message.id === current),
      `Provider did not answer ${method}`,
    );
  };
  const notify = (method, params) => {
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method, ...(params === undefined ? {} : { params }) }) +
        "\n",
    );
  };
  const respond = (id, result) =>
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  return { child, messages, notify, request, respond };
}

test("synthetic provider resumes one in-progress turn without redispatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-recovery-test-"));
  const project = join(root, "project");
  try {
    await createRecoveryLayout(root);
    const first = provider(root, project);
    assert.deepEqual((await first.request("initialize")).result, {
      userAgent: "codex/0.153.4",
    });
    first.notify("initialized");
    const opened = await first.request("thread/start", {
      cwd: project,
      config: {
        mcp_servers: {
          drawloom: {
            url: "http://127.0.0.1:1",
            http_headers: { Authorization: "Bearer secret" },
          },
        },
      },
    });
    assert.equal(opened.result.thread.cwd, project);
    assert.deepEqual(
      (
        await first.request("thread/memoryMode/set", {
          threadId: opened.result.thread.id,
          mode: "disabled",
        })
      ).result,
      {},
    );
    const started = await first.request("turn/start", {
      threadId: opened.result.thread.id,
    });
    assert.ok(started.result.turn.id);
    first.child.stdin.end();
    await once(first.child, "exit");

    const second = provider(root, project);
    const read = await second.request("thread/read", {
      threadId: opened.result.thread.id,
      includeTurns: true,
    });
    assert.equal(read.result.thread.turns[0].status, "inProgress");
    const resumed = await second.request("thread/resume", {
      threadId: opened.result.thread.id,
    });
    assert.equal(resumed.result.thread.id, opened.result.thread.id);
    const unsupported = await second.request("account/read");
    assert.equal(unsupported.error.code, -32601);
    second.child.stdin.end();
    await once(second.child, "exit");

    const state = await json(join(root, "provider-state", "state.json"));
    assert.equal(state.initialized, true);
    assert.equal(state.startCount, 1);
    assert.equal(state.startAttemptCount, 1);
    assert.doesNotMatch(JSON.stringify(state), /Bearer secret|127\.0\.0\.1:1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("stale approval response is ignored by a resumed provider transport", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-recovery-test-"));
  const project = join(root, "project");
  await createRecoveryLayout(root);
  const mcp = await createRecoveryMcpServer(root);
  let first, second;
  try {
    first = provider(root, project);
    await first.request("initialize");
    first.notify("initialized");
    const opened = await first.request("thread/start", {
      cwd: project,
      config: { mcp_servers: { drawloom: { url: mcp.url, http_headers: {} } } },
    });
    const started = await first.request("turn/start", { threadId: opened.result.thread.id });
    await writeControl(root, "admission-release", {
      threadId: opened.result.thread.id,
      turnId: started.result.turn.id,
      operationId: "operation-stale",
      toolName: "hold",
    });
    const old = await waitFor(
      () => first.messages.find((message) => message.method?.endsWith("requestApproval")),
      "Approval was not requested",
    );
    first.child.kill("SIGTERM");
    await once(first.child, "exit");
    second = provider(root, project);
    await second.request("initialize");
    second.respond(old.id, { decision: "accept" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(await readReceipt(root, "approval-decision"), undefined);
    assert.equal(await readReceipt(root, "effect-finished"), undefined);
    const duplicate = await second.request("turn/start", { threadId: opened.result.thread.id });
    assert.equal(duplicate.error.code, -32602);
    const state = await json(join(root, "provider-state", "state.json"));
    assert.equal(state.startCount, 1);
    assert.equal(state.startAttemptCount, 2);
  } finally {
    for (const p of [first, second]) {
      if (p?.child.exitCode === null) {
        p.child.kill("SIGTERM");
        await once(p.child, "exit");
      }
    }
    await mcp.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("admission emits one MCP call and one unresolved approval request", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-recovery-test-"));
  const project = join(root, "project");
  await createRecoveryLayout(root);
  const mcp = await createRecoveryMcpServer(root);
  let p;
  try {
    await writeReceipt(root, "launch", {
      kind: "launch",
      fixtureCase: "kill-host",
      shellPid: process.pid,
      hostPid: process.pid,
    });
    p = provider(root, project);
    await p.request("initialize");
    p.notify("initialized");
    const opened = await p.request("thread/start", {
      cwd: project,
      config: {
        mcp_servers: {
          drawloom: {
            url: mcp.url,
            http_headers: { Authorization: "Bearer never-persist" },
          },
        },
      },
    });
    const started = await p.request("turn/start", {
      threadId: opened.result.thread.id,
    });
    await writeControl(root, "admission-release", {
      threadId: opened.result.thread.id,
      turnId: started.result.turn.id,
      operationId: "operation-fixed",
      toolName: "hold",
    });
    const approval = await waitFor(
      () =>
        p.messages.find((message) => message.method === "item/commandExecution/requestApproval"),
      "Provider did not request native approval",
    );
    assert.equal(typeof approval.id, "number");
    assert.deepEqual(approval.params.availableDecisions, ["accept", "decline"]);
    const effect = await waitFor(
      () => readReceipt(root, "effect-started"),
      "MCP effect did not start",
    );
    assert.equal(effect.operationId, "operation-fixed");
    assert.equal(await readReceipt(root, "effect-finished"), undefined);
    assert.equal(await readReceipt(root, "approval-decision"), undefined);
    assert.doesNotMatch(
      await readFile(join(root, "receipts", "turn-admitted.json"), "utf8"),
      /never-persist|Authorization|127\.0\.0\.1/,
    );
    p.child.kill("SIGTERM");
    await once(p.child, "exit");
    await assertRecoveryReceipts(root, { phase: "pending" });
    assert.equal((await readReceipt(root, "termination")).kind, "sigterm");
  } finally {
    if (p && p.child.exitCode === null) {
      p.child.kill("SIGTERM");
      await once(p.child, "exit");
    }
    await mcp.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("holding MCP tool finishes only after the exact release control", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-recovery-test-"));
  await createRecoveryLayout(root);
  const mcp = await createRecoveryMcpServer(root);
  try {
    const request = (method, params, id) =>
      fetch(mcp.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
    assert.equal((await request("initialize", {}, 1)).status, 200);
    const pending = request(
      "tools/call",
      {
        name: "hold",
        arguments: {
          runId: "run",
          threadId: "thread",
          turnId: "turn",
          operationId: "operation",
        },
      },
      2,
    );
    await waitFor(() => readReceipt(root, "effect-started"), "Effect did not start");
    assert.equal(await readReceipt(root, "effect-finished"), undefined);
    await writeControl(root, "effect-release", { operationId: "wrong" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(await readReceipt(root, "effect-finished"), undefined);
    await writeControl(root, "effect-release", { operationId: "operation" });
    assert.equal((await pending).status, 200);
    assert.equal((await readReceipt(root, "effect-finished")).operationId, "operation");
  } finally {
    await mcp.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture layout rejects broad or non-disposable roots", async () => {
  await assert.rejects(() => createRecoveryLayout("/"), /fixture root/);
  const root = await mkdtemp(join(tmpdir(), "unrelated-"));
  try {
    await assert.rejects(() => createRecoveryLayout(root), /fixture root/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fixture project uses one canonical path through a symlinked root spelling", async () => {
  const parent = await mkdtemp(join(tmpdir(), "drawloom-native-parent-"));
  const target = join(parent, "drawloom-native-recovery-target");
  const alias = join(tmpdir(), `drawloom-native-recovery-alias-${process.pid}`);
  try {
    await mkdir(target);
    await symlink(target, alias);
    const layout = await createRecoveryLayout(alias);
    assert.equal(layout.root, await realpath(target));
    assert.equal(layout.project, await realpath(join(target, "project")));
  } finally {
    await rm(alias, { force: true });
    await rm(parent, { recursive: true, force: true });
  }
});

test("prepared fixture uses a standard package and PATH-selected codex executable", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-recovery-test-"));
  try {
    const layout = await createRecoveryLayout(root);
    await prepareRecoveryPackage(root, "http://127.0.0.1:43123/mcp");
    assert.deepEqual(await json(join(layout.package, "plugin.json")), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "native-recovery-fixture",
    });
    assert.deepEqual(await json(join(layout.package, "mcp.json")), {
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        recovery: {
          type: "streamable-http",
          url: "http://127.0.0.1:43123/mcp",
        },
      },
    });
    const shim = await readFile(join(layout.bin, "codex"), "utf8");
    assert.match(shim, /^#!\/bin\/sh\nexec /);
    assert.doesNotMatch(shim, /DRAWLOOM_HOST_BIN|Bearer/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("operation discovery reads only the exact fixture conversation and fails on ambiguity", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-recovery-test-"));
  try {
    const layout = await createRecoveryLayout(root);
    const database = new DatabaseSync(join(layout.data, "history.sqlite"));
    database.exec(
      "CREATE TABLE history_entries (conversation_id TEXT NOT NULL, operation_id TEXT);",
    );
    const insert = database.prepare(
      "INSERT INTO history_entries(conversation_id, operation_id) VALUES (?, ?)",
    );
    insert.run("fixture-conversation", "operation-exact");
    insert.run("somebody-else", "operation-foreign");
    database.close();
    assert.equal(await discoverOperationId(root, "fixture-conversation"), "operation-exact");
    const again = new DatabaseSync(join(layout.data, "history.sqlite"));
    again
      .prepare("INSERT INTO history_entries(conversation_id, operation_id) VALUES (?, ?)")
      .run("fixture-conversation", "operation-ambiguous");
    again.close();
    await assert.rejects(
      () => discoverOperationId(root, "fixture-conversation"),
      /exactly one operation identity/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("setup host readiness failure closes its exact spawned process", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-recovery-test-"));
  try {
    const layout = await createRecoveryLayout(root);
    const app = join(root, "Synthetic.app");
    const runtime = join(app, "Contents", "Resources", "host", "host");
    await mkdir(runtime, { recursive: true });
    await symlink(process.execPath, join(runtime, "node"));
    await writeFile(
      join(runtime, "main.mjs"),
      `import { writeFileSync } from "node:fs";
writeFileSync(new URL("provider-state/setup-host-pid", "file://" + process.env.DRAWLOOM_NATIVE_RECOVERY_ROOT + "/"), String(process.pid));
process.stdin.resume();
process.stdin.once("end", () => process.exit(0));
setInterval(() => {}, 1000);
`,
    );
    await assert.rejects(
      () => startSetupHost(root, app, { readinessTimeoutMs: 50 }),
      /readiness timed out/,
    );
    const pid = Number(await readFile(join(layout.providerState, "setup-host-pid"), "utf8"));
    assert.throws(
      () => process.kill(pid, 0),
      (error) => error.code === "ESRCH",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("native cleanup receipt reports an exact lingering descendant", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-native-recovery-test-"));
  let shell, hostPid, childPid;
  try {
    const layout = await createRecoveryLayout(root);
    const hostScript = join(root, "host.mjs");
    const shellScript = join(root, "shell.mjs");
    await writeFile(
      hostScript,
      `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
writeFileSync(process.argv[2], String(child.pid));
setInterval(() => {}, 1000);
`,
    );
    await writeFile(
      shellScript,
      `import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const host = spawn(process.execPath, [process.argv[2], process.argv[4]], { stdio: "ignore" });
writeFileSync(process.argv[3], String(host.pid));
setInterval(() => {}, 1000);
`,
    );
    const hostPidFile = join(root, "host-pid");
    const childPidFile = join(root, "child-pid");
    shell = spawn(process.execPath, [shellScript, hostScript, hostPidFile, childPidFile], {
      stdio: "ignore",
    });
    hostPid = Number(
      await waitFor(async () => readFile(hostPidFile, "utf8").catch(() => ""), "host pid"),
    );
    childPid = Number(
      await waitFor(async () => readFile(childPidFile, "utf8").catch(() => ""), "child pid"),
    );
    const launch = await recordNativeLaunch(root, {
      fixtureCase: "kill-host",
      shellPid: shell.pid,
      hostPid,
      shellExecutable: process.execPath,
      hostExecutable: process.execPath,
    });
    assert.ok(launch.descendants.some((entry) => entry.pid === childPid));
    shell.kill("SIGTERM");
    await once(shell, "exit");
    process.kill(hostPid, "SIGTERM");
    await waitFor(() => {
      try {
        process.kill(hostPid, 0);
        return false;
      } catch (error) {
        return error.code === "ESRCH";
      }
    }, "host exit");
    await assert.rejects(() => verifyNativeCleanup(root, { timeoutMs: 50 }), /unresolved PIDs/);
    const cleanup = await readReceipt(root, "cleanup");
    assert.equal(cleanup.success, false);
    assert.deepEqual(cleanup.unresolvedPids, [childPid]);
    process.kill(childPid, "SIGKILL");
    await waitFor(() => {
      try {
        process.kill(childPid, 0);
        return false;
      } catch (error) {
        return error.code === "ESRCH";
      }
    }, "child exit");
    assert.deepEqual(await verifyNativeCleanup(root, { timeoutMs: 50 }), {
      kind: "cleanup",
      success: true,
      unresolvedPids: [],
    });
    childPid = undefined;
  } finally {
    for (const pid of [hostPid, childPid]) {
      if (!pid) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    if (shell?.exitCode === null) shell.kill("SIGKILL");
    await rm(root, { recursive: true, force: true });
  }
});
