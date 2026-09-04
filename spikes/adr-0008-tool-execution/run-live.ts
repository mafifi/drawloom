import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { StdioCodexTransport, isRecord, type CodexNotification } from "../adr-0007-codex-app-server/app-server-client.ts";
import { RecordSchema, ResultSchema } from "./contract.ts";
import { describeFailure, ObservationSchema, ProofFailure, type RuntimeState } from "./runtime-state.ts";

// Only locally authored assertions are safe to print; transport errors may
// embed raw provider JSON or local paths in their message.
const assertProof: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new ProofFailure(message);
};
const waitUntil = async <T>(probe: () => Promise<T | undefined>, label: string, timeoutMs = 90_000): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await Bun.sleep(30);
  }
  throw new ProofFailure(`Timed out: ${label}`);
};
const rows = async (path: string): Promise<unknown[]> => {
  const text = await readFile(path, "utf8");
  return text.trim() ? text.trim().split("\n").map((line) => JSON.parse(line)) : [];
};
const bun = Bun.which("bun"); const codex = Bun.which("codex");
assertProof(bun && codex, "Bun and Codex executables are required");
const directory = await mkdtemp(join(tmpdir(), "drawloom-adr-0008-"));
const state: RuntimeState = { entries: [] };
const gates = { metadata: false, canonicalResult: false, stableExposure: false,
  delayedCallIsolation: false, replayIsolation: false, modelArgumentIsolation: false,
  missingOriginDenied: false, correlation: false, executionEvidence: false, cleanup: false };
const notices: CodexNotification[] = [];
let transport: StdioCodexTransport | undefined;
let replayClient: Client | undefined;
let replayTransport: StdioClientTransport | undefined;
let threadId: string | undefined;
let activeTurnId: string | undefined;
let failure: string | undefined;
let stage = "preflight";
const saveState = async () => {
  await Bun.write(join(directory, "state.next.json"), JSON.stringify(state));
  await rename(join(directory, "state.next.json"), join(directory, "state.json"));
};
try {
  await saveState();
  for (const file of ["effects.jsonl", "evidence.jsonl", "observations.jsonl"]) await Bun.write(join(directory, file), "");
  transport = new StdioCodexTransport(codex, directory);
  transport.onNotification((notice) => { notices.push(notice); });
  transport.onRequest((request) => { transport!.respond(request.id, { action: "decline" }); });
  await transport.initialize("drawloom-adr-0008-proof");
  const opened = await transport.request("thread/start", {
    cwd: directory, ephemeral: false, approvalPolicy: "never", sandbox: "read-only",
    baseInstructions: "You are a tool integration probe. Follow the user's exact MCP call instructions. Never use shell, file, web, delegation, or other tools. Do not simulate tool calls. Do not retry failed tool calls.",
    config: { mcp_servers: { drawloom_tool_proof: {
      command: bun, args: [join(import.meta.dir, "mcp-server.ts")],
      env: { DRAWLOOM_TOOL_PROOF_DIR: directory }, required: true,
      default_tools_approval_mode: "approve", tool_timeout_sec: 120,
    } } },
  });
  assertProof(isRecord(opened) && isRecord(opened.thread) && typeof opened.thread.id === "string", "thread/start did not return a thread");
  threadId = opened.thread.id;
  await transport.request("thread/memoryMode/set", { threadId, mode: "disabled" });

  const start = async (operationId: string, text: string, allowedTools = ["word_count"]) => {
    const result = await transport!.request("turn/start", {
      threadId, input: [{ type: "text", text, text_elements: [] }], effort: "low", summary: "none",
    });
    assertProof(isRecord(result) && isRecord(result.turn) && typeof result.turn.id === "string", "turn/start did not return an identity");
    const turnId = result.turn.id; activeTurnId = turnId;
    state.entries.push({ threadId: threadId!, turnId, operationId, active: true, allowedTools });
    await saveState(); return turnId;
  };
  const completed = async (turnId: string) => waitUntil(async () => {
    const notice = notices.find((n) => n.method === "turn/completed" && isRecord(n.params) && isRecord(n.params.turn) && n.params.turn.id === turnId);
    if (!notice || !isRecord(notice.params) || !isRecord(notice.params.turn)) return undefined;
    return notice.params.turn.status;
  }, "turn completion");
  const observations = async () => z.array(ObservationSchema).parse(await rows(join(directory, "observations.jsonl")));
  const completedTools = (turnId: string) => notices.flatMap((n) => {
    if (n.method !== "item/completed" || !isRecord(n.params) || n.params.turnId !== turnId || !isRecord(n.params.item)) return [];
    return n.params.item.type === "mcpToolCall" ? [n.params.item] : [];
  });

  stage = "word-count and metadata";
  const firstTurn = await start("operation-count", 'Call word_count from drawloom_tool_proof exactly once with {"text":"one two three"}. Report its result briefly.');
  assertProof(await completed(firstTurn) === "completed", "word-count turn did not complete");
  activeTurnId = undefined;
  const firstRows = (await observations()).filter((r) => r.operationId === "operation-count");
  assertProof(firstRows.length === 1 && firstRows[0]?.status === "succeeded", "MCP call did not resolve its exact provider-turn binding");
  gates.metadata = true;
  const items = completedTools(firstTurn);
  assertProof(items.length === 1 && isRecord(items[0]?.result), "Expected one completed MCP result");
  const firstResult = ResultSchema.parse(items[0].result.structuredContent);
  assertProof(firstResult.evidence === "recorded", "Control invocation evidence was not acknowledged");
  assertProof(firstResult.outcome.status === "succeeded" && isRecord(firstResult.outcome.value) && firstResult.outcome.value.count === 3, "Canonical word count differs from expected value");
  assertProof(firstResult.outcome.text === '{"count":3}', "Default presentation differs from canonical JSON");
  gates.canonicalResult = true;
  const meta = items[0].result._meta;
  assertProof(isRecord(meta) && isRecord(meta.drawloom) && meta.drawloom.toolInvocationId === firstRows[0]?.invocationId, "Explicit invocation correlation was not retained");
  gates.correlation = true;
  state.entries[0]!.active = false; await saveState();

  stage = "controlled delayed call";
  await Bun.write(join(directory, "delay-next"), "delay one real call");
  const turnA = await start("operation-a", 'Call word_count from drawloom_tool_proof exactly once with {"text":"delayed alpha"}. Wait for its result.');
  const marker = await waitUntil(async () => {
    if (!(await Bun.file(join(directory, "delay-entered")).exists())) return undefined;
    return JSON.parse(await readFile(join(directory, "delay-entered"), "utf8"));
  }, "delayed MCP ingress");
  assertProof(isRecord(marker) && marker.originPresent && marker.bound, "Delayed call lacked trusted origin");
  state.entries.find((entry) => entry.operationId === "operation-a")!.active = false;
  await saveState();
  await transport.request("turn/interrupt", { threadId, turnId: turnA });
  assertProof(await completed(turnA) === "interrupted", "Delayed operation did not interrupt");
  activeTurnId = undefined;
  const turnB = await start("operation-b", 'Call word_count from drawloom_tool_proof exactly once with {"text":"new beta operation"}. Report its result.');
  // B's grant is now active before A is allowed to reach the gateway.
  await Bun.write(join(directory, "release-delay"), "release A after B acceptance");
  assertProof(await completed(turnB) === "completed", "Operation B did not complete");
  activeTurnId = undefined;
  const delayed = await waitUntil(async () => (await observations()).find((row) => row.operationId === "operation-a"), "delayed A outcome");
  assertProof(delayed.status === "failed" && delayed.code === "denied", "Delayed A borrowed B authority");
  const bRows = (await observations()).filter((row) => row.operationId === "operation-b");
  assertProof(bRows.length === 1 && bRows[0]?.status === "succeeded", "B failed to use its own authority");
  assertProof(firstRows[0]?.serverInstance === delayed.serverInstance && delayed.serverInstance === bRows[0]?.serverInstance, "MCP exposure restarted across operations");
  gates.delayedCallIsolation = true; gates.stableExposure = true;

  stage = "controlled envelope replay";
  replayClient = new Client({ name: "drawloom-adr-0008-replay", version: "0.0.0" });
  replayTransport = new StdioClientTransport({ command: bun, args: [join(import.meta.dir, "mcp-server.ts")],
    env: { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")), DRAWLOOM_TOOL_PROOF_DIR: directory }, stderr: "pipe" });
  await replayClient.connect(replayTransport);
  const captured = z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()), _meta: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(await readFile(join(directory, "captured-call.json"), "utf8")));
  const replay = await replayClient.callTool(captured, undefined, { timeout: 10_000 });
  const replayResult = ResultSchema.parse(replay.structuredContent);
  assertProof(replayResult.outcome.status === "failed" && replayResult.outcome.code === "denied", "Replayed A executed under B authority");
  const forged = await replayClient.callTool({ ...captured, arguments: { text: "forged", operationId: "operation-b" } }, undefined, { timeout: 10_000 });
  const forgedResult = ResultSchema.parse(forged.structuredContent);
  assertProof(forgedResult.outcome.status === "failed" && forgedResult.outcome.code === "invalid_input", "Model arguments changed the authority binding");
  const missing = await replayClient.callTool({ name: "word_count", arguments: { text: "missing origin" } }, undefined, { timeout: 10_000 });
  const missingResult = ResultSchema.parse(missing.structuredContent);
  assertProof(missingResult.outcome.status === "failed" && missingResult.outcome.code === "denied", "Missing metadata fell back to active authority");
  gates.replayIsolation = true; gates.modelArgumentIsolation = true; gates.missingOriginDenied = true;
  const effects = z.array(z.strictObject({ operationId: z.string() })).parse(await rows(join(directory, "effects.jsonl")));
  assertProof(JSON.stringify(effects.map((effect) => effect.operationId)) === JSON.stringify(["operation-count", "operation-b"]), "Unexpected execution effect or retry");
  const records = z.array(RecordSchema).parse(await rows(join(directory, "evidence.jsonl")));
  for (const observation of await observations()) {
    assertProof(observation.evidence === "recorded", "Invocation evidence was not acknowledged");
    const pair = records.filter((record) => record.invocationId === observation.invocationId);
    assertProof(pair.length === 2 && pair[0]?.kind === "started" && pair[1]?.kind === "finished" &&
      pair.every((record) => record.operationId === observation.operationId) &&
      pair[1].outcome.status === observation.status, "Execution evidence does not match its originating invocation");
  }
  gates.executionEvidence = true;
} catch (error) {
  failure = `${stage}: ${describeFailure(error)}`;
  process.exitCode = 1;
} finally {
  let clean = true;
  try { await replayClient?.close(); await replayTransport?.close(); } catch { clean = false; }
  if (transport) {
    if (activeTurnId && threadId) {
      try { await transport.request("turn/interrupt", { threadId, turnId: activeTurnId }); } catch { clean = false; }
    }
    if (threadId) {
      try { await transport.request("thread/archive", { threadId }); } catch { clean = false; }
    }
    try { await transport.close(); } catch { clean = false; }
  }
  try { await rm(directory, { recursive: true, force: true }); } catch { clean = false; }
  gates.cleanup = clean;
  if (!clean) { failure ??= "Cleanup failed"; process.exitCode = 1; }
}
if (!Object.values(gates).every(Boolean)) process.exitCode = 1;
console.log(JSON.stringify({ status: Object.values(gates).every(Boolean) ? "passed" : "failed",
  environment: { bun: Bun.version, codex: new TextDecoder().decode(Bun.spawnSync([codex, "--version"]).stdout).trim() },
  gates, ...(failure ? { failure } : {}),
}, null, 2));
