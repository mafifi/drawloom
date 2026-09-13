import { expect, test } from "bun:test";
import { coveredMilliseconds } from "./measurement.mjs";

test("measurement counts overlapping callback time once, not once per scorer", () => {
  expect(coveredMilliseconds([[3, 8], [1, 4], [10, 12]])).toBe(9);
  expect(coveredMilliseconds([])).toBe(0);
});
