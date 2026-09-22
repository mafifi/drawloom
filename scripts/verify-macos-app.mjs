#!/usr/bin/env node
/**
 * Release acceptance for an assembled, signed Drawloom.app.
 *
 * WHY THIS IS SEPARATE FROM CI
 * ----------------------------
 * `scripts/packaged-sidecars.test.mjs` covers deploy -> prune -> relocate, which
 * runs in the ordinary Node lane. It deliberately does NOT build a .app, so it
 * never exercises Tauri's resource-copy step -- and that step is what produced
 * the failure this check exists to catch: Tauri does not preserve symlinks, so a
 * sidecar deployed with pnpm's default linker arrived in the bundle with no
 * dependency closure at all. The app still started and served; only using the
 * knowledge worker revealed it.
 *
 * Run this against a real, signed bundle before release. It needs a built .app
 * and a machine that can execute it, so it is a deliberate release step rather
 * than part of the automated gate.
 *
 * USAGE
 *   pnpm run build:packages && pnpm --filter @drawloom/desktop run bundle:host
 *   pnpm --filter @drawloom/desktop exec tauri build
 *   scripts/sign-macos-app.sh <app> <identity>
 *   node scripts/verify-macos-app.mjs <path to Drawloom.app>
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
// The single authority for what runtime ships; importing it keeps this check
// from becoming a second declaration that can agree with nothing.
import { KnownNodeRuntime } from "../apps/desktop/host/node-runtime.ts";

const app = resolve(process.argv[2] ?? "");
if (!app || !existsSync(app)) {
  console.error("Usage: verify-macos-app.mjs <path to Drawloom.app>");
  process.exit(2);
}
const resources = join(app, "Contents/Resources");
const results = [];
const check = (name, run) => {
  try {
    const detail = run();
    results.push({ name, ok: true, detail: detail ?? "" });
  } catch (error) {
    results.push({
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};
const must = (condition, message) => {
  if (!condition) throw new Error(message);
};

check("resources present", () => {
  for (const asset of [
    "host/host/node",
    "host/host/main.mjs",
    "web/index.html",
    "knowledge/dist/sidecar.js",
    "orchestration/dist/sidecar.js",
  ])
    must(existsSync(join(resources, asset)), `missing ${asset}`);
  return "host, web and both sidecars";
});

check("shipped Node runtime matches its manifest and ships its notice", () => {
  // Drawloom distributes this runtime, so its aggregate LICENSE is an obligation.
  // `bundle:host` used to copy the executable alone, leaving the notice behind.
  //
  // The binary is compared by VERSION and ARCHITECTURE only. Signing rewrites
  // the Mach-O, so a signed bundle matches neither the upstream digest NOR the
  // upstream SIZE -- the signature is appended to the file. An earlier version
  // of this check excluded the digest and kept the size, and failed here for
  // exactly that reason. The notice is not signed, so its digest is stable and
  // is still asserted.
  // `scripts/stage-node-runtime.ts` checks that digest before signing; the
  // signed artifact's own checksum belongs in the release record.
  const binary = join(resources, "host/host/node");
  const notice = join(resources, "host/host/LICENSE.node");
  must(existsSync(notice), "LICENSE.node is not beside the shipped node binary");

  const reported = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
  must(
    reported === `v${KnownNodeRuntime.version}`,
    `shipped node reports ${reported}, expected v${KnownNodeRuntime.version}`,
  );
  const architecture = execFileSync(binary, ["-p", "process.arch"], { encoding: "utf8" }).trim();
  must(
    architecture === KnownNodeRuntime.arch,
    `shipped node reports ${architecture}, expected ${KnownNodeRuntime.arch}`,
  );
  const noticeDigest = createHash("sha256").update(readFileSync(notice)).digest("hex");
  must(
    noticeDigest === KnownNodeRuntime.licenseSha256,
    "LICENSE.node does not match the digest recorded in the manifest",
  );
  return `node v${KnownNodeRuntime.version} ${architecture} with its notice`;
});

check("sidecar closures survived the resource copy", () => {
  // The defect this file exists for: Tauri drops symlinks, so a sidecar's
  // node_modules can arrive empty while the app still starts.
  for (const sidecar of ["knowledge", "orchestration"]) {
    const modules = join(resources, sidecar, "node_modules");
    must(existsSync(modules), `${sidecar} has no node_modules in the bundle`);
    must(readdirSync(modules).length > 0, `${sidecar} node_modules is empty`);
  }
  return "knowledge and orchestration closures intact";
});

check("signature is valid and hardened", () => {
  execFileSync("codesign", ["--verify", "--deep", "--strict", app], { stdio: "pipe" });
  const described =
    execFileSync("codesign", ["-dv", app], { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }) +
    spawnSync("codesign", ["-dv", app], { encoding: "utf8" }).stderr;
  must(/flags=[^ ]*runtime/.test(described), "hardened runtime is not enabled");
  return "valid, hardened";
});

check("entitlements are the reviewed minimum, and scoped to the host", () => {
  // Two questions, not one. The old check asked only whether the SET was
  // minimal, which a bundle passes while granting that exception to every
  // executable in it. The shell owns the window and the native browser; a JIT
  // exception the Node runtime needs must not reach it.
  const entitlementsOf = (path) => {
    const shown = spawnSync("codesign", ["-d", "--entitlements", "-", "--xml", path], {
      encoding: "utf8",
    });
    return `${shown.stdout ?? ""}`;
  };

  const host = entitlementsOf(join(resources, "host/host/node"));
  must(host.includes("com.apple.security.cs.allow-jit"), "the host runtime is missing allow-jit");
  for (const rejected of [
    "allow-unsigned-executable-memory",
    "disable-library-validation",
    "allow-dyld-environment-variables",
    "get-task-allow",
  ])
    must(!host.includes(rejected), `the host carries ${rejected}`);

  const shell = entitlementsOf(join(app, "Contents/MacOS/drawloom-desktop"));
  must(
    !shell.includes("com.apple.security.cs.allow-jit"),
    "the UI shell carries allow-jit; only the host runtime needs it",
  );
  must(!shell.includes("get-task-allow"), "the UI shell carries get-task-allow");
  return "host: allow-jit only; shell: none";
});

check("native modules load under the hardened runtime", () => {
  const node = join(resources, "host/host/node");
  const probes = {
    keychain: `import {createRequire} from 'node:module';
      const r=createRequire(${JSON.stringify(join(resources, "host/host/main.mjs"))});
      const {Entry}=r('@napi-rs/keyring'); const e=new Entry('drawloom-acceptance','probe');
      e.setPassword('v'); if(e.getPassword()!=='v') process.exit(1); e.deletePassword();`,
    "sqlite-vec": `import {DatabaseSync} from 'node:sqlite'; import {createRequire} from 'node:module';
      const r=createRequire(${JSON.stringify(join(resources, "knowledge/dist/sidecar.js"))});
      const db=new DatabaseSync(':memory:',{allowExtension:true}); db.enableLoadExtension(true);
      r('sqlite-vec').load(db); if(!db.prepare('select vec_version() as v').get()?.v) process.exit(1); db.close();`,
    "temporal core-bridge": `import {createRequire} from 'node:module';
      const r=createRequire(${JSON.stringify(join(resources, "orchestration/dist/sidecar.js"))});
      if(Object.keys(r('@temporalio/worker')).length===0) process.exit(1);`,
  };
  for (const [label, code] of Object.entries(probes)) {
    const run = spawnSync(node, ["--input-type=module", "-e", code], {
      cwd: "/",
      encoding: "utf8",
      timeout: 60_000,
    });
    must(run.status === 0, `${label} failed to load: ${String(run.stderr).split("\n")[0]}`);
  }
  return "keychain, sqlite-vec, core-bridge";
});

/**
 * Under `DRAWLOOM_MANAGED=1` the host's first stdout line is a readiness record
 * carrying the URL AND the installation directory it selected, so the shell does
 * not choose a second one. Parse it rather than pattern-matching a URL out of
 * it: a greedy `\\S+` match swallows the rest of the JSON and produces a
 * polluted token, which the host rejects with 401.
 */
const readiness = (out) => {
  const line = out.split("\n").find((value) => value.trim().startsWith("{"));
  if (!line) return undefined;
  try {
    const value = JSON.parse(line);
    return typeof value?.url === "string" && typeof value?.dataDirectory === "string"
      ? value
      : undefined;
  } catch {
    return undefined;
  }
};

await new Promise((done) => {
  const data = mkdtempSync(join(tmpdir(), "drawloom-acceptance-"));
  const child = spawn(join(resources, "host/host/node"), [join(resources, "host/host/main.mjs")], {
    cwd: "/",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DRAWLOOM_DATA_DIR: data,
      DRAWLOOM_WEB_ROOT: join(resources, "web"),
      DRAWLOOM_KNOWLEDGE_RUNTIME: join(resources, "knowledge"),
      DRAWLOOM_ORCHESTRATION_RUNTIME: join(resources, "orchestration"),
      DRAWLOOM_MANAGED: "1",
    },
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const finish = (ok, detail) => {
    results.push({ name: "host serves and shuts down cleanly", ok, detail });
    rmSync(data, { recursive: true, force: true });
    done();
  };
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    finish(false, "did not start within 60s");
  }, 60_000);
  child.stdout.on("data", async () => {
    const ready = readiness(out);
    if (!ready) return;
    clearTimeout(timer);
    // The readiness contract itself: the directory must be the one this run was
    // given, not one the reader re-derived.
    if (ready.dataDirectory !== data)
      return finish(false, `readiness reported ${ready.dataDirectory}, expected ${data}`);
    const bootstrap = ready.url;
    const port = new URL(bootstrap).port;
    const boot = await fetch(bootstrap, { redirect: "manual" });
    const cookie = (boot.headers.getSetCookie() ?? [])[0]?.split(";")[0];
    const index = await fetch(`http://127.0.0.1:${port}/`, { headers: cookie ? { cookie } : {} });
    const served =
      index.status === 200 && /text\/html/.test(index.headers.get("content-type") ?? "");
    const nonce = /nonce-/.test(index.headers.get("content-security-policy") ?? "");
    child.kill("SIGINT");
    child.once("exit", (code) =>
      finish(served && nonce && code === 0, `index ${index.status}, nonce ${nonce}, exit ${code}`),
    );
  });
});

/**
 * Lifecycle, against the SIGNED bundle and a disposable data directory.
 *
 * The check above starts the host, serves one page and quits gracefully. That
 * is the easy half. The half that matters is a FORCED termination with work
 * outstanding, because that is where a recovery path can quietly invent an
 * answer: reporting a killed operation as completed or failed is worse than
 * admitting it is unknown.
 *
 * The Tauri shell is deliberately not launched here -- it opens a window and
 * needs a session a release check cannot assume. It spawns exactly this host
 * from exactly this bundle, so the state and recovery behaviour is what is
 * exercised; driving the GUI shell remains a separate, manual step.
 */
const lifecycle = async () => {
  const data = mkdtempSync(join(tmpdir(), "drawloom-lifecycle-"));
  // A project directory may not sit inside the installation data directory,
  // and the host refuses either containing the other. Disposable, and named.
  const working = mkdtempSync(join(tmpdir(), "drawloom-lifecycle-project-"));
  const start = () => {
    const child = spawn(
      join(resources, "host/host/node"),
      [join(resources, "host/host/main.mjs")],
      {
        cwd: "/",
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          DRAWLOOM_DATA_DIR: data,
          DRAWLOOM_WEB_ROOT: join(resources, "web"),
          DRAWLOOM_KNOWLEDGE_RUNTIME: join(resources, "knowledge"),
          DRAWLOOM_ORCHESTRATION_RUNTIME: join(resources, "orchestration"),
          DRAWLOOM_MANAGED: "1",
        },
      },
    );
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error(`did not start within 60s: ${out}`)), 60_000);
      child.stdout.on("data", () => {
        const ready = readiness(out);
        if (!ready) return;
        clearTimeout(timer);
        resolve(ready.url);
      });
    });
    return { child, ready, output: () => out };
  };

  /** One authenticated session against a running host. */
  const session = async (bootstrap) => {
    const port = new URL(bootstrap).port;
    const boot = await fetch(bootstrap, { redirect: "manual" });
    const cookie = (boot.headers.getSetCookie() ?? [])[0]?.split(";")[0] ?? "";
    const origin = `http://127.0.0.1:${port}`;
    const call = async (path, body) => {
      // Non-GET requests must carry a matching Origin and a JSON content type;
      // the host refuses anything else as an invalid command channel.
      const response = await fetch(`${origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          cookie,
          ...(body === undefined ? {} : { origin, "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, value: await response.json().catch(() => undefined) };
    };
    return { call };
  };

  const stop = (child, signal) =>
    new Promise((resolve) => {
      child.once("exit", (code, received) => resolve({ code, received }));
      child.kill(signal);
    });

  try {
    // 1. Establish state a restart must preserve.
    const first = start();
    const one = await session(await first.ready);
    const added = await one.call("/api/command", { kind: "add_project", directory: working });
    must(added.status === 200, `could not add a project: ${added.status}`);
    const created = await one.call("/api/command", {
      kind: "create_conversation",
      workbenchId: "text",
      provider: "synthetic",
    });
    must(created.status === 200, `could not create a conversation: ${created.status}`);
    const conversationId = created.value?.selectedId;
    must(Boolean(conversationId), "no conversation was selected");

    // 2. Graceful quit, then relaunch: the work must still be there.
    const quit = await stop(first.child, "SIGINT");
    must(quit.code === 0, `graceful quit exited ${quit.code}`);
    const second = start();
    const two = await session(await second.ready);
    const restored = await two.call("/api/state");
    must(restored.status === 200, `state unavailable after restart: ${restored.status}`);
    const restoredState = JSON.stringify(restored.value);
    must(
      restoredState.includes(conversationId),
      "a conversation did not survive a graceful restart",
    );
    must(restoredState.includes(working), "a project did not survive a graceful restart");

    // 3. FORCED termination. SIGKILL cannot be trapped, so nothing tidies up.
    //
    //    WHAT THIS DOES NOT PROVE. An earlier version sent a turn, slept 750ms
    //    and killed the host, claiming to have interrupted active work. It had
    //    not: the synthetic provider completes a turn in well under that, and
    //    polling `/api/state` shows `status: ready` throughout, so there is no
    //    in-flight window to catch through the public surface. Forcing one
    //    needs a pending approval, which requires an injected driver rather
    //    than an HTTP command.
    //
    //    So this asserts what it can see: committed state survives a kill, and
    //    recovery does not resurrect a liveness it cannot have. The semantics
    //    Codex asked for -- no duplicate execution, and an undeterminable
    //    outcome reported as unknown rather than guessed -- are proved against
    //    a real Temporal server by `test:temporal`, in "killed effect writer
    //    leaves durable intent: absent recovery is unknown and receipt-only
    //    recovery never resubmits". That is the right home for them; this is a
    //    packaging check. Audit finding F12 records the remaining gap.
    await two.call("/api/command", {
      kind: "send",
      conversationId,
      text: "a turn committed before the kill",
    });
    const killed = await stop(second.child, "SIGKILL");
    must(killed.received === "SIGKILL", `expected SIGKILL, saw ${killed.received}`);

    // 4. Recover. The bar is that it starts, keeps what it had, and does not
    //    claim an outcome it cannot know.
    const third = start();
    const three = await session(await third.ready);
    const after = await three.call("/api/state");
    must(after.status === 200, `did not recover after a kill: ${after.status}`);
    const recovered = JSON.stringify(after.value);
    must(
      recovered.includes(conversationId),
      "the conversation did not survive a forced termination",
    );
    must(recovered.includes(working), "the project did not survive a forced termination");
    // A killed operation must not come back claiming to be running. Recovery
    // may report it as unknown or as ended; what it may not do is resume a
    // liveness it cannot have.
    must(
      !/"status":"(?:running|active|streaming)"/.test(recovered),
      "an operation killed mid-flight is reported as still running after recovery",
    );
    const settled = await stop(third.child, "SIGINT");
    must(settled.code === 0, `post-recovery quit exited ${settled.code}`);
    return "state survives a graceful restart and a SIGKILL; recovery reports nothing as running";
  } finally {
    rmSync(data, { recursive: true, force: true });
    rmSync(working, { recursive: true, force: true });
  }
};
results.push(
  await (async () => {
    try {
      return { name: "restart and forced termination", ok: true, detail: await lifecycle() };
    } catch (error) {
      return {
        name: "restart and forced termination",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  })(),
);

for (const { name, ok, detail } of results)
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} acceptance checks passed`);
process.exitCode = failed ? 1 : 0;
