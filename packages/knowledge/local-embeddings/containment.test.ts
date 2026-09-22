import { expect, test } from "vitest";
import { pathContainmentConformance } from "@drawloom/host/conformance";
import { isSubpath } from "./src/containment.ts";

test("runtime setup containment conforms to the shared meaning", () => {
  expect(() => pathContainmentConformance(isSubpath)).not.toThrow();
});

test("the corrected rule accepts the legitimate paths the old one refused", () => {
  // Regression for the actual defect: these are valid directory names that
  // `startsWith("..")` and `includes("../")` rejected.
  expect(isSubpath("/runtime", "/runtime/..draft/llama")).toBe(true);
  expect(isSubpath("/runtime", "/runtime/b../llama")).toBe(true);
  expect(isSubpath("/runtime", "/runtime/sub/../llama")).toBe(true);
  // Still refuses real escapes, and a sibling sharing a textual prefix.
  expect(isSubpath("/runtime", "/runtime/../etc")).toBe(false);
  expect(isSubpath("/runtime/a", "/runtime/ab")).toBe(false);
});
