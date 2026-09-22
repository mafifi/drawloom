import { expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink, rm, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containsPluginPath, readPluginIcon, packagePresentation } from "./plugin-presentation.js";
import type { FileOpen } from "./plugin-presentation.js";
import { pathContainmentConformance } from "@drawloom/host/conformance";
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";

test("special files cannot block icon loading", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-icon-fifo-"));
  try {
    const path = join(root, "icon.svg");
    expect(spawnSync("mkfifo", [path]).status).toBe(0);
    // A blocking open on a FIFO would hang forever. The child measures the call
    // itself and reports its duration, so the bound is on the read rather than
    // on Node's startup and module loading, which it previously included.
    const code = `
      import {readPluginIcon} from ${JSON.stringify(import.meta.dirname + "/plugin-presentation.ts")};
      const started = process.hrtime.bigint();
      const value = await readPluginIcon(${JSON.stringify(root)}, "icon.svg");
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      console.log(JSON.stringify({ value: value ?? null, elapsedMs }));`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
      timeout: 30_000,
    });
    expect(run.status, run.stderr.toString()).toBe(0);
    const observed = JSON.parse(run.stdout.toString().trim()) as {
      value: string | null;
      elapsedMs: number;
    };
    expect(observed.value).toBeNull();
    expect(observed.elapsedMs).toBeLessThan(1000);
  } finally {
    await rm(root, { recursive: true });
  }
});

test("replacement between resolving and opening an icon cannot expose outside bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-icon-race-"));
  try {
    const inside = join(root, "inside");
    await mkdir(inside, { recursive: true });
    const icon = join(inside, "icon.svg");
    await writeFile(icon, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(
      join(root, "outside.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg"><text>private</text></svg>',
    );
    // Swap the resolved path for a link out of the package at the moment it is
    // opened. Injected rather than mocked in a child process: the race is in
    // this function's own sequence, so nothing global needs replacing.
    let swapped = false;
    const files = {
      open: async (...args: Parameters<typeof open>) => {
        if (!swapped) {
          swapped = true;
          await rm(icon);
          await symlink(join(root, "outside.svg"), icon);
        }
        return open(...args);
      },
    } as FileOpen;
    expect(await readPluginIcon(inside, "icon.svg", files)).toBeUndefined();
    expect(swapped).toBe(true);
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
    expect(
      (await readPluginIcon(root, "./icon.svg"))?.startsWith("data:image/svg+xml;base64,"),
    ).toBe(true);
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

test("the plugin icon production containment rule conforms to the shared semantics", () => {
  // This import is the rule used by readPluginIcon itself. In particular, the
  // conformance cases reject the old broad `startsWith('..')` rule because it
  // wrongly excludes legitimate `..draft` names.
  expect(() => pathContainmentConformance(containsPluginPath)).not.toThrow();
});
