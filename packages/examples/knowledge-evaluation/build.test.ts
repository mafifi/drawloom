import { afterEach, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildKnowledgeEvaluationPackage } from "./build.js";
import { spawnSync } from "node:child_process";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("builds a self-contained shared EvaluationWorkbench MCP App and packs exact public fixtures", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-knowledge-evaluation-build-"));
  temporary.push(root);
  await buildKnowledgeEvaluationPackage();
  const html = await readFile(join(import.meta.dirname, "app.html"), "utf8");
  expect(html).toContain('<script type="module">');
  expect(html).toContain("prefers-reduced-motion");
  expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)=["']https?:/);
  expect(html).not.toContain("/Users/");
  for (const entrypoint of ["backend.js", "workflows.js"] as const) {
    const source = await readFile(join(import.meta.dirname, "org.drawloom", entrypoint), "utf8");
    expect(source).not.toMatch(/from ["']@drawloom\//);
    expect(source).not.toContain("/Users/");
  }
  expect(
    await readFile(join(import.meta.dirname, "org.drawloom", "workflows.js"), "utf8"),
  ).not.toMatch(/from ["']node:/);
  const archive = join(root, "knowledge-evaluation.tgz");
  const packed = spawnSync("pnpm", ["pack", "--out", archive], {
    cwd: import.meta.dirname,
  });
  expect(packed.status, packed.stderr.toString()).toBe(0);
  const listing = spawnSync("tar", ["-tzf", archive]).stdout.toString();
  expect(listing).toContain("package/org.drawloom/backend.js");
  expect(listing).toContain("package/org.drawloom/workflows.js");
  expect(listing).toContain("package/org.drawloom/backend.d.ts");
  expect(listing).toContain("package/org.drawloom/workflows.d.ts");
  expect(listing).toContain("package/app.html");
  expect(listing).not.toMatch(/package\/dist\/(?:backend|workflows)\.js/);
  expect(listing).not.toMatch(/package\/dist\/(?:backend|workflows)\.d\.ts/);
  expect(listing).not.toMatch(/package\/src\/(?:backend|workflows)\.ts/);
  for (const [name, bytes] of [
    ["corpus.ts", 10_539],
    ["local-knowledge-mlx-10k.json", 24_306],
    ["local-knowledge-answers-10k.json", 173_165],
  ] as const) {
    const value = spawnSync("tar", ["-xOf", archive, `package/src/fixtures/${name}`]).stdout;
    expect(value.byteLength).toBe(bytes);
  }

  const installed = join(root, "src", "installed-consumer");
  await mkdir(installed, { recursive: true });
  const extracted = spawnSync(
    "tar",
    ["-xzf", archive, "--strip-components=1", "-C", installed],
    {},
  );
  expect(extracted.status, extracted.stderr.toString()).toBe(0);
  const module = (await import(
    `${pathToFileURL(join(installed, "dist", "index.js")).href}?ancestor-src=${Date.now()}`
  )) as { loadKnowledgeEvaluation(): Promise<unknown> };
  await expect(module.loadKnowledgeEvaluation()).resolves.toBeDefined();
}, 60_000); // Build/pack/extract is an integration check, not a five-second unit test.
