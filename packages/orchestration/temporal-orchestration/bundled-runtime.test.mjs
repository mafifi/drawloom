import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { build as esbuild } from "esbuild";

// The shipped host is an esbuild bundle executed by the pinned Node runtime, so
// this lane bundles and runs the client the same way. It previously produced a
// single-file `bun build --compile` executable; that shape is no longer shipped,
// and the lane only passed where Bun happened to be installed.
test("a bundled host executes a packaged workflow using only staged Node resources", {
  skip: process.env.DRAWLOOM_TEMPORAL_BUNDLED !== "1",
  timeout: 60000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-bundled-client-"));
  const pkg = join(root, "plugin");
  await mkdir(pkg);
  const executable = join(root, "client.mjs");
  try {
    await esbuild({
      entryPoints: [
        resolve("packages/orchestration/temporal-orchestration/fixtures/bundled-client.mjs"),
      ],
      outfile: executable,
      bundle: true,
      platform: "node",
      format: "esm",
      // Mirrors the desktop host's own banner: bundled CommonJS dependencies
      // still call `require`, which does not exist in an ESM output.
      banner: {
        js: 'import { createRequire as __bundledRequire } from "node:module"; const require = __bundledRequire(import.meta.url);',
      },
    });
    await esbuild({
      entryPoints: [resolve("packages/orchestration/temporal-orchestration/fixtures/recovery.mjs")],
      outfile: join(pkg, "workflow.mjs"),
      bundle: true,
      platform: "browser",
      format: "esm",
    });
    const runtime = resolve(
      process.env.DRAWLOOM_ORCHESTRATION_RUNTIME ?? "apps/desktop/src-tauri/binaries/orchestration",
    );
    const output = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [executable, join(root, "data"), runtime, pkg], {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(Error("Bundled client timed out"));
      }, 45000);
      child.stdout.on("data", (value) => {
        stdout += value;
      });
      child.stderr.on("data", (value) => {
        stderr += value;
      });
      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.once("exit", (code) => {
        clearTimeout(timeout);
        code === 0 ? resolve(stdout) : reject(Error(stderr));
      });
    });
    assert.match(output, /COMPILED_RUNTIME_OK/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
