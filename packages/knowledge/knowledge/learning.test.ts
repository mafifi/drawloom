import { expect, test } from "vitest";
import {
  LearningAvailabilitySchema,
  LearningCurationStatusSchema,
  LearningCurationResultSchema,
  LearningControlResultSchema,
} from "./src/learning.js";

test("learning availability requires no local installation details", () => {
  expect(
    LearningAvailabilitySchema.parse({ availability: "ready", message: "", retrieval: "lexical" }),
  ).toEqual({
    availability: "ready",
    message: "",
    retrieval: "lexical",
  });
  expect(
    LearningAvailabilitySchema.safeParse({
      availability: "ready",
      message: "",
      retrieval: "lexical",
      modelDirectory: "/tmp",
    }).success,
  ).toBe(false);
});
test("all curation and control result branches reject extra or local-only fields", () => {
  for (const kind of [
    "idle",
    "busy",
    "paused",
    "uncertain",
    "budget_exhausted",
    "unavailable",
    "cancelled",
    "consent_required",
  ] as const) {
    expect(LearningCurationResultSchema.parse({ kind })).toEqual({ kind });
    expect(
      LearningCurationResultSchema.safeParse({ kind, identity: "local-coordinator" }).success,
    ).toBe(false);
  }
  for (const kind of ["ready", "unavailable", "cancelled"] as const) {
    expect(LearningControlResultSchema.parse({ kind })).toEqual({ kind });
    expect(LearningControlResultSchema.safeParse({ kind, model: "local-model" }).success).toBe(
      false,
    );
  }
});
test("curation state and operation outcomes are concrete, not arbitrary strings or unknown active state", () => {
  expect(
    LearningCurationStatusSchema.safeParse({
      state: "idle",
      message: "",
      paused: false,
      active: false,
      pendingUpdates: 0,
      automaticStartsToday: 0,
      automaticMillisecondsToday: 0,
    }).success,
  ).toBe(true);
  expect(
    LearningCurationStatusSchema.safeParse({
      state: "idle",
      message: "",
      paused: false,
      active: { anything: true },
      pendingUpdates: 0,
      automaticStartsToday: 0,
      automaticMillisecondsToday: 0,
    }).success,
  ).toBe(false);
  expect(LearningCurationResultSchema.safeParse({ kind: "whatever" }).success).toBe(false);
  expect(LearningCurationResultSchema.safeParse({ kind: "started" }).success).toBe(false);
  expect(LearningCurationResultSchema.safeParse({ kind: "started", runId: "run-1" }).success).toBe(
    true,
  );
});
