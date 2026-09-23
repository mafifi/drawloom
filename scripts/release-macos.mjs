#!/usr/bin/env node
// Thin orchestration of Apple's tools; no credentials beyond a Keychain profile.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const scripts = dirname(fileURLToPath(import.meta.url));
const execute = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "inherit"],
  });
const digest = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const save = (path, value) => {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
};

/** Copy first: never re-sign a running app or overwrite a prior release. */
export function assemble({ app, output, identity }, run = execute) {
  app = resolve(app);
  output = resolve(output);
  if (!output.endsWith(".dmg")) throw new Error("Output must explicitly end in .dmg");
  for (const path of [
    output,
    `${output}.acceptance.log`,
    `${output}.assembly.json`,
    `${output}.notary.json`,
  ]) {
    if (existsSync(path)) throw new Error(`Output or evidence already exists: ${path}`);
  }
  if (!identity.startsWith("Developer ID Application:"))
    throw new Error("A Developer ID Application identity is required");
  if (!existsSync(app)) throw new Error(`App does not exist: ${app}`);
  mkdirSync(dirname(output), { recursive: true });
  const lock = `${output}.assembly.lock`;
  writeFileSync(lock, `${process.pid}\n`, { flag: "wx", mode: 0o600 });
  const stage = mkdtempSync(join(tmpdir(), "drawloom-release-"));
  const copiedApp = join(stage, "Drawloom.app");
  try {
    run("ditto", [app, copiedApp]);
    run("sh", [join(scripts, "sign-macos-app.sh"), copiedApp, identity]);
    const acceptance = run(process.execPath, [join(scripts, "verify-macos-app.mjs"), copiedApp]);
    writeFileSync(`${output}.acceptance.log`, acceptance);
    symlinkSync("/Applications", join(stage, "Applications"));
    run("hdiutil", [
      "create",
      "-volname",
      "Drawloom",
      "-srcfolder",
      stage,
      "-format",
      "UDZO",
      output,
    ]);
    run("codesign", ["--force", "--timestamp", "--sign", identity, output]);
    run("codesign", ["--verify", "--strict", output]);
    run("hdiutil", ["verify", output]);
    const record = {
      app,
      dmg: output,
      sha256: digest(output),
      identity,
      createdAt: new Date().toISOString(),
    };
    save(`${output}.assembly.json`, record);
    return record;
  } finally {
    // Only this invocation's mkdtemp directory, never the caller's source app.
    rmSync(stage, { recursive: true, force: true });
    rmSync(lock);
  }
}

const validId = (id) =>
  typeof id === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id);

/** submit is one-shot. status/finish only inspect the retained submission. */
export function notarise(action, { dmg, receipt, profile }, run = execute) {
  if (!["submit", "status", "finish"].includes(action))
    throw new Error("Use submit, status or finish");
  if (!profile) throw new Error("A notarytool Keychain profile is required");
  dmg = resolve(dmg);
  receipt = resolve(receipt ?? `${dmg}.notary.json`);
  if (action === "submit") {
    if (existsSync(receipt))
      throw new Error(`Submission receipt already exists: ${receipt}; inspect it, do not resubmit`);
    const record = {
      dmg,
      sha256: digest(dmg),
      profile,
      state: "submitting",
      createdAt: new Date().toISOString(),
    };
    // Exclusive creation occurs BEFORE the network call. Failure is uncertain,
    // not permission to upload again. Retain raw stdout for manual recovery.
    writeFileSync(receipt, JSON.stringify(record, null, 2), { flag: "wx", mode: 0o600 });
    let raw;
    try {
      raw = run("xcrun", [
        "notarytool",
        "submit",
        dmg,
        "--keychain-profile",
        profile,
        "--no-progress",
        "--output-format",
        "json",
      ]);
    } catch (error) {
      if (error && (typeof error.stdout === "string" || Buffer.isBuffer(error.stdout))) {
        writeFileSync(`${receipt}.submit.json`, error.stdout, { mode: 0o600 });
      }
      throw error;
    }
    writeFileSync(`${receipt}.submit.json`, raw, { mode: 0o600 });
    const response = JSON.parse(raw);
    if (!validId(response.id))
      throw new Error("Missing valid submission ID; retain receipt and inspect notarytool history");
    const submitted = { ...record, id: response.id, state: "submitted" };
    save(receipt, submitted);
    return submitted;
  }
  const record = JSON.parse(readFileSync(receipt, "utf8"));
  if (!validId(record.id))
    throw new Error(
      "Uncertain submission: recover ID from raw receipt or notarytool history before continuing",
    );
  if (
    record.dmg !== dmg ||
    record.profile !== profile ||
    digest(dmg) !== (record.stapledSha256 ?? record.sha256)
  )
    throw new Error("Artifact or profile changed since submission; refusing to use this receipt");
  const response = JSON.parse(
    run("xcrun", [
      "notarytool",
      "info",
      record.id,
      "--keychain-profile",
      profile,
      "--output-format",
      "json",
    ]),
  );
  if (
    response.id !== record.id ||
    !["Accepted", "Invalid", "In Progress"].includes(response.status)
  )
    throw new Error("Unexpected notarisation status response");
  record.status = response.status;
  save(receipt, record);
  if (action === "status") return record;
  if (response.status !== "Accepted")
    throw new Error(`Submission not accepted: ${response.status}`);
  run("xcrun", [
    "notarytool",
    "log",
    record.id,
    "--keychain-profile",
    profile,
    `${receipt}.log.json`,
  ]);
  run("xcrun", ["stapler", "staple", dmg]);
  record.stapledSha256 = digest(dmg);
  save(receipt, record);
  run("xcrun", ["stapler", "validate", dmg]);
  run("codesign", ["--verify", "--strict", dmg]);
  run("hdiutil", ["verify", dmg]);
  run("spctl", [
    "--assess",
    "--type",
    "open",
    "--context",
    "context:primary-signature",
    "--verbose=2",
    dmg,
  ]);
  record.state = "complete";
  save(receipt, record);
  return record;
}

if (import.meta.main) {
  try {
    if (process.platform !== "darwin") throw new Error("This release workflow requires macOS");
    const [action, ...args] = process.argv.slice(2);
    if (action === "dmg" && args.length === 3) {
      console.log(
        JSON.stringify(assemble({ app: args[0], output: args[1], identity: args[2] }), null, 2),
      );
    } else if (["submit", "status", "finish"].includes(action) && args.length === 2) {
      console.log(JSON.stringify(notarise(action, { dmg: args[0], profile: args[1] }), null, 2));
    } else {
      throw new Error(
        'Usage: release-macos.mjs dmg <app> <new.dmg> "Developer ID Application: …" | submit/status/finish <dmg> <keychain-profile>',
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
