import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { open, mkdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { isMissing } from "./storage.js";

const COMMAND_OUTPUT_LIMIT_BYTES = 1024 * 1024;
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}
export async function acquireLock(directory: string): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "manager.lock");
  const token = `${process.pid}:${crypto.randomUUID()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, "wx", 0o600);
      try {
        await file.writeFile(JSON.stringify({ pid: process.pid, token }));
        await file.sync();
      } finally {
        await file.close();
      }
      return async () => {
        const saved = z
          .object({ token: z.string() })
          .parse(JSON.parse(await readFile(path, "utf8")));
        if (saved.token === token) await unlink(path);
      };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      let previous;
      try {
        previous = z
          .object({ pid: z.number().int().positive(), token: z.string() })
          .parse(JSON.parse(await readFile(path, "utf8")));
      } catch {
        throw new Error(
          "Orchestration directory is owned or has an incomplete lock; inspect manager.lock",
        );
      }
      if (isAlive(previous.pid))
        throw new Error("Orchestration directory is already owned by another manager");
      // Compare immediately before reclaiming a dead writer; never terminate a PID.
      const latest = JSON.parse(await readFile(path, "utf8")) as { token?: string };
      if (latest.token !== previous.token) throw new Error("Orchestration lock changed");
      await unlink(path).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
    }
  }
  throw new Error("Orchestration directory is owned");
}
export async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback port available");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
export async function stopChild(child: ChildProcess | undefined, timeoutMs = 5000): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    child.once("exit", finish);
    child.once("error", finish);
    child.kill("SIGTERM");
  });
}
export async function command(
  executable: string,
  args: string[],
  timeoutMs = 30000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { stdout } = await promisify(execFile)(executable, args, {
      encoding: "buffer",
      maxBuffer: COMMAND_OUTPUT_LIMIT_BYTES,
      signal: controller.signal,
      killSignal: "SIGKILL",
    });
    return stdout.toString("utf8");
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Local orchestration command timed out");
    if (!(error instanceof Error)) throw error;
    const result = error as Error & {
      code?: number | string;
      stderr?: Buffer | string;
    };
    if (result.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER")
      throw new Error(
        `Local orchestration command output exceeded ${COMMAND_OUTPUT_LIMIT_BYTES} bytes`,
      );
    if (typeof result.code === "number") {
      const errorOutput = Buffer.isBuffer(result.stderr)
        ? result.stderr.toString("utf8")
        : (result.stderr ?? "");
      throw new Error(
        `Local orchestration command failed (${result.code}): ${errorOutput.slice(-2000)}`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
