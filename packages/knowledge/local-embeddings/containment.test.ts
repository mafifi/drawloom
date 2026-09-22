import { expect, test } from "vitest";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathContainmentConformance } from "@drawloom/host/conformance";

/**
 * `isSubpath` is module-private in src/setup.ts, so this pins the same
 * expression against the shared suite. The duplication is deliberate: a shared
 * implementation has no legal home here, because `.dependency-cruiser.mjs`
 * forbids provider-to-provider imports and every contract is `runtime:
 * portable`. ADR 0004's answer is to share the behaviour instead.
 */
function isSubpath(root: string, candidate: string): boolean {
  const between = relative(resolve(root), resolve(candidate));
  return (
    between === "" || (!isAbsolute(between) && between !== ".." && !between.startsWith(".." + sep))
  );
}

test("runtime setup containment conforms to the shared meaning", () => {
  expect(() => pathContainmentConformance(isSubpath)).not.toThrow();
});

test("the corrected rule accepts the legitimate paths the old one refused", () => {
  // Regression for the actual defect: these are valid directory names that
  // `startsWith("..")` and `includes("../")` rejected.
  expect(isSubpath("/runtime", "/runtime/..draft/llama")).toBe(true);
  expect(isSubpath("/runtime", "/runtime/b../llama")).toBe(true);
  expect(isSubpath("/runtime", "/runtime/sub/../llama")).toBe(true);
  // Still refuses real escapes.
  expect(isSubpath("/runtime", "/runtime/../etc")).toBe(false);
  expect(isSubpath("/runtime/a", "/runtime/ab")).toBe(false);
});
