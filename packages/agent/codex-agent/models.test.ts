import { test, expect } from "bun:test";
import { readCodexModels, permitsModel } from "./src/models";
test("model inventory is bounded metadata and validates reasoning", async () => {
  const calls: string[] = [];
  const models = await readCodexModels({
    request: async (method) => {
      calls.push(method);
      return {
        data: [
          {
            model: "small",
            displayName: "Small model",
            supportedReasoningEfforts: [{ reasoningEffort: "low" }],
          },
        ],
        nextCursor: null,
      };
    },
  });
  expect(calls).toEqual(["model/list"]);
  expect(permitsModel(models, { model: "small", effort: "low" })).toBe(true);
  expect(permitsModel(models, { model: "small", effort: "high" })).toBe(false);
  expect(permitsModel(models, { model: "missing" })).toBe(false);
});
test("repeating cursors fail rather than fetching forever", async () => {
  let calls = 0;
  await expect(
    readCodexModels({
      request: async () => {
        calls++;
        return { data: [], nextCursor: "repeat" };
      },
    }),
  ).rejects.toThrow("Repeated");
  expect(calls).toBe(2);
});
