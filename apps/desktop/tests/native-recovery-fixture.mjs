import { randomUUID } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import {
  chmod,
  mkdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { createRecoveryMcpServer } from "./native-recovery-mcp.mjs";

const rootPrefix = "drawloom-native-recovery-";
const receiptNames = new Set([
  "approval-decision",
  "approval-requested",
  "cleanup",
  "effect-finished",
  "effect-started",
  "host-stdio-closed",
  "launch",
  "setup",
  "termination",
  "turn-admitted",
  "turn-start-replied",
]);
const controlNames = new Set(["admission-release", "effect-release"]);
const execFileAsync = promisify(execFile);

export function validateRecoveryRoot(root) {
  const absolute = resolve(root);
  if (absolute === "/" || !basename(absolute).startsWith(rootPrefix))
    throw Error(`Invalid native recovery fixture root; use a disposable ${rootPrefix}* directory`);
  return absolute;
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  await rename(temporary, path);
}

export async function createRecoveryLayout(root) {
  const absolute = validateRecoveryRoot(root);
  for (const name of [
    "bin",
    "controls",
    "data",
    "package",
    "project",
    "provider-state",
    "receipts",
  ])
    await mkdir(join(absolute, name), { recursive: true });
  const canonical = await realpath(absolute);
  return {
    root: canonical,
    bin: join(canonical, "bin"),
    controls: join(canonical, "controls"),
    data: join(canonical, "data"),
    package: join(canonical, "package"),
    project: join(canonical, "project"),
    providerState: join(canonical, "provider-state"),
    receipts: join(canonical, "receipts"),
  };
}

export async function prepareRecoveryPackage(root, mcpUrl) {
  const layout = await createRecoveryLayout(root);
  const parsed = new URL(mcpUrl);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/mcp")
    throw Error("Synthetic recovery MCP URL must be loopback HTTP /mcp");
  await writeFile(
    join(layout.package, "plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "native-recovery-fixture",
    }) + "\n",
  );
  await writeFile(
    join(layout.package, "mcp.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: { recovery: { type: "streamable-http", url: parsed.href } },
    }) + "\n",
  );
  const provider = new URL("./native-recovery-codex.mjs", import.meta.url).pathname;
  const quoted = provider.replaceAll("'", "'\\''");
  const shim = join(layout.bin, "codex");
  await writeFile(shim, `#!/bin/sh\nexec node '${quoted}' "$@"\n`, {
    mode: 0o700,
  });
  await chmod(shim, 0o700);
  return layout;
}

export async function writeReceipt(root, name, value) {
  if (!receiptNames.has(name)) throw Error("Invalid native recovery receipt name");
  await atomicJson(join(validateRecoveryRoot(root), "receipts", `${name}.json`), value);
}

export async function readReceipt(root, name) {
  if (!receiptNames.has(name)) throw Error("Invalid native recovery receipt name");
  try {
    return JSON.parse(
      await readFile(join(validateRecoveryRoot(root), "receipts", `${name}.json`), "utf8"),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function writeControl(root, name, value) {
  if (!controlNames.has(name)) throw Error("Invalid native recovery control name");
  await atomicJson(join(validateRecoveryRoot(root), "controls", `${name}.json`), value);
}

export async function readControl(root, name) {
  if (!controlNames.has(name)) throw Error("Invalid native recovery control name");
  try {
    return JSON.parse(
      await readFile(join(validateRecoveryRoot(root), "controls", `${name}.json`), "utf8"),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function waitForControl(root, name, accepts) {
  for (;;) {
    const value = await readControl(root, name);
    if (value && accepts(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export async function writeProviderState(root, value) {
  await atomicJson(join(validateRecoveryRoot(root), "provider-state", "state.json"), value);
}

export async function readProviderState(root) {
  try {
    return JSON.parse(
      await readFile(join(validateRecoveryRoot(root), "provider-state", "state.json"), "utf8"),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function assertRecoveryReceipts(root, { phase }) {
  const launch = await readReceipt(root, "launch");
  const admitted = await readReceipt(root, "turn-admitted");
  const started = await readReceipt(root, "effect-started");
  const approval = await readReceipt(root, "approval-requested");
  if (!launch || !admitted || !started || !approval) throw Error("Pending barriers are incomplete");
  if (
    admitted.threadId !== started.threadId ||
    admitted.turnId !== started.turnId ||
    admitted.operationId !== started.operationId ||
    admitted.threadId !== approval.threadId ||
    admitted.turnId !== approval.turnId
  )
    throw Error("Pending barrier identities do not match");
  if (await readReceipt(root, "effect-finished")) throw Error("Effect was guessed terminal");
  if (await readReceipt(root, "approval-decision")) throw Error("Approval was already decided");
  const state = await readProviderState(root);
  if (state?.startCount !== 1 || state?.startAttemptCount !== 1 || state?.mcpCallCount !== 1)
    throw Error("Expected exactly one turn and one MCP dispatch");
  if (phase === "terminated") {
    if (!(await readReceipt(root, "termination"))) throw Error("Missing termination receipt");
    if ((await readReceipt(root, "cleanup"))?.success !== true)
      throw Error("Successful exact-PID cleanup receipt is required");
  }
  return {
    threadId: admitted.threadId,
    turnId: admitted.turnId,
    operationId: admitted.operationId,
  };
}

export async function discoverOperationId(root, conversationId) {
  const { DatabaseSync } = await import("node:sqlite");
  const database = new DatabaseSync(join(validateRecoveryRoot(root), "data", "history.sqlite"), {
    readOnly: true,
  });
  try {
    const rows = database
      .prepare(
        "SELECT DISTINCT operation_id FROM history_entries WHERE conversation_id = ? AND operation_id IS NOT NULL",
      )
      .all(conversationId);
    if (rows.length !== 1 || typeof rows[0].operation_id !== "string" || !rows[0].operation_id)
      throw Error("Expected exactly one operation identity for the fixture conversation");
    return rows[0].operation_id;
  } finally {
    database.close();
  }
}

async function processRows() {
  const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,ppid="]);
  return stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter(([pid, ppid]) => Number.isSafeInteger(pid) && Number.isSafeInteger(ppid))
    .map(([pid, ppid]) => ({ pid, ppid }));
}

async function processIdentity(pid) {
  const { stdout } = await execFileAsync("/bin/ps", [
    "-p",
    String(pid),
    "-o",
    "ppid=",
    "-o",
    "comm=",
  ]);
  const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(stdout);
  if (!match) throw Error(`Recorded process ${pid} is unavailable`);
  // macOS ps reports the executable path as `comm`. Linux reports the thread
  // name instead (Node's main thread is "MainThread"), so read /proc there.
  const executable = process.platform === "linux" ? `/proc/${pid}/exe` : match[2];
  return { pid, ppid: Number(match[1]), executable: await realpath(executable) };
}

function descendants(rootPid, rows) {
  const found = [];
  const parents = [rootPid];
  while (parents.length) {
    const parent = parents.shift();
    for (const row of rows) {
      if (row.ppid !== parent || found.some((entry) => entry.pid === row.pid)) continue;
      found.push(row);
      parents.push(row.pid);
    }
  }
  return found;
}

export async function recordNativeLaunch(root, input) {
  const shell = await processIdentity(input.shellPid);
  const host = await processIdentity(input.hostPid);
  if (host.ppid !== shell.pid)
    throw Error("Bundled host is not a direct child of the native shell");
  if (shell.executable !== (await realpath(input.shellExecutable)))
    throw Error("Native shell executable identity does not match");
  if (host.executable !== (await realpath(input.hostExecutable)))
    throw Error("Bundled host executable identity does not match");
  const children = descendants(shell.pid, await processRows());
  if (!children.some((entry) => entry.pid === host.pid))
    throw Error("Bundled host is not in the native shell process tree");
  const receipt = {
    kind: "launch",
    fixtureCase: input.fixtureCase,
    shellPid: shell.pid,
    hostPid: host.pid,
    descendants: children.map(({ pid, ppid }) => ({ pid, ppid })),
  };
  await writeReceipt(root, "launch", receipt);
  return receipt;
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

export async function verifyNativeCleanup(root, { timeoutMs = 15_000 } = {}) {
  const launch = await readReceipt(root, "launch");
  if (!launch) throw Error("Launch receipt is required before cleanup verification");
  const pids = [
    ...new Set([launch.shellPid, launch.hostPid, ...launch.descendants.map((entry) => entry.pid)]),
  ];
  const deadline = Date.now() + timeoutMs;
  let unresolved;
  do {
    unresolved = pids.filter(alive);
    if (!unresolved.length) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  } while (Date.now() < deadline);
  const receipt = {
    kind: "cleanup",
    success: unresolved.length === 0,
    unresolvedPids: unresolved,
  };
  await writeReceipt(root, "cleanup", receipt);
  if (!receipt.success)
    throw Error(`Native fixture cleanup has ${unresolved.length} unresolved PIDs`);
  return receipt;
}

function option(arguments_, name, required = true) {
  const position = arguments_.indexOf(`--${name}`);
  const value = position < 0 ? undefined : arguments_[position + 1];
  if (required && (!value || value.startsWith("--"))) throw Error(`Missing --${name}`);
  return value;
}

export async function startSetupHost(root, app, { readinessTimeoutMs = 60_000 } = {}) {
  const layout = await createRecoveryLayout(root);
  const resources = join(resolve(app), "Contents", "Resources");
  const node = join(resources, "host", "host", "node");
  const main = join(resources, "host", "host", "main.mjs");
  if (!(await stat(node)).isFile() || !(await stat(main)).isFile())
    throw Error("The supplied app lacks the bundled host runtime");
  const child = spawn(node, [main], {
    cwd: layout.root,
    env: {
      PATH: [layout.bin, dirname(node), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":"),
      ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
      DRAWLOOM_DATA_DIR: layout.data,
      DRAWLOOM_WEB_ROOT: join(resources, "web"),
      DRAWLOOM_NODE_PATH: node,
      DRAWLOOM_KNOWLEDGE_RUNTIME: join(resources, "knowledge"),
      DRAWLOOM_NIGHTLOOM_RUNTIME: join(resources, "host", "node_modules", "@drawloom", "nightloom"),
      DRAWLOOM_ORCHESTRATION_RUNTIME: join(resources, "orchestration"),
      DRAWLOOM_EXPERIMENTAL_PLUGIN_DISCOVERY: "0",
      DRAWLOOM_MANAGED: "1",
      DRAWLOOM_NATIVE_RECOVERY_ROOT: layout.root,
      DRAWLOOM_NATIVE_RECOVERY_PROJECT: layout.project,
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exited = once(child, "exit");
  let stderrBytes = 0;
  child.stderr.on("data", (chunk) => (stderrBytes += chunk.length));
  const lines = createInterface({ input: child.stdout });
  const close = async () => {
    child.stdin.end();
    let timer;
    let result;
    try {
      result = await Promise.race([
        exited,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error(`Bundled setup host ${child.pid} did not close`)),
            20_000,
          );
        }),
      ]);
    } catch (error) {
      child.kill("SIGTERM");
      let killTimer;
      await Promise.race([
        exited,
        new Promise((resolve) => {
          killTimer = setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 5_000);
        }),
      ]).finally(() => clearTimeout(killTimer));
      if (child.exitCode === null && child.signalCode === null) await exited;
      throw error;
    } finally {
      clearTimeout(timer);
      lines.close();
    }
    if (result[0] !== 0)
      throw Error(
        `Bundled setup host exited ${result[0] ?? result[1]}; stderr bytes ${stderrBytes}`,
      );
    return { pid: child.pid, code: result[0] };
  };
  const ready = Promise.withResolvers();
  lines.on("line", (line) => {
    try {
      const parsed = JSON.parse(line);
      if (parsed.url && parsed.dataDirectory === layout.data) ready.resolve(parsed.url);
    } catch {}
  });
  child.once("error", ready.reject);
  child.once("exit", () => ready.reject(Error("Bundled host exited before readiness")));
  const deadline = setTimeout(
    () => ready.reject(Error("Bundled host readiness timed out")),
    readinessTimeoutMs,
  );
  let bootstrapUrl, bootstrap, cookie, origin;
  try {
    bootstrapUrl = await ready.promise;
    bootstrap = await fetch(bootstrapUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (bootstrap.status !== 303)
      throw Error(`Bundled host bootstrap returned ${bootstrap.status}`);
    cookie = bootstrap.headers.get("set-cookie")?.split(";", 1)[0];
    if (!cookie) throw Error("Bundled host did not issue an authentication cookie");
    origin = new URL(bootstrapUrl).origin;
  } catch (error) {
    await close().catch(() => {});
    throw error;
  } finally {
    clearTimeout(deadline);
  }
  const request = async (path, body) => {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        cookie,
        origin,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    const result = await response.json();
    if (response.status !== 200) throw Error(`Bundled host ${path} returned ${response.status}`);
    return result;
  };
  return { child, request, close };
}

export async function setupRecoveryFixture(root, app, mcpUrl) {
  const layout = await prepareRecoveryPackage(root, mcpUrl);
  let host = await startSetupHost(root, app);
  const setupProcesses = [];
  try {
    await host.request("/api/packages", {
      action: "add",
      root: layout.package,
    });
    const packages = await host.request("/api/packages");
    const installed = packages.filter((entry) => entry.name === "native-recovery-fixture");
    if (installed.length !== 1 || installed[0].pendingRestart !== true)
      throw Error("Fixture package did not enter the expected restart-required state");
    await host.request("/api/packages", {
      action: "configure",
      id: installed[0].id,
      settings: {
        enabled: true,
        trustedBackend: false,
        servers: ["recovery"],
        elicitationDisabledServers: [],
        approvedResourceOrigins: [],
        configuration: {},
      },
    });
    setupProcesses.push(await host.close());
    host = await startSetupHost(root, app);
    await host.request("/api/command", {
      kind: "add_project",
      directory: layout.project,
      name: "Recovery fixture",
    });
    const created = await host.request("/api/command", {
      kind: "create_conversation",
      workbenchId: "text",
      provider: "codex",
    });
    const grants = created.operator?.grants?.filter((grant) => grant.toolName.startsWith("pkg_"));
    if (grants?.length !== 1 || grants[0].allowed !== false)
      throw Error("Expected exactly one ungranted installed package tool alias");
    const conversationId = created.selectedId;
    const projectId = created.selectedProjectId;
    if (!conversationId || !projectId) throw Error("Fixture conversation binding was not created");
    const granted = await host.request("/api/command", {
      kind: "operator",
      conversationId,
      workbenchId: "text",
      command: {
        kind: "set_tool_grant",
        toolName: grants[0].toolName,
        allowed: true,
      },
    });
    if (
      !granted.operator.grants.some(
        (grant) => grant.toolName === grants[0].toolName && grant.allowed,
      )
    )
      throw Error("Installed package tool grant was not persisted");
    setupProcesses.push(await host.close());
    await unlink(join(layout.receipts, "termination.json")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    const receipt = {
      kind: "setup",
      runId: randomUUID(),
      installationId: installed[0].id,
      conversationId,
      projectId,
      toolName: grants[0].toolName,
      packageNeededRestart: true,
      grantAllowed: true,
      setupProcesses,
    };
    await writeReceipt(root, "setup", receipt);
    return receipt;
  } catch (error) {
    if (host.child.exitCode === null) await host.close().catch(() => {});
    throw error;
  }
}

async function cli(arguments_) {
  const command = arguments_[0];
  const root = option(arguments_, "root");
  if (command === "serve") {
    const app = option(arguments_, "app");
    await createRecoveryLayout(root);
    const mcp = await createRecoveryMcpServer(root);
    let setup;
    try {
      setup = await setupRecoveryFixture(root, app, mcp.url);
      process.stdout.write(
        JSON.stringify({
          status: "ready-for-native-launch",
          runId: setup.runId,
          controllerPid: process.pid,
        }) + "\n",
      );
      await new Promise((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
    } finally {
      await mcp.close();
    }
    return;
  }
  if (command === "release-admission") {
    const turn = await readReceipt(root, "turn-start-replied");
    const setup = await readReceipt(root, "setup");
    if (!turn || !setup) throw Error("Setup and turn-start barriers are required");
    if (await readControl(root, "admission-release"))
      throw Error("Admission was already released for this fixture run");
    let operationId;
    for (let attempt = 0; attempt < 600; attempt++) {
      try {
        operationId = await discoverOperationId(root, setup.conversationId);
        break;
      } catch (error) {
        if (!error.message.includes("exactly one operation identity")) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!operationId) throw Error("Fixture history did not publish one operation identity in time");
    await writeControl(root, "admission-release", {
      runId: setup.runId,
      threadId: turn.threadId,
      turnId: turn.turnId,
      operationId,
      toolName: setup.toolName,
    });
    process.stdout.write(JSON.stringify({ status: "admission-released", operationId }) + "\n");
    return;
  }
  if (command === "record-launch") {
    const shellPid = Number(option(arguments_, "shell-pid"));
    const hostPid = Number(option(arguments_, "host-pid"));
    const fixtureCase = option(arguments_, "case");
    const shellExecutable = option(arguments_, "shell-executable");
    const hostExecutable = option(arguments_, "host-executable");
    if (![shellPid, hostPid].every((pid) => Number.isSafeInteger(pid) && pid > 1))
      throw Error("Launch PIDs must be exact positive integers");
    if (!new Set(["graceful", "kill-shell", "kill-host"]).has(fixtureCase))
      throw Error("Invalid native recovery case");
    await recordNativeLaunch(root, {
      fixtureCase,
      shellPid,
      hostPid,
      shellExecutable,
      hostExecutable,
    });
    process.stdout.write(JSON.stringify({ status: "launch-recorded", fixtureCase }) + "\n");
    return;
  }
  if (command === "verify-cleanup") {
    const timeoutMs = Number(option(arguments_, "timeout-ms", false) ?? 15_000);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 60_000)
      throw Error("Cleanup timeout must be an integer from 0 to 60000");
    await verifyNativeCleanup(root, { timeoutMs });
    process.stdout.write(JSON.stringify({ status: "cleanup-verified" }) + "\n");
    return;
  }
  if (command === "assert") {
    const phase = option(arguments_, "phase");
    if (!new Set(["pending", "terminated"]).has(phase)) throw Error("Invalid assertion phase");
    const identity = await assertRecoveryReceipts(root, { phase });
    process.stdout.write(JSON.stringify({ status: `${phase}-asserted`, ...identity }) + "\n");
    return;
  }
  throw Error("Use serve, release-admission, record-launch, verify-cleanup, or assert");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await cli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
