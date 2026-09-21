import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readdir } from "node:fs/promises";

/**
 * The shipped sidecars are assembled by `pnpm deploy` and then pruned. Three
 * things have silently broken this before, none of which a "the app starts"
 * check would catch:
 *
 *  - Tauri's resource copy does not preserve symlinks, so a deploy using pnpm's
 *    default symlinked store arrives in the .app with no dependency closure at
 *    all. The worker only fails when something uses it.
 *  - The prune keeps one platform's native binary; keeping the wrong one, or
 *    leaving links to removed directories, produces a tree that cannot load.
 *  - The pruned tree must still resolve and execute away from the checkout.
 *
 * This exercises the real assembly rather than asserting on sizes.
 */
const repository = resolve(import.meta.dirname, "..");
const pnpm = ["--yes", "pnpm@12.5.1"];
const triple = { arm64: "aarch64", x64: "x86_64" }[process.arch] + "-apple-darwin";

function deploy(filter, destination) {
  // Deployed inside the repository: pnpm rewrites patched-dependency paths
  // relative to the target and cannot cross filesystem roots.
  execFileSync(
    "npx",
    [...pnpm, "--filter", filter, "deploy", "--prod", "--node-linker=hoisted", destination],
    { cwd: repository, stdio: "pipe" },
  );
}

async function walk(directory, visit) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    visit(entry, full);
    if (entry.isDirectory() && !entry.isSymbolicLink()) await walk(full, visit);
  }
}

test("the packaged orchestration sidecar is self-contained, single-platform and runnable", async (t) => {
  if (process.platform !== "darwin") return t.skip("packaging target is macOS");
  const staging = join(repository, ".deploy", `packaged-check-${process.pid}`);
  const away = mkdtempSync(join(tmpdir(), "drawloom-packaged-"));
  try {
    deploy("@drawloom/temporal-orchestration", staging);
    execFileSync(
      process.execPath,
      [
        join(repository, "scripts/prune-orchestration-sidecar-runtime.mjs"),
        staging,
        `--core-bridge-target=${triple}`,
      ],
      { cwd: repository, stdio: "pipe" },
    );

    // Tauri copies resources without preserving links; a symlinked closure
    // would arrive empty, so the assembled tree must contain none.
    const links = [];
    await walk(staging, (entry, full) => {
      if (entry.isSymbolicLink()) links.push(full);
    });
    assert.deepEqual(links, [], "a deployed sidecar must contain no symlinks");

    // Exactly the build target's native binary survives, and it is that arch.
    const releases = [];
    await walk(join(staging, "node_modules"), (entry, full) => {
      if (entry.isDirectory() && full.endsWith(join("core-bridge", "releases")))
        releases.push(full);
    });
    assert.ok(releases.length > 0, "core-bridge releases directory should exist");
    for (const directory of releases) {
      assert.deepEqual(readdirSync(directory), [triple], `only ${triple} should remain`);
      const binary = join(directory, triple, "index.node");
      assert.ok(statSync(binary).isFile(), "the kept platform must retain its binary");
      const described = execFileSync("file", [binary], { encoding: "utf8" });
      assert.match(described, /Mach-O/, "the kept binary must be Mach-O");
      assert.match(
        described,
        new RegExp(process.arch === "arm64" ? "arm64" : "x86_64"),
        "the kept binary must match the build architecture",
      );
    }

    // The entrypoint and the workflow module it resolves by path must survive.
    for (const asset of ["dist/sidecar.js", "dist/workflow.js"])
      assert.ok(existsSync(join(staging, asset)), `${asset} must be present`);

    // It must load and run outside the checkout it was built from.
    const relocated = join(away, "orchestration");
    cpSync(staging, relocated, { recursive: true });
    const started = spawnSync(process.execPath, [join(relocated, "dist/sidecar.js")], {
      cwd: "/",
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.doesNotMatch(
      String(started.stderr),
      /ERR_MODULE_NOT_FOUND|ERR_DLOPEN/,
      `relocated sidecar failed to resolve its closure: ${started.stderr.slice(0, 400)}`,
    );
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(away, { recursive: true, force: true });
  }
});
