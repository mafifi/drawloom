import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KnownModelManifests, MlxEmbeddingWorker, ModelManifestSchema, createKnowledgeEmbeddings, createModelSetup, embeddingConfiguration } from "./src/index.js";
import type { TrustedKnowledgeSubject } from "@drawloom/knowledge";

const owner = { type: "user", id: "owner", properties: {} } as TrustedKnowledgeSubject;

test("the supported MLX identity pins measured weights and has a distinct indexing fingerprint", () => {
  expect(Object.keys(KnownModelManifests)).toEqual(["qwen3-embedding-0.6b-mlx"]);
  const manifest = KnownModelManifests["qwen3-embedding-0.6b-mlx"];
  expect(manifest).toMatchObject({
    id: "qwen3-embedding-0.6b-mlx",
    revision: "407ad2329cd30702720aafe83f74a1ba30fdfbca",
    dimensions: 1024,
    runtime: "mlx",
    maxTokens: 2048,
    maxBatchTokens: 8192,
  });
  expect(manifest.artifacts.find((item) => item.path === "model.safetensors")).toEqual({
    path: "model.safetensors",
    bytes: 633152041,
    sha256: "fe956e8d346b4f08215a3cfc48a874354f900c20a59e965b75df0d9d77c54b28",
    url: "https://huggingface.co/mlx-community/Qwen3-Embedding-0.6B-8bit/resolve/407ad2329cd30702720aafe83f74a1ba30fdfbca/model.safetensors",
  });
  expect(embeddingConfiguration("qwen3-embedding-0.6b-mlx").id).toBe("local:qwen3-embedding-0.6b-mlx");
});

test("MLX setup reports prerequisites before downloads and requires consent for runtime installation", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-mlx-setup-"));
  let fetched = 0;
  try {
    const setup = createModelSetup({
      root,
      manifest: KnownModelManifests["qwen3-embedding-0.6b-mlx"],
      fetch: async () => { fetched++; throw new Error("must not download"); },
      mlxRuntime: { uvExecutable: "/missing/uv", platform: "darwin", arch: "arm64" },
    });
    await expect(setup.install()).resolves.toEqual({ kind: "pending_consent" });
    await expect(setup.install({ consent: true })).resolves.toEqual({ kind: "failed", code: "uv_unavailable" });
    expect(fetched).toBe(0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("runtime failure is repairable and uv uses root-local managed Python and cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-mlx-runtime-")); const uv = join(root, "uv"); await writeFile(uv, ""); await chmod(uv, 0o700);
  const bytes = new TextEncoder().encode("model"); const manifest = ModelManifestSchema.parse({ id: "test-mlx", revision: "public-test-revision", dimensions: 2, dtype: "q8", runtime: "mlx", formatting: { query: "", document: "", pooling: "last_token", layerNorm: false }, artifacts: [{ path: "model", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), url: "https://example.invalid/model" }] });
  const environments: NodeJS.ProcessEnv[] = []; const probed: string[] = []; let fail = true;
  const setup = createModelSetup({ root, manifest, fetch: async () => new Response(bytes), mlxRuntime: { uvExecutable: uv, platform: "darwin", arch: "arm64",
    run: async (_file, args, env) => { environments.push(env); if (args[0] === "venv") { const directory = args.at(-1)!; const python = join(root, "runtime", ".uv-python", "cpython", "bin", "python3.12"); await mkdir(join(directory, "bin"), { recursive: true }); await mkdir(join(directory, "lib", "python3.12", "site-packages"), { recursive: true }); await mkdir(join(python, ".."), { recursive: true }); await writeFile(python, ""); await chmod(python, 0o700); await symlink(python, join(directory, "bin", "python")); } else if (fail) throw new Error("synthetic install failure"); },
    probe: async (python) => { probed.push(python); return { python: "3.12.13", "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2", metal: true }; } } });
  await expect(setup.install({ consent: true })).resolves.toMatchObject({ kind: "failed", code: "runtime_install_failed" });
  fail = false; await expect(setup.install({ consent: true })).resolves.toMatchObject({ kind: "ready", runtimeDirectory: join(root, "runtime", "mlx") });
  expect(environments.every((env) => env.UV_PYTHON_INSTALL_DIR?.startsWith(root) && env.UV_CACHE_DIR?.startsWith(root))).toBe(true);
  expect(probed.every((python) => python === join(root, "runtime", "mlx", "bin", "python"))).toBe(true);
  await writeFile(join(root, "runtime", "mlx", "lib", "python3.12", "site-packages", "corrupt"), "removed package simulation");
  await expect(setup.ready()).resolves.toBeUndefined();
  await expect(setup.install({ consent: true })).resolves.toMatchObject({ kind: "ready", runtimeDirectory: join(root, "runtime", "mlx") });
  await rm(root, { recursive: true, force: true });
});

test.skipIf(!process.env.DRAWLOOM_MLX_MODEL_ROOT)("opt-in cold ModelSetup readiness uses the installed venv and verified model", async () => {
  const root = process.env.DRAWLOOM_MLX_MODEL_ROOT!;
  const ready = await createModelSetup({ root, manifest: KnownModelManifests["qwen3-embedding-0.6b-mlx"] }).ready();
  expect(ready).toMatchObject({ directory: join(root, "active", "qwen3-embedding-0.6b-mlx"), runtimeDirectory: join(root, "runtime", "mlx") });
});

test("runtime installation cancellation removes partial runtime and permits retry", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-mlx-cancel-")); const uv = join(root, "uv"); await writeFile(uv, ""); await chmod(uv, 0o700); const controller = new AbortController();
  const manifest = ModelManifestSchema.parse({ id: "cancel-mlx", revision: "public-test-revision", dimensions: 2, dtype: "q8", runtime: "mlx", formatting: { query: "", document: "", pooling: "last_token", layerNorm: false }, artifacts: [{ path: "model", bytes: 1, sha256: createHash("sha256").update("x").digest("hex"), url: "https://example.invalid/model" }] });
  let cancel = true; const setup = createModelSetup({ root, manifest, fetch: async () => new Response("x"), mlxRuntime: { uvExecutable: uv, platform: "darwin", arch: "arm64", run: async (_f, args) => { const directory = args.at(-1)!; if (args[0] === "venv") { const python = join(root, "runtime", ".uv-python", "bin", "python"); await mkdir(join(directory, "bin"), { recursive: true }); await mkdir(join(directory, "lib", "python3.12", "site-packages"), { recursive: true }); await mkdir(join(python, ".."), { recursive: true }); await writeFile(python, ""); await chmod(python, 0o700); await symlink(python, join(directory, "bin", "python")); if (cancel) controller.abort(); } }, probe: async () => ({ python: "3.12.13", "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2", metal: true }) } });
  await expect(setup.install({ consent: true, signal: controller.signal })).resolves.toEqual({ kind: "cancelled" }); cancel = false;
  const retry = new AbortController(); await expect(setup.install({ consent: true, signal: retry.signal })).resolves.toMatchObject({ kind: "ready" });
  await rm(root, { recursive: true, force: true });
});

test("the shared embedding adapter accepts the MLX structural worker", async () => {
  const configuration = embeddingConfiguration("qwen3-embedding-0.6b-mlx");
  const provider = createKnowledgeEmbeddings({ model: "qwen3-embedding-0.6b-mlx", authorizer: { async authorize() { return { decision: true as const }; } }, worker: { async embed() { return [Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0)]; } } });
  const result = await provider.embed(owner, { configuration, role: "document", items: [{ id: "synthetic", text: "public" }] });
  expect(result.kind).toBe("ok");
});

class FakeReadable extends EventEmitter { setEncoding(): this { return this; } }
class FakeWritable extends EventEmitter { readonly writes: string[] = []; write(value: string): boolean { this.writes.push(value); return true; } end(): void {} }
class FakeChild extends EventEmitter {
  readonly stdout = new FakeReadable(); readonly stderr = new FakeReadable(); readonly stdin = new FakeWritable();
  killed = false; kill(): boolean { this.killed = true; queueMicrotask(() => this.emit("exit", 0)); return true; }
}
async function waitForChild(children: readonly FakeChild[], childIndex = 0): Promise<FakeChild> {
  for (let index = 0; index < 20 && !children[childIndex]; index++) await new Promise((resolve) => setTimeout(resolve, 0));
  if (!children[childIndex]) throw new Error("worker did not spawn");
  return children[childIndex];
}

test("MLX worker validates handshake, serializes one request, rejects malformed output, and restarts", async () => {
  const children: FakeChild[] = [];
  const worker = new MlxEmbeddingWorker({
    root: "/controlled",
    model: "qwen3-embedding-0.6b-mlx",
    spawn: () => { const child = new FakeChild(); children.push(child); return child; },
    ready: async () => ({ manifest: KnownModelManifests["qwen3-embedding-0.6b-mlx"], directory: "/controlled/model", runtimeDirectory: "/controlled/runtime" }),
    requestTimeoutMs: 100,
  });
  const first = worker.embed({ role: "query", items: ["public synthetic query"] });
  const firstChild = await waitForChild(children);
  firstChild.stdout.emit("data", `${JSON.stringify({ kind: "ready", protocol: 1, modelRevision: "407ad2329cd30702720aafe83f74a1ba30fdfbca", dimensions: 1024, device: "gpu", versions: { "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2" } })}\n`);
  for (let index = 0; index < 20 && firstChild.stdin.writes.length === 0; index++) await new Promise((resolve) => setTimeout(resolve, 0));
  await expect(worker.embed({ role: "document", items: ["second"] })).rejects.toMatchObject({ code: "worker_busy" });
  children[0]!.stdout.emit("data", `${JSON.stringify({ kind: "result", id: "1", vectors: [[1, 2]] })}\n`);
  await expect(first).rejects.toMatchObject({ code: "invalid_result" });
  const second = worker.embed({ role: "document", items: ["restart"] });
  await waitForChild(children, 1);
  expect(children).toHaveLength(2);
  children[1]!.stdout.emit("data", `${JSON.stringify({ kind: "ready", protocol: 1, modelRevision: "wrong", dimensions: 1024, device: "gpu", versions: { "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2" } })}\n`);
  await expect(second).rejects.toMatchObject({ code: "configuration_mismatch" });
  await worker.close();
});

test("MLX worker cancellation terminates the subprocess", async () => {
  const children: FakeChild[] = [];
  const worker = new MlxEmbeddingWorker({
    root: "/controlled", model: "qwen3-embedding-0.6b-mlx", spawn: () => { const child = new FakeChild(); children.push(child); return child; },
    ready: async () => ({ manifest: KnownModelManifests["qwen3-embedding-0.6b-mlx"], directory: "/controlled/model", runtimeDirectory: "/controlled/runtime" }),
  });
  const controller = new AbortController();
  const pending = worker.embed({ role: "query", items: ["cancel"] }, { signal: controller.signal });
  const child = await waitForChild(children);
  child.stdout.emit("data", `${JSON.stringify({ kind: "ready", protocol: 1, modelRevision: "407ad2329cd30702720aafe83f74a1ba30fdfbca", dimensions: 1024, device: "gpu", versions: { "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2" } })}\n`);
  await Promise.resolve();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "request_cancelled" });
  expect(child.killed).toBe(true);
  await worker.close();
});

test("close and abort settle startup handshake immediately and abort permits retry", async () => {
  const ready = async () => ({ manifest: KnownModelManifests["qwen3-embedding-0.6b-mlx"], directory: "/model", runtimeDirectory: "/runtime" });
  const closedChildren: FakeChild[] = []; const closing = new MlxEmbeddingWorker({ root: "/controlled", model: "qwen3-embedding-0.6b-mlx", ready, requestTimeoutMs: 100, spawn: () => { const child = new FakeChild(); closedChildren.push(child); return child; } });
  const closedEmbed = closing.embed({ role: "query", items: ["close startup"] }); await waitForChild(closedChildren); await closing.close();
  await expect(closedEmbed).rejects.toMatchObject({ code: "worker_closed" });
  const children: FakeChild[] = []; const worker = new MlxEmbeddingWorker({ root: "/controlled", model: "qwen3-embedding-0.6b-mlx", ready, requestTimeoutMs: 100, spawn: () => { const child = new FakeChild(); children.push(child); return child; } });
  const controller = new AbortController(); const aborted = worker.embed({ role: "query", items: ["abort startup"] }, { signal: controller.signal }); await waitForChild(children); controller.abort();
  await expect(aborted).rejects.toMatchObject({ code: "request_cancelled" });
  const retry = worker.embed({ role: "query", items: ["retry"] }); const replacement = await waitForChild(children, 1); replacement.stdout.emit("data", `${JSON.stringify({ kind: "ready", protocol: 1, modelRevision: "407ad2329cd30702720aafe83f74a1ba30fdfbca", dimensions: 1024, device: "gpu", versions: { "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2" } })}\n`); await Promise.resolve(); controller.abort();
  replacement.emit("exit", 1); await expect(retry).rejects.toMatchObject({ code: "worker_failed" }); await worker.close();
});

test("readiness obeys close, abort, and the single operation deadline without later spawning", async () => {
  for (const mode of ["close", "abort", "timeout"] as const) {
    let resolveReady!: (value: any) => void; let spawned = 0;
    const worker = new MlxEmbeddingWorker({ root: "/controlled", model: "qwen3-embedding-0.6b-mlx", requestTimeoutMs: 5,
      ready: () => new Promise((resolve) => { resolveReady = resolve; }), spawn: () => { spawned++; return new FakeChild(); } });
    const controller = new AbortController(); const pending = worker.embed({ role: "query", items: [mode] }, { signal: controller.signal });
    await Promise.resolve();
    if (mode === "close") await worker.close(); else if (mode === "abort") controller.abort();
    await expect(pending).rejects.toMatchObject({ code: mode === "close" ? "worker_closed" : mode === "abort" ? "request_cancelled" : "request_timeout" });
    resolveReady({ manifest: KnownModelManifests["qwen3-embedding-0.6b-mlx"], directory: "/model", runtimeDirectory: "/runtime" });
    await new Promise((resolve) => setTimeout(resolve, 10)); expect(spawned).toBe(0); await worker.close();
  }
});

test("maximum admitted vectors fit the stdout bound while malformed oversized output is retired", async () => {
  const children: FakeChild[] = [];
  const worker = new MlxEmbeddingWorker({ root: "/controlled", model: "qwen3-embedding-0.6b-mlx", requestTimeoutMs: 100,
    ready: async () => ({ manifest: KnownModelManifests["qwen3-embedding-0.6b-mlx"], directory: "/model", runtimeDirectory: "/runtime" }),
    spawn: () => { const child = new FakeChild(); children.push(child); return child; } });
  const pending = worker.embed({ role: "query", items: Array.from({ length: 50 }, (_, index) => `bounded ${index}`) }); const child = await waitForChild(children);
  child.stdout.emit("data", `${JSON.stringify({ kind: "ready", protocol: 1, modelRevision: "407ad2329cd30702720aafe83f74a1ba30fdfbca", dimensions: 1024, device: "gpu", versions: { "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2" } })}\n`);
  for (let index = 0; index < 20 && child.stdin.writes.length === 0; index++) await new Promise((resolve) => setTimeout(resolve, 0));
  const vectors = Array.from({ length: 50 }, () => Array.from({ length: 1024 }, () => -0.12345678901234568));
  const record = `${JSON.stringify({ kind: "result", id: "1", vectors })}\n`; expect(Buffer.byteLength(record)).toBeGreaterThan(1024 * 1024);
  child.stdout.emit("data", record); await expect(pending).resolves.toHaveLength(50);
  const malformed = worker.embed({ role: "query", items: ["malformed"] }); for (let index = 0; index < 20 && child.stdin.writes.length < 2; index++) await new Promise((resolve) => setTimeout(resolve, 0)); child.stderr.emit("data", "diagnostic".repeat(10000)); child.stdout.emit("data", "x".repeat(2 * 1024 * 1024 + 1));
  await expect(malformed).rejects.toMatchObject({ code: "invalid_result" }); expect(child.killed).toBe(true); await worker.close();
});
