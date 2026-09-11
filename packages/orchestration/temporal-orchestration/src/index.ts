import { Client, Connection, WorkflowExecutionAlreadyStartedError } from "@temporalio/client";
import { createServer } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, realpath, readdir, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve, join, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { trace } from "@opentelemetry/api";
import { canonical, parse, parseWorkflowModule, matchTaskHandlers, RunSnapshotSchema, StepFailure, type Registry, type Orchestrator, type RegisteredTaskHandler, type Json } from "@drawloom/orchestration";
import type { OrchestrationReadiness } from "@drawloom/desktop-host";
import { digest, readJson, writeJson } from "./storage.js";
import { acquireLock, command, stopChild, unusedPort } from "./processes.js";
import { createReceiptDispatcher } from "./receipts.js";
import { stepFailureCode } from './failures.js';
import { observe } from './telemetry.js';

const OwnerInput = z.strictObject({ projectId: z.string().min(1).max(256), installationId: z.string().min(1).max(256), packageDirectory: z.string().min(1), entrypoint: z.string().min(1) });
const OwnerRecordSchema = OwnerInput.extend({ bundleFingerprint: z.string(), owner: z.string() });
export type OwnerRecord = z.infer<typeof OwnerRecordSchema>;
export type PrepareOwner = z.infer<typeof OwnerInput>;
export interface LocalTemporalOptions { dataDirectory: string; temporalPath?: string; nodePath?: string; /** Composition-owned real Node files for a compiled desktop host. */ runtimeDirectory?: string }
export interface LocalTemporalRegistration {
  readonly orchestrator: Orchestrator;
  readonly registry: Registry;
  readiness(): OrchestrationReadiness;
  attach(handlers: readonly RegisteredTaskHandler[]): Promise<void>;
  close(): Promise<void>;
}
const RunRecord = z.strictObject({ runId: z.string(), fingerprint: z.string(), bundleFingerprint: z.string(), terminal: z.boolean() });
type RunRecord = z.infer<typeof RunRecord>;
const Bundle = z.strictObject({ fingerprint: z.string(), dependencies: z.array(z.tuple([z.string(), z.string()])) });
type Dispatcher = ReturnType<typeof createReceiptDispatcher>;
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const limit = (value = 100) => { if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid page limit"); return Math.min(value, 100); };

/** One manager per data root; creating it neither imports a plugin nor starts a service. */
export function createLocalTemporalManager(options: LocalTemporalOptions) {
  const root = resolve(options.dataDirectory, "orchestration");
  const sidecar = options.runtimeDirectory
    ? resolve(options.runtimeDirectory, 'node_modules/@drawloom/temporal-orchestration/dist/sidecar.js')
    : fileURLToPath(new URL("../dist/sidecar.js", import.meta.url));
  const node = options.nodePath ?? "node";
  const cli = options.temporalPath ?? "temporal";
  let lock: Promise<() => Promise<void>> | undefined;
  let unlock: (() => Promise<void>) | undefined;
  let closed = false;
  let connection: Connection | undefined;
  let client: Client | undefined;
  let service: ChildProcess | undefined;
  let startup: Promise<void> | undefined;
  let address = "";
  let bridgeURL = "";
  const registrations = new Map<string, LocalTemporalRegistration>();
  const preparing = new Map<string, Promise<LocalTemporalRegistration>>();
  const dispatchers = new Map<string, Dispatcher>();
  const tokenOwners = new Map<string, string>();
  const workers = new Set<ChildProcess>();
  let serial: Promise<unknown> = Promise.resolve();
  const mutate = <T>(work: () => Promise<T>): Promise<T> => {
    const result = serial.then(work); serial = result.catch(() => {}); return result;
  };
  async function own(): Promise<void> {
    if (closed) throw new Error("Local orchestration manager closed");
    lock ??= acquireLock(root).then((release) => { unlock = release; return release; });
    await lock;
  }
  const server = createServer(async (request, response) => {
    try {
      const token = request.headers.authorization?.replace(/^Bearer /, "");
      const owner = token ? tokenOwners.get(token) : undefined;
      const dispatcher = owner ? dispatchers.get(owner) : undefined;
      if (!owner || !dispatcher || request.method !== "POST") { response.writeHead(403).end(); return; }
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk as Uint8Array); length += bytes.length;
        if (length > 1024 * 1024) { response.writeHead(413).end(); request.destroy(); return; }
        chunks.push(bytes);
      }
      const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      let output: unknown;
      if (request.url === "/dispatch") output = await dispatcher.dispatch(value);
      else if (request.url === "/cancel") output = dispatcher.cancel(z.strictObject({ runId: z.string() }).parse(value).runId);
      else { response.writeHead(404).end(); return; }
      const body = JSON.stringify({ value: output });
      if (Buffer.byteLength(body) > 1024 * 1024) throw new StepFailure("unknown", "Dispatch result too large");
      response.writeHead(200, { "content-type": "application/json" }).end(body);
    } catch (error) {
      response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ error: "Task dispatch failed", code: stepFailureCode(error) ?? (error instanceof z.ZodError ? 'invalid' : 'unknown') }));
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;
  server.maxConnections = 128;
  async function startService(): Promise<void> {
    await own();
    startup ??= observe('startup', async () => {
      const version = await command(cli, ["--version"], 5000);
      if (!version.includes("temporal version 1.3.0 (Server 1.27.1,")) throw new Error("Local orchestration requires Temporal CLI 1.3.0 / server 1.27.1");
      const nodeVersion = await command(node, ["-p", "process.versions.node + ':' + Boolean(process.versions.bun)"], 5000);
      if (!/^24\.20\.0:false\s*$/.test(nodeVersion)) throw new Error("Local orchestration requires actual Node 24.20.0");
      const port = await unusedPort();
      address = `127.0.0.1:${port}`;
      const config = join(root, "service.json");
      await writeJson(config, { mode: "service", parent: process.pid, temporalPath: cli, port, database: join(root, "temporal.sqlite") });
      service = spawn(node, [sidecar, config], { stdio: ["ignore", "ignore", "pipe"] });
      let failed: Error | undefined;
      service.stderr?.on("data", () => {});
      service.once("error", (error) => { failed = error; });
      service.once("exit", () => { failed ??= new Error("Local Temporal service exited"); });
      try {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (failed) throw failed;
          try { connection = await Connection.connect({ address, connectTimeout: 200 }); break; }
          catch { await pause(100); }
        }
        if (!connection || failed) throw failed ?? new Error("Local Temporal readiness timed out");
        client = new Client({ connection });
        await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
        const bound = server.address();
        if (!bound || typeof bound === "string") throw new Error("Dispatch listener unavailable");
        bridgeURL = `http://127.0.0.1:${bound.port}`;
      } catch (error) { await connection?.close(); connection = undefined; await stopChild(service); throw error; }
    });
    await startup;
  }
  const ownersDirectory = join(root, "owners");
  async function listOwners(): Promise<readonly OwnerRecord[]> {
    await own();
    await mkdir(ownersDirectory, { recursive: true, mode: 0o700 });
    const paths = (await readdir(ownersDirectory)).filter((path) => path.endsWith(".json"));
    return Promise.all(paths.map(async (path) => OwnerRecordSchema.parse(await readJson(join(ownersDirectory, path)))));
  }
  const recordsPath = (owner: string) => join(root, "runs", `${owner}.json`);
  const records = async (owner: string) => z.array(RunRecord).parse(await readJson(recordsPath(owner)) ?? []);
  const bounded = <T>(work: () => Promise<T>) => connection!.withDeadline(Date.now() + 5000, work);
  async function unfinished(owner: string): Promise<boolean> {
    const entries = await records(owner);
    let changed = false;
    for (const entry of entries) {
      if (entry.terminal) continue;
      if (!client) return true;
      try {
        const state = await bounded(() => client!.workflow.getHandle(entry.runId).describe());
        if (state.status.name === "RUNNING") return true;
        entry.terminal = true; changed = true;
      } catch { return true; }
    }
    if (changed) await mutate(async () => {
      // Queries ran outside the writer queue. Merge terminal observations into the
      // latest index so a concurrent start intent cannot be dropped.
      const latest = await records(owner);
      for (const entry of latest) if (entries.some((observed) => observed.runId === entry.runId && observed.terminal)) entry.terminal = true;
      await writeJson(recordsPath(owner), latest);
    });
    return false;
  }
  async function hasUnfinishedInstallation(installationId: string): Promise<boolean> {
    for (const owner of await listOwners()) if (owner.installationId === installationId && await unfinished(owner.owner)) return true;
    return false;
  }
  async function prepareOwner(input: PrepareOwner, owner: string): Promise<LocalTemporalRegistration> {
    await own();
    const packageDirectory = await realpath(input.packageDirectory);
    if (isAbsolute(input.entrypoint)) throw new Error("Workflow entrypoint containment failed");
    const entry = await realpath(resolve(packageDirectory, input.entrypoint));
    const local = relative(packageDirectory, entry);
    if (local.startsWith("..") || isAbsolute(local) || !/\.(?:c|m)?js$/.test(entry)) throw new Error("Workflow entrypoint containment failed");
    await startService();
    const bundleDirectory = join(root, "bundles", owner);
    await mkdir(bundleDirectory, { recursive: true, mode: 0o700 });
    const destination = join(bundleDirectory, "candidate.js");
    const config = join(bundleDirectory, "compile.json");
    await writeJson(config, { mode: "bundle", parent: process.pid, entry, packageDirectory, destination });
    const output = await command(node, [sidecar, config], 45000);
    const compiled = Bundle.parse(JSON.parse(output.trim().split("\n").at(-1)!));
    // Verify source did not change between bundling and trusted host import.
    for (const [path, hash] of compiled.dependencies) if (digest(await readFile(path)) !== hash) throw new Error("Workflow dependency changed while preparing");
    const old = await readJson(join(ownersDirectory, `${owner}.json`));
    if (old !== undefined) {
      const previous = OwnerRecordSchema.parse(old);
      if (previous.bundleFingerprint !== compiled.fingerprint && await unfinished(owner)) throw new Error("Workflow bundle changed with unfinished runs");
    }
    const bundle = join(bundleDirectory, `${compiled.fingerprint}.js`);
    await rename(destination, bundle);
    const imported: unknown = await import(`${pathToFileURL(entry).href}?drawloom=${compiled.fingerprint}`);
    const registry = parseWorkflowModule(Reflect.get(imported as object, "default"));
    const record: OwnerRecord = { ...input, packageDirectory, owner, bundleFingerprint: compiled.fingerprint };
    await writeJson(join(ownersDirectory, `${owner}.json`), record);
    let ready = false;
    let disposed = false;
    let worker: ChildProcess | undefined;
    let dispatcher: Dispatcher | undefined;
    const token = randomUUID();
    const secret = digest(`${owner}:${compiled.fingerprint}`);
    const check = () => { if (!ready || disposed || closed || service?.exitCode !== null || service?.signalCode !== null || worker?.exitCode !== null || worker?.signalCode !== null) throw new Error("Local orchestration is not ready"); };
    const cursor = (kind: string, value: unknown) => {
      const payload = Buffer.from(JSON.stringify({ owner, bundle: compiled.fingerprint, kind, value })).toString("base64url");
      return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    };
    const decode = (kind: string, value?: string): number => {
      if (!value) return 0;
      const [payload, signature, extra] = value.split(".");
      if (!payload || !signature || extra || value.length > 8192) throw new Error("Invalid owner cursor");
      const expected = createHmac("sha256", secret).update(payload).digest();
      const supplied = Buffer.from(signature, "base64url");
      if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error("Invalid owner cursor");
      const decoded = z.strictObject({ owner: z.literal(owner), bundle: z.literal(compiled.fingerprint), kind: z.literal(kind), value: z.number().int().nonnegative() }).parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
      return decoded.value;
    };
    const handle = (runId: string) => {
      check(); if (!runId.startsWith(`${owner}/`)) throw new Error("Unknown run owner");
      return client!.workflow.getHandle(runId);
    };
    const checkBundle = async (runId: string) => {
      const entries = await records(owner);
      const record = entries.find((entry) => runId === entry.runId || runId.startsWith(`${entry.runId}/child/`));
      if (!record || record.bundleFingerprint !== compiled.fingerprint) throw new Error("Unknown run or blocked workflow bundle");
    };
    const observedStates = new Map<string, string>();
    const get: Orchestrator["get"] = async (runId) => {
      const run = handle(runId); await checkBundle(runId);
      const snapshot = RunSnapshotSchema.parse(await bounded(() => run.query("state")));
      if (snapshot.runId !== runId) throw new Error("Mismatched run response");
      const state = snapshot.unresolvedEffects.length ? 'unknown' : snapshot.cancellationRequested ? 'cancellation_requested' : snapshot.pendingInputs.length ? 'waiting' : snapshot.status;
      if (observedStates.get(runId) !== state) {
        if (observedStates.size >= 1024 && !observedStates.has(runId)) observedStates.delete(observedStates.keys().next().value!);
        observedStates.set(runId, state);
        const span = trace.getTracer('@drawloom/temporal-orchestration').startSpan('drawloom.orchestration.state');
        span.setAttribute('drawloom.run.id', digest(runId));
        span.setAttribute('drawloom.workflow.state', state);
        span.end();
      }
      if (snapshot.status !== "running") await mutate(async () => {
        const entries = await records(owner); const entry = entries.find((value) => value.runId === runId);
        if (entry && !entry.terminal) { entry.terminal = true; await writeJson(recordsPath(owner), entries); }
      });
      return snapshot;
    };
    const orchestrator: Orchestrator = {
      async start(identity, workflow, input) {
        check(); z.string().min(1).max(512).parse(identity);
        const definition = registry.workflows.find((value) => value.id === workflow.id && value.version === workflow.version);
        if (!definition) throw new Error("Unregistered workflow version");
        const value = parse(definition.input, input) as Json;
        const fingerprint = canonical([workflow.id, workflow.version, value]);
        const runId = `${owner}/${encodeURIComponent(identity)}`;
        await mutate(async () => {
          const entries = await records(owner); const prior = entries.find((entry) => entry.runId === runId);
          if (prior && (prior.fingerprint !== fingerprint || prior.bundleFingerprint !== compiled.fingerprint)) throw new Error("Conflicting start");
          if (!prior) { entries.push({ runId, fingerprint, bundleFingerprint: compiled.fingerprint, terminal: false }); await writeJson(recordsPath(owner), entries); }
        });
        await trace.getTracer("@drawloom/temporal-orchestration").startActiveSpan("drawloom.orchestration.start", async (span) => {
          span.setAttribute('drawloom.run.id', digest(runId));
          try {
            await bounded(() => client!.workflow.start("drawloomWorkflow", { workflowId: runId, taskQueue: `${owner}-${compiled.fingerprint}`, args: [{ identity, workflow: workflow.id, version: workflow.version, input: value, fingerprint }], workflowIdReusePolicy: "REJECT_DUPLICATE" }));
            span.setAttribute('drawloom.outcome', 'ok');
          } catch (error) { if (!(error instanceof WorkflowExecutionAlreadyStartedError)) { span.setAttribute('drawloom.outcome', 'error'); throw error; } span.setAttribute('drawloom.cache.hit', true); }
          finally { span.end(); }
        });
        if (await bounded(() => handle(runId).query("startIdentity")) !== fingerprint) throw new Error("Conflicting start");
        return runId;
      },
      get,
      async getSteps(runId, options = {}) {
        const run = handle(runId); await checkBundle(runId);
        const offset = decode(`steps:${runId}`, options.cursor), size = limit(options.limit);
        const steps = RunSnapshotSchema.shape.steps.parse(await bounded(() => run.query("steps", offset, size + 1)));
        return { steps: steps.slice(0, size), ...(steps.length > size ? { cursor: cursor(`steps:${runId}`, offset + size) } : {}) };
      },
      async list(options = {}) {
        check(); const offset = decode("list", options.cursor), size = limit(options.limit);
        const entries = (await records(owner)).filter((entry) => entry.bundleFingerprint === compiled.fingerprint);
        const runs = await Promise.all(entries.slice(offset, offset + size).map((entry) => get(entry.runId)));
        return { runs, ...(entries.length > offset + size ? { cursor: cursor("list", offset + size) } : {}) };
      },
      async result(runId, options = {}) {
        const run = handle(runId); await checkBundle(runId);
        if (options.signal?.aborted) throw new Error("Wait aborted");
        const result = run.result().then((value: unknown) => z.json().parse(value));
        if (!options.signal) return result;
        const signal = options.signal;
        return new Promise<Json>((resolve, reject) => {
          const abort = () => reject(new Error("Wait aborted")); signal.addEventListener("abort", abort, { once: true });
          result.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
        });
      },
      async respond(runId, requestId, value) {
        const run = handle(runId); await checkBundle(runId); z.json().parse(value);
        if (await bounded(() => run.query("answered", requestId, value))) return;
        if ((await get(runId)).status !== "running") throw new Error("Stale input");
        await bounded(() => run.executeUpdate("answer", { args: [requestId, value] }));
      },
      async cancel(runId) { const run = handle(runId); await checkBundle(runId); dispatcher?.cancel(runId); await bounded(() => run.cancel()); },
    };
    const registration: LocalTemporalRegistration = {
      registry, orchestrator,
      readiness() { try { check(); return { status: "ready" }; } catch { return { status: "unavailable", code: "worker_unavailable", message: "Local workflow worker is not ready" }; } },
      async attach(handlers) {
        if (disposed || closed) throw new Error("Registration closed");
        if (worker) throw new Error("Handlers already attached");
        const matched = matchTaskHandlers(registry, handlers);
        dispatcher = createReceiptDispatcher(join(root, "receipts", owner), owner, matched);
        dispatchers.set(owner, dispatcher); tokenOwners.set(token, owner);
        const config = join(bundleDirectory, "worker.json");
        await writeJson(config, { mode: "worker", parent: process.pid, address, taskQueue: `${owner}-${compiled.fingerprint}`, bundle, bridge: bridgeURL, token });
        worker = spawn(node, [sidecar, config], { stdio: ["ignore", "pipe", "pipe"] });
        workers.add(worker); worker.stderr?.on("data", () => {});
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Workflow worker readiness timed out")), 15000);
            worker!.once("error", (error) => { clearTimeout(timer); reject(error); });
            worker!.once("exit", () => { ready = false; clearTimeout(timer); reject(new Error("Workflow worker exited")); });
            worker!.stdout?.on("data", (data: Buffer) => { if (data.toString().includes("DRAWLOOM_WORKER_READY")) { clearTimeout(timer); ready = true; resolve(); } });
          });
        } catch (error) { await registration.close(); throw error; }
      },
      async close() {
        if (disposed) return; disposed = true; ready = false;
        tokenOwners.delete(token); dispatchers.delete(owner);
        await dispatcher?.close(); await stopChild(worker); if (worker) workers.delete(worker);
        registrations.delete(owner);
      },
    };
    registrations.set(owner, registration);
    return registration;
  }
  return {
    listOwners, hasUnfinishedInstallation,
    prepare(value: PrepareOwner): Promise<LocalTemporalRegistration> {
      const input = OwnerInput.parse(value);
      const owner = digest(canonical([input.projectId, input.installationId]));
      if (registrations.has(owner)) return Promise.reject(new Error("Owner already prepared"));
      const prior = preparing.get(owner); if (prior) return prior;
      const preparingOwner = observe('prepare', () => prepareOwner(input, owner)).finally(() => preparing.delete(owner));
      preparing.set(owner, preparingOwner); return preparingOwner;
    },
    async close() {
      if (closed) return; closed = true;
      return observe('shutdown', async () => {
      await Promise.allSettled([...preparing.values()]);
      await Promise.allSettled([...registrations.values()].map((registration) => registration.close()));
      tokenOwners.clear();
      server.closeAllConnections();
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      await connection?.close(); await stopChild(service); await serial;
      if (unlock) { await unlock(); unlock = undefined; }
      });
    },
  };
}
