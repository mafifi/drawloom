import { expect, test } from "vitest";
import { pathContainmentConformance } from "@drawloom/host/conformance";
import { insidePath } from "./src/containment.ts";

test("package boundary containment conforms to the shared meaning", () => {
  expect(() => pathContainmentConformance(insidePath)).not.toThrow();
});
