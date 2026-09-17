import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

async function compile(root: string, cwd: string, name: string) {
  const destination = join(root, `${name}.js`);
  const config = join(root, `${name}.json`);
  await writeFile(
    config,
    JSON.stringify({
      mode: "bundle",
      parent: process.pid,
      entry: resolve("packages/orchestration/temporal-orchestration/fixtures/workflows.mjs"),
      packageDirectory: resolve("packages/orchestration/temporal-orchestration"),
      destination,
      bundleContext: resolve("."),
    }),
  );
  const child = Bun.spawn(
    [
      process.execPath,
      resolve("packages/orchestration/temporal-orchestration/src/sidecar.ts"),
      config,
    ],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  expect(code, stderr).toBe(0);
  return {
    result: JSON.parse(stdout.trim().split("\n").at(-1)!),
    bytes: await readFile(destination),
  };
}

test("explicit absolute bundle context makes workflow bytes and fingerprint independent of launch cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-bundle-context-"));
  try {
    const firstCwd = join(root, "first"),
      secondCwd = join(root, "second");
    await mkdir(firstCwd);
    await mkdir(secondCwd);
    const first = await compile(root, firstCwd, "first");
    const second = await compile(root, secondCwd, "second");
    expect(second.bytes).toEqual(first.bytes);
    expect(second.result.fingerprint).toBe(first.result.fingerprint);
    expect(new Map(second.result.dependencies)).toEqual(new Map(first.result.dependencies));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
