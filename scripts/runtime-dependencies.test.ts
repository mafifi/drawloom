import { expect, test } from "vitest";
import { runtimeDependencies } from "./runtime-dependencies.ts";

test("required peers enter product closure; dev dependencies do not", () => {
  expect(
    runtimeDependencies({
      dependencies: { core: "1" },
      peerDependencies: { adapter: "1" },
      devDependencies: { test: "1" },
    }),
  ).toEqual([
    { name: "core", optional: false },
    { name: "adapter", optional: false },
  ]);
});
test("installed optional peers are inspected but their absence is not a required dependency failure", () => {
  expect(
    runtimeDependencies({
      peerDependencies: { optional: "1" },
      peerDependenciesMeta: { optional: { optional: true } },
    }),
  ).toEqual([{ name: "optional", optional: true }]);
});
