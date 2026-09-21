import { expect, test } from "vitest";
import { presentToolOutcome, groupToolActivity, toolActivityTitle } from "./tool-outcome.js";

test("tool activity uses admitted display titles and keeps opaque unknown aliases out of headings", () => {
  expect(
    toolActivityTitle("pkg_abc", [{ toolName: "pkg_abc", title: "Render motion graphics" }]),
  ).toBe("Render motion graphics");
  expect(toolActivityTitle("pkg_unknown", [])).toBe("Recorded tool call");
  expect(toolActivityTitle("media.inspect", [])).toBe("media inspect");
});

test("activity groups attach to their own operation without inventing old turn associations", () => {
  const result = {
    invocationId: "one",
    operationId: "op",
    evidence: "recorded" as const,
    outcome: { status: "ok" as const, value: {}, text: "done" },
  };
  const groups = groupToolActivity(
    [result, { ...result, invocationId: "two", operationId: "older" }],
    [
      { id: "first", operationId: "op" },
      { id: "last", operationId: "op" },
    ],
  );
  expect(groups.get("last")?.map((r) => r.invocationId)).toEqual(["one"]);
  expect(groups.get("first")).toBeUndefined();
  expect(groups.get("")?.map((r) => r.invocationId)).toEqual(["two"]);
});

test("retained correlated tools own their outcome instead of duplicating live activity", () => {
  const result = {
    invocationId: "call",
    operationId: "op",
    evidence: "recorded" as const,
    outcome: { status: "ok" as const, value: {}, text: "done" },
  };
  const groups = groupToolActivity(
    [result],
    [{ id: "tool", operationId: "op", origin: { kind: "tool", callId: "call" } }],
  );
  expect(groups.size).toBe(0);
});

test("tool outcomes preserve completed, denied, cancelled, and uncertain states", () => {
  expect(
    presentToolOutcome({
      invocationId: "ok",
      evidence: "recorded",
      outcome: { status: "ok", value: {}, text: "done" },
    }),
  ).toMatchObject({ state: "completed", statusLabel: "Completed" });
  expect(
    presentToolOutcome({
      invocationId: "denied",
      evidence: "start_failed",
      outcome: { status: "failed", code: "denied", execution: "not_started" },
    }),
  ).toMatchObject({ state: "denied", statusLabel: "Denied" });
  expect(
    presentToolOutcome({
      invocationId: "cancelled",
      evidence: "recorded",
      outcome: { status: "failed", code: "cancelled", execution: "not_started" },
    }),
  ).toMatchObject({ state: "cancelled", statusLabel: "Cancelled" });
  expect(
    presentToolOutcome({
      invocationId: "unknown",
      evidence: "outcome_failed",
      outcome: { status: "failed", code: "evidence_failed", execution: "unknown" },
    }),
  ).toMatchObject({ state: "uncertain", statusLabel: "Outcome uncertain" });
  expect(
    presentToolOutcome({
      invocationId: "denied-unknown",
      evidence: "outcome_failed",
      outcome: { status: "failed", code: "denied", execution: "unknown" },
    }),
  ).toMatchObject({ state: "uncertain", statusLabel: "Outcome uncertain" });
  expect(
    presentToolOutcome({
      invocationId: "cancelled-completed",
      evidence: "recorded",
      outcome: { status: "failed", code: "cancelled", execution: "completed" },
    }),
  ).toMatchObject({ state: "failed", statusLabel: "Failed" });
});

test("successful tool execution is not presented as business acceptance", () => {
  const outcome = presentToolOutcome({
    invocationId: "ok",
    evidence: "recorded",
    outcome: { status: "ok", value: {}, text: "done" },
  });
  expect(outcome.description).toContain("not acceptance or publication");
  expect(outcome.label).toBe("Tool activity");
});

test("unretained results do not anchor inside a collapsed retained process group", () => {
  const result = {
    invocationId: "missing",
    operationId: "op",
    evidence: "outcome_failed" as const,
    outcome: {
      status: "failed" as const,
      code: "evidence_failed" as const,
      execution: "unknown" as const,
    },
  };
  const groups = groupToolActivity(
    [result],
    [{ id: "tool", operationId: "op", origin: { kind: "tool", callId: "retained" } }],
  );
  expect(groups.get("")).toEqual([result]);
});
