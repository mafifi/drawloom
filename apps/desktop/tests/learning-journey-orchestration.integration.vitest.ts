import { test } from "vitest";

test("learning journey recovers through the orchestration contract", async () => {
  await import("./learning-journey-orchestration.integration");
}, 120_000);
