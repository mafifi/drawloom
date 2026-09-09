import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { discoverWorkspaceManifests } from "./dependency-policy.ts";

const directory = await mkdtemp(join(tmpdir(), "drawloom-pack-"));
const packages = await discoverWorkspaceManifests(process.cwd(), [
  "packages/*/*",
]);
try {
  for (const workspace of packages) {
    const archive = join(
      directory,
      workspace.manifest.name!.replaceAll("/", "-") + ".tgz",
    );
    const packed = Bun.spawnSync(
      ["bun", "pm", "pack", "--filename", archive, "--quiet"],
      { cwd: dirname(resolve(workspace.path)), stdout: "pipe", stderr: "pipe" },
    );
    if (packed.exitCode !== 0)
      throw Error(`Package build failed: ${workspace.path}`);
    const listing = Bun.spawnSync(["tar", "-tzf", archive], { stdout: "pipe" })
      .stdout.toString()
      .split("\n");
    const manifest = JSON.parse(
      Bun.spawnSync(["tar", "-xOf", archive, "package/package.json"], {
        stdout: "pipe",
      }).stdout.toString(),
    ) as {
      dependencies?: Record<string, string>;
      exports: Record<string, Record<string, string>>;
    };
    for (const version of Object.values(manifest.dependencies ?? {}))
      if (/^(workspace:|catalog:|file:|\/)/.test(version))
        throw Error("Nonportable packed dependency");
    for (const conditions of Object.values(manifest.exports))
      for (const entry of Object.values(conditions))
        if (!listing.includes("package/" + entry.replace(/^\.\//, "")))
          throw Error(`Missing packed export: ${entry}`);
  }
  console.log(
    `Packed export and dependency checks: ${packages.length} packages passed`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
