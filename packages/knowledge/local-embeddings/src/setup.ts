import { createHash, randomUUID } from "node:crypto";
import { copyFile, lstat, mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { constants, type BigIntStats } from "node:fs";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalEmbeddingsError } from "./errors.js";
import { ModelManifestSchema, type ModelManifest } from "./manifest.js";

export type ModelSetupStatus =
  | { kind: "pending_consent" }
  | { kind: "installing_runtime"; step: "python" | "packages" | "verifying" }
  | { kind: "downloading"; path: string; received: number; expected: number }
  | { kind: "verifying"; path: string }
  | { kind: "cancelled" }
  | { kind: "failed"; code: "download_failed" | "hash_mismatch" | "size_mismatch" | "invalid_manifest" | "setup_busy" | "uv_unavailable" | "unsupported_hardware" | "runtime_install_failed" }
  | { kind: "ready"; directory: string; runtimeDirectory?: string };

export interface ReadyModel { readonly manifest: ModelManifest; readonly directory: string; readonly runtimeDirectory?: string; }
export interface MlxRuntimeSetupOptions { readonly uvExecutable?: string; readonly platform?: NodeJS.Platform; readonly arch?: string; readonly run?: (file: string, args: readonly string[], env: NodeJS.ProcessEnv) => Promise<void>; readonly probe?: (python: string) => Promise<unknown>; }
export type ArtifactFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export interface ModelSetupOptions { readonly root: string; readonly manifest: ModelManifest; readonly fetch?: ArtifactFetch; readonly mlxRuntime?: MlxRuntimeSetupOptions; }
export interface InstallOptions { readonly consent?: boolean; readonly signal?: AbortSignal; readonly onProgress?: (status: ModelSetupStatus) => void; }

const readyFile = ".drawloom-ready.json";
const runtimeReadyFile = ".drawloom-runtime-ready.json";
const runtimeVersions = { python: "3.12.13", "mlx-embeddings": "0.1.0", mlx: "0.32.2", transformers: "5.17.0", tokenizers: "0.23.2" } as const;
const execFileAsync = promisify(execFile);

function isSubpath(root: string, candidate: string): boolean {
  const between = relative(resolve(root), resolve(candidate));
  return between === "" || (!between.startsWith("..") && !between.includes("../"));
}

function artifactFile(root: string, path: string): string {
  const file = resolve(root, path);
  if (!isSubpath(root, file)) throw new LocalEmbeddingsError("invalid_manifest", "relative artifact path is required");
  return file;
}

async function fingerprint(file: string): Promise<string | undefined> {
  try {
    const details = await lstat(file, { bigint: true });
    if (!details.isFile() || details.isSymbolicLink()) return undefined;
    return fileIdentity(details);
  } catch { return undefined; }
}
async function pathIdentity(path: string): Promise<string | undefined> { try { return fileIdentity(await lstat(path, { bigint: true })); } catch { return undefined; } }
function immutable<T>(value: T): T { if (value && typeof value === "object" && !Object.isFrozen(value)) { for (const child of Object.values(value as Record<string, unknown>)) immutable(child); Object.freeze(value); } return value; }

function fileIdentity(details: BigIntStats): string {
  return [details.dev, details.ino, details.size, details.mtimeNs, details.ctimeNs].join(":");
}

async function matches(file: string, bytes: number, sha256: string): Promise<string | undefined> {
  const digest = createHash("sha256");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => undefined);
  if (!handle) return undefined;
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || before.size !== BigInt(bytes)) return undefined;
    const identity = fileIdentity(before);
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let read = 0;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, null);
      if (bytesRead === 0) break;
      read += bytesRead;
      if (read > bytes) return undefined;
      digest.update(chunk.subarray(0, bytesRead));
    }
    if (read !== bytes || fileIdentity(await handle.stat({ bigint: true })) !== identity || await fingerprint(file) !== identity) return undefined;
    return digest.digest("hex") === sha256 ? identity : undefined;
  } finally { await handle.close(); }
}

export class ModelSetup {
  readonly #root: string;
  readonly #manifest: ModelManifest;
  readonly #fetch: ArtifactFetch;
  readonly #mlxRuntime: MlxRuntimeSetupOptions;
  #status: ModelSetupStatus = { kind: "pending_consent" };
  #controller: AbortController | undefined;
  #verified: { readonly directory: string; readonly fingerprints: ReadonlyMap<string, string>; } | undefined;
  #runtimeVerified: { directory: string; python: string; packages: string } | undefined;

  constructor(options: ModelSetupOptions) {
    this.#root = resolve(options.root);
    this.#manifest = immutable(ModelManifestSchema.parse(options.manifest));
    for (const artifact of this.#manifest.artifacts) artifactFile(this.#root, artifact.path);
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#mlxRuntime = options.mlxRuntime ?? {};
  }

  status(): ModelSetupStatus { return this.#status; }
  cancel(): void { this.#controller?.abort(); }

  async ready(): Promise<ReadyModel | undefined> {
    const directory = join(this.#root, "active", this.#manifest.id);
    if (this.#verified?.directory === directory && await this.#verifiedGenerationStillCurrent()) {
      const runtimeDirectory = await this.#readyRuntime();
      if (!runtimeDirectory) return undefined;
      return { manifest: this.#manifest, directory, ...(runtimeDirectory ? { runtimeDirectory } : {}) };
    }
    this.#verified = undefined;
    try {
      const recorded = JSON.parse(await readFile(join(directory, readyFile), "utf8")) as { revision?: unknown; artifacts?: unknown };
      if (recorded.revision !== this.#manifest.revision || !Array.isArray(recorded.artifacts)) return undefined;
      const paths = new Set(recorded.artifacts);
      if (paths.size !== this.#manifest.artifacts.length) return undefined;
      const fingerprints = new Map<string, string>();
      for (const artifact of this.#manifest.artifacts) {
        if (!paths.has(artifact.path)) return undefined;
        const identity = await matches(artifactFile(directory, artifact.path), artifact.bytes, artifact.sha256);
        if (!identity) return undefined;
        fingerprints.set(artifact.path, identity);
      }
      this.#verified = { directory, fingerprints };
      const runtimeDirectory = await this.#readyRuntime();
      if (!runtimeDirectory) return undefined;
      return { manifest: this.#manifest, directory, ...(runtimeDirectory ? { runtimeDirectory } : {}) };
    } catch { return undefined; }
  }

  async install(options: InstallOptions = {}): Promise<ModelSetupStatus> {
    if (!options.consent) return this.#emit({ kind: "pending_consent" }, options);
    if (options.signal?.aborted) return this.#emit({ kind: "cancelled" }, options);
    if (this.#controller) return { kind: "failed", code: "setup_busy" };
    const controller = new AbortController();
    this.#controller = controller;
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      const prerequisite = await this.#mlxPrerequisiteFailure();
      if (prerequisite) return this.#emit({ kind: "failed", code: prerequisite }, options);
      const existing = await this.ready();
      controller.signal.throwIfAborted();
      if (existing) return this.#emit({ kind: "ready", directory: existing.directory, ...(existing.runtimeDirectory ? { runtimeDirectory: existing.runtimeDirectory } : {}) }, options);
      if (!await this.#readyRuntime()) await this.#installRuntime(controller.signal, options);
      await mkdir(join(this.#root, "objects"), { recursive: true, mode: 0o700 });
      for (const artifact of this.#manifest.artifacts) await this.#ensureObject(artifact, controller.signal, options);
      if (controller.signal.aborted) return this.#emit({ kind: "cancelled" }, options);
      return await this.#activate(options, controller.signal);
    } catch (cause) {
      if (controller.signal.aborted || (cause instanceof DOMException && cause.name === "AbortError")) return this.#emit({ kind: "cancelled" }, options);
      if (cause instanceof LocalEmbeddingsError) return this.#emit({ kind: "failed", code: cause.code as "download_failed" | "hash_mismatch" | "size_mismatch" | "invalid_manifest" | "runtime_install_failed" | "unsupported_hardware" }, options);
      return this.#emit({ kind: "failed", code: "download_failed" }, options);
    } finally {
      options.signal?.removeEventListener("abort", abort);
      if (this.#controller === controller) this.#controller = undefined;
    }
  }

  #emit(status: ModelSetupStatus, options: InstallOptions): ModelSetupStatus { this.#status = status; options.onProgress?.(status); return status; }

  async #mlxPrerequisiteFailure(): Promise<"uv_unavailable" | "unsupported_hardware" | undefined> {
    if ((this.#mlxRuntime.platform ?? process.platform) !== "darwin" || (this.#mlxRuntime.arch ?? process.arch) !== "arm64") return "unsupported_hardware";
    const uv = this.#mlxRuntime.uvExecutable ?? "uv";
    try {
      if (uv.includes("/")) await access(uv, constants.X_OK);
      else await execFileAsync(uv, ["--version"]);
    } catch { return "uv_unavailable"; }
    return undefined;
  }

  async #readyRuntime(): Promise<string | undefined> {
    const directory = join(this.#root, "runtime", "mlx");
    try {
      const value = JSON.parse(await readFile(join(directory, runtimeReadyFile), "utf8"));
      if (JSON.stringify(value.versions) !== JSON.stringify(runtimeVersions)) return undefined;
      const pythonLink = join(directory, "bin", "python");
      await access(pythonLink, constants.X_OK);
      const python = await realpath(pythonLink);
      if (!isSubpath(this.#root, python)) return undefined;
      const identity = await fingerprint(python);
      const packages = await pathIdentity(join(directory, "lib", "python3.12", "site-packages"));
      if (!identity || !packages || (this.#runtimeVerified && (this.#runtimeVerified.python !== identity || this.#runtimeVerified.packages !== packages))) { this.#runtimeVerified = undefined; return undefined; }
      if (!this.#runtimeVerified && !await this.#probeRuntime(pythonLink).catch(() => false)) return undefined;
      this.#runtimeVerified = { directory, python: identity, packages };
      return directory;
    } catch { return undefined; }
  }

  async #installRuntime(signal: AbortSignal, options: InstallOptions): Promise<void> {
    const directory = join(this.#root, "runtime", "mlx");
    const uv = this.#mlxRuntime.uvExecutable ?? "uv";
    const run = this.#mlxRuntime.run ?? (async (file, args, env) => { await execFileAsync(file, [...args], { signal, env }); });
    const environment = { ...process.env, UV_PYTHON_INSTALL_DIR: join(this.#root, "runtime", ".uv-python"), UV_CACHE_DIR: join(this.#root, "runtime", ".uv-cache") };
    let checkingGpu = false;
    try {
      await rm(directory, { recursive: true, force: true });
      await mkdir(dirname(directory), { recursive: true, mode: 0o700 });
      this.#emit({ kind: "installing_runtime", step: "python" }, options);
      await run(uv, ["venv", "--python", runtimeVersions.python, "--managed-python", "--no-project", directory], environment);
      signal.throwIfAborted();
      this.#emit({ kind: "installing_runtime", step: "packages" }, options);
      const lock = fileURLToPath(new URL("../python/mlx-requirements.lock", import.meta.url));
      await run(uv, ["pip", "sync", "--python", join(directory, "bin", "python"), "--require-hashes", "--only-binary", ":all:", "--no-config", "--default-index", "https://pypi.org/simple", lock], environment);
      signal.throwIfAborted();
      this.#emit({ kind: "installing_runtime", step: "verifying" }, options);
      checkingGpu = true;
      if (!await this.#probeRuntime(join(directory, "bin", "python"), signal, environment)) throw new Error("runtime mismatch");
      checkingGpu = false;
      await writeFile(join(directory, runtimeReadyFile), JSON.stringify({ versions: runtimeVersions }), { mode: 0o600 });
      const python = await realpath(join(directory, "bin", "python"));
      const pythonIdentity = await fingerprint(python); const packages = await pathIdentity(join(directory, "lib", "python3.12", "site-packages"));
      this.#runtimeVerified = pythonIdentity && packages ? { directory, python: pythonIdentity, packages } : undefined;
    } catch (cause) {
      await rm(directory, { recursive: true, force: true });
      if (signal.aborted) throw cause;
      throw new LocalEmbeddingsError(checkingGpu ? "unsupported_hardware" : "runtime_install_failed", checkingGpu ? "Metal GPU is unavailable" : "Isolated MLX runtime installation failed");
    }
  }

  async #probeRuntime(python: string, signal?: AbortSignal, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
    const probe = this.#mlxRuntime.probe ?? (async (executable) => JSON.parse((await execFileAsync(executable, ["-I", "-c", `import json, sys, importlib.metadata; import mlx_embeddings, transformers, tokenizers, mlx, mlx.core as mx; print(json.dumps({\"python\": \".\".join(map(str, sys.version_info[:3])), \"mlx-embeddings\": importlib.metadata.version(\"mlx-embeddings\"), \"mlx\": importlib.metadata.version(\"mlx\"), \"transformers\": importlib.metadata.version(\"transformers\"), \"tokenizers\": importlib.metadata.version(\"tokenizers\"), \"metal\": mx.metal.is_available()}))`], { signal, env })).stdout));
    const observed = await probe(python) as Record<string, unknown>;
    return observed.metal === true && Object.entries(runtimeVersions).every(([name, version]) => observed[name] === version);
  }

  async #verifiedGenerationStillCurrent(): Promise<boolean> {
    const verified = this.#verified;
    if (!verified) return false;
    for (const artifact of this.#manifest.artifacts) {
      if (await fingerprint(artifactFile(verified.directory, artifact.path)) !== verified.fingerprints.get(artifact.path)) return false;
    }
    return true;
  }

  async #ensureObject(artifact: ModelManifest["artifacts"][number], signal: AbortSignal, options: InstallOptions): Promise<void> {
    const object = join(this.#root, "objects", artifact.sha256);
    if (await matches(object, artifact.bytes, artifact.sha256)) return;
    await rm(object, { force: true });
    const temporary = `${object}.${randomUUID()}.part`;
    try {
      const response = await this.#fetch(artifact.url, { signal });
      if (!response.ok || !response.body) throw new LocalEmbeddingsError("download_failed", "artifact download failed");
      const handle = await open(temporary, "wx", 0o600);
      const digest = createHash("sha256");
      let received = 0;
      try {
        const reader = response.body.getReader();
        let complete = false;
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            if (signal.aborted) { await reader.cancel(); throw new DOMException("cancelled", "AbortError"); }
            received += part.value.byteLength;
            if (received > artifact.bytes) throw new LocalEmbeddingsError("size_mismatch", "artifact size differs from manifest");
            digest.update(part.value); await this.#writeAll(handle, part.value);
            this.#emit({ kind: "downloading", path: artifact.path, received, expected: artifact.bytes }, options);
          }
          complete = true;
        } finally {
          if (!complete) await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      } finally { await handle.close(); }
      if (received !== artifact.bytes) throw new LocalEmbeddingsError("size_mismatch", "artifact size differs from manifest");
      this.#emit({ kind: "verifying", path: artifact.path }, options);
      if (digest.digest("hex") !== artifact.sha256) throw new LocalEmbeddingsError("hash_mismatch", "artifact hash differs from manifest");
      await rename(temporary, object);
    } finally { await rm(temporary, { force: true }); }
  }

  async #writeAll(handle: Awaited<ReturnType<typeof open>>, bytes: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesWritten } = await handle.write(bytes, offset, bytes.byteLength - offset, null);
      if (bytesWritten <= 0) throw new LocalEmbeddingsError("download_failed", "artifact write failed");
      offset += bytesWritten;
    }
  }

  async #activate(options: InstallOptions, signal: AbortSignal): Promise<ModelSetupStatus> {
    const active = join(this.#root, "active", this.#manifest.id);
    const existing = await this.ready();
    signal.throwIfAborted();
    if (existing) return this.#emit({ kind: "ready", directory: existing.directory, ...(existing.runtimeDirectory ? { runtimeDirectory: existing.runtimeDirectory } : {}) }, options);
    const staging = join(this.#root, ".staging", `${this.#manifest.id}-${randomUUID()}`);
    try {
      await mkdir(staging, { recursive: true, mode: 0o700 });
      for (const artifact of this.#manifest.artifacts) {
        const target = artifactFile(staging, artifact.path);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(this.#root, "objects", artifact.sha256), target);
        signal.throwIfAborted();
      }
      await writeFile(join(staging, readyFile), JSON.stringify({ revision: this.#manifest.revision, artifacts: this.#manifest.artifacts.map((artifact) => artifact.path) }));
      await mkdir(dirname(active), { recursive: true });
      signal.throwIfAborted();
      await this.#publish(staging, active, signal);
      this.#verified = undefined;
      const runtimeDirectory = this.#runtimeVerified?.directory ?? await this.#readyRuntime();
      return this.#emit({ kind: "ready", directory: active, ...(runtimeDirectory ? { runtimeDirectory } : {}) }, options);
    } catch (cause) {
      signal.throwIfAborted();
      const recovered = await this.ready();
      if (recovered) return this.#emit({ kind: "ready", directory: active, ...(recovered.runtimeDirectory ? { runtimeDirectory: recovered.runtimeDirectory } : {}) }, options);
      throw cause;
    } finally { await rm(staging, { recursive: true, force: true }); }
  }

  async #publish(staging: string, active: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    try { await rename(staging, active); return; }
    catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw cause;
    }
    const recovered = await this.ready();
    signal.throwIfAborted();
    if (recovered) return;
    const quarantine = join(this.#root, ".quarantine", `${this.#manifest.id}-${randomUUID()}`);
    await mkdir(dirname(quarantine), { recursive: true });
    signal.throwIfAborted();
    try { await rename(active, quarantine); }
    catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      if (code !== "ENOENT") throw cause;
    }
    try { await rename(staging, active); }
    finally { await rm(quarantine, { recursive: true, force: true }); }
  }
}

export function createModelSetup(options: ModelSetupOptions): ModelSetup { return new ModelSetup(options); }
