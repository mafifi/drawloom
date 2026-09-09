import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runUiPolicyHook } from "./ui-policy-hook.ts";

const script = fileURLToPath(new URL("./ui-policy-hook.ts", import.meta.url));
const event = JSON.stringify({
  hook_event_name: "PostToolUse", tool_name: "apply_patch", cwd: "/synthetic/session",
  tool_input: { command: "*** Begin Patch\n*** End Patch" },
});

describe("advisory UI policy hook", () => {
  test("stays silent for clean maintained sources and unrelated hook events", async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-ui-hook-"));
    try {
      await mkdir(join(root, "apps/demo/src"), { recursive: true });
      await writeFile(join(root, "apps/demo/src/View.svelte"), "<main><p>Ready</p></main>");
      expect(await runUiPolicyHook(event, root)).toBe("");
      expect(await runUiPolicyHook(JSON.stringify({
        hook_event_name: "PostToolUse", tool_name: "Bash", cwd: root,
      }), root)).toBe("");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test("reports actual scanner findings with locations and bounded repair guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-ui-hook-"));
    try {
      await mkdir(join(root, "apps/demo/src"), { recursive: true });
      await writeFile(join(root, "apps/demo/src/View.svelte"), `<script>
        import { Button } from '@drawloom/ui';
      </script>\n<Button pending>Save</Button>\n${'<button>Native</button>\n'.repeat(30)}`);
      const output = JSON.parse(await runUiPolicyHook(event, root));
      expect(Object.keys(output)).toEqual(["hookSpecificOutput"]);
      const context = output.hookSpecificOutput.additionalContext;
      expect(context).toContain("apps/demo/src/View.svelte:4");
      expect(context).toContain("StatefulButton");
      expect(context).toContain("pending");
      expect(context).toContain("31 issue");
      expect(context).toContain("bun run check:ui-policy");
      expect(context.length).toBeLessThanOrEqual(3000);
      expect(context).not.toContain(">Native</button>");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test("reports unavailable scans as advisory guidance", async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-ui-hook-"));
    try {
      await writeFile(join(root, "apps"), "not a directory");
      const output = JSON.parse(await runUiPolicyHook(event, root));
      expect(output.hookSpecificOutput.additionalContext).toContain("could not scan");
      expect(output.hookSpecificOutput.additionalContext).toContain("bun run check:ui-policy");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test("malformed stdin returns non-blocking, actionable JSON without leaking its input", async () => {
    const child = Bun.spawn([process.execPath, script], {
      stdin: new Blob(["not-json private-payload"]), stdout: "pipe", stderr: "pipe",
    });
    const [status, stdout, stderr] = await Promise.all([
      child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ]);
    expect(status).toBe(0);
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(Object.keys(result)).toEqual(["hookSpecificOutput"]);
    expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(result.hookSpecificOutput.additionalContext).toContain("bun run check:ui-policy");
    expect(stdout).not.toContain("private-payload");
  });
});
