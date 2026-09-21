import { expect, test } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

async function check(files: Record<string, string>) {
  const cwd = await mkdtemp(join(tmpdir(), "drawloom-docs-test-"));
  try {
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(cwd, path)), { recursive: true });
      await writeFile(join(cwd, path), text);
    }
    for (const args of [
      ["init", "-q"],
      ["add", "."],
    ]) {
      const result = spawnSync("git", [...args], { cwd });
      expect(result.status).toBe(0);
    }
    const result = spawnSync(process.execPath, [join(import.meta.dirname, "check-docs.ts")], {
      cwd,
    });
    return { code: result.status, error: result.stderr.toString() };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

test("allows the atlas links without ignored generated output in a clean checkout", async () => {
  const result = await check({
    "docs/reference/repository-audit/README.md":
      "[Map](../evidence/generated/repository-atlas/overview.html)\n[Checklist](../evidence/generated/repository-atlas/index.md)",
  });
  expect(result.code).toBe(0);
});

test("rejects missing ordinary files and the obsolete generated directory", async () => {
  const result = await check({
    "README.md": "[Missing](missing.md)\n[Old](docs/reference/generated/atlas.html)",
  });
  expect(result.code).toBe(1);
  expect(result.error).toContain('broken link "missing.md"');
  expect(result.error).toContain('broken link "docs/reference/generated/atlas.html"');
});

test("checks heading anchors but ignores example links in code", async () => {
  const result = await check({
    "README.md":
      "[Valid](guide.md#start-here)\n[Invalid](guide.md#missing)\n`[Example](example.md)`\n```md\n[Example](sample.md)\n```",
    "guide.md": "# Start here\n",
  });
  expect(result.code).toBe(1);
  expect(result.error).toContain('broken anchor "guide.md#missing"');
  expect(result.error).not.toContain("broken link");
  expect(result.error).not.toContain('broken anchor "guide.md#start-here"');
});
