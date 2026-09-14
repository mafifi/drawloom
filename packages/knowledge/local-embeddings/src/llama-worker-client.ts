import { randomBytes, randomInt } from "node:crypto";
import { spawn as nodeSpawn } from "node:child_process";
import { join } from "node:path";
import { z } from "zod";
import { LocalEmbeddingsError } from "./errors.js";
import { formatEmbeddingInput, knownManifest } from "./manifest.js";
import { createModelSetup, type ReadyModel } from "./setup.js";
import { validateEmbeddingVectors } from "./validation.js";
import { EmbedRequestSchema, type EmbedOptions, type EmbedRequest, type EmbeddingWorker } from "./worker-types.js";

interface ReadableLike { on(event: string, listener: (...args: any[]) => void): unknown; setEncoding(encoding: string): unknown; }
interface ChildLike { stdout: ReadableLike; stderr: ReadableLike; on(event: string, listener: (...args: any[]) => void): unknown; kill(signal?: NodeJS.Signals): boolean; }
type Spawn = (command: string, args: readonly string[], options: { cwd: string; env: NodeJS.ProcessEnv; stdio: readonly ["ignore", "pipe", "pipe"] }) => ChildLike;
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const TokenizedSchema = z.strictObject({ tokens: z.array(z.number().int()).max(8193) });
const EmbeddingsSchema = z.object({
  object: z.string().optional(), model: z.string(), usage: z.unknown().optional(),
  data: z.array(z.strictObject({ object: z.string().optional(), index: z.number().int().nonnegative(), embedding: z.array(z.number()).max(1024) })).max(50),
});
const maxResponseBytes = 2 * 1024 * 1024;

export interface LlamaEmbeddingWorkerOptions {
  readonly root: string;
  readonly model: "qwen3-embedding-0.6b-gguf";
  readonly requestTimeoutMs?: number;
  readonly shutdownTimeoutMs?: number;
  readonly spawn?: Spawn;
  readonly fetch?: Fetch;
  readonly port?: () => number;
  readonly apiKey?: () => string;
  readonly ready?: () => Promise<ReadyModel | undefined>;
}

/** Persistent supervised llama-server. Only one bounded embedding request is admitted at a time. */
export class LlamaEmbeddingWorker implements EmbeddingWorker {
  readonly #options: LlamaEmbeddingWorkerOptions;
  readonly #ready: () => Promise<ReadyModel | undefined>;
  #child: ChildLike | undefined;
  #server: { baseUrl: string; apiKey: string; stopped: AbortController } | undefined;
  #retiring: Promise<void> = Promise.resolve();
  #exited = new WeakSet<object>();
  #active: AbortController | undefined;
  #busy = false;
  #closed = false;

  constructor(options: LlamaEmbeddingWorkerOptions) {
    this.#options = options;
    if (options.ready) this.#ready = options.ready;
    else {
      const setup = createModelSetup({ root: options.root, manifest: knownManifest(options.model) });
      this.#ready = () => setup.ready();
    }
  }

  async embed(input: EmbedRequest, options: EmbedOptions = {}): Promise<readonly (readonly number[])[]> {
    if (this.#closed) throw new LocalEmbeddingsError("worker_closed", "Inference worker is closed");
    if (this.#busy) throw new LocalEmbeddingsError("worker_busy", "One inference request is already running");
    const request = EmbedRequestSchema.parse(input);
    const timeoutMs = options.timeoutMs ?? this.#options.requestTimeoutMs ?? 30_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new LocalEmbeddingsError("invalid_request", "Invalid inference deadline");
    options.signal?.throwIfAborted();
    this.#busy = true;
    const operation = new AbortController(); this.#active = operation;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; operation.abort(); }, timeoutMs);
    const cancel = () => operation.abort(); options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      const ready = await this.#abortable(this.#ready(), operation.signal);
      if (!ready) throw new LocalEmbeddingsError("model_not_ready", "GGUF model and llama.cpp runtime are not ready");
      await this.#abortable(this.#retiring, operation.signal);
      if (this.#closed) throw new LocalEmbeddingsError("worker_closed", "Inference worker is closed");
      await this.#ensureStarted(ready, operation.signal);
      const formatted = request.items.map((item) => formatEmbeddingInput(this.#options.model, request.role, item));
      let total = 0;
      for (const content of formatted) {
        const tokenized = TokenizedSchema.safeParse(await this.#json("/tokenize", { content, add_special: true, parse_special: true }, operation.signal));
        if (!tokenized.success) throw new LocalEmbeddingsError("invalid_result", "llama.cpp returned invalid tokenization");
        if (tokenized.data.tokens.length > ready.manifest.maxTokens) throw new LocalEmbeddingsError("input_too_large", "Embedding item exceeds its token budget");
        total += tokenized.data.tokens.length;
        if (total > ready.manifest.maxBatchTokens) throw new LocalEmbeddingsError("input_too_large", "Embedding batch exceeds its token budget");
      }
      const vectors: unknown[] = [];
      for (const content of formatted) {
        const parsed = EmbeddingsSchema.safeParse(await this.#json("/v1/embeddings", { input: content, model: this.#options.model, encoding_format: "float" }, operation.signal));
        if (!parsed.success || parsed.data.model !== this.#options.model || parsed.data.data.length !== 1 || parsed.data.data[0]?.index !== 0) {
          throw new LocalEmbeddingsError("invalid_result", "llama.cpp returned an invalid embedding result");
        }
        vectors.push(parsed.data.data[0].embedding);
      }
      return validateEmbeddingVectors(vectors, { count: request.items.length, dimensions: ready.manifest.dimensions, normalized: true });
    } catch (cause) {
      const interrupted = operation.signal.aborted;
      if (this.#child && (interrupted || !(cause instanceof LocalEmbeddingsError) || !["input_too_large", "model_not_ready"].includes(cause.code))) await this.#retire(this.#child);
      if (this.#closed) throw new LocalEmbeddingsError("worker_closed", "Inference worker is closed");
      if (timedOut) throw new LocalEmbeddingsError("request_timeout", "llama.cpp inference request timed out");
      if (options.signal?.aborted) throw new LocalEmbeddingsError("request_cancelled", "llama.cpp inference request was cancelled");
      if (cause instanceof LocalEmbeddingsError) throw cause;
      throw new LocalEmbeddingsError("worker_failed", "llama.cpp inference failed");
    } finally {
      clearTimeout(timer); options.signal?.removeEventListener("abort", cancel);
      if (this.#active === operation) this.#active = undefined;
      this.#busy = false;
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true; this.#active?.abort();
    if (this.#child) await this.#retire(this.#child);
    await this.#retiring;
  }

  async #ensureStarted(ready: ReadyModel, signal: AbortSignal): Promise<void> {
    if (this.#child && this.#server) return;
    const port = this.#options.port?.() ?? randomInt(49_152, 65_536);
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65_535) throw new LocalEmbeddingsError("configuration_mismatch", "Invalid private server port");
    const apiKey = this.#options.apiKey?.() ?? randomBytes(32).toString("base64url");
    if (apiKey.length < 16) throw new LocalEmbeddingsError("configuration_mismatch", "Private server key is too short");
    const binary = join(ready.runtimeDirectory, "bin", "llama-server");
    const model = join(ready.directory, ready.manifest.artifacts[0]!.path);
    const args = [
      "--model", model, "--alias", this.#options.model, "--host", "127.0.0.1", "--port", String(port), "--api-key", apiKey,
      "--embedding", "--pooling", "last", "--offline", "--no-webui", "--no-webui-mcp-proxy",
      "--device", "MTL0", "--n-gpu-layers", "all", "--ctx-size", "4096", "--batch-size", "2048", "--ubatch-size", "2048", "--parallel", "1",
    ] as const;
    const spawn = this.#options.spawn ?? (nodeSpawn as unknown as Spawn);
    const child = spawn(binary, args, { cwd: ready.runtimeDirectory, env: { HOME: this.#options.root, PATH: "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"] });
    const stopped = new AbortController();
    this.#child = child; this.#server = { baseUrl: `http://127.0.0.1:${port}`, apiKey, stopped };
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", () => undefined); child.stderr.on("data", () => undefined);
    const failed = () => { if (this.#child === child) { stopped.abort(); this.#active?.abort(); } };
    const exited = () => {
      this.#exited.add(child);
      if (this.#child === child) { this.#child = undefined; this.#server = undefined; stopped.abort(); this.#active?.abort(); }
    };
    child.stdout.on("error", failed); child.stderr.on("error", failed); child.on("error", failed); child.on("exit", exited); child.on("close", exited);
    for (;;) {
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      if (stopped.signal.aborted) throw new LocalEmbeddingsError("worker_failed", "llama.cpp server stopped during startup");
      try {
        const response = await this.#fetch(`${this.#server.baseUrl}/v1/models`, { headers: this.#headers(), signal });
        if (response.ok) { await response.body?.cancel().catch(() => undefined); return; }
        await response.body?.cancel().catch(() => undefined);
      } catch (cause) {
        if (signal.aborted || stopped.signal.aborted) throw cause;
      }
      await this.#delay(20, signal);
    }
  }

  async #json(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    const server = this.#server; if (!server) throw new LocalEmbeddingsError("worker_failed", "llama.cpp server is unavailable");
    const response = await this.#fetch(`${server.baseUrl}${path}`, { method: "POST", headers: this.#headers(), body: JSON.stringify(body), signal });
    if (!response.ok) { await response.body?.cancel().catch(() => undefined); throw new LocalEmbeddingsError("worker_failed", "llama.cpp request failed"); }
    const text = await response.text();
    if (Buffer.byteLength(text) > maxResponseBytes) throw new LocalEmbeddingsError("invalid_result", "llama.cpp response exceeds its byte budget");
    try { return JSON.parse(text); }
    catch { throw new LocalEmbeddingsError("invalid_result", "llama.cpp returned malformed JSON"); }
  }

  #headers(): Headers {
    const headers = new Headers({ "content-type": "application/json" });
    if (this.#server) headers.set("authorization", `Bearer ${this.#server.apiKey}`);
    return headers;
  }

  #fetch(input: string, init: RequestInit): Promise<Response> { return (this.#options.fetch ?? globalThis.fetch)(input, init); }

  #delay(milliseconds: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(done, milliseconds);
      const abort = () => done(new DOMException("aborted", "AbortError"));
      function done(error?: Error) { clearTimeout(timer); signal.removeEventListener("abort", abort); error ? reject(error) : resolve(); }
      signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort();
    });
  }

  #abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => finish(new DOMException("aborted", "AbortError")); let settled = false;
      const finish = (error?: unknown, value?: T) => { if (settled) return; settled = true; signal.removeEventListener("abort", abort); error ? reject(error) : resolve(value!); };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort(); else void promise.then((value) => finish(undefined, value), (cause) => finish(cause));
    });
  }

  async #retire(child: ChildLike): Promise<void> {
    if (this.#exited.has(child)) {
      if (this.#child === child) { this.#child = undefined; this.#server = undefined; }
      return;
    }
    if (this.#child !== child) { await this.#retiring; return; }
    this.#child = undefined; this.#server = undefined;
    const retiring = new Promise<void>((resolve, reject) => {
      let settled = false; let escalation: ReturnType<typeof setTimeout> | undefined;
      const finish = (error?: Error) => { if (settled) return; settled = true; clearTimeout(timer); if (escalation) clearTimeout(escalation); error ? reject(error) : resolve(); };
      child.on("exit", () => finish()); child.on("close", () => finish());
      child.kill("SIGTERM");
      const timeout = this.#options.shutdownTimeoutMs ?? 5_000;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        escalation = setTimeout(() => finish(new LocalEmbeddingsError("worker_shutdown_timeout", "llama.cpp server did not exit after SIGKILL")), timeout);
      }, timeout);
    });
    this.#retiring = retiring; await retiring;
  }
}
