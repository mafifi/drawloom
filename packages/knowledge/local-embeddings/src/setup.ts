import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants, type BigIntStats } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { isSubpath } from "./containment.js";
import { promisify } from "node:util";
import { LocalEmbeddingsError } from "./errors.js";
import {
  KnownLlamaRuntime,
  ModelManifestSchema,
  RuntimeArtifactSchema,
  type ModelManifest,
  type RuntimeArtifact,
  type TrustedRuntimeArtifact,
} from "./manifest.js";

export type ModelSetupStatus =
  | { kind: "pending_consent" }
  | { kind: "downloading"; path: string; received: number; expected: number }
  | { kind: "verifying"; path: string }
  | { kind: "installing_runtime"; step: "extracting" | "verifying" }
  | { kind: "cancelled" }
  | {
      kind: "failed";
      code:
        | "download_failed"
        | "hash_mismatch"
        | "size_mismatch"
        | "invalid_manifest"
        | "setup_busy"
        | "unsupported_hardware"
        | "runtime_unavailable"
        | "runtime_install_failed";
    }
  | { kind: "ready"; directory: string; runtimeDirectory: string };

export interface ReadyModel {
  readonly manifest: ModelManifest;
  readonly directory: string;
  readonly runtimeDirectory: string;
}
export type ArtifactFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
export interface LlamaRuntimeSetupOptions {
  readonly platform?: NodeJS.Platform;
  readonly arch?: string;
}
export interface ModelSetupOptions {
  readonly root: string;
  readonly manifest: ModelManifest;
  readonly fetch?: ArtifactFetch;
  /** Only trusted host composition may replace the unpublished runtime artifact. */
  readonly runtimeArtifact?: TrustedRuntimeArtifact;
  readonly llamaRuntime?: LlamaRuntimeSetupOptions;
}
export interface InstallOptions {
  readonly consent?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (status: ModelSetupStatus) => void;
}
export type ObsoleteRuntimeCleanup =
  | { kind: "nothing_to_remove" }
  | { kind: "removed"; paths: readonly string[] }
  | { kind: "refused"; code: "unsafe_root" | "unsafe_target" };

const readyFile = ".drawloom-ready.json";
const runtimeReadyFile = ".drawloom-runtime-ready.json";
const runtimeArchivePath = "llama.cpp-darwin-arm64.tar.gz";
const runtimeArchiveRoot = "drawloom-llama-runtime";
const execFileAsync = promisify(execFile);

function artifactFile(root: string, path: string): string {
  const file = resolve(root, path);
  if (!isSubpath(root, file))
    throw new LocalEmbeddingsError("invalid_manifest", "relative artifact path is required");
  return file;
}

function fileIdentity(details: BigIntStats): string {
  return [details.dev, details.ino, details.size, details.mtimeNs, details.ctimeNs].join(":");
}

async function fingerprint(file: string): Promise<string | undefined> {
  try {
    const details = await lstat(file, { bigint: true });
    return details.isFile() && !details.isSymbolicLink() ? fileIdentity(details) : undefined;
  } catch {
    return undefined;
  }
}

async function matchesSha256(
  file: string,
  sha256: string,
  bytes?: number,
): Promise<string | undefined> {
  const digest = createHash("sha256");
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => undefined);
  if (!handle) return undefined;
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || (bytes !== undefined && before.size !== BigInt(bytes)))
      return undefined;
    const identity = fileIdentity(before);
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let read = 0;
    for (;;) {
      const part = await handle.read(chunk, 0, chunk.byteLength, null);
      if (!part.bytesRead) break;
      read += part.bytesRead;
      if (bytes !== undefined && read > bytes) return undefined;
      digest.update(chunk.subarray(0, part.bytesRead));
    }
    if (
      (bytes !== undefined && read !== bytes) ||
      fileIdentity(await handle.stat({ bigint: true })) !== identity ||
      (await fingerprint(file)) !== identity
    )
      return undefined;
    return digest.digest("hex") === sha256 ? identity : undefined;
  } finally {
    await handle.close();
  }
}

async function matches(file: string, bytes: number, sha256: string): Promise<string | undefined> {
  return matchesSha256(file, sha256, bytes);
}

type OwnedTargetState = "absent" | "present" | "unsafe";

async function ownedTargetState(
  root: string,
  physicalRoot: string,
  target: string,
): Promise<OwnedTargetState> {
  const between = relative(resolve(root), resolve(target));
  // Containment, plus this caller's own rule: the root itself is not an owned
  // target, so an empty delta is "unsafe" here even though it is inside.
  if (!between || !isSubpath(root, target)) return "unsafe";
  let current = root;
  for (const part of between.split("/")) {
    current = join(current, part);
    try {
      const details = await lstat(current);
      if (details.isSymbolicLink() || !details.isDirectory()) return "unsafe";
    } catch (cause) {
      return cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT"
        ? "absent"
        : "unsafe";
    }
  }
  try {
    return isSubpath(physicalRoot, await realpath(target)) ? "present" : "unsafe";
  } catch {
    return "unsafe";
  }
}

function immutable<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

export class ModelSetup {
  readonly #root: string;
  readonly #manifest: ModelManifest;
  readonly #runtime: RuntimeArtifact;
  readonly #fetch: ArtifactFetch;
  readonly #llamaRuntime: LlamaRuntimeSetupOptions;
  #status: ModelSetupStatus = { kind: "pending_consent" };
  #controller: AbortController | undefined;
  #verified: { directory: string; fingerprints: ReadonlyMap<string, string> } | undefined;
  #runtimeVerified: { directory: string; binary: string } | undefined;

  constructor(options: ModelSetupOptions) {
    this.#root = resolve(options.root);
    this.#manifest = immutable(ModelManifestSchema.parse(options.manifest));
    for (const artifact of this.#manifest.artifacts) artifactFile(this.#root, artifact.path);
    if (options.runtimeArtifact?.trusted !== true) {
      if (options.runtimeArtifact !== undefined)
        throw new LocalEmbeddingsError(
          "invalid_manifest",
          "runtime override must be explicitly trusted",
        );
      this.#runtime = KnownLlamaRuntime;
    } else {
      const { trusted: _trusted, ...artifact } = options.runtimeArtifact;
      this.#runtime = immutable(RuntimeArtifactSchema.parse(artifact));
    }
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#llamaRuntime = options.llamaRuntime ?? {};
  }

  status(): ModelSetupStatus {
    return this.#status;
  }
  cancel(): void {
    this.#controller?.abort();
  }

  async obsoleteRuntimePresent(): Promise<boolean> {
    for (const target of this.#obsoleteTargets()) {
      try {
        await lstat(target);
        return true;
      } catch {
        /* absent */
      }
    }
    return false;
  }

  async cleanupObsoleteMlxRuntime(): Promise<ObsoleteRuntimeCleanup> {
    let physicalRoot: string;
    let rootIdentity: string;
    try {
      const rootDetails = await lstat(this.#root, { bigint: true });
      if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink())
        return { kind: "refused", code: "unsafe_root" };
      rootIdentity = fileIdentity(rootDetails);
      physicalRoot = await realpath(this.#root);
    } catch (cause) {
      return cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT"
        ? { kind: "nothing_to_remove" }
        : { kind: "refused", code: "unsafe_root" };
    }
    const present: string[] = [];
    for (const target of this.#obsoleteTargets()) {
      if (!isSubpath(this.#root, target) || target === this.#root)
        return { kind: "refused", code: "unsafe_target" };
      const state = await ownedTargetState(this.#root, physicalRoot, target);
      if (state === "unsafe") return { kind: "refused", code: "unsafe_target" };
      if (state === "present") present.push(target);
    }
    if (!present.length) return { kind: "nothing_to_remove" };
    for (const target of present) {
      try {
        const rootDetails = await lstat(this.#root, { bigint: true });
        if (
          !rootDetails.isDirectory() ||
          rootDetails.isSymbolicLink() ||
          fileIdentity(rootDetails) !== rootIdentity ||
          (await realpath(this.#root)) !== physicalRoot
        )
          return { kind: "refused", code: "unsafe_root" };
      } catch {
        return { kind: "refused", code: "unsafe_root" };
      }
      if ((await ownedTargetState(this.#root, physicalRoot, target)) !== "present")
        return { kind: "refused", code: "unsafe_target" };
      await rm(target, { recursive: true, force: false });
    }
    return { kind: "removed", paths: present };
  }

  async ready(): Promise<ReadyModel | undefined> {
    const directory = join(this.#root, "active", this.#manifest.id);
    const runtimeDirectory = await this.#readyRuntime();
    if (!runtimeDirectory) return undefined;
    if (this.#verified?.directory === directory && (await this.#verifiedGenerationStillCurrent()))
      return { manifest: this.#manifest, directory, runtimeDirectory };
    this.#verified = undefined;
    try {
      const recorded = JSON.parse(await readFile(join(directory, readyFile), "utf8")) as {
        revision?: unknown;
        artifacts?: unknown;
      };
      if (recorded.revision !== this.#manifest.revision || !Array.isArray(recorded.artifacts))
        return undefined;
      const paths = new Set(recorded.artifacts);
      if (paths.size !== this.#manifest.artifacts.length) return undefined;
      const fingerprints = new Map<string, string>();
      for (const artifact of this.#manifest.artifacts) {
        if (!paths.has(artifact.path)) return undefined;
        const identity = await matches(
          artifactFile(directory, artifact.path),
          artifact.bytes,
          artifact.sha256,
        );
        if (!identity) return undefined;
        fingerprints.set(artifact.path, identity);
      }
      this.#verified = { directory, fingerprints };
      return { manifest: this.#manifest, directory, runtimeDirectory };
    } catch {
      return undefined;
    }
  }

  async install(options: InstallOptions = {}): Promise<ModelSetupStatus> {
    if (!options.consent) return this.#emit({ kind: "pending_consent" }, options);
    if (options.signal?.aborted) return this.#emit({ kind: "cancelled" }, options);
    if (this.#controller) return { kind: "failed", code: "setup_busy" };
    if (
      (this.#llamaRuntime.platform ?? process.platform) !== "darwin" ||
      (this.#llamaRuntime.arch ?? process.arch) !== "arm64"
    )
      return this.#emit({ kind: "failed", code: "unsupported_hardware" }, options);
    if (!this.#runtime.url)
      return this.#emit({ kind: "failed", code: "runtime_unavailable" }, options);
    const controller = new AbortController();
    this.#controller = controller;
    const abort = () => controller.abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      const existing = await this.ready();
      controller.signal.throwIfAborted();
      if (existing)
        return this.#emit(
          {
            kind: "ready",
            directory: existing.directory,
            runtimeDirectory: existing.runtimeDirectory,
          },
          options,
        );
      await mkdir(join(this.#root, "objects"), { recursive: true, mode: 0o700 });
      if (!(await this.#readyRuntime())) {
        const runtimeObject = await this.#ensureObject(
          {
            path: runtimeArchivePath,
            bytes: this.#runtime.bytes,
            sha256: this.#runtime.sha256,
            url: this.#runtime.url,
          },
          controller.signal,
          options,
        );
        await this.#installRuntime(runtimeObject, controller.signal, options);
      }
      for (const artifact of this.#manifest.artifacts)
        await this.#ensureObject(artifact, controller.signal, options);
      controller.signal.throwIfAborted();
      return await this.#activate(options, controller.signal);
    } catch (cause) {
      if (
        controller.signal.aborted ||
        (cause instanceof DOMException && cause.name === "AbortError")
      )
        return this.#emit({ kind: "cancelled" }, options);
      if (cause instanceof LocalEmbeddingsError)
        return this.#emit(
          {
            kind: "failed",
            code: cause.code as Extract<ModelSetupStatus, { kind: "failed" }>["code"],
          },
          options,
        );
      return this.#emit({ kind: "failed", code: "download_failed" }, options);
    } finally {
      options.signal?.removeEventListener("abort", abort);
      if (this.#controller === controller) this.#controller = undefined;
    }
  }

  #obsoleteTargets(): readonly string[] {
    return [
      join(this.#root, "runtime", "mlx"),
      join(this.#root, "runtime", ".uv-python"),
      join(this.#root, "runtime", ".uv-cache"),
      join(this.#root, "active", "qwen3-embedding-0.6b-mlx"),
    ];
  }

  #emit(status: ModelSetupStatus, options: InstallOptions): ModelSetupStatus {
    this.#status = status;
    options.onProgress?.(status);
    return status;
  }

  #runtimeDirectory(): string {
    return join(this.#root, "runtime", `llama.cpp-${this.#runtime.revision}`);
  }

  async #readyRuntime(): Promise<string | undefined> {
    const directory = this.#runtimeDirectory();
    try {
      const recorded = JSON.parse(
        await readFile(join(directory, runtimeReadyFile), "utf8"),
      ) as Record<string, unknown>;
      if (recorded.revision !== this.#runtime.revision || recorded.sha256 !== this.#runtime.sha256)
        return undefined;
      const binary = join(directory, "bin", "llama-server");
      await access(binary, constants.X_OK);
      const identity = await fingerprint(binary);
      if (!identity) {
        this.#runtimeVerified = undefined;
        return undefined;
      }
      if (
        this.#runtimeVerified?.directory === directory &&
        this.#runtimeVerified.binary === identity
      )
        return directory;
      const verified = await matchesSha256(binary, this.#runtime.binarySha256);
      if (!verified) {
        this.#runtimeVerified = undefined;
        return undefined;
      }
      this.#runtimeVerified = { directory, binary: verified };
      return directory;
    } catch {
      return undefined;
    }
  }

  async #installRuntime(
    archive: string,
    signal: AbortSignal,
    options: InstallOptions,
  ): Promise<void> {
    const active = this.#runtimeDirectory();
    const stagingParent = join(this.#root, ".staging", `runtime-${randomUUID()}`);
    try {
      this.#emit({ kind: "installing_runtime", step: "extracting" }, options);
      await mkdir(stagingParent, { recursive: true, mode: 0o700 });
      const listing = (await execFileAsync("/usr/bin/tar", ["-tzf", archive], { signal })).stdout
        .split("\n")
        .filter(Boolean);
      const allowed = new Set([
        `${runtimeArchiveRoot}/`,
        `${runtimeArchiveRoot}/bin/`,
        `${runtimeArchiveRoot}/bin/llama-server`,
        `${runtimeArchiveRoot}/LICENSE`,
        `${runtimeArchiveRoot}/THIRD_PARTY_NOTICES.txt`,
      ]);
      if (!listing.length || listing.some((entry) => !allowed.has(entry)))
        throw new LocalEmbeddingsError(
          "runtime_install_failed",
          "runtime archive contains unexpected paths",
        );
      await execFileAsync("/usr/bin/tar", ["-xzf", archive, "-C", stagingParent], { signal });
      signal.throwIfAborted();
      this.#emit({ kind: "installing_runtime", step: "verifying" }, options);
      const staged = join(stagingParent, runtimeArchiveRoot);
      for (const path of [
        join(staged, "bin", "llama-server"),
        join(staged, "LICENSE"),
        join(staged, "THIRD_PARTY_NOTICES.txt"),
      ]) {
        const details = await lstat(path);
        if (!details.isFile() || details.isSymbolicLink())
          throw new LocalEmbeddingsError("runtime_install_failed", "runtime payload is invalid");
      }
      await chmod(join(staged, "bin", "llama-server"), 0o700);
      if (!(await matchesSha256(join(staged, "bin", "llama-server"), this.#runtime.binarySha256)))
        throw new LocalEmbeddingsError(
          "runtime_install_failed",
          "runtime executable hash differs from trusted artifact",
        );
      await writeFile(
        join(staged, runtimeReadyFile),
        JSON.stringify({ revision: this.#runtime.revision, sha256: this.#runtime.sha256 }),
        { mode: 0o600 },
      );
      await mkdir(dirname(active), { recursive: true, mode: 0o700 });
      await this.#publish(staged, active, signal);
      this.#runtimeVerified = undefined;
      if (!(await this.#readyRuntime()))
        throw new LocalEmbeddingsError(
          "runtime_install_failed",
          "installed runtime could not be verified",
        );
    } catch (cause) {
      if (signal.aborted) throw cause;
      if (cause instanceof LocalEmbeddingsError) throw cause;
      throw new LocalEmbeddingsError(
        "runtime_install_failed",
        "verified runtime archive installation failed",
      );
    } finally {
      await rm(stagingParent, { recursive: true, force: true });
    }
  }

  async #verifiedGenerationStillCurrent(): Promise<boolean> {
    if (!this.#verified) return false;
    for (const artifact of this.#manifest.artifacts)
      if (
        (await fingerprint(artifactFile(this.#verified.directory, artifact.path))) !==
        this.#verified.fingerprints.get(artifact.path)
      )
        return false;
    return true;
  }

  async #ensureObject(
    artifact: { path: string; bytes: number; sha256: string; url: string },
    signal: AbortSignal,
    options: InstallOptions,
  ): Promise<string> {
    const object = join(this.#root, "objects", artifact.sha256);
    if (await matches(object, artifact.bytes, artifact.sha256)) return object;
    await rm(object, { force: true });
    const temporary = `${object}.${randomUUID()}.part`;
    try {
      const response = await this.#fetch(artifact.url, { signal });
      if (!response.ok || !response.body)
        throw new LocalEmbeddingsError("download_failed", "artifact download failed");
      const handle = await open(temporary, "wx", 0o600);
      const digest = createHash("sha256");
      let received = 0;
      try {
        const reader = response.body.getReader();
        let complete = false;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            if (signal.aborted) {
              await reader.cancel();
              throw new DOMException("cancelled", "AbortError");
            }
            received += part.value.byteLength;
            if (received > artifact.bytes)
              throw new LocalEmbeddingsError(
                "size_mismatch",
                "artifact size differs from manifest",
              );
            digest.update(part.value);
            await this.#writeAll(handle, part.value);
            this.#emit(
              { kind: "downloading", path: artifact.path, received, expected: artifact.bytes },
              options,
            );
          }
          complete = true;
        } finally {
          if (!complete) await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
      } finally {
        await handle.close();
      }
      if (received !== artifact.bytes)
        throw new LocalEmbeddingsError("size_mismatch", "artifact size differs from manifest");
      this.#emit({ kind: "verifying", path: artifact.path }, options);
      if (digest.digest("hex") !== artifact.sha256)
        throw new LocalEmbeddingsError("hash_mismatch", "artifact hash differs from manifest");
      await rename(temporary, object);
      return object;
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async #writeAll(handle: Awaited<ReturnType<typeof open>>, bytes: Uint8Array): Promise<void> {
    let offset = 0;
    while (offset < bytes.byteLength) {
      const result = await handle.write(bytes, offset, bytes.byteLength - offset, null);
      if (result.bytesWritten <= 0)
        throw new LocalEmbeddingsError("download_failed", "artifact write failed");
      offset += result.bytesWritten;
    }
  }

  async #activate(options: InstallOptions, signal: AbortSignal): Promise<ModelSetupStatus> {
    const active = join(this.#root, "active", this.#manifest.id);
    const existing = await this.ready();
    signal.throwIfAborted();
    if (existing)
      return this.#emit(
        {
          kind: "ready",
          directory: existing.directory,
          runtimeDirectory: existing.runtimeDirectory,
        },
        options,
      );
    const staging = join(this.#root, ".staging", `${this.#manifest.id}-${randomUUID()}`);
    try {
      await mkdir(staging, { recursive: true, mode: 0o700 });
      for (const artifact of this.#manifest.artifacts) {
        const target = artifactFile(staging, artifact.path);
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(this.#root, "objects", artifact.sha256), target);
        signal.throwIfAborted();
      }
      await writeFile(
        join(staging, readyFile),
        JSON.stringify({
          revision: this.#manifest.revision,
          artifacts: this.#manifest.artifacts.map((artifact) => artifact.path),
        }),
        { mode: 0o600 },
      );
      await mkdir(dirname(active), { recursive: true });
      signal.throwIfAborted();
      await this.#publish(staging, active, signal);
      this.#verified = undefined;
      const ready = await this.ready();
      if (!ready)
        throw new LocalEmbeddingsError(
          "runtime_install_failed",
          "installed model could not be verified",
        );
      return this.#emit(
        { kind: "ready", directory: ready.directory, runtimeDirectory: ready.runtimeDirectory },
        options,
      );
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }

  async #publish(staging: string, active: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    try {
      await rename(staging, active);
      return;
    } catch (cause) {
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw cause;
    }
    const quarantine = join(this.#root, ".quarantine", `${randomUUID()}`);
    await mkdir(dirname(quarantine), { recursive: true });
    signal.throwIfAborted();
    try {
      await rename(active, quarantine);
    } catch (cause) {
      if (!(cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT"))
        throw cause;
    }
    try {
      await rename(staging, active);
    } catch (cause) {
      await rename(quarantine, active).catch(() => undefined);
      throw cause;
    } finally {
      await rm(quarantine, { recursive: true, force: true });
    }
  }
}

export function createModelSetup(options: ModelSetupOptions): ModelSetup {
  return new ModelSetup(options);
}
