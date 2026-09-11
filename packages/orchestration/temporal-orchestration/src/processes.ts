import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { open, mkdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { isMissing } from "./storage.js";
export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return !(error instanceof Error && "code" in error && error.code === "ESRCH"); }
}
export async function acquireLock(directory: string): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "manager.lock");
  const token = `${process.pid}:${crypto.randomUUID()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(path, "wx", 0o600);
      try { await file.writeFile(JSON.stringify({ pid: process.pid, token })); await file.sync(); } finally { await file.close(); }
      return async () => {
        const saved = z.object({ token: z.string() }).parse(JSON.parse(await readFile(path, "utf8")));
        if (saved.token === token) await unlink(path);
      };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
      let previous;
      try { previous = z.object({ pid: z.number().int().positive(), token: z.string() }).parse(JSON.parse(await readFile(path, "utf8"))); }
      catch { throw new Error("Orchestration directory is owned or has an incomplete lock; inspect manager.lock"); }
      if (isAlive(previous.pid)) throw new Error("Orchestration directory is already owned by another manager");
      // Compare immediately before reclaiming a dead writer; never terminate a PID.
      const latest = JSON.parse(await readFile(path, "utf8")) as { token?: string };
      if (latest.token !== previous.token) throw new Error("Orchestration lock changed");
      await unlink(path).catch((error: unknown) => { if (!isMissing(error)) throw error; });
    }
  }
  throw new Error("Orchestration directory is owned");
}
export async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback port available");
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
export async function stopChild(child: ChildProcess | undefined, timeoutMs = 5000): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const finish = () => { clearTimeout(timer); resolve(); };
    child.once("exit", finish); child.once("error", finish); child.kill("SIGTERM");
  });
}
export async function command(executable: string, args: string[], timeoutMs = 30000): Promise<string> {
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let errorOutput = "";
  child.stdout.on("data", (data: Buffer) => { if (output.length < 65536) output += data.toString(); });
  child.stderr.on("data", (data: Buffer) => { if (errorOutput.length < 65536) errorOutput += data.toString(); });
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Local orchestration command timed out")); }, timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`Local orchestration command failed (${code}): ${errorOutput.slice(-2000)}`)); });
  });
}
