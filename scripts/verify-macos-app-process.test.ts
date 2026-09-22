import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  createOwnedChildProcesses,
  fetchJsonWithDeadline,
  fetchWithDeadline,
} from "./verify-macos-app-process.mjs";

const readiness = (out: string) => {
  const line = out.split("\n").find((value) => value.trim().startsWith("{"));
  if (!line) return undefined;
  const value = JSON.parse(line);
  return typeof value?.url === "string" ? value : undefined;
};

const fakeHost = (source: string) =>
  spawn(process.execPath, ["--input-type=module", "-e", source], {
    stdio: ["ignore", "pipe", "pipe"],
  });

const runFailure = async (
  source: string,
  afterReady?: (ready: { url: string }) => Promise<void>,
  { waitForBoot = false } = {},
) => {
  const directory = await mkdtemp(join(tmpdir(), "drawloom-owned-host-"));
  const children = createOwnedChildProcesses({ stopTimeoutMs: 1_000 });
  const child = children.track(fakeHost(source));
  let out = "";
  child.stdout.on("data", (chunk: Buffer) => (out += chunk));
  const events = [];
  child.once("exit", () => events.push("exit"));
  let failure: unknown;
  if (waitForBoot && !out.includes("booted"))
    await new Promise<void>((resolve) => {
      const booted = () => {
        if (!out.includes("booted")) return;
        child.stdout.off("data", booted);
        resolve();
      };
      child.stdout.on("data", booted);
    });
  const started = Date.now();
  try {
    const ready = await children.waitForReadiness(child, () => readiness(out), {
      timeoutMs: 100,
      output: () => out,
    });
    await afterReady?.(ready);
  } catch (error) {
    failure = error;
  } finally {
    await children.reap();
    events.push("reaped");
    await rm(directory, { recursive: true, force: true });
    events.push("removed");
  }
  return { child, directory, events, failure, elapsedMs: Date.now() - started };
};

test("a verifier-owned host that never becomes ready is reaped before disposable data is removed", async () => {
  const result = await runFailure(
    "console.log('booted'); setInterval(() => {}, 1_000)",
    undefined,
    { waitForBoot: true },
  );
  expect(result.failure).toMatchObject({ message: expect.stringContaining("did not start") });
  expect(result.elapsedMs).toBeLessThan(5_000);
  expect(result.child.signalCode).toBe("SIGKILL");
  expect(result.child.stdout.destroyed).toBe(true);
  expect(result.child.stderr.destroyed).toBe(true);
  expect(result.events).toEqual(["exit", "reaped", "removed"]);
  expect(existsSync(result.directory)).toBe(false);
});

test("a verifier-owned host that exits before readiness rejects promptly without a live pipe", async () => {
  const result = await runFailure("process.exit(17)");
  expect(result.failure).toMatchObject({
    message: expect.stringContaining("exited before readiness"),
  });
  expect(result.elapsedMs).toBeLessThan(5_000);
  expect(result.child.exitCode).toBe(17);
  expect(result.child.stdout.destroyed).toBe(true);
  expect(result.child.stderr.destroyed).toBe(true);
  expect(result.events).toEqual(["exit", "reaped", "removed"]);
  expect(existsSync(result.directory)).toBe(false);
});

test("a later verifier failure still terminates its ready host before deleting state", async () => {
  const result = await runFailure(
    "import {createServer} from 'node:http'; console.log('booted'); const server=createServer((_request,response)=>{response.statusCode=503; response.end('not ready')}); server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`})))",
    async (ready) => {
      const response = await fetchWithDeadline(ready.url);
      expect(response.status).toBe(200);
    },
    { waitForBoot: true },
  );
  expect(result.failure).toMatchObject({ message: expect.stringContaining("503") });
  expect(result.elapsedMs).toBeLessThan(5_000);
  expect(result.child.signalCode).toBe("SIGKILL");
  expect(result.events).toEqual(["exit", "reaped", "removed"]);
  expect(existsSync(result.directory)).toBe(false);
});

test("verifier requests have a bounded deadline", async () => {
  const pendingFetch: typeof fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return reject(new Error("missing deadline signal"));
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
  await expect(fetchWithDeadline("http://127.0.0.1:1", {}, 25, pendingFetch)).rejects.toThrow(
    /timed out|aborted/i,
  );
});

test("a partial JSON body times out and its owned host is reaped before state deletion", async () => {
  const result = await runFailure(
    "import {createServer} from 'node:http'; console.log('booted'); const server=createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/json'}); response.write('{')}); server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`})))",
    async (ready) => {
      await fetchJsonWithDeadline(ready.url, {}, 100);
    },
    { waitForBoot: true },
  );
  expect(result.failure).toMatchObject({
    message: expect.stringMatching(/timed out|abort/i),
  });
  expect(result.elapsedMs).toBeLessThan(5_000);
  expect(result.child.signalCode).toBe("SIGKILL");
  expect(result.child.stdout.destroyed).toBe(true);
  expect(result.child.stderr.destroyed).toBe(true);
  expect(result.events).toEqual(["exit", "reaped", "removed"]);
  expect(existsSync(result.directory)).toBe(false);
});
