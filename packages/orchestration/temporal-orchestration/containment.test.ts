import { expect, test } from "vitest";
import { pathContainmentConformance } from "@drawloom/host/conformance";
import { insidePath } from "./src/containment.ts";

test("workflow containment conforms to the shared meaning", () => {
  expect(() => pathContainmentConformance(insidePath)).not.toThrow();
});

test("the corrected rule accepts legitimate names the old expression refused", () => {
  expect(insidePath("/pkg", "/pkg/..draft/workflow.mjs")).toBe(true);
  expect(insidePath("/pkg", "/pkg/sub/../workflow.mjs")).toBe(true);
  // Still refuses escapes, including a sibling that shares a textual prefix.
  expect(insidePath("/pkg", "/pkg/../other/workflow.mjs")).toBe(false);
  expect(insidePath("/pkg/a", "/pkg/ab")).toBe(false);
});
