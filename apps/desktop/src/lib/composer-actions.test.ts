import { expect, test } from "vitest";
import { composerActions, delegationDraft } from "./composer-actions.js";

test("browser navigation remains available while an agent is working", () => {
  const actions = composerActions({
    goal: false,
    plan: false,
    delegate: false,
    fork: false,
    active: true,
    busy: true,
    browser: true,
  });
  expect(actions.find((action) => action.id === "action:browser")?.disabled).toBe(false);
});

test("both picker entry points use the same capability-scoped actions", () => {
  const actions = composerActions({
    goal: true,
    plan: true,
    delegate: true,
    fork: true,
    active: false,
    busy: false,
  });
  expect(actions.map((action) => action.id)).toEqual(["action:goal", "action:plan", "action:fork"]);
  expect(actions.some((action) => action.id === "action:delegate")).toBe(false);
  expect(actions.find((a) => a.id === "action:fork")?.description).toContain("shared");
  expect(
    composerActions({
      goal: false,
      plan: false,
      delegate: false,
      fork: false,
      active: false,
      busy: false,
    }),
  ).toEqual([]);
});
test("fork is unavailable during work and delegation only prepares editable text", () => {
  expect(
    composerActions({
      goal: false,
      plan: false,
      delegate: true,
      fork: true,
      active: true,
      busy: false,
    }).find((a) => a.id === "action:fork")?.disabled,
  ).toBe(true);
  expect(delegationDraft("My existing draft")).toContain("My existing draft");
  expect(delegationDraft("", { id: "opaque-child", label: "Reviewer" })).toContain("Reviewer");
});
