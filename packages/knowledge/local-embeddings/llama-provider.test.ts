import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  KnownLlamaRuntime, KnownModelManifests, LlamaEmbeddingWorker, ModelManifestSchema, RuntimeArtifactSchema,
  createModelSetup, embeddingConfiguration, formatEmbeddingInput, validateEmbeddingVectors,
} from "./src/index.js";

const modelId = "qwen3-embedding-0.6b-gguf" as const;
const unit = Object.freeze([1, ...Array<number>(1023).fill(0)]);
const execFileAsync = promisify(execFile);

test("the supported GGUF identity replaces the old index generation", () => {
  expect(LlamaEmbeddingWorker).toBeFunction();
  expect(Object.keys(KnownModelManifests)).toEqual([modelId]);
  const manifest = KnownModelManifests[modelId];
  expect(manifest).toMatchObject({
    id: modelId,
    revision: "370f27d7550e0def9b39c1f16d3fbaa13aa67728",
    dimensions: 1024,
    runtime: "llama.cpp",
    maxTokens: 2048,
    maxBatchTokens: 8192,
    artifacts: [{
      path: "Qwen3-Embedding-0.6B-Q8_0.gguf",
      bytes: 639150592,
      sha256: "06507c7b42688469c4e7298b0a1e16deff06caf291cf0a5b278c308249c3e439",
      url: "https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/370f27d7550e0def9b39c1f16d3fbaa13aa67728/Qwen3-Embedding-0.6B-Q8_0.gguf",
    }],
  });
  expect(embeddingConfiguration(modelId).id).toBe(`local:${modelId}`);
  expect(embeddingConfiguration(modelId).fingerprint).not.toBe("7901d8a98731adf8926fbab80206cd38f59596c361f9ad4b5d1ad74d992dabf3");
  expect(embeddingConfiguration(modelId).fingerprint).not.toBe("c9ca071c3fc2fcf7b37dd7a6ca4300d9819149195931590c4152cef0ca442936");
  expect(KnownLlamaRuntime).toMatchObject({
    bytes: 4697890,
    sha256: "0bf91c702d391a106aba0e0b61f15a5b77bab5d269aff0c7590b2f82332de88a",
    binarySha256: "e1e60e0d2dde29a6da46474f6ba1b8365f714527230bc4cb35134c3839096007",
  });
  expect(formatEmbeddingInput(modelId, "query", "Where?")).toBe("Instruct: Given a web search query, retrieve relevant passages that answer the query\nQuery:Where?");
  expect(formatEmbeddingInput(modelId, "document", "There.")).toBe("There.");
});

test("setup is honestly unavailable before any download when the runtime has no published URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-llama-unavailable-"));
  let fetched = 0;
  try {
    const setup = createModelSetup({ root, manifest: KnownModelManifests[modelId], fetch: async () => { fetched++; throw Error("must not fetch"); } });
    await expect(setup.install()).resolves.toEqual({ kind: "pending_consent" });
    await expect(setup.install({ consent: true })).resolves.toEqual({ kind: "failed", code: "runtime_unavailable" });
    expect(fetched).toBe(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

class FakeReadable extends EventEmitter { setEncoding(): this { return this; } }
class FakeChild extends EventEmitter {
  readonly stdout = new FakeReadable();
  readonly stderr = new FakeReadable();
  readonly signals: string[] = [];
  kill(signal?: string): boolean { this.signals.push(signal ?? "SIGTERM"); queueMicrotask(() => this.emit("exit", 0)); return true; }
}
class AlreadyExitedChild extends FakeChild {
  exited = false;
  override kill(signal?: string): boolean { this.signals.push(signal ?? "SIGTERM"); return !this.exited; }
}

const jsonResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

test("llama worker starts one authenticated loopback embedding-only Metal server and tokenizes before embedding", async () => {
  const children: FakeChild[] = [];
  const starts: Array<{ command: string; args: readonly string[]; options: unknown }> = [];
  const calls: Array<{ url: string; init?: RequestInit; body?: any }> = [];
  const worker = new LlamaEmbeddingWorker({
    root: "/controlled",
    model: modelId,
    port: () => 54321,
    apiKey: () => "private-test-key",
    ready: async () => ({ manifest: KnownModelManifests[modelId], directory: "/controlled/model", runtimeDirectory: "/controlled/runtime" }),
    spawn: (command, args, options) => { starts.push({ command, args, options }); const child = new FakeChild(); children.push(child); return child; },
    fetch: async (input, init) => {
      const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, ...(init ? { init } : {}), body });
      if (url.endsWith("/v1/models")) return jsonResponse({ object: "list", data: [{ id: modelId, object: "model", created: 0, owned_by: "llama.cpp" }] });
      if (url.endsWith("/tokenize")) return jsonResponse({ tokens: body.content === "document" ? [1] : [1, 2, 3] });
      return jsonResponse({ object: "list", model: modelId, usage: { prompt_tokens: 2, total_tokens: 2 }, data: [
        { object: "embedding", index: 0, embedding: unit },
      ] });
    },
  });
  try {
    await expect(worker.embed({ role: "document", items: ["document", "second"] })).resolves.toHaveLength(2);
    expect(children).toHaveLength(1);
    expect(starts).toEqual([{ command: "/controlled/runtime/bin/llama-server", args: [
      "--model", "/controlled/model/Qwen3-Embedding-0.6B-Q8_0.gguf", "--alias", modelId, "--host", "127.0.0.1", "--port", "54321",
      "--api-key", "private-test-key", "--embedding", "--pooling", "last", "--offline", "--no-webui", "--no-webui-mcp-proxy",
      "--device", "MTL0", "--n-gpu-layers", "all", "--ctx-size", "4096", "--batch-size", "2048", "--ubatch-size", "2048", "--parallel", "1",
    ], options: { cwd: "/controlled/runtime", env: { HOME: "/controlled", PATH: "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "pipe"] } }]);
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/v1/models", "/tokenize", "/tokenize", "/v1/embeddings", "/v1/embeddings"]);
    expect(calls.filter((call) => new URL(call.url).pathname === "/v1/embeddings").map((call) => call.body.input)).toEqual(["document", "second"]);
    expect(calls.every((call) => new Headers(call.init?.headers).get("authorization") === "Bearer private-test-key")).toBe(true);
  } finally { await worker.close(); }
  expect(children[0]!.signals).toEqual(["SIGTERM"]);
});

test("llama worker enforces per-item and aggregate token budgets before inference", async () => {
  for (const counts of [[2049], [2000, 2000, 2000, 2000, 193]]) {
    const tokenCounts = [...counts];
    let embeddings = 0;
    const worker = new LlamaEmbeddingWorker({ root: "/controlled", model: modelId, port: () => 54322, apiKey: () => "private-test-key",
      ready: async () => ({ manifest: KnownModelManifests[modelId], directory: "/model", runtimeDirectory: "/runtime" }),
      spawn: () => new FakeChild(),
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path === "/v1/models") return jsonResponse({ object: "list", data: [] });
        if (path === "/tokenize") return jsonResponse({ tokens: Array(tokenCounts.shift()!).fill(1) });
        embeddings++; return jsonResponse({ data: [] });
      },
    });
    try { await expect(worker.embed({ role: "document", items: counts.map((_, index) => String(index)) })).rejects.toMatchObject({ code: "input_too_large" }); }
    finally { await worker.close(); }
    expect(embeddings).toBe(0);
  }
});

test("llama worker rejects wrong indexes and non-normalized, null, or non-finite vectors", async () => {
  for (const data of [
    [{ object: "embedding", index: 1, embedding: unit }],
    [{ object: "embedding", index: 0, embedding: [2, ...Array<number>(1023).fill(0)] }],
    [{ object: "embedding", index: 0, embedding: [null, ...Array<number>(1023).fill(0)] }],
    [{ object: "embedding", index: 0, embedding: [Number.NaN, ...Array<number>(1023).fill(0)] }],
  ]) {
    const child = new FakeChild();
    const worker = new LlamaEmbeddingWorker({ root: "/controlled", model: modelId, port: () => 54323, apiKey: () => "private-test-key",
      ready: async () => ({ manifest: KnownModelManifests[modelId], directory: "/model", runtimeDirectory: "/runtime" }), spawn: () => child,
      fetch: async (input) => new URL(String(input)).pathname === "/tokenize" ? jsonResponse({ tokens: [1] }) : new URL(String(input)).pathname === "/v1/models" ? jsonResponse({ object: "list", data: [] }) : jsonResponse({ object: "list", model: modelId, usage: { prompt_tokens: 1, total_tokens: 1 }, data }),
    });
    await expect(worker.embed({ role: "document", items: ["x"] })).rejects.toMatchObject({ code: "invalid_result" });
    expect(child.signals).toEqual(["SIGTERM"]);
    await worker.close();
  }
});

test("cancellation reaps the uncertain server before a later request starts a replacement", async () => {
  const children: FakeChild[] = []; let release!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  let request = 0;
  const worker = new LlamaEmbeddingWorker({ root: "/controlled", model: modelId, port: () => 54324, apiKey: () => "private-test-key",
    ready: async () => ({ manifest: KnownModelManifests[modelId], directory: "/model", runtimeDirectory: "/runtime" }),
    spawn: () => { const child = new FakeChild(); children.push(child); return child; },
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path === "/v1/models") return jsonResponse({ object: "list", data: [] });
      if (path === "/tokenize" && request++ === 0) { await Promise.race([blocked, new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }))]); }
      if (path === "/tokenize") return jsonResponse({ tokens: [1] });
      return jsonResponse({ object: "list", model: modelId, usage: { prompt_tokens: 1, total_tokens: 1 }, data: [{ object: "embedding", index: 0, embedding: unit }] });
    },
  });
  const controller = new AbortController(); const first = worker.embed({ role: "document", items: ["first"] }, { signal: controller.signal });
  while (!request) await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await expect(first).rejects.toMatchObject({ code: "request_cancelled" });
  expect(children[0]!.signals).toEqual(["SIGTERM"]);
  await expect(worker.embed({ role: "document", items: ["second"] })).resolves.toHaveLength(1);
  expect(children).toHaveLength(2);
  release(); await worker.close();
});

test("an already-exited server settles promptly and the next request starts a replacement", async () => {
  const children: FakeChild[] = []; let start = 0;
  const worker = new LlamaEmbeddingWorker({ root: "/controlled", model: modelId, port: () => 54325, apiKey: () => "private-test-key", shutdownTimeoutMs: 20,
    ready: async () => ({ manifest: KnownModelManifests[modelId], directory: "/model", runtimeDirectory: "/runtime" }),
    spawn: () => { const child = start === 0 ? new AlreadyExitedChild() : new FakeChild(); children.push(child); if (start++ === 0) queueMicrotask(() => { (child as AlreadyExitedChild).exited = true; child.emit("exit", 1); }); return child; },
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (children.length === 1) return new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
      if (path === "/v1/models") return jsonResponse({ object: "list", data: [] });
      if (path === "/tokenize") return jsonResponse({ tokens: [1] });
      return jsonResponse({ object: "list", model: modelId, data: [{ index: 0, embedding: unit }] });
    },
  });
  const began = performance.now(); await expect(worker.embed({ role: "document", items: ["first"] })).rejects.toMatchObject({ code: "worker_failed" });
  expect(performance.now() - began).toBeLessThan(20);
  await expect(worker.embed({ role: "document", items: ["second"] })).resolves.toHaveLength(1);
  expect(children).toHaveLength(2); await worker.close();
});

test("vector validation rejects non-unit output", () => {
  expect(() => validateEmbeddingVectors([[2, 0]], { count: 1, dimensions: 2, normalized: true })).toThrow();
  expect(validateEmbeddingVectors([[0.6, 0.8]], { count: 1, dimensions: 2, normalized: true })).toEqual([[0.6, 0.8]]);
});

test("obsolete MLX cleanup removes only exact owned directories and refuses a symlinked root", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-obsolete-cleanup-"));
  const outside = await mkdtemp(join(tmpdir(), "drawloom-obsolete-outside-"));
  try {
    await mkdir(join(root, "runtime", "mlx"), { recursive: true });
    await mkdir(join(root, "runtime", ".uv-python"), { recursive: true });
    await mkdir(join(root, "runtime", ".uv-cache"), { recursive: true });
    await mkdir(join(root, "active", "qwen3-embedding-0.6b-mlx"), { recursive: true });
    await writeFile(join(root, "keep"), "keep");
    const setup = createModelSetup({ root, manifest: KnownModelManifests[modelId] });
    await expect(setup.cleanupObsoleteMlxRuntime()).resolves.toMatchObject({ kind: "removed" });
    expect(await readFile(join(root, "keep"), "utf8")).toBe("keep");
    const link = join(outside, "root-link"); await symlink(root, link);
    const unsafe = createModelSetup({ root: link, manifest: KnownModelManifests[modelId] });
    await expect(unsafe.cleanupObsoleteMlxRuntime()).resolves.toEqual({ kind: "refused", code: "unsafe_root" });
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test("obsolete MLX cleanup refuses symlinked ownership intermediates without deleting external data", async () => {
  for (const intermediate of ["runtime", "active"] as const) {
    const root = await mkdtemp(join(tmpdir(), `drawloom-obsolete-${intermediate}-`));
    const outside = await mkdtemp(join(tmpdir(), `drawloom-obsolete-${intermediate}-outside-`));
    const leaf = intermediate === "runtime" ? "mlx" : "qwen3-embedding-0.6b-mlx";
    try {
      await mkdir(join(outside, leaf), { recursive: true });
      await writeFile(join(outside, leaf, "preserve"), "external");
      await symlink(outside, join(root, intermediate));
      const setup = createModelSetup({ root, manifest: KnownModelManifests[modelId] });
      await expect(setup.cleanupObsoleteMlxRuntime()).resolves.toEqual({ kind: "refused", code: "unsafe_target" });
      await expect(readFile(join(outside, leaf, "preserve"), "utf8")).resolves.toBe("external");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  }
});

test("runtime artifacts require an executable digest anchored in trusted composition", () => {
  const artifact = {
    id: "llama.cpp-darwin-arm64",
    revision: "2f539596c6e9a977e91b6bc6344650422c6bc3b0",
    platform: "darwin",
    arch: "arm64",
    bytes: 1,
    sha256: createHash("sha256").update("archive").digest("hex"),
  };
  expect(RuntimeArtifactSchema.safeParse(artifact).success).toBe(false);
  expect(RuntimeArtifactSchema.safeParse({ ...artifact, binarySha256: createHash("sha256").update("binary").digest("hex") }).success).toBe(true);
});

test("runtime artifact overrides must be explicitly trusted", () => {
  const manifest = ModelManifestSchema.parse({ id: "fixture", revision: "public-test-revision", dimensions: 2, dtype: "q8", runtime: "llama.cpp", formatting: { query: "", document: "", pooling: "last_token", layerNorm: false }, artifacts: [{ path: "model.gguf", bytes: 1, sha256: createHash("sha256").update("x").digest("hex"), url: "https://example.invalid/model.gguf" }] });
  const runtime = RuntimeArtifactSchema.parse({ id: "llama.cpp-darwin-arm64", revision: "2f539596c6e9a977e91b6bc6344650422c6bc3b0", platform: "darwin", arch: "arm64", bytes: 1, sha256: createHash("sha256").update("x").digest("hex"), binarySha256: createHash("sha256").update("fixture-binary").digest("hex"), url: "https://example.invalid/runtime.tar.gz" });
  expect(() => createModelSetup({ root: "/controlled", manifest, runtimeArtifact: runtime as any })).toThrow();
  expect(() => createModelSetup({ root: "/controlled", manifest, runtimeArtifact: { ...runtime, trusted: true } })).not.toThrow();
});

test("trusted runtime and model archives are verified and atomically become ready", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-runtime-install-"));
  const fixture = await mkdtemp(join(tmpdir(), "drawloom-runtime-archive-"));
  try {
    const payload = join(fixture, "drawloom-llama-runtime"); await mkdir(join(payload, "bin"), { recursive: true });
    await writeFile(join(payload, "bin", "llama-server"), "fixture-binary"); await chmod(join(payload, "bin", "llama-server"), 0o700);
    await writeFile(join(payload, "LICENSE"), "MIT fixture"); await writeFile(join(payload, "THIRD_PARTY_NOTICES.txt"), "MIT fixtures");
    const archive = join(fixture, "runtime.tar.gz");
    await execFileAsync("/usr/bin/tar", ["-czf", archive, "-C", fixture, "drawloom-llama-runtime"], { env: { ...process.env, COPYFILE_DISABLE: "1" } });
    const archiveBytes = new Uint8Array(await Bun.file(archive).arrayBuffer()); const modelBytes = new TextEncoder().encode("x");
    const manifest = ModelManifestSchema.parse({ id: "fixture", revision: "public-test-revision", dimensions: 2, dtype: "q8", runtime: "llama.cpp", formatting: { query: "", document: "", pooling: "last_token", layerNorm: false }, artifacts: [{ path: "model.gguf", bytes: 1, sha256: createHash("sha256").update(modelBytes).digest("hex"), url: "https://example.invalid/model.gguf" }] });
    const runtime = RuntimeArtifactSchema.parse({ id: "llama.cpp-darwin-arm64", revision: "2f539596c6e9a977e91b6bc6344650422c6bc3b0", platform: "darwin", arch: "arm64", bytes: archiveBytes.length, sha256: createHash("sha256").update(archiveBytes).digest("hex"), binarySha256: createHash("sha256").update("fixture-binary").digest("hex"), url: "https://example.invalid/runtime.tar.gz" });
    const progress: string[] = [];
    const setup = createModelSetup({ root, manifest, runtimeArtifact: { ...runtime, trusted: true }, llamaRuntime: { platform: "darwin", arch: "arm64" }, fetch: async (input) => new Response(String(input).includes("runtime") ? archiveBytes : modelBytes) });
    await expect(setup.install({ consent: true, onProgress: (status) => progress.push(status.kind) })).resolves.toMatchObject({ kind: "ready", directory: join(root, "active", "fixture"), runtimeDirectory: join(root, "runtime", `llama.cpp-${runtime.revision}`) });
    expect(progress).toContain("installing_runtime"); expect(progress.at(-1)).toBe("ready");
    await expect(setup.ready()).resolves.toMatchObject({ directory: join(root, "active", "fixture") });
    const binary = join(root, "runtime", `llama.cpp-${runtime.revision}`, "bin", "llama-server");
    await writeFile(binary, "changed-binary"); await chmod(binary, 0o700);
    await expect(setup.ready()).resolves.toBeUndefined();
    await expect(setup.ready()).resolves.toBeUndefined();
    const cold = createModelSetup({ root, manifest, runtimeArtifact: { ...runtime, trusted: true }, llamaRuntime: { platform: "darwin", arch: "arm64" } });
    await expect(cold.ready()).resolves.toBeUndefined();
  } finally { await rm(root, { recursive: true, force: true }); await rm(fixture, { recursive: true, force: true }); }
});
