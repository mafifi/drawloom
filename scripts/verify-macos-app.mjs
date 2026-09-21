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
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

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

check("entitlements are the reviewed minimum", () => {
  const raw = spawnSync("codesign", ["-d", "--entitlements", "-", "--xml", app], {
    encoding: "utf8",
  }).stdout;
  const keys = [...raw.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]).sort();
  must(
    keys.length === 1 && keys[0] === "com.apple.security.cs.allow-jit",
    `expected only allow-jit, found: ${keys.join(", ") || "none"}`,
  );
  must(!/get-task-allow/.test(raw), "get-task-allow must never ship");
  return "allow-jit only";
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
    if (!/bootstrap\?token=/.test(out)) return;
    clearTimeout(timer);
    const bootstrap = out.match(/http:\/\/\S+bootstrap\S+/)[0];
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

for (const { name, ok, detail } of results)
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} acceptance checks passed`);
process.exitCode = failed ? 1 : 0;
