import { fileURLToPath } from "node:url";
import { scanUiPolicy } from "./ui-policy.ts";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const rerun = "Run bun run check:ui-policy from the repository root for the complete result.";

function advice(context: string): string {
  return JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } });
}

export async function runUiPolicyHook(input: string, root = repositoryRoot): Promise<string> {
  let event: unknown;
  try { event = JSON.parse(input); }
  catch { return advice(`UI policy hook could not read its event. ${rerun}`); }
  if (!event || typeof event !== "object" || !("hook_event_name" in event)
    || typeof event.hook_event_name !== "string" || !("tool_name" in event)
    || typeof event.tool_name !== "string" || !("cwd" in event) || typeof event.cwd !== "string")
    return advice(`UI policy hook could not read its event. ${rerun}`);
  if (event.hook_event_name !== "PostToolUse" || event.tool_name !== "apply_patch") return "";

  // Scan the script's checkout, not a payload-selected directory. A full scan is
  // cheap and covers patch renames without depending on the patch wire format.
  try {
    const { issues } = await scanUiPolicy(root);
    if (issues.length === 0) return "";
    const findings = issues.slice(0, 8).map((issue) =>
      `${issue.path}:${issue.line}: ${issue.message}`.slice(0, 320));
    const context = [`UI policy advisory: ${issues.length} issue(s); showing up to 8.`,
      ...findings, rerun].join("\n");
    return advice(context);
  } catch {
    return advice(`UI policy hook could not scan maintained sources. ${rerun}`);
  }
}

if (import.meta.main) {
  const output = await runUiPolicyHook(await Bun.stdin.text());
  if (output) console.log(output);
}
