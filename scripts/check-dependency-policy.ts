import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverWorkspaceManifests,
  type RootManifest,
  validateDependencyPolicy,
} from "./dependency-policy.ts";

const rootDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootManifest = JSON.parse(
  await readFile(join(rootDirectory, "package.json"), "utf8"),
) as RootManifest;
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
