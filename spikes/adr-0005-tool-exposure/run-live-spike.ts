import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ActiveOperationGrant } from "./tool-authority";

type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

class AppServerClient {
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly notifications: JsonRecord[] = [];
  private readonly notificationWaiters = new Set<{
    predicate: (message: JsonRecord) => boolean;
    resolve: (message: JsonRecord) => void;
    reject: (error: Error) => void;
  }>();
  private readonly process;
  private closed = false;
  private failure: Error | undefined;
  private stderr = "";

  public constructor(
    command: string,
    cwd: string,
    private readonly requestTimeoutMs = 30_000,
  ) {
    this.process = Bun.spawn(
      [
        command,
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
        cwd,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    void this.readStdout().catch((error: unknown) =>
      this.fail(error instanceof Error ? error : new Error(String(error))),
    );
    void this.readStderr();
    void this.process.exited.then((exitCode) => {
      if (!this.closed) {
        this.fail(new Error(`App-server exited with code ${exitCode}`));
      }
    });
  }

  private async readStdout(): Promise<void> {
    const reader = this.process.stdout.getReader();
    const decoder = new TextDecoder();
    let buffered = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        if (!this.closed) this.fail(new Error("App-server stdout reached EOF"));
        break;
      }
      buffered += decoder.decode(value, { stream: true });
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) this.handleMessage(JSON.parse(line));
      }
    }
  }

  private async readStderr(): Promise<void> {
    this.stderr = await new Response(this.process.stderr).text();
  }

  private handleMessage(value: unknown): void {
    if (!isRecord(value)) return;
    if (typeof value.id === "number" && !("method" in value)) {
      const pending = this.pending.get(value.id);
      if (!pending) return;
      this.pending.delete(value.id);
      clearTimeout(pending.timer);
      if (isRecord(value.error)) {
        pending.reject(
          new Error(`App-server rejected request: ${JSON.stringify(value.error)}`),
        );
      } else {
        pending.resolve(value.result);
      }
      return;
    }
    if (typeof value.method === "string" && "id" in value) {
      this.send({
        id: value.id,
        error: { code: -32601, message: "Unsupported spike client request" },
      });
      return;
    }
    if (typeof value.method !== "string") return;
    this.notifications.push(value);
    for (const waiter of this.notificationWaiters) {
      if (!waiter.predicate(value)) continue;
      this.notificationWaiters.delete(waiter);
      waiter.resolve(value);
    }
  }

  private send(value: unknown): void {
    this.process.stdin.write(`${JSON.stringify(value)}\n`);
    this.process.stdin.flush();
  }

  public request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed || this.failure) {
      return Promise.reject(
        this.failure ?? new Error("App-server is closed"),
      );
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.fail(new Error(`App-server request timed out: ${method}`)),
        this.requestTimeoutMs,
      );
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send(params === undefined ? { id, method } : { id, method, params });
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  public notify(method: string): void {
    if (this.closed || this.failure) {
      throw this.failure ?? new Error("App-server is closed");
    }
    this.send({ method });
  }

  public waitFor(
    predicate: (message: JsonRecord) => boolean,
    timeoutMs = 120_000,
  ): Promise<JsonRecord> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.closed) return Promise.reject(new Error("App-server is closed"));
    const existing = this.notifications.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      let timeout: ReturnType<typeof setTimeout>;
      const waiter: {
        predicate: (message: JsonRecord) => boolean;
        resolve: (message: JsonRecord) => void;
        reject: (error: Error) => void;
      } = {
        predicate,
        resolve: (message: JsonRecord) => {
          clearTimeout(timeout);
          resolve(message);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      };
      this.notificationWaiters.add(waiter);
      timeout = setTimeout(() => {
        if (!this.notificationWaiters.delete(waiter)) return;
        reject(new Error(`Timed out waiting for app-server notification`));
      }, timeoutMs);
    });
  }

  public async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      this.process.stdin.end();
      this.process.kill();
    } catch {
      // The process may already have exited after a reported failure.
    }
    await this.process.exited;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("App-server closed before responding"));
    }
    this.pending.clear();
  }

  public diagnostics(): { notifications: JsonRecord[]; stderr: string } {
    return { notifications: this.notifications, stderr: this.stderr };
  }

  private fail(error: Error): void {
    if (this.closed || this.failure) return;
    this.failure = new Error(`App-server transport closed: ${error.message}`);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.failure);
    }
    this.pending.clear();
    for (const waiter of this.notificationWaiters) waiter.reject(this.failure);
    this.notificationWaiters.clear();
  }
}

const requireExecutable = (name: string): string => {
  const executable = Bun.which(name);
  if (!executable) throw new Error(`${name} executable not found`);
  return executable;
};

const assertSpike: (
  condition: unknown,
  message: string,
) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(`Spike assertion failed: ${message}`);
};

const spikeDirectory = import.meta.dir;
const codex = requireExecutable("codex");
const bun = requireExecutable("bun");
const runtimeDirectory = await mkdtemp(
  join(tmpdir(), "drawloom-adr-0005-tool-exposure-"),
);
const schemaDirectory = join(runtimeDirectory, "schema");
const grantPath = join(runtimeDirectory, "grant.json");
const evidencePath = join(runtimeDirectory, "evidence.jsonl");

const writeGrant = async (grant: ActiveOperationGrant): Promise<void> => {
  const nextPath = `${grantPath}.next`;
  await Bun.write(nextPath, JSON.stringify(grant));
  await rename(nextPath, grantPath);
};

let client: AppServerClient | undefined;
let protocolSchemaSha256: string | undefined;
let result: JsonRecord | undefined;
let openedThreadId: string | undefined;

try {
  await mkdir(schemaDirectory);
  await Bun.write(evidencePath, "");
  const schemaGeneration = Bun.spawnSync([
    codex,
    "app-server",
    "generate-json-schema",
    "--experimental",
    "--out",
    schemaDirectory,
  ]);
  if (schemaGeneration.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(schemaGeneration.stderr));
  }
  const schemaBytes = await Bun.file(
    join(schemaDirectory, "codex_app_server_protocol.schemas.json"),
  ).arrayBuffer();
  protocolSchemaSha256 = createHash("sha256")
    .update(new Uint8Array(schemaBytes))
    .digest("hex");
  const connectedClient = new AppServerClient(codex, spikeDirectory);
  client = connectedClient;

  const initialize = await connectedClient.request("initialize", {
    clientInfo: {
      name: "drawloom-adr-0005-tool-exposure-spike",
      title: "Drawloom ADR 0005 Spike",
      version: "0.0.0",
    },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      extensions: null,
    },
  });
  connectedClient.notify("initialized");

  await writeGrant({
    exposureId: "exposure-1",
    grantId: "grant-1",
    operationId: "operation-1",
    allowedTools: ["drawloom_probe"],
  });

  const threadStart = (await connectedClient.request("thread/start", {
    cwd: spikeDirectory,
    approvalPolicy: "never",
    sandbox: "read-only",
    baseInstructions:
      "You are running a deterministic tool integration spike. Follow the user's explicit tool-call instructions exactly. Do not use shell, file, web, or delegation tools.",
    developerInstructions:
      "Use only the drawloom_probe MCP tool when a prompt requests it.",
    ephemeral: false,
    config: {
      mcp_servers: {
        drawloom_spike: {
          command: bun,
          args: [join(spikeDirectory, "mcp-server.ts")],
          env: {
            DRAWLOOM_SPIKE_GRANT_PATH: grantPath,
            DRAWLOOM_SPIKE_EVIDENCE_PATH: evidencePath,
          },
          default_tools_approval_mode: "approve",
          required: true,
        },
      },
    },
  })) as JsonRecord;
  const thread = threadStart.thread;
  if (!isRecord(thread) || typeof thread.id !== "string") {
    throw new Error("thread/start returned no thread id");
  }
  const threadId = thread.id;
  openedThreadId = threadId;

  await connectedClient.request("thread/memoryMode/set", {
    threadId,
    mode: "disabled",
  });

  const mcpStatus = await connectedClient.request("mcpServerStatus/list", {
    threadId,
    detail: "full",
  });
  const drawloomMcpStatus =
    isRecord(mcpStatus) && Array.isArray(mcpStatus.data)
      ? mcpStatus.data.filter(
          (server) => isRecord(server) && server.name === "drawloom_spike",
        )
      : [];
  const exposedServer = drawloomMcpStatus[0];
  const exposedTools = isRecord(exposedServer) && isRecord(exposedServer.tools)
    ? exposedServer.tools
    : undefined;
  const exposedProbe = isRecord(exposedTools?.drawloom_probe)
    ? exposedTools.drawloom_probe
    : undefined;
  const inputSchema = isRecord(exposedProbe?.inputSchema)
    ? exposedProbe.inputSchema
    : undefined;
  assertSpike(
    drawloomMcpStatus.length === 1 &&
      inputSchema?.type === "object" &&
      inputSchema?.additionalProperties === false,
    "Codex must discover the one Zod-projected probe schema",
  );

  const runTurn = async (
    operationId: string,
    grantId: string,
    allowedTools: string[],
    value: string,
  ): Promise<{ turnId: string; completed: JsonRecord }> => {
    await writeGrant({
      exposureId: "exposure-1",
      grantId,
      operationId,
      allowedTools,
    });
    const started = (await connectedClient.request("turn/start", {
      threadId,
      clientUserMessageId: `${operationId}-input`,
      input: [
        {
          type: "text",
          text: `Call the MCP tool named drawloom_probe from server drawloom_spike exactly once with value ${JSON.stringify(value)}. Then report its result briefly.`,
          text_elements: [],
        },
      ],
      additionalContext: {
        "drawloom.operation": {
          value: `The authoritative Drawloom operation id is ${operationId}.`,
          kind: "application",
        },
      },
      effort: "low",
      summary: "none",
    })) as JsonRecord;
    const turn = started.turn;
    if (!isRecord(turn) || typeof turn.id !== "string") {
      throw new Error("turn/start returned no turn id");
    }
    const turnId = turn.id;
    const completed = await connectedClient.waitFor(
      (message) =>
        message.method === "turn/completed" &&
        isRecord(message.params) &&
        isRecord(message.params.turn) &&
        message.params.turn.id === turnId,
    );
    return { turnId, completed };
  };

  const turns = [
    await runTurn("operation-1", "grant-1", ["drawloom_probe"], "alpha"),
    await runTurn("operation-2", "grant-2", [], "beta"),
    await runTurn("operation-3", "grant-3", ["drawloom_probe"], "gamma"),
  ];

  const evidenceText = await readFile(evidencePath, "utf8");
  const evidence = evidenceText
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const completedItems = connectedClient
    .diagnostics()
    .notifications.filter((message) => message.method === "item/completed")
    .flatMap((message) =>
      isRecord(message.params) && isRecord(message.params.item)
        ? [message.params.item]
        : [],
    )
    .filter((item) => item.type === "mcpToolCall");
  const expectedDecisions = [
    ["operation-1", "grant-1", "allowed"],
    ["operation-2", "grant-2", "denied"],
    ["operation-3", "grant-3", "allowed"],
  ] as const;
  assertSpike(evidence.length === 3, "gateway must record exactly three calls");
  assertSpike(
    completedItems.length === 3,
    "Codex must emit exactly three completed MCP tool items",
  );
  assertSpike(
    typeof evidence[0]?.serverInstanceId === "string" &&
      evidence.every(
        (record) => record.serverInstanceId === evidence[0]?.serverInstanceId,
      ),
    "all operations must use one session-scoped MCP server instance",
  );
  for (const [index, [operationId, grantId, status]] of
    expectedDecisions.entries()) {
    const gatewayRecord = evidence[index];
    const providerRecord = completedItems[index];
    const providerResult = isRecord(providerRecord?.result)
      ? providerRecord.result
      : undefined;
    const providerMeta = isRecord(providerResult?._meta)
      ? providerResult._meta
      : undefined;
    const drawloomMeta = isRecord(providerMeta?.drawloom)
      ? providerMeta.drawloom
      : undefined;
    assertSpike(
      gatewayRecord?.operationId === operationId &&
        gatewayRecord?.grantId === grantId &&
        gatewayRecord?.status === status,
      `gateway decision ${index + 1} must match ${operationId}/${grantId}/${status}`,
    );
    assertSpike(
      drawloomMeta?.toolInvocationId === gatewayRecord.toolInvocationId &&
        drawloomMeta?.operationId === operationId,
      `provider observation ${index + 1} must preserve exact gateway correlation`,
    );
    assertSpike(
      providerRecord?.status === (status === "denied" ? "failed" : "completed"),
      `provider observation ${index + 1} must preserve allow/deny outcome`,
    );
  }

  result = {
    codexVersion: new TextDecoder()
      .decode(Bun.spawnSync([codex, "--version"]).stdout)
      .trim(),
    initialize,
    protocolSchemaSha256,
    runtimeDirectory,
    threadId,
    mcpStatus: drawloomMcpStatus,
    turns: turns.map(({ turnId, completed }) => ({
      turnId,
      status:
        isRecord(completed.params) && isRecord(completed.params.turn)
          ? completed.params.turn.status
          : "unknown",
    })),
    toolEvidence: evidence,
    providerToolItems: completedItems.map((item) => ({
      id: item.id,
      server: item.server,
      tool: item.tool,
      status: item.status,
      resultMeta: isRecord(item.result) ? item.result._meta : null,
      structuredContent: isRecord(item.result)
        ? item.result.structuredContent
        : null,
    })),
  };
} catch (error) {
  result = {
    protocolSchemaSha256,
    runtimeDirectory,
    error: error instanceof Error ? error.message : String(error),
    diagnostics: client?.diagnostics(),
  };
  process.exitCode = 1;
} finally {
  let archivedThread = openedThreadId === undefined;
  let removedRuntimeDirectory = false;
  if (openedThreadId && client) {
    try {
      await client.request("thread/archive", { threadId: openedThreadId });
      archivedThread = true;
    } catch (error) {
      if (result && !("error" in result)) {
        result.error =
          error instanceof Error ? error.message : "Thread archival failed";
      }
      process.exitCode = 1;
    }
  }
  if (client) {
    try {
      await client.close();
    } catch (error) {
      if (result && !("error" in result)) {
        result.error =
          error instanceof Error ? error.message : "Client cleanup failed";
      }
      process.exitCode = 1;
    }
  }
  try {
    await rm(runtimeDirectory, { recursive: true, force: true });
    removedRuntimeDirectory = true;
  } catch (error) {
    if (result && !("error" in result)) {
      result.error =
        error instanceof Error ? error.message : "Runtime cleanup failed";
    }
    process.exitCode = 1;
  }
  if (result) {
    result.cleanup = { archivedThread, removedRuntimeDirectory };
  }
}

console.log(JSON.stringify(result, null, 2));
