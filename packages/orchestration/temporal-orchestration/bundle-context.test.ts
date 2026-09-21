import { expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { text as readText } from "node:stream/consumers";
import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
/** Bun exposed `child.exited`; Node signals completion with an "exit" event. */
const exitCodeOf = async (child: ChildProcess): Promise<number> =>
  (await once(child, "exit"))[0] as number;

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
  // Launch the built sidecar, which is what the product spawns (src/index.ts
  // resolves ../dist/sidecar.js). Running it under the real Node executable
  // outside Vite is the point of this check, so it requires a prior build.
  const child = spawn(
    process.execPath,
    [resolve("packages/orchestration/temporal-orchestration/dist/sidecar.js"), config],
    { cwd },
  );
  const [code, stdout, stderr] = await Promise.all([
    exitCodeOf(child),
    readText(child.stdout!),
    readText(child.stderr!),
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
