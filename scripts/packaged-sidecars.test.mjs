import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readdir } from "node:fs/promises";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { setTimeout } from "node:timers/promises";

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

    // It must load and run outside the checkout it was built from, over the
    // interface it actually has. This previously asserted only that stderr did
    // not match two error patterns, while launching the sidecar with NO config
    // argument -- so it failed reading `process.argv[2]`, matched neither
    // pattern, and passed. An executable that failed any other way passed too.
    const relocated = join(away, "orchestration");
    cpSync(staging, relocated, { recursive: true });
    const entry = join(relocated, "dist/sidecar.js");

    // The sidecar takes a JSON CONFIG FILE PATH as argv[2]; it has no methods
    // and no line protocol. `mode` selects bundle, worker or service.
    const run = (config, label) => {
      const path = join(away, `${label}.json`);
      writeFileSync(path, JSON.stringify(config));
      return spawnSync(process.execPath, [entry, path], {
        cwd: "/",
        encoding: "utf8",
        timeout: 60_000,
      });
    };

    // Positive: workflow bundling, the launch mode that does real work.
    // Inside the package: the bundler enforces containment on every dependency
    // it resolves, so a module outside `packageDirectory` is refused by design.
    const workflows = join(relocated, "workflows.cjs");
    writeFileSync(
      workflows,
      "exports.default = { workflows: [], tasks: [], revision: 'packaged-check' };",
    );
    const destination = join(relocated, "bundle.js");
    const bundled = run(
      {
        mode: "bundle",
        parent: process.pid,
        entry: workflows,
        packageDirectory: relocated,
        destination,
        bundleContext: relocated,
      },
      "bundle",
    );
    assert.equal(
      bundled.status,
      0,
      `relocated sidecar could not bundle a workflow: ${String(bundled.stderr).slice(0, 600)}`,
    );
    assert.ok(statSync(destination).size > 0, "bundling must write its output");
    const reported = JSON.parse(String(bundled.stdout).trim());
    assert.match(reported.fingerprint, /^[a-f0-9]+$/, "bundling must report a fingerprint");

    // Negative, in terms this interface actually has. Each must fail visibly
    // and promptly rather than hanging or exiting 0.
    for (const [label, config] of [
      ["invalid-mode", { mode: "nope", parent: process.pid }],
      ["missing-parent", { mode: "bundle" }],
      ["unknown-key", { mode: "bundle", parent: process.pid, surprise: true }],
      [
        "relative-bundle-context",
        { mode: "bundle", parent: process.pid, bundleContext: "relative/path" },
      ],
    ]) {
      const rejected = run(config, label);
      assert.notEqual(rejected.status, 0, `${label} must be rejected`);
      assert.equal(rejected.signal, null, `${label} must fail rather than hang`);
    }
    const unparseable = join(away, "unparseable.json");
    writeFileSync(unparseable, "{ not json");
    const broken = spawnSync(process.execPath, [entry, unparseable], {
      cwd: "/",
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(broken.status, 0, "an unparseable config must be rejected");
    const absent = spawnSync(process.execPath, [entry, join(away, "does-not-exist.json")], {
      cwd: "/",
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(absent.status, 0, "a missing config must be rejected");
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(away, { recursive: true, force: true });
  }
});

/**
 * The knowledge sidecar's interface is nothing like the orchestration one: a
 * JSON launch descriptor in argv[2], then newline-delimited frames on stdin.
 * It is also BIDIRECTIONAL -- the worker asks the host to authorize each
 * operation and waits for a decision, so a test that only sends requests gets
 * a bounded error for everything and learns nothing.
 *
 * The failure semantics here are defined, and asserted as defined rather than
 * guessed: an unknown method answers with an error and the worker SURVIVES,
 * while a malformed frame shuts it down. Asserting survival for the second
 * would assert the opposite of the design.
 */
test("the packaged knowledge sidecar answers its real protocol and fails as specified", async (t) => {
  if (process.platform !== "darwin") return t.skip("packaging target is macOS");
  const staging = join(repository, ".deploy", `knowledge-check-${process.pid}`);
  const away = mkdtempSync(join(tmpdir(), "drawloom-knowledge-packaged-"));
  try {
    deploy("@drawloom/local-knowledge-runtime", staging);
    const links = [];
    await walk(staging, (entry, full) => {
      if (entry.isSymbolicLink()) links.push(full.slice(staging.length + 1));
    });
    assert.deepEqual(links, [], "a deployed sidecar must contain no symlinks");

    const relocated = join(away, "knowledge");
    cpSync(staging, relocated, { recursive: true });
    const entry = join(relocated, "dist/sidecar.js");
    assert.ok(existsSync(entry), "the knowledge entrypoint must survive the deploy");

    const root = join(away, "data");
    const working = join(away, "working");
    mkdirSync(root, { recursive: true });
    mkdirSync(working, { recursive: true });

    const worker = spawn(
      process.execPath,
      [entry, JSON.stringify({ root, workingDirectory: working })],
      { cwd: "/", stdio: ["pipe", "pipe", "pipe"] },
    );
    const exited = once(worker, "exit");
    let stderr = "";
    worker.stderr.setEncoding("utf8");
    worker.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const frames = [];
    createInterface({ input: worker.stdout }).on("line", (line) => {
      try {
        frames.push(JSON.parse(line));
      } catch (error) {
        raw.push("PARSE-FAILED: " + String(error).slice(0, 120));
        // A non-JSON line is not a frame; keep it in `raw` for diagnostics
        // rather than throwing inside the listener and losing the reader.
      }
    });
    const send = (value) => worker.stdin.write(`${JSON.stringify(value)}\n`);
    const take = async (match, label) => {
      for (let attempt = 0; attempt < 400; attempt++) {
        const index = frames.findIndex(match);
        if (index >= 0) return frames.splice(index, 1)[0];
        if (worker.exitCode !== null)
          throw Error(`worker exited before ${label}: ${stderr.slice(0, 400)}`);
        await setTimeout(50);
      }
      throw Error(
        `timed out waiting for ${label}: stderr=${stderr.slice(0, 300)} frames=${JSON.stringify(
          frames.map((frame) => ({ id: frame.id, method: frame.method })),
        )}`,
      );
    };

    /**
     * Drive one operation end to end. The worker raises an authorization
     * request for an action it has not already decided, so a later call for the
     * same action does NOT necessarily re-ask -- decisions are remembered. The
     * helper therefore answers an authorization request only if one arrives.
     */
    let authorizations = 0;
    const call = async (id, method, decision) => {
      send({
        id,
        method,
        params: {
          lifetime: randomUUID(),
          operationId: randomUUID(),
          remainingMs: 30_000,
          params: {},
        },
      });
      const settled = await take(
        (frame) => frame.method === "knowledge.authorize" || frame.id === id,
        `${method} authorization request or response`,
      );
      if (settled.method !== "knowledge.authorize") return settled;
      authorizations++;
      assert.ok(settled.params.request.subject, "an authorization request carries its subject");
      assert.ok(settled.params.request.action?.name, "an authorization request carries its action");
      // The worker mints the identity it asserts; the host answers with the
      // values FROM the request, not the ones it sent.
      send({
        id: settled.id,
        result: {
          lifetime: settled.params.lifetime,
          operationId: settled.params.operationId,
          decisionId: settled.params.decisionId,
          result: { decision },
        },
      });
      return take((frame) => frame.id === id, `${method} response`);
    };

    // Permitted: the operation runs and answers, correlated by id.
    const permitted = await call(1, "knowledge.status", true);
    assert.ok(
      "result" in permitted,
      `a permitted status must answer: ${JSON.stringify(permitted).slice(0, 300)}`,
    );

    assert.ok(authorizations > 0, "the worker asks the host to authorize its work");

    // Denied: a different action is decided separately, so this one is asked
    // and refused. A refusal is a bounded error, not a crash.
    const denied = await call(2, "knowledge.index", false);
    assert.equal(denied.error?.code, -32000, "a denied operation is a bounded error");

    // Unknown method: an error response, and the worker SURVIVES. This is the
    // one negative case here that is not fatal.
    send({ id: 3, method: "knowledge.not-a-method", params: {} });
    assert.equal((await take((f) => f.id === 3, "unknown method")).error?.code, -32000);
    // Survival means it still answers. Whether that answer is a result or a
    // bounded error depends on runtime state this packaging check does not own.
    const alive = await call(4, "knowledge.status", true);
    assert.equal(alive.id, 4, "the worker still answers after an unknown method");
    assert.equal(worker.exitCode, null, "an unknown method does not end the worker");

    // A malformed frame shuts the worker down. Shutdown IS the contract.
    worker.stdin.write("{ not json\n");
    const [code] = await Promise.race([
      exited,
      setTimeout(20_000).then(() => {
        worker.kill("SIGKILL");
        throw Error("a malformed frame must not leave the worker running");
      }),
    ]);
    assert.ok(typeof code === "number", "the worker exits rather than hanging");
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(away, { recursive: true, force: true });
  }
});
