/** Opt-in real local service proof. Runtime files remain in a fresh OS temp directory. */
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, appendFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { createServer as portServer } from "node:net";
import { randomUUID } from "node:crypto";
import { Connection, Client } from "@temporalio/client";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
import { createAgentBridge } from "./agent-bridge.ts";
import { dispatchAgentTask } from "./agent-task-host.ts";
import { createTemporalOrchestrator } from "./temporal.ts";
import { orchestrationConformance, taskHandler } from "./conformance.ts";
import { fixtureRegistry, workflows } from "./fixtures.ts";
import { StepFailure, type TaskContext, type Json } from "./contract.ts";
import { stopChild as stop } from "./temporal-host.ts";

const runtime = await mkdtemp(join(tmpdir(), "drawloom-temporal-proof-"));
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const attempts: TaskContext[] = [],
  timings: {
    runId: string;
    stepId: string;
    task: string;
    attempt: number;
    start: number;
    end?: number;
  }[] = [];
const bridges = new Map<string, ReturnType<typeof createAgentBridge>>();
const receipts = new Map<string, Json>();
const cancellation = new Map<string, AbortController>();
const sessions: string[] = [];
const operations: { runId: string; start: number; end?: number }[] = [];
let receiptWrite = Promise.resolve();
let lostResponseWrites = 0;
const bridgeToken = randomUUID();
const host = createServer(async (request, response) => {
  if (request.headers.authorization !== `Bearer ${bridgeToken}`) {
    response.statusCode = 403;
    response.end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const data = JSON.parse(Buffer.concat(chunks).toString()) as {
      runId: string;
      stepId: string;
      task: string;
      version: string;
      input: Json;
      attempt: number;
    };
    if (request.url === "/cancel") {
      cancellation.get(data.runId)?.abort();
      const result = await bridges.get(data.runId)?.requestCancellation();
      response.end(JSON.stringify({ value: result?.unresolvedEffects ?? [] }));
      return;
    }
    let abort = cancellation.get(data.runId);
    if (!abort) {
      abort = new AbortController();
      cancellation.set(data.runId, abort);
    }
    const context: TaskContext = {
      runId: data.runId,
      stepId: data.stepId,
      taskVersion: data.version,
      attempt: data.attempt,
      attemptId: `${data.stepId}/attempt/${data.attempt}`,
      signal: abort.signal,
    };
    attempts.push(context);
    const timing = {
      runId: data.runId,
      stepId: data.stepId,
      task: data.task,
      attempt: data.attempt,
      start: Date.now(),
    } as (typeof timings)[number];
    timings.push(timing);
    if (data.task === "lost-response") {
      lostResponseWrites++;
      timing.end = Date.now();
      response.destroy();
      return;
    }
    let bridge = bridges.get(data.runId);
    if (!bridge) {
      const synthetic = createSyntheticDriver(async () => {
        const operation: (typeof operations)[number] = {
          runId: data.runId,
          start: Date.now(),
        };
        operations.push(operation);
        if (data.runId.endsWith("/background"))
          return new Promise<string>(() => {});
        await delay(150);
        operation.end = Date.now();
        return "Synthetic result";
      });
      bridge = createAgentBridge(
        data.runId,
        {
          driverId: synthetic.driverId,
          async openSession(input) {
            sessions.push(input.sessionId);
            return synthetic.openSession(input);
          },
        },
        {
          async get(k) {
            return receipts.get(k);
          },
          async set(k, v) {
            receipts.set(k, v);
            const snapshot = JSON.stringify([...receipts]);
            receiptWrite = receiptWrite.then(() =>
              writeFile(join(runtime, "receipts.json"), snapshot),
            );
            await receiptWrite;
          },
        },
        {
          context: { text: "Public synthetic proof" },
          tools: { id: "none", tools: [] },
        },
      );
      bridges.set(data.runId, bridge);
    }
    try {
      const value = data.task.startsWith("agent.")
        ? await dispatchAgentTask(bridge, data.task, data.input, context)
        : taskHandler(data.task, data.input, context);
      response.end(JSON.stringify({ value }));
    } finally {
      timing.end = Date.now();
    }
  } catch (error) {
    response.end(
      JSON.stringify({
        error: String(error),
        code: error instanceof StepFailure ? error.code : "invalid",
      }),
    );
  }
});
await new Promise<void>((r) => host.listen(0, "127.0.0.1", r));
const hostPort = (host.address() as { port: number }).port;
async function freePort() {
  const s = portServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as { port: number }).port;
  await new Promise<void>((r, j) => s.close((e) => (e ? j(e) : r())));
  return port;
}
const port = await freePort(),
  uiPort = await freePort(),
  metricsPort = await freePort();
const address = `127.0.0.1:${port}`,
  queue = `proof-${Date.now()}`;
let service: ChildProcess | undefined,
  worker: ChildProcess | undefined,
  connection: Connection | undefined;
const children = new Set<ChildProcess>();
function start(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  child.stdout?.on("data", (x) => {
    void appendFile(
      join(
        runtime,
        `${command.includes("temporal") ? "service" : "worker"}.log`,
      ),
      x,
    );
  });
  child.stderr?.on("data", (x) => {
    void appendFile(
      join(
        runtime,
        `${command.includes("temporal") ? "service" : "worker"}.log`,
      ),
      x,
    );
  });
  return child;
}
async function startService() {
  service = start("temporal", [
    "server",
    "start-dev",
    "--ip",
    "127.0.0.1",
    "--port",
    String(port),
    "--ui-port",
    String(uiPort),
    "--metrics-port",
    String(metricsPort),
    "--db-filename",
    join(runtime, "temporal.sqlite"),
  ]);
  for (let i = 0; i < 100; i++) {
    try {
      const c = await Connection.connect({ address, connectTimeout: 500 });
      await c.close();
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Service startup failed: ${runtime}`);
}
async function startWorker() {
  worker = start(
    process.execPath,
    [resolve("spikes/adr-0017-orchestration/dist/temporal-worker.js")],
    {
      TEMPORAL_ADDRESS: address,
      BRIDGE_URL: `http://127.0.0.1:${hostPort}`,
      BRIDGE_TOKEN: bridgeToken,
      TASK_QUEUE: queue,
      WORKFLOW_PATH: resolve(
        "spikes/adr-0017-orchestration/temporal-workflow.ts",
      ),
    },
  );
  await new Promise<void>((r, j) => {
    const timer = setTimeout(
      () => j(new Error(`Worker startup timeout ${runtime}`)),
      30000,
    );
    worker!.once("exit", (code) => {
      clearTimeout(timer);
      j(new Error(`Worker exited ${code}: ${runtime}`));
    });
    worker!.stdout!.on("data", (x) => {
      if (String(x).includes("WORKER_READY")) {
        clearTimeout(timer);
        r();
      }
    });
  });
}
const started = Date.now();
try {
  await startService();
  await startWorker();
  connection = await Connection.connect({ address });
  const client = new Client({ connection });
  console.log("Running shared real Temporal conformance");
  await orchestrationConformance(async () => ({
    engine: createTemporalOrchestrator(
      client,
      queue,
      "conformance",
      fixtureRegistry,
    ),
    attempts,
    async dispose() {},
  }));
  console.log("Shared conformance passed; testing restarts");
  let engine = createTemporalOrchestrator(
    client,
    queue,
    "restart",
    fixtureRegistry,
  );
  const id = await engine.start("principal", workflows.spine, 3);
  let snapshot = await engine.get(id);
  for (let i = 0; !snapshot.pendingInputs.length && i < 300; i++) {
    await delay(20);
    snapshot = await engine.get(id);
  }
  assert.ok(snapshot.pendingInputs[0]);
  const count = attempts.length,
    childIds = [...snapshot.childRunIds],
    sessionIds = [...sessions],
    request = snapshot.pendingInputs[0];
  await stop(worker);
  await startWorker();
  assert.deepEqual((await engine.get(id)).childRunIds, childIds);
  assert.equal(attempts.length, count);
  await stop(worker);
  await connection.close();
  connection = undefined;
  await stop(service);
  await startService();
  await startWorker();
  connection = await Connection.connect({ address });
  engine = createTemporalOrchestrator(
    new Client({ connection }),
    queue,
    "restart",
    fixtureRegistry,
  );
  assert.equal(await engine.start("principal", workflows.spine, 3), id);
  assert.equal(attempts.length, count);
  assert.deepEqual((await engine.get(id)).pendingInputs, [request]);
  assert.deepEqual(sessions, sessionIds);
  await assert.rejects(engine.start("principal", workflows.spine, 4));
  await assert.rejects(engine.respond(id, `${request}-stale`, 1));
  await assert.rejects(engine.respond(id, request, "invalid"));
  await engine.respond(id, request, 1);
  const result = await engine.result(id);
  assert.equal((result as { total: number }).total, 15);
  assert.deepEqual(sessions, sessionIds);
  const branchIntervals = childIds.map(
    (child) => operations.find((t) => t.runId === child)!,
  );
  assert.ok(branchIntervals[0] && branchIntervals[1]);
  const leftRetry = timings.filter(
    (t) => t.runId === childIds[0] && t.task === "fail-once",
  );
  const rightCompleted = timings.filter(
    (t) => t.runId === childIds[1] && t.task === "double",
  );
  assert.equal(leftRetry.length, 2);
  assert.equal(rightCompleted.length, 1);
  assert.ok(rightCompleted[0]!.end! < leftRetry[1]!.start);
  assert.equal(lostResponseWrites, 1);
  assert.ok(
    Math.max(...branchIntervals.map((t) => t.start)) <
      Math.min(...branchIntervals.map((t) => t.end!)),
  );
  const background = await engine.start(
    "background",
    workflows.backgroundAgent,
    null,
  );
  for (
    let i = 0;
    !(await engine.get(background)).pendingInputs.length && i < 200;
    i++
  )
    await delay(20);
  assert.ok((await engine.get(background)).pendingInputs.length);
  await engine.cancel(background);
  await assert.rejects(engine.result(background));
  const cancelledState = await engine.get(background);
  assert.equal(cancelledState.status, "cancelled");
  assert.ok(
    cancelledState.unresolvedEffects.some((effect) =>
      effect.includes("active"),
    ),
  );
  const summary = {
    runtime,
    node: process.version,
    temporalSdk: "1.23.0",
    elapsedMs: Date.now() - started,
    sharedConformance: "passed",
    lostResponseWrites,
    workerRestart: "passed",
    serviceRestart: "passed",
    attemptCountAtWait: count,
    attemptCountAfterRestarts: count,
    childIds,
    sessionCount: sessions.length,
    sessionReopened: false,
    result,
    branchIntervals,
    leftRetry,
    rightCompleted,
    cancelledState,
    attempts: timings,
    limitations: [
      "Independent synthetic bridge host remained alive; no bridge-process or whole-machine recovery claim",
      "Same workflow code across restarts; no history migration",
      "Synthetic agent only; no live model",
    ],
  };
  await writeFile(
    join(runtime, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await stop(worker);
  await connection?.close();
  await stop(service);
  for (const child of children) await stop(child);
  await Promise.all([...bridges.values()].map((b) => b.close()));
  await new Promise<void>((r) => host.close(() => r()));
}
