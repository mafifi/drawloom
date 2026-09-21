import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { command } from "./dist/processes.js";
import { build as esbuild } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

test("real Temporal restores an unrelated trusted package through the desktop loader without repeating its host-stored effect", {
  skip: process.env.DRAWLOOM_TEMPORAL_TEST !== "1",
  timeout: 90000,
}, async () => {
  // The fixture drives the desktop host's own modules, which use this repo's
  // `.js` specifiers for `.ts` sources. Node cannot resolve those; the bundler
  // can, and a bundle executed by the real Node binary is what ships.
  // Emitted inside apps/desktop so its external imports -- including the
  // native Temporal addon, which cannot be bundled -- resolve from that
  // package, the same arrangement the development host uses.
  const staging = resolve("apps/desktop/.dev/temporal");
  try {
    await mkdir(staging, { recursive: true });
    const entry = join(staging, "installed-temporal-host.mjs");
    await esbuild({
      entryPoints: [resolve("apps/desktop/tests/installed-temporal-host.mjs")],
      outfile: entry,
      bundle: true,
      platform: "node",
      format: "esm",
      packages: "external",
    });
    const output = await command(process.execPath, [entry], 80000);
    assert.match(output, /INSTALLED_HOST_TEMPORAL_OK/);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
});
