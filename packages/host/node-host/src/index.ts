import {
  JsonValueSchema,
  RpcRequestError,
  type JsonStore,
  type AssetReader,
  type AssetStore,
  type AssetReadOptions,
  type RpcTransport,
  type RpcMessage,
} from "@drawloom/host";
import { mkdir, realpath, lstat, open, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, dirname, relative, isAbsolute, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { z } from "zod";
export { createMcpToolServer } from "./mcp.js";

const managedAssetByteLimit = 256 * 1024 * 1024;
const assetChunkByteLimit = 64 * 1024;

function aborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = Error('Asset operation cancelled');
  error.name = 'AbortError';
  throw error;
}

function validateLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0)
    throw Error('Invalid asset byte limit');
}

function validateRange(options: AssetReadOptions, size: number): { start: number; endExclusive: number } {
  const start = options.start ?? 0;
  const endExclusive = options.endExclusive ?? size;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(endExclusive) ||
    start < 0 ||
    endExclusive < start ||
    endExclusive > size
  ) throw Error('Invalid asset range');
  return { start, endExclusive };
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (!path.startsWith('..' + sep) && path !== '..' && !isAbsolute(path));
}

export function createNodeAssetStore(root: string, binding?: { device: string; inode: string }): AssetStore {
  const base = resolve(root);
  const expected = binding ? { ...binding } : undefined;
  let identity: { canonical: string; dev: bigint; ino: bigint } | undefined;

  async function canonicalRoot(create: boolean): Promise<string> {
    if (create) await mkdir(base, { recursive: true });
    const info = await lstat(base);
    if (info.isSymbolicLink() || !info.isDirectory()) throw Error('Invalid asset root');
    const canonical = await realpath(base);
    const canonicalInfo = await lstat(canonical, { bigint: true });
    if (!canonicalInfo.isDirectory()) throw Error('Invalid asset root');
    if (expected && (expected.device !== String(canonicalInfo.dev) || expected.inode !== String(canonicalInfo.ino))) throw Error('Asset root changed');
    if (!identity) identity = { canonical, dev: canonicalInfo.dev, ino: canonicalInfo.ino };
    else if (
      identity.canonical !== canonical ||
      identity.dev !== canonicalInfo.dev ||
      identity.ino !== canonicalInfo.ino
    ) throw Error('Asset root changed');
    return canonical;
  }

  async function location(key: string, create: boolean) {
    if (
      !key ||
      key.includes("\\") ||
      key.split("/").some((p) => !p || p === "." || p === "..") ||
      key.includes("\0")
    )
      throw Error("Invalid asset key");
    const canonical = await canonicalRoot(create);
    let parent = canonical;
    const segments = key.split("/");
    for (const segment of segments.slice(0, -1)) {
      parent = join(parent, segment);
      if (create)
        await mkdir(parent, { recursive: false }).catch((e) => {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        });
      const info = await lstat(parent);
      if (info.isSymbolicLink() || !info.isDirectory())
        throw Error("Invalid asset directory");
      const canonicalParent = await realpath(parent);
      if (!inside(canonical, canonicalParent)) throw Error('Invalid asset directory');
      parent = canonicalParent;
    }
    const target = join(parent, segments.at(-1)!);
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink()) throw Error("Invalid asset link");
      if (!info.isFile()) throw Error('Invalid asset file');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return { target, canonical };
  }

  async function syncDirectory(path: string): Promise<void> {
    const directory = await open(path, constants.O_RDONLY);
    try { await directory.sync(); } finally { await directory.close(); }
  }

  async function openReader(key: string): Promise<AssetReader> {
    const { target, canonical } = await location(key, false);
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || !Number.isSafeInteger(info.size) || info.size < 0)
        throw Error('Invalid asset file');
      const canonicalTarget = await realpath(target);
      if (!inside(canonical, canonicalTarget)) throw Error('Invalid asset file');
      const pathInfo = await lstat(canonicalTarget);
      if (!pathInfo.isFile() || pathInfo.dev !== info.dev || pathInfo.ino !== info.ino)
        throw Error('Asset file changed during open');
      await canonicalRoot(false);
      let closed = false;
      let closing: Promise<void> | undefined;
      return {
        size: info.size,
        stream(options = {}) {
          const { start, endExclusive } = validateRange(options, info.size);
          const { signal } = options;
          return {
            async *[Symbol.asyncIterator]() {
              if (closed) throw Error('Asset reader closed');
              aborted(signal);
              let position = start;
              while (position < endExclusive) {
                if (closed) throw Error('Asset reader closed');
                aborted(signal);
                const length = Math.min(assetChunkByteLimit, endExclusive - position);
                const buffer = new Uint8Array(length);
                let bytesRead: number;
                try {
                  ({ bytesRead } = await file.read(buffer, 0, length, position));
                } catch {
                  if (closed) throw Error('Asset reader closed');
                  throw Error('Asset read failed');
                }
                if (closed) throw Error('Asset reader closed');
                aborted(signal);
                if (bytesRead === 0) throw Error('Asset read ended before expected range');
                position += bytesRead;
                yield bytesRead === buffer.byteLength ? buffer : buffer.subarray(0, bytesRead);
                if (closed) throw Error('Asset reader closed');
                aborted(signal);
              }
            },
          };
        },
        close() {
          if (closing) return closing;
          closed = true;
          closing = file.close();
          return closing;
        },
      };
    } catch (error) {
      await file.close();
      throw error;
    }
  }

  async function writeStream(
    key: string,
    chunks: AsyncIterable<Uint8Array>,
    options: { maxBytes: number; signal?: AbortSignal },
  ): Promise<void> {
    validateLimit(options.maxBytes);
    aborted(options.signal);
    const { target, canonical } = await location(key, true);
    const temporary = join(dirname(target), ".drawloom-" + randomUUID());
    let created = false;
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      file = await open(temporary, "wx", 0o600);
      created = true;
      let total = 0;
      for await (const chunk of chunks) {
        aborted(options.signal);
        if (!(chunk instanceof Uint8Array)) throw Error('Invalid asset chunk');
        if (chunk.byteLength > options.maxBytes - total) throw Error('Asset byte limit exceeded');
        total += chunk.byteLength;
        let offset = 0;
        while (offset < chunk.byteLength) {
          aborted(options.signal);
          const length = Math.min(assetChunkByteLimit, chunk.byteLength - offset);
          const { bytesWritten } = await file.write(chunk, offset, length, null);
          if (bytesWritten === 0) throw Error('Asset write failed');
          offset += bytesWritten;
        }
      }
      aborted(options.signal);
      await file.sync();
      await file.close();
      file = undefined;
      const validated = await location(key, false).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { target, canonical };
        throw error;
      });
      if (validated.target !== target || validated.canonical !== canonical)
        throw Error('Asset root changed');
      await canonicalRoot(false);
      await rename(temporary, target);
      created = false;
      await syncDirectory(dirname(target));
    } finally {
      if (file) await file.close().catch(() => {});
      if (created) {
        try { await unlink(temporary); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
    }
  }

  return {
    open: openReader,
    async read(key) {
      const reader = await openReader(key);
      try {
        if (reader.size > managedAssetByteLimit) throw Error('Asset byte limit exceeded');
        const bytes = new Uint8Array(reader.size);
        let offset = 0;
        for await (const chunk of reader.stream()) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return bytes;
      } finally {
        await reader.close();
      }
    },
    async write(key, bytes) {
      async function* input() { yield bytes; }
      await writeStream(key, input(), { maxBytes: managedAssetByteLimit });
    },
    writeStream,
  };
}
export function createNodeJsonStore(root: string): JsonStore {
  const assets = createNodeAssetStore(root);
  const key = (value: string) =>
    encodeURIComponent(z.string().min(1).parse(value)) + ".json";
  return {
    async get(value) {
      try {
        return JsonValueSchema.parse(
          JSON.parse(new TextDecoder().decode(await assets.read(key(value)))),
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw Error("Stored value unavailable");
      }
    },
    async set(value, data) {
      const valid = JsonValueSchema.parse(data);
      await assets.write(
        key(value),
        new TextEncoder().encode(JSON.stringify(valid)),
      );
    },
  };
}
export function createStdioTransport(options: {
  command: string;
  args: readonly string[];
  cwd?: string;
  requestTimeoutMs?: number;
  maxMessageBytes?: number;
}): RpcTransport {
  const process = spawn(options.command, [...options.args], {
    ...(options.cwd ? { cwd: options.cwd } : {}),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let ended = false;
  let closed = false;
  let nextId = 0;
  let buffer = "";
  const listeners = new Set<{
    message: (message: RpcMessage) => void;
    failure: () => void;
  }>();
  const pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const fail = () => {
    if (ended) return;
    ended = true;
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error("Transport unavailable"));
    }
    pending.clear();
    for (const listener of listeners) listener.failure();
    process.kill();
  };
  const send = (value: unknown) => {
    if (ended || closed) throw Error("Transport unavailable");
    process.stdin.write(JSON.stringify(value) + "\n", (error) => {
      if (error) fail();
    });
  };
  process.stdout.setEncoding("utf8");
  process.stdout.on("data", (chunk: string) => {
    if (ended) return;
    buffer += chunk;
    if (
      Buffer.byteLength(buffer) > (options.maxMessageBytes ?? 4 * 1024 * 1024)
    ) {
      fail();
      return;
    }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        const envelope = z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(line));
        if (typeof envelope.method === "string") {
          const id =
            envelope.id === undefined
              ? undefined
              : z.union([z.string(), z.number()]).parse(envelope.id);
          for (const listener of listeners)
            listener.message({
              method: envelope.method,
              params: envelope.params,
              ...(id === undefined ? {} : { id }),
            });
        } else {
          const id = z.number().parse(envelope.id);
          const entry = pending.get(id);
          if (!entry) continue;
          // Keep the entry and its deadline until validation succeeds, so fail()
          // can reject this request as well as all other pending requests.
          if (("error" in envelope) === ("result" in envelope)) throw Error();
          const rejection = "error" in envelope
            ? new RpcRequestError(z.object({ code: z.number().int().safe() }).parse(envelope.error).code)
            : undefined;
          pending.delete(id);
          clearTimeout(entry.timer);
          if (rejection) entry.reject(rejection);
          else if ("result" in envelope) entry.resolve(envelope.result);
          else throw Error();
        }
      } catch {
        fail();
        return;
      }
    }
  });
  process.stderr.resume();
  process.on("error", fail);
  process.on("exit", () => {
    if (!closed) fail();
  });
  process.stdin.on("error", fail);
  return {
    request(method, params) {
      if (ended || closed)
        return Promise.reject(Error("Transport unavailable"));
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(fail, options.requestTimeoutMs ?? 30000);
        pending.set(id, { resolve, reject, timer });
        try {
          send({ id, method, params });
        } catch {
          fail();
        }
      });
    },
    notify(method, params) {
      send({ method, ...(params === undefined ? {} : { params }) });
    },
    respond(id, result) {
      send({ id, result });
    },
    subscribe(message, failure) {
      const entry = { message, failure };
      listeners.add(entry);
      if (ended) queueMicrotask(failure);
      return () => {
        listeners.delete(entry);
      };
    },
    async close() {
      if (closed) return;
      closed = true;
      listeners.clear();
      fail();
      process.stdin.destroy();
      if (process.exitCode === null && process.signalCode === null)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            process.kill("SIGKILL");
          }, 1000);
          process.once("close", () => {
            clearTimeout(timer);
            resolve();
          });
        });
    },
  };
}
export function codexCommand(command = "codex"): {
  command: string;
  args: string[];
} {
  return {
    command,
    args: [
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
  };
}
