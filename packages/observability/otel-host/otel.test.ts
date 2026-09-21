import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";

// One runtime now ships, so there is one lane. This deliberately launches the
// real Node executable against the source file rather than running inside Vite.
test("OTel host real context, privacy, loopback export and outage", () => {
  const result = spawnSync(process.execPath, [new URL("./verify.ts", import.meta.url).pathname], {
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
});
