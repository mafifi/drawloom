import { spawn as nodeSpawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { LocalEmbeddingsError } from "./errors.js";
import { knownManifest } from "./manifest.js";
import { createModelSetup, type ReadyModel } from "./setup.js";
import { validateEmbeddingVectors } from "./validation.js";
import { EmbedRequestSchema as RequestSchema, type EmbedOptions, type EmbedRequest } from "./worker-types.js";

const expectedVersions = { "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2" } as const;
const ReadySchema = z.strictObject({ kind: z.literal("ready"), protocol: z.literal(1), modelRevision: z.string(), dimensions: z.number().int(), device: z.literal("gpu"), versions: z.record(z.string(), z.string()) });
const ResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("result"), id: z.string(), vectors: z.array(z.array(z.number().finite()).max(1024)).max(50) }),
  z.strictObject({ kind: z.literal("error"), id: z.string(), code: z.string().min(1).max(128) }),
]);
interface ReadableLike { on(event: string, listener: (...args: any[]) => void): unknown; setEncoding(encoding: string): unknown; }
interface WritableLike { on(event: string, listener: (...args: any[]) => void): unknown; write(value: string): unknown; end(): unknown; }
interface ChildLike { stdout: ReadableLike; stderr: ReadableLike; stdin: WritableLike; on(event: string, listener: (...args: any[]) => void): unknown; kill(signal?: NodeJS.Signals): boolean; }
// 50 normalized 1,024-dimensional vectors serialized as finite JSON numbers
// exceed 1 MiB with ordinary Python spacing. Two MiB admits that contract while
// retaining a strict bound against unterminated or malicious output.
const maxOutputBytes = 2 * 1024 * 1024;
type Spawn = (command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv; stdio: readonly ["pipe", "pipe", "pipe"] }) => ChildLike;

export interface MlxEmbeddingWorkerOptions {
  readonly root: string;
  readonly model: "qwen3-embedding-0.6b-mlx";
  readonly requestTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly spawn?: Spawn;
  readonly ready?: () => Promise<ReadyModel | undefined>;
}

/** Persistent, offline stdio subprocess. One request is admitted at a time. */
export class MlxEmbeddingWorker {
  readonly #options: MlxEmbeddingWorkerOptions;
  readonly #ready: () => Promise<ReadyModel | undefined>;
  #child: ChildLike | undefined;
  #busy = false;
  #closed = false;
  #sequence = 0;
  #lines = "";
  #pending: { id: string; count: number; resolve(value: readonly (readonly number[])[]): void; reject(error: Error): void } | undefined;
  #handshake: { resolve(): void; reject(error: Error): void } | undefined;
  #closeController = new AbortController();
  #retiring: Promise<void> = Promise.resolve();
  #retirements = new WeakMap<object, Promise<void>>();
  #exited = new WeakSet<object>();

  constructor(options: MlxEmbeddingWorkerOptions) {
    this.#options = options;
    if (options.ready) this.#ready = options.ready;
    else {
      // Keep the setup instance: its conservative file-identity cache avoids
      // rehashing the 600 MB model on every embedding request.
      const setup = createModelSetup({ root: options.root, manifest: knownManifest(options.model) });
      this.#ready = () => setup.ready();
    }
  }

  async embed(input: EmbedRequest, options: EmbedOptions = {}): Promise<readonly (readonly number[])[]> {
    if (this.#closed) throw new LocalEmbeddingsError("worker_closed", "Inference worker is closed");
    if (this.#busy) throw new LocalEmbeddingsError("worker_busy", "One inference request is already running");
    const request = RequestSchema.parse(input);
    const timeoutMs = options.timeoutMs ?? this.#options.requestTimeoutMs ?? 30_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new LocalEmbeddingsError("invalid_request", "Invalid inference deadline");
    options.signal?.throwIfAborted();
    this.#busy = true;
    try {
      const deadline = performance.now() + timeoutMs;
      const ready = await this.#bounded(this.#ready(), deadline, options.signal);
      if (this.#closed) throw new LocalEmbeddingsError("worker_closed", "Inference worker is closed");
      if (!ready?.runtimeDirectory) throw new LocalEmbeddingsError("model_not_ready", "MLX model and isolated runtime are not ready");
      await this.#bounded(this.#retiring, deadline, options.signal);
      if (this.#closed) throw new LocalEmbeddingsError("worker_closed", "Inference worker is closed");
      await this.#ensureStarted(ready, deadline, options.signal);
      const child = this.#child;
      if (!child) throw new LocalEmbeddingsError("worker_failed", "MLX inference worker stopped during startup");
      const id = String(++this.#sequence);
      return await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error, vectors?: readonly (readonly number[])[]) => {
          if (settled) return; settled = true; clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
          if (this.#pending?.id === id) this.#pending = undefined;
          error ? reject(error) : resolve(vectors!);
        };
        const halt = (code: string) => { finish(new LocalEmbeddingsError(code, "MLX inference request interrupted")); this.#terminate(child); };
        const cancel = () => halt("request_cancelled");
        const timer = setTimeout(() => halt("request_timeout"), Math.max(1, deadline - performance.now()));
        this.#pending = { id, count: request.items.length, resolve: (vectors) => finish(undefined, vectors), reject: (error) => finish(error) };
        options.signal?.addEventListener("abort", cancel, { once: true });
        if (options.signal?.aborted) cancel();
        else child.stdin.write(`${JSON.stringify({ kind: "embed", id, request })}\n`);
      });
    } finally { this.#busy = false; }
  }

  async close(): Promise<void> {
    this.#closed = true;
    this.#closeController.abort();
    this.#pending?.reject(new LocalEmbeddingsError("worker_closed", "Inference worker closed"));
    if (this.#child) this.#terminate(this.#child);
    await this.#retiring;
  }

  async #ensureStarted(ready: ReadyModel, deadline: number, signal?: AbortSignal): Promise<void> {
    if (this.#child) return;
    const python = join(ready.runtimeDirectory!, "bin", "python");
    const script = fileURLToPath(new URL("../python/mlx_worker.py", import.meta.url));
    const spawn = this.#options.spawn ?? (nodeSpawn as unknown as Spawn);
    const child = spawn(python, ["-I", script, ready.directory, ready.manifest.revision], {
      cwd: ready.directory,
      env: { PATH: process.env.PATH, HOME: this.#options.root, HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", TOKENIZERS_PARALLELISM: "false", PYTHONNOUSERSITE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#child = child; this.#lines = "";
    let handshake!: { resolve(): void; reject(error: Error): void };
    const started = new Promise<void>((resolve, reject) => { handshake = { resolve, reject }; });
    this.#handshake = handshake;
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: unknown) => this.#receive(child, String(chunk)));
    child.stderr.on("data", () => undefined);
    const streamFailed = () => this.#streamFailed(child);
    child.stdin.on("error", streamFailed); child.stdout.on("error", streamFailed); child.stderr.on("error", streamFailed);
    child.on("error", streamFailed);
    const stopped = () => {
      if (this.#exited.has(child)) return;
      this.#exited.add(child); this.#failed(child, new LocalEmbeddingsError("worker_failed", "MLX inference worker stopped"));
    };
    child.on("exit", stopped); child.on("close", stopped);
    try { await this.#bounded(started, deadline, signal); }
    catch (cause) { this.#terminate(child); throw cause; }
    finally { if (this.#handshake === handshake) this.#handshake = undefined; }
  }

  #receive(child: ChildLike, chunk: string): void {
    if (this.#child !== child) return;
    this.#lines += chunk;
    if (Buffer.byteLength(this.#lines) > maxOutputBytes) { this.#protocolFailure(); return; }
    for (;;) {
      const newline = this.#lines.indexOf("\n"); if (newline < 0) return;
      const line = this.#lines.slice(0, newline); this.#lines = this.#lines.slice(newline + 1);
      let value: unknown; try { value = JSON.parse(line); } catch { this.#protocolFailure(); continue; }
      if (this.#handshake) {
        const parsed = ReadySchema.safeParse(value);
        if (!parsed.success || parsed.data.modelRevision !== knownManifest(this.#options.model).revision || parsed.data.dimensions !== 1024 || Object.entries(expectedVersions).some(([name, version]) => parsed.data.versions[name] !== version)) {
          this.#handshake.reject(new LocalEmbeddingsError("configuration_mismatch", "MLX runtime does not match the supported configuration")); this.#handshake = undefined; this.#protocolFailure(); continue;
        }
        this.#handshake.resolve(); this.#handshake = undefined; continue;
      }
      const parsed = ResultSchema.safeParse(value); const pending = this.#pending;
      if (!parsed.success) { this.#protocolFailure(); continue; }
      if (!pending || parsed.data.id !== pending.id) continue;
      if (parsed.data.kind === "error") { pending.reject(new LocalEmbeddingsError(parsed.data.code, "MLX inference failed")); continue; }
      try { pending.resolve(validateEmbeddingVectors(parsed.data.vectors, { count: pending.count, dimensions: 1024 })); }
      catch { pending.reject(new LocalEmbeddingsError("invalid_result", "Invalid MLX inference vectors")); this.#terminate(this.#child!); }
    }
  }

  #protocolFailure(): void { const child = this.#child; const error = new LocalEmbeddingsError("invalid_result", "Invalid MLX worker response"); this.#handshake?.reject(error); this.#handshake = undefined; this.#pending?.reject(error); if (child) this.#terminate(child); }
  #streamFailed(child: ChildLike): void {
    if (this.#child !== child) return;
    const error = new LocalEmbeddingsError("worker_failed", "MLX inference worker stream failed");
    this.#handshake?.reject(error); this.#handshake = undefined; this.#pending?.reject(error);
    this.#terminate(child);
  }
  #failed(child: ChildLike, error: Error): void { if (this.#child !== child) return; this.#child = undefined; this.#handshake?.reject(error); this.#handshake = undefined; this.#pending?.reject(error); }
  #terminate(child: ChildLike): void {
    const existing = this.#retirements.get(child); if (existing) { this.#retiring = existing; return; }
    if (this.#child === child) this.#child = undefined;
    if (this.#exited.has(child)) return;
    child.stdin.end(); child.kill("SIGTERM");
    const retiring = new Promise<void>((resolve, reject) => {
      let settled = false;
      let escalation: ReturnType<typeof setTimeout> | undefined;
      const done = () => { if (!settled) { settled = true; clearTimeout(timer); if (escalation) clearTimeout(escalation); resolve(); } };
      child.on("exit", done); child.on("close", done);
      const timeout = this.#options.shutdownTimeoutMs ?? 5_000;
      const timer = setTimeout(() => { child.kill("SIGKILL"); escalation = setTimeout(() => { if (!settled) { settled = true; this.#closed = true; reject(new LocalEmbeddingsError("worker_shutdown_timeout", "MLX worker did not exit after SIGKILL")); } }, timeout); }, timeout);
    });
    this.#retirements.set(child, retiring); this.#retiring = retiring;
    void this.#retiring.catch(() => undefined);
  }

  #bounded<T>(operation: Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const remaining = deadline - performance.now();
      if (remaining <= 0) { reject(new LocalEmbeddingsError("request_timeout", "MLX inference request timed out")); return; }
      const timer = setTimeout(() => finish(new LocalEmbeddingsError("request_timeout", "MLX inference request timed out")), remaining);
      const abort = () => finish(new LocalEmbeddingsError(this.#closed ? "worker_closed" : "request_cancelled", "MLX inference request interrupted"));
      let settled = false;
      const finish = (error?: Error, value?: T) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); this.#closeController.signal.removeEventListener("abort", abort); error ? reject(error) : resolve(value!); };
      signal?.addEventListener("abort", abort, { once: true }); this.#closeController.signal.addEventListener("abort", abort, { once: true });
      if (signal?.aborted || this.#closeController.signal.aborted) abort();
      else void operation.then((value) => finish(undefined, value), (cause) => finish(cause instanceof Error ? cause : new Error(String(cause))));
    });
  }
}
