import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverWorkspaceManifests,
  type RootManifest,
  validateDependencyPolicy,
} from "./dependency-policy.ts";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(join(rootDirectory, "package.json"), "utf8"),
) as RootManifest;
// pnpm keeps the package globs and dependency catalogs in pnpm-workspace.yaml
// rather than the root manifest. The policy validates their content either way.
const workspaceFile = parseYaml(
  await readFile(join(rootDirectory, "pnpm-workspace.yaml"), "utf8"),
) as NonNullable<RootManifest["workspaces"]>;
const rootManifest: RootManifest = { ...manifest, workspaces: workspaceFile };
const patterns = rootManifest.workspaces?.packages ?? [];
const workspaces = await discoverWorkspaceManifests(rootDirectory, patterns);
const violations = validateDependencyPolicy(rootManifest, workspaces);

if (violations.length > 0) {
  for (const item of violations) {
    console.error(`${item.workspace}:${item.field}: ${item.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `Dependency policy: OK (${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"})`,
  );
}
