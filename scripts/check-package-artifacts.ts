import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { discoverWorkspaceManifests } from "./dependency-policy.ts";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "drawloom-pack-"));
const packages = await discoverWorkspaceManifests(process.cwd(), ["packages/*/*"]);
try {
  for (const workspace of packages) {
    const archive = join(directory, workspace.manifest.name!.replaceAll("/", "-") + ".tgz");
    const packed = spawnSync("pnpm", ["pack", "--out", archive], {
      cwd: dirname(resolve(workspace.path)),
    });
    if (packed.status !== 0) throw Error(`Package build failed: ${workspace.path}`);
    const listing = spawnSync("tar", ["-tzf", archive]).stdout.toString().split("\n");
    const manifest = JSON.parse(
      spawnSync("tar", ["-xOf", archive, "package/package.json"]).stdout.toString(),
    ) as {
      dependencies?: Record<string, string>;
      exports: Record<string, Record<string, string>>;
    };
    for (const version of Object.values(manifest.dependencies ?? {}))
      if (/^(workspace:|catalog:|file:|\/)/.test(version))
        throw Error("Nonportable packed dependency");
    // Every export the packed manifest advertises must exist in the tarball,
    // including the development condition. A package that does not ship `src`
    // removes that condition with publishConfig.exports rather than publishing
    // an export target that resolves to nothing.
    for (const conditions of Object.values(manifest.exports))
      for (const entry of Object.values(conditions))
        if (!listing.includes("package/" + entry.replace(/^\.\//, "")))
          throw Error(`Missing packed export: ${entry}`);
  }
  console.log(`Packed export and dependency checks: ${packages.length} packages passed`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
