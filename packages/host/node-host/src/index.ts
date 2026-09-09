import {
  JsonValueSchema,
  type JsonStore,
  type AssetStore,
  type RpcTransport,
  type RpcMessage,
} from "@drawloom/host";
import { mkdir, realpath, lstat, open, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { z } from "zod";
export { createMcpToolServer } from "./mcp.js";
export function createNodeAssetStore(root: string): AssetStore {
  const base = resolve(root);
  async function location(key: string, create: boolean) {
    if (
      !key ||
      key.includes("\\") ||
      key.split("/").some((p) => !p || p === "." || p === "..") ||
      key.includes("\0")
    )
      throw Error("Invalid asset key");
    await mkdir(base, { recursive: true });
    const canonical = await realpath(base);
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
    }
    const target = join(parent, segments.at(-1)!);
    try {
      if ((await lstat(target)).isSymbolicLink())
        throw Error("Invalid asset link");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return target;
  }
  return {
    async read(key) {
      const target = await location(key, false);
      const file = await open(
        target,
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      try {
        return new Uint8Array(await file.readFile());
      } finally {
        await file.close();
      }
    },
    async write(key, bytes) {
      const target = await location(key, true);
      const temporary = join(dirname(target), ".drawloom-" + randomUUID());
      let created = false;
      try {
        const file = await open(temporary, "wx", 0o600);
        created = true;
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(temporary, target);
        created = false;
      } finally {
        if (created) await unlink(temporary);
      }
    },
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
          pending.delete(id);
          clearTimeout(entry.timer);
          if ("error" in envelope)
            entry.reject(Error("Provider request rejected"));
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
