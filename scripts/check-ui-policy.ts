import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanUiPolicy } from "./ui-policy.ts";

// Independently built consumers can run the same checker against their own root.
const root = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), "..");
const { files, issues } = await scanUiPolicy(root);
for (const issue of issues) console.error(`${issue.path}:${issue.line}: ${issue.message}`);
if (issues.length > 0) process.exitCode = 1;
else console.log(`UI policy: OK (${files} maintained source files)`);
