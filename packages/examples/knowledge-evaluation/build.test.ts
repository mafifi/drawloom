import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildKnowledgeEvaluationPackage } from "./build.js";

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

test("builds a self-contained shared EvaluationWorkbench MCP App and packs exact public fixtures", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-evaluation-build-")); temporary.push(root);
  await buildKnowledgeEvaluationPackage();
  const html = await readFile(join(import.meta.dir, "app.html"), "utf8");
  expect(html).toContain('<script type="module">');
  expect(html).toContain("prefers-reduced-motion");
  expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["']https?:/);
  expect(html).not.toContain("/Users/");
  for (const entrypoint of ["backend.js", "workflows.js"] as const) {
    const source = await readFile(join(import.meta.dir, "dist", entrypoint), "utf8");
    expect(source).not.toMatch(/from ["']@drawloom\//);
    expect(source).not.toContain("/Users/");
  }
  expect(await readFile(join(import.meta.dir, "dist", "workflows.js"), "utf8")).not.toMatch(/from ["']node:/);
  const archive = join(root, "knowledge-evaluation.tgz");
  const packed = Bun.spawnSync(["bun", "pm", "pack", "--filename", archive, "--quiet"], { cwd: import.meta.dir, stdout: "pipe", stderr: "pipe" });
  expect(packed.exitCode, packed.stderr.toString()).toBe(0);
  const listing = Bun.spawnSync(["tar", "-tzf", archive], { stdout: "pipe" }).stdout.toString();
  expect(listing).toContain("package/dist/backend.js");
  expect(listing).toContain("package/dist/workflows.js");
  expect(listing).toContain("package/app.html");
  for (const [name, bytes] of [["corpus.ts", 10_539], ["local-knowledge-mlx-10k.json", 24_306], ["local-knowledge-answers-10k.json", 173_165]] as const) {
    const value = Bun.spawnSync(["tar", "-xOf", archive, `package/src/fixtures/${name}`], { stdout: "pipe" }).stdout;
    expect(value.byteLength).toBe(bytes);
  }
});
