import { expect, test } from "vitest";
import { createStdioTransport } from "./src/index.ts";

/** A provider's stderr is retained so a failure can explain itself, but it is
 * untrusted output. These checks hold the boundary: it must reach the caller as
 * a `cause` (never the primary message, which is matched against allow-lists
 * and surfaced to users) and it must be bounded. */
test("a failed provider carries its captured output as a cause, not in the message", async () => {
  const secret = "SENSITIVE-PROVIDER-OUTPUT-a1b2c3";
  const rpc = createStdioTransport({
    command: process.execPath,
    args: ["-e", `process.stderr.write(${JSON.stringify(secret)}); process.exit(3);`],
  });
  const failure = await rpc.request("anything", {}).then(
    () => undefined,
    (error: unknown) => error as Error,
  );
  await rpc.close();
  expect(failure).toBeInstanceOf(Error);
  // The message is what error handling and user-facing surfaces match on.
  expect(failure?.message).toBe("Transport unavailable");
  expect(failure?.message).not.toContain(secret);
  // The detail is available deliberately, to whoever chooses to look.
  expect(String((failure?.cause as Error | undefined)?.message)).toContain(secret);
});

test("retained provider output is bounded", async () => {
  const rpc = createStdioTransport({
    command: process.execPath,
    args: ["-e", "process.stderr.write('x'.repeat(200_000)); process.exit(1);"],
  });
  const failure = await rpc.request("anything", {}).then(
    () => undefined,
    (error: unknown) => error as Error,
  );
  await rpc.close();
  const retained = String((failure?.cause as Error | undefined)?.message ?? "");
  expect(retained.length).toBeGreaterThan(0);
  expect(retained.length).toBeLessThanOrEqual(8 * 1024);
});
