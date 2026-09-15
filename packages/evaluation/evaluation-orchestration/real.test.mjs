import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { command } from "../../orchestration/temporal-orchestration/dist/processes.js";

if (!process.versions.bun) {
  test("real local Temporal schedules, restores, and cancels supported evaluation", {
    skip: process.env.DRAWLOOM_TEMPORAL_TEST !== "1",
    timeout: 120000,
  }, async () => {
    const output = await command(
      "bun",
      [resolve("scripts/fixtures/evaluation-real-temporal.mjs")],
      110000,
    );
    assert.match(output, /EVALUATION_TEMPORAL_OK/);
  });
}
