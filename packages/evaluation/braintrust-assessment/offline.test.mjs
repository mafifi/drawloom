import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (!process.versions.bun) {
  test("supported Braintrust assessment imports and runs under an OS network-denied clean child", { skip: process.platform !== "darwin", timeout: 30000 }, async () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const root = await mkdtemp(join(tmpdir(), "drawloom-assessment-offline-"));
    await mkdir(join(root, "tmp"), { recursive: true, mode: 0o700 });
    const log = join(root, "network.jsonl");
    let received = 0;
    const server = createServer((_request, response) => { received++; response.end("not expected"); });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Local probe port is unavailable");
      const child = spawn("/usr/bin/sandbox-exec", [
        "-p", "(version 1)(allow default)(deny network*)",
        process.execPath,
        "--import", join(directory, "fixtures/network-observer.mjs"),
        join(directory, "fixtures/offline-assessment.mjs"),
        String(address.port),
      ], {
        cwd: directory,
        env: {
          PATH: "/usr/bin:/bin",
          HOME: root,
          TMPDIR: join(root, "tmp"),
          CI: "1",
          DO_NOT_TRACK: "1",
          OTEL_SDK_DISABLED: "true",
          DRAWLOOM_ASSESSMENT_NETWORK_LOG: log,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "", stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      const code = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", resolve);
      });
      assert.equal(code, 0, stderr);
      const result = stdout.split("\n").map((line) => { try { return JSON.parse(line); } catch { return undefined; } }).find((value) => value?.kind === "result");
      assert.deepEqual(result, { kind: "result", denied: true, outcome: "succeeded", score: 1 });
      const observed = JSON.parse((await readFile(log, "utf8")).trim());
      assert.equal(observed["net.client.socket"], 1, "only the deliberate denied socket probe may be observed");
      assert.equal(observed["undici:request:create"] ?? 0, 0);
      assert.equal(observed["http.client.request.created"] ?? 0, 0);
      assert.equal(received, 0);
    } finally {
      server.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
