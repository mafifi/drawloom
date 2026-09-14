import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildInspectionPackage } from "./inspection-build.ts";

test("builds a self-contained installed Svelte MCP App package", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-inspection-build-test-"));
  const out = join(root, "package");
  const built = await buildInspectionPackage(out);
  expect(built.packageRoot).toBe(out);
  const manifest = JSON.parse(await readFile(join(out, "plugin.json"), "utf8"));
  const mcp = JSON.parse(await readFile(join(out, "mcp.json"), "utf8"));
  const html = await readFile(join(out, "app.html"), "utf8");
  const server = await readFile(join(out, "server.mjs"), "utf8");

  expect(manifest.extensions["org.drawloom"].workbenches[0]).toMatchObject({ id: "evaluation-inspection", openingTool: { server: "inspection", tool: "inspection.open" } });
  expect(mcp.mcpServers.inspection).toEqual({ type: "stdio", command: "node", args: ["${PLUGIN_ROOT}/server.mjs"] });
  expect(html).toContain("<script type=\"module\">");
  expect(html).toContain("@media (prefers-reduced-motion: reduce)");
  expect(html).not.toContain("/Users/");
  expect(server).not.toContain("spikes/adr-0025-evaluation");
  expect((await readFile(join(out, "inspection.json"))).byteLength).toBeGreaterThan(1_000);
  await expect(buildInspectionPackage(out)).rejects.toThrow("already exists");
});
