import { expect, test } from "vitest";
import { describeShutdownFailures } from "./shutdown-report.js";

const secret = "PROVIDER-STDERR-/Users/someone/token=abc123";
const failure = () =>
  new AggregateError(
    [
      new AggregateError(
        [new Error("Transport unavailable", { cause: new Error(secret) })],
        "Desktop cleanup failed",
      ),
    ],
    "Desktop cleanup failed",
  );

test("default shutdown output reports the failure but withholds nested causes", () => {
  const lines = describeShutdownFailures([failure()], { diagnostics: false }).join("\n");
  // The operator still learns what failed and where.
  expect(lines).toContain("Desktop cleanup failed");
  expect(lines).toContain("Transport unavailable");
  // Captured provider output does not appear in logs a user might share.
  expect(lines).not.toContain(secret);
  expect(lines).toContain("set DRAWLOOM_DIAGNOSTICS=1");
});

test("explicit diagnostics include the captured provider output", () => {
  const lines = describeShutdownFailures([failure()], { diagnostics: true }).join("\n");
  expect(lines).toContain("Transport unavailable");
  expect(lines).toContain(secret);
  expect(lines).not.toContain("withheld");
});

test("a failure without a cause is unaffected by the diagnostics setting", () => {
  const plain = [new Error("Desktop closed")];
  expect(describeShutdownFailures(plain, { diagnostics: false }).join("\n")).toContain(
    "Desktop closed",
  );
  expect(describeShutdownFailures(plain, { diagnostics: false })).toEqual(
    describeShutdownFailures(plain, { diagnostics: true }),
  );
});
