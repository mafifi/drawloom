import { expect, test } from "bun:test";
import { assertPlanningIdle, assertGoalActivation } from "./planning-control.js";

test("planning requires settled execution and a confirmed non-active native goal", () => {
  expect(() => assertPlanningIdle("op", null)).toThrow("settle");
  expect(() => assertPlanningIdle(undefined, undefined)).toThrow("Refresh");
  expect(() => assertPlanningIdle(undefined, { status: "active" })).toThrow("Pause");
  expect(() => assertPlanningIdle(undefined, { status: "paused" })).not.toThrow();
  expect(() => assertPlanningIdle(undefined, null)).not.toThrow();
});

test("goal activation stays fenced until a native default turn is accepted", () => {
  expect(() => assertGoalActivation({ mode: "plan" })).toThrow();
  expect(() => assertGoalActivation({ mode: "default", defaultModeRequired: true })).toThrow();
  expect(() => assertGoalActivation({ mode: "default", defaultModeRequired: false })).not.toThrow();
});
