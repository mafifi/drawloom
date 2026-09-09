import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanUiPolicy } from "./ui-policy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { files, issues } = await scanUiPolicy(root);
for (const issue of issues) console.error(`${issue.path}:${issue.line}: ${issue.message}`);
if (issues.length > 0) process.exitCode = 1;
else console.log(`UI policy: OK (${files} maintained source files)`);
