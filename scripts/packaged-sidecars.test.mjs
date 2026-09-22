import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { readdir } from "node:fs/promises";
import { once } from "node:events";
import { createHash, randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { setTimeout } from "node:timers/promises";
import { createConnection, createServer } from "node:net";

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
  const children = new Set();
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
    const sha = (value) => createHash("sha256").update(value).digest("hex");
    const expected = sha(
      JSON.stringify({
        executable: sha(readFileSync(destination)),
        dependencies: [...reported.dependencies].sort(([a], [b]) => a.localeCompare(b)),
      }),
    );
    assert.equal(
      reported.fingerprint,
      expected,
      "the fingerprint must bind the bundle and dependency closure",
    );

    // Negative, in terms this interface actually has. Each must fail visibly
    // and promptly rather than hanging or exiting 0.
    for (const [label, config, cause] of [
      ["invalid-mode", { mode: "nope", parent: process.pid }, /Invalid option|mode|nope/i],
      [
        "missing-mode",
        {
          parent: process.pid,
          entry: workflows,
          packageDirectory: relocated,
          destination,
          bundleContext: relocated,
        },
        /mode/i,
      ],
      ["missing-parent", { mode: "bundle" }, /parent/i],
      [
        "unknown-key",
        { mode: "bundle", parent: process.pid, surprise: true },
        /surprise|unrecognized/i,
      ],
      [
        "relative-bundle-context",
        {
          mode: "bundle",
          parent: process.pid,
          entry: workflows,
          packageDirectory: relocated,
          destination,
          bundleContext: "relative/path",
        },
        /bundleContext|invalid/i,
      ],
    ]) {
      const rejected = run(config, label);
      assert.notEqual(rejected.status, 0, `${label} must be rejected`);
      assert.equal(rejected.signal, null, `${label} must fail rather than hang`);
      assert.match(String(rejected.stderr), cause, `${label} must fail for the intended cause`);
    }
    const unparseable = join(away, "unparseable.json");
    writeFileSync(unparseable, "{ not json");
    const broken = spawnSync(process.execPath, [entry, unparseable], {
      cwd: "/",
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(broken.status, 0, "an unparseable config must be rejected");
    assert.match(
      String(broken.stderr),
      /SyntaxError|json/i,
      "unparseable config must fail while parsing JSON",
    );
    const absent = spawnSync(process.execPath, [entry, join(away, "does-not-exist.json")], {
      cwd: "/",
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.notEqual(absent.status, 0, "a missing config must be rejected");
    assert.match(
      String(absent.stderr),
      /ENOENT|no such file/i,
      "missing config must fail at file access",
    );

    const temporalPath = execFileSync("which", ["temporal"], { encoding: "utf8" }).trim();
    const listener = createServer();
    await new Promise((resolve, reject) =>
      listener.once("error", reject).listen(0, "127.0.0.1", resolve),
    );
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const serviceConfig = join(away, "service.json");
    writeFileSync(
      serviceConfig,
      JSON.stringify({
        mode: "service",
        parent: process.pid,
        temporalPath,
        port,
        database: join(away, "temporal.db"),
      }),
    );
    const service = spawn(process.execPath, [entry, serviceConfig], {
      cwd: "/",
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(service);
    const reachable = async () =>
      new Promise((resolve) => {
        const socket = createConnection({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolve(true);
        });
        socket.once("error", () => resolve(false));
      });
    let ready = false;
    for (let attempt = 0; attempt < 200; attempt++) {
      if (await reachable()) {
        ready = true;
        break;
      }
      if (service.exitCode !== null) break;
      await setTimeout(100);
    }
    assert.ok(ready, "staged service mode must make Temporal reachable");
    const workerConfig = join(away, "worker.json");
    writeFileSync(
      workerConfig,
      JSON.stringify({
        mode: "worker",
        parent: process.pid,
        address: `127.0.0.1:${port}`,
        taskQueue: "packaged-check",
        bridge: "http://127.0.0.1:1",
        token: "test",
        bundle: destination,
      }),
    );
    const worker = spawn(process.execPath, [entry, workerConfig], {
      cwd: "/",
      stdio: ["ignore", "pipe", "pipe"],
    });
    children.add(worker);
    const workerLines = createInterface({ input: worker.stdout });
    const [workerReady] = await Promise.race([
      once(workerLines, "line"),
      setTimeout(30_000, undefined, { ref: false }).then(() => {
        throw Error("worker mode did not become ready");
      }),
    ]);
    assert.equal(workerReady, "DRAWLOOM_WORKER_READY");
    const workerExited = once(worker, "exit");
    worker.kill("SIGTERM");
    assert.equal((await workerExited)[0], 0, "worker mode shuts down cleanly");
    children.delete(worker);
    const missingBundle = run(
      {
        mode: "worker",
        parent: process.pid,
        address: `127.0.0.1:${port}`,
        taskQueue: "packaged-check",
        bridge: "http://127.0.0.1:1",
        token: "test",
      },
      "worker-without-bundle",
    );
    assert.notEqual(missingBundle.status, 0);
    assert.match(String(missingBundle.stderr), /bundle|undefined|path/i);
    const serviceExited = once(service, "exit");
    service.kill("SIGTERM");
    assert.equal((await serviceExited)[0], 0, "service mode shuts down cleanly");
    children.delete(service);
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGKILL");
        await exit.catch(() => {});
      }
    }
    rmSync(staging, { recursive: true, force: true });
    rmSync(away, { recursive: true, force: true });
  }
});

test("the desktop's shipped Nightloom workflow can be prepared from its deployed closure", async (t) => {
  if (process.platform !== "darwin") return t.skip("packaging target is macOS");
  const staging = join(repository, ".deploy", `nightloom-check-${process.pid}`);
  const orchestration = join(repository, ".deploy", `nightloom-orchestration-${process.pid}`);
  const away = mkdtempSync(join(tmpdir(), "drawloom-nightloom-packaged-"));
  try {
    deploy("@drawloom/desktop", staging);
    const relocated = join(away, "host");
    cpSync(staging, relocated, { recursive: true });
    const workflow = join(relocated, "node_modules/@drawloom/nightloom/dist/workflows.js");
    assert.ok(existsSync(workflow), "Nightloom's workflow entrypoint must survive deployment");
    const registry = await import(`file://${workflow}`);
    assert.ok(registry.default, "the relocated Nightloom workflow registry must load");
    deploy("@drawloom/temporal-orchestration", orchestration);
    execFileSync(
      process.execPath,
      [
        join(repository, "scripts/prune-orchestration-sidecar-runtime.mjs"),
        orchestration,
        `--core-bridge-target=${triple}`,
      ],
      { cwd: repository, stdio: "pipe" },
    );
    const sidecar = join(away, "orchestration");
    cpSync(orchestration, sidecar, { recursive: true });
    const destination = join(away, "nightloom-bundle.js");
    const config = join(away, "nightloom-bundle.json");
    writeFileSync(
      config,
      JSON.stringify({
        mode: "bundle",
        parent: process.pid,
        entry: workflow,
        packageDirectory: join(relocated, "node_modules/@drawloom/nightloom"),
        destination,
        bundleContext: relocated,
        hostCapability: true,
      }),
    );
    const bundled = spawnSync(process.execPath, [join(sidecar, "dist/sidecar.js"), config], {
      cwd: "/",
      encoding: "utf8",
      timeout: 120_000,
    });
    assert.equal(
      bundled.status,
      0,
      `the shipped Nightloom workflow must bundle: ${String(bundled.stderr).slice(0, 600)}`,
    );
    assert.ok(statSync(destination).size > 0);
    assert.match(JSON.parse(String(bundled.stdout).trim()).fingerprint, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(orchestration, { recursive: true, force: true });
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
  const workers = new Set();
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
    workers.add(worker);
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
      } catch {
        // A non-JSON line is not a frame. The timeout below reports what did
        // arrive, so swallowing it here loses nothing.
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
    const lifetime = randomUUID();
    const call = async (id, method, decision) => {
      send({
        id,
        method,
        params: {
          lifetime,
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

    // Denial is a real authorization exchange, then an allowed request survives.
    const denied = await call(2, "knowledge.status", false);
    assert.equal(denied.id, 2);
    assert.equal(denied.error?.code, -32000, JSON.stringify(denied));
    const permitted = await call(1, "knowledge.status", true);
    assert.equal(permitted.id, 1);
    assert.ok(["ready", "unavailable", "failed"].includes(permitted.result?.availability));
    assert.equal(permitted.result?.configuration?.embeddingModel, "qwen3-embedding-0.6b-gguf");
    assert.equal(typeof permitted.result?.maintenance?.pendingUpdates, "number");
    const maintenance = await call(6, "knowledge.maintenance.status", true);
    assert.equal(maintenance.id, 6);
    assert.equal(maintenance.result?.kind, "ok", JSON.stringify(maintenance));
    assert.equal(typeof maintenance.result?.pendingUnits, "number");
    assert.equal(typeof maintenance.result?.checkpoint, "string");

    assert.ok(authorizations > 0, "the worker asks the host to authorize its work");

    const afterDenial = await call(5, "knowledge.status", true);
    assert.equal(afterDenial.id, 5);
    assert.equal(
      afterDenial.result?.configuration?.embeddingModel,
      "qwen3-embedding-0.6b-gguf",
      JSON.stringify(afterDenial),
    );

    // Unknown method: an error response, and the worker SURVIVES. This is the
    // one negative case here that is not fatal.
    send({ id: 3, method: "knowledge.not-a-method", params: {} });
    assert.equal((await take((f) => f.id === 3, "unknown method")).error?.code, -32000);
    // Survival means it still answers. Whether that answer is a result or a
    // bounded error depends on runtime state this packaging check does not own.
    const alive = await call(4, "knowledge.status", true);
    assert.equal(alive.id, 4, "the worker still answers after an unknown method");
    assert.equal(alive.result?.configuration?.embeddingModel, "qwen3-embedding-0.6b-gguf");
    assert.equal(worker.exitCode, null, "an unknown method does not end the worker");

    // A malformed frame shuts the worker down. Shutdown IS the contract.
    worker.stdin.write("{ not json\n");
    const [code, signal] = await Promise.race([
      exited,
      setTimeout(20_000, undefined, { ref: false }).then(() => {
        worker.kill("SIGKILL");
        throw Error("a malformed frame must not leave the worker running");
      }),
    ]);
    assert.equal(code, 0, "malformed JSON shuts down cleanly");
    assert.equal(signal, null, "malformed JSON is handled, not killed");
    workers.delete(worker);

    const fatal = async (label, transmit) => {
      const child = spawn(
        process.execPath,
        [entry, JSON.stringify({ root: join(away, label), workingDirectory: working })],
        { cwd: "/", stdio: ["pipe", "pipe", "pipe"] },
      );
      workers.add(child);
      const exit = once(child, "exit");
      await transmit(child);
      const [code, signal] = await Promise.race([
        exit,
        setTimeout(20_000, undefined, { ref: false }).then(() => {
          throw Error(`${label} did not shut down`);
        }),
      ]);
      assert.equal(signal, null, `${label} should exit cleanly`);
      assert.equal(code, 0, `${label} should exit successfully`);
      workers.delete(child);
    };
    await fatal("parsed-invalid", (child) =>
      child.stdin.write('{"id":"wrong","method":"knowledge.status","params":{}}\n'),
    );
    await fatal(
      "oversized",
      (child) =>
        new Promise((resolve, reject) =>
          child.stdin.write(`${"x".repeat(1024 * 1024 + 1)}\n`, (error) =>
            error ? reject(error) : resolve(),
          ),
        ),
    );
    await fatal("eof", (child) => child.stdin.end());
    await fatal("close", async (child) => {
      const lines = createInterface({ input: child.stdout });
      child.stdin.write('{"id":1,"method":"knowledge.close","params":{}}\n');
      const [line] = await once(lines, "line");
      assert.deepEqual(JSON.parse(line), { id: 1, result: {} });
      child.stdin.end();
    });
    await fatal("sigterm", async (child) => {
      const lines = createInterface({ input: child.stdout });
      child.stdin.write('{"id":1,"method":"knowledge.not-a-method","params":{}}\n');
      const [line] = await once(lines, "line");
      assert.equal(JSON.parse(line).id, 1, "worker is ready before SIGTERM");
      child.kill("SIGTERM");
    });
  } finally {
    for (const worker of workers) {
      if (worker.exitCode === null && worker.signalCode === null) {
        const exited = once(worker, "exit");
        worker.kill("SIGKILL");
        await exited.catch(() => {});
      }
    }
    rmSync(staging, { recursive: true, force: true });
    rmSync(away, { recursive: true, force: true });
  }
});
