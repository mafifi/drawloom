import { expect, test } from "bun:test";
import { controlGoal } from "./goal-control.js";

test("unavailable goal control never simulates a successful mutation", async () => {
  await expect(controlGoal(undefined, { action: "read" })).rejects.toThrow("does not support");
});

test("goal control forwards the exact revision and propagates ambiguous failures without retry", async () => {
  let calls = 0;
  const goals = {
    read: async () => ({ status: "ok" as const, value: null }),
    resume: async (input: { revision: string }) => {
      calls++;
      expect(input.revision).toBe("r1");
      return {
        status: "rejected" as const,
        failure: { code: "provider_unavailable" as const, message: "Refresh before trying again" },
      };
    },
  };
  await expect(controlGoal(goals as never, { action: "resume", revision: "r1" })).rejects.toThrow(
    "Refresh before trying again",
  );
  expect(calls).toBe(1);
});
