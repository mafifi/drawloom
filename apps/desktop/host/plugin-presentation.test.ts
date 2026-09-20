import { expect, test } from "bun:test";
import { mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPluginIcon, packagePresentation } from "./plugin-presentation.js";

test("special files cannot block icon loading", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-icon-fifo-"));
  try {
    const path = join(root, "icon.svg");
    expect(Bun.spawnSync(["mkfifo", path]).exitCode).toBe(0);
    const code = `import {readPluginIcon} from ${JSON.stringify(import.meta.dir + "/plugin-presentation.ts")}; console.log(await readPluginIcon(${JSON.stringify(root)}, "icon.svg"));`;
    const run = Bun.spawnSync([process.execPath, "-e", code], { timeout: 1000 });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString().trim()).toBe("undefined");
  } finally {
    await rm(root, { recursive: true });
  }
});

test("replacement between resolving and opening an icon cannot expose outside bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-icon-race-"));
  try {
    const inside = join(root, "inside");
    await Bun.spawn(["mkdir", inside]).exited;
    await writeFile(join(inside, "icon.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(
      join(root, "outside.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><text>private</text></svg>',
    );
    const code = `import {mock} from "bun:test"; import * as fs from "node:fs/promises";
      const original=fs.open; let swapped=false;
      mock.module("node:fs/promises",()=>({...fs,open:async(...args)=>{if(!swapped){swapped=true;await fs.unlink(${JSON.stringify(join(inside, "icon.svg"))});await fs.symlink(${JSON.stringify(join(root, "outside.svg"))},${JSON.stringify(join(inside, "icon.svg"))});}return original(...args);}}));
      const {readPluginIcon}=await import(${JSON.stringify(import.meta.dir + "/plugin-presentation.ts")});console.log(await readPluginIcon(${JSON.stringify(inside)},"icon.svg"));`;
    const run = Bun.spawnSync([process.execPath, "-e", code], { timeout: 2000 });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString().trim()).toBe("undefined");
  } finally {
    await rm(root, { recursive: true });
  }
});

test("host loads bounded package icons and rejects escapes, active content and non-images", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-icon-"));
  const outside = await mkdtemp(join(tmpdir(), "drawloom-icon-outside-"));
  try {
    await writeFile(
      join(root, "icon.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>',
    );
    await writeFile(join(outside, "secret.svg"), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await symlink(join(outside, "secret.svg"), join(root, "escape.svg"));
    await writeFile(join(root, "bad.svg"), "<svg><script>alert(1)</script></svg>");
    await writeFile(join(root, "fake.png"), "secret text");
    await writeFile(join(root, "large.svg"), "x".repeat(262145));
    expect(await readPluginIcon(root, "./icon.svg")).toStartWith("data:image/svg+xml;base64,");
    for (const path of [
      "./escape.svg",
      "./bad.svg",
      "./fake.png",
      "./large.svg",
      "./missing.png",
      join(outside, "secret.svg"),
    ])
      expect(await readPluginIcon(root, path)).toBeUndefined();
    expect(
      await packagePresentation(root, {
        displayName: "Friendly",
        icon: { light: "./missing.png" },
      }),
    ).toEqual({ displayName: "Friendly" });
  } finally {
    await rm(root, { recursive: true });
    await rm(outside, { recursive: true });
  }
});
