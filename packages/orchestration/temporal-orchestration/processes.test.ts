import { test, expect } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { command } from "./src/processes.js";

const node = process.execPath;

async function expectChildTerminated(marker: string): Promise<void> {
  const pid = Number(await readFile(marker, "utf8"));
  await expect
    .poll(() => {
      try {
        process.kill(pid, 0);
        return true;
      } catch (error) {
        return !(error instanceof Error && "code" in error && error.code === "ESRCH");
      }
    })
    .toBe(false);
}

test("command preserves a complete large UTF-8 result after fragmented writes", async () => {
  const expected = `${"dependency,".repeat(7_000)}${"🌙".repeat(3_000)}`;
  const source = [
    `const output = ${JSON.stringify(expected)};`,
    "const bytes = Buffer.from(output);",
    "for (let offset = 0; offset < bytes.length; offset += 7) process.stdout.write(bytes.subarray(offset, offset + 7));",
  ].join("");

  expect(await command(node, ["-e", source])).toBe(expected);
});

test("command rejects an output overflow and terminates its child", async () => {
  const marker = join(tmpdir(), `drawloom-command-overflow-${crypto.randomUUID()}`);
  const source = [
    "const { writeFileSync } = require('node:fs');",
    `writeFileSync(${JSON.stringify(marker)}, String(process.pid));`,
    "process.stdout.write('x'.repeat(1_048_577));",
    "setInterval(() => {}, 1_000);",
  ].join("");
  try {
    await expect(command(node, ["-e", source], 5_000)).rejects.toThrow("output exceeded");
    await expectChildTerminated(marker);
  } finally {
    await rm(marker, { force: true });
  }
});

test("command keeps failure, timeout, and spawn errors explicit", async () => {
  await expect(
    command(node, ["-e", "process.stderr.write('failed'); process.exit(3)"]),
  ).rejects.toThrow("failed (3): failed");
  const marker = join(tmpdir(), `drawloom-command-timeout-${crypto.randomUUID()}`);
  try {
    const timeoutSource = [
      "const { writeFileSync } = require('node:fs');",
      `writeFileSync(${JSON.stringify(marker)}, String(process.pid));`,
      "setInterval(() => {}, 1_000);",
    ].join("");
    await expect(command(node, ["-e", timeoutSource], 200)).rejects.toThrow("timed out");
    await expectChildTerminated(marker);
  } finally {
    await rm(marker, { force: true });
  }
  await expect(command(join(tmpdir(), "missing-drawloom-command"), [])).rejects.toThrow();
});
