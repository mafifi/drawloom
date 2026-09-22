import { expect, test } from "vitest";
import { pathContainmentConformance } from "@drawloom/host/conformance";
import { inside } from "./src/containment.ts";

test("asset store containment conforms to the shared meaning", () => {
  expect(() => pathContainmentConformance(inside)).not.toThrow();
});
