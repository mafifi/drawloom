import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

test("learning orchestration keeps real Temporal recovery in Node and runs source integration in Vitest", () => {
  expect(manifest.scripts["test:orchestration:learning"]).toBe(
    "node --test --test-concurrency=1 apps/desktop/tests/nightloom-orchestration.integration.node-check.mjs && vitest run --config vitest.learning.config.ts",
  );
});

test("learning runner is collected only by its dedicated Vitest configuration", () => {
  const lane = "apps/desktop/tests/learning-journey-orchestration.integration.vitest.ts";
  const list = (config: string) =>
    execFileSync("pnpm", ["vitest", "list", "--config", config], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

  expect(existsSync(lane)).toBe(true);
  expect(lane).not.toMatch(/\.test\.(?:ts|js)$/);
  expect(list("vitest.config.ts")).not.toContain(lane);
  expect(list("vitest.learning.config.ts")).toContain(lane);
});
