import { expect, test } from "vitest";
import * as agent from "./src/index.js";
import { agentGoalsConformance } from "./src/goals-conformance.js";

test("goal snapshots reject provider identifiers and negative accounting", () => {
  const schema = agent.AgentGoalSnapshotSchema;
  expect(schema).toBeDefined();
  const goal = {
    revision: "r1",
    objective: "Verify the release",
    status: "active",
  };
  expect(schema.safeParse(goal).success).toBe(true);
  expect(schema.safeParse({ ...goal, threadId: "native" }).success).toBe(false);
  expect(schema.safeParse({ ...goal, timeUsedSeconds: -1 }).success).toBe(false);
});

test("plan notifications require operation correlation and valid step states", () => {
  const signal = {
    kind: "plan.updated",
    operationId: "op",
    plan: { steps: [{ text: "Verify", status: "pending" }] },
  };
  expect(agent.AgentSessionSignalSchema.safeParse(signal).success).toBe(true);
  expect(
    agent.AgentSessionSignalSchema.safeParse({
      ...signal,
      operationId: undefined,
    }).success,
  ).toBe(false);
  expect(
    agent.AgentSessionSignalSchema.safeParse({
      ...signal,
      plan: { steps: [{ text: "Verify", status: "done" }] },
    }).success,
  ).toBe(false);
});

test("shared goal conformance exercises fresh and stale snapshots", async () => {
  let revision = 0;
  let goal: {
    revision: string;
    objective: string;
    status: "active" | "paused";
  } | null = null;
  const rejected = {
    status: "rejected" as const,
    failure: { code: "invalid_state" as const, message: "stale" },
  };
  const next = (objective: string, status: "active" | "paused") => ({
    revision: `r${++revision}`,
    objective,
    status,
  });
  await agentGoalsConformance(() => ({
    async read() {
      return { status: "ok" as const, value: goal && { ...goal } };
    },
    async create(objective) {
      goal = next(objective, "active");
      return { status: "ok" as const, value: { ...goal } };
    },
    async edit(input) {
      if (!goal || input.revision !== goal.revision) return rejected;
      goal = next(input.objective, goal.status);
      return { status: "ok" as const, value: { ...goal } };
    },
    async pause(input) {
      if (!goal || input.revision !== goal.revision) return rejected;
      goal = next(goal.objective, "paused");
      return { status: "ok" as const, value: { ...goal } };
    },
    async resume(input) {
      if (!goal || input.revision !== goal.revision) return rejected;
      goal = next(goal.objective, "active");
      return { status: "ok" as const, value: { ...goal } };
    },
    async clear(input) {
      if (!goal || input.revision !== goal.revision) return rejected;
      goal = null;
      return { status: "ok" as const, value: null };
    },
  }));
});
