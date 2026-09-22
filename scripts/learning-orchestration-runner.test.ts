import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));

test("learning orchestration keeps real Temporal recovery in Node and runs source integration in Vitest", () => {
  expect(manifest.scripts["test:orchestration:learning"]).toBe(
    "node --test --test-concurrency=1 apps/desktop/tests/nightloom-orchestration.integration.node-check.mjs && vitest run --config vitest.learning.config.ts",
  );
});

test("learning runner collects only the explicit source integration", () => {
  expect(existsSync("vitest.learning.config.ts")).toBe(true);
  expect(readFileSync("vitest.learning.config.ts", "utf8")).toContain(
    'include: ["apps/desktop/tests/learning-journey-orchestration.integration.test.ts"]',
  );
});
