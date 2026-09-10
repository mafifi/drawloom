import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { ApplicationFailure } from "@temporalio/common";
import { callBridge, stopChild } from "./temporal-host.ts";
import { createTemporalOrchestrator } from "./temporal.ts";
import type { Client } from "@temporalio/client";
import { fixtureRegistry } from "./fixtures.ts";

test("pagination rejects non-positive, fractional and non-finite limits before provider calls", async () => {
  const engine = createTemporalOrchestrator(
    {} as Client,
    "queue",
    "proof",
    fixtureRegistry,
  );
  for (const limit of [0, -1, 1.5, NaN, Infinity]) {
    await assert.rejects(engine.list({ limit }), /Invalid limit/);
    await assert.rejects(
      engine.getSteps("proof/run", { limit }),
      /Invalid limit/,
    );
  }
});

for (const kind of [
  "lost",
  "malformed",
  "invalid-envelope",
  "http-error",
] as const) {
  test(`bridge ${kind} response is non-retryable unknown with attempt metadata`, async () => {
    let writes = 0;
    const host = createServer(async (request, response) => {
      for await (const _ of request) {
        /* consume request before the synthetic effect */
      }
      writes++;
      if (kind === "lost") response.destroy();
      else if (kind === "malformed") response.end("{broken");
      else if (kind === "invalid-envelope") response.end("{}");
      else {
        response.statusCode = 502;
        response.end('{"value":1}');
      }
    });
    await new Promise<void>((resolve) => host.listen(0, "127.0.0.1", resolve));
    try {
      await assert.rejects(
        callBridge(
          `http://127.0.0.1:${(host.address() as { port: number }).port}`,
          "token",
          { operation: "synthetic-write" },
          1,
        ),
        (error) => {
          assert.ok(error instanceof ApplicationFailure);
          assert.equal(error.type, "unknown");
          assert.equal(error.nonRetryable, true);
          assert.deepEqual(error.details, [1]);
          return true;
        },
      );
      assert.equal(writes, 1);
    } finally {
      await new Promise<void>((resolve) => host.close(() => resolve()));
    }
  });
}

for (const signal of ["SIGTERM", "SIGKILL"] as const) {
  test(`cleanup returns for a child already exited by ${signal} and stops the remaining child`, async () => {
    const ended = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stdio: "ignore",
    });
    const remaining = spawn(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      { stdio: "ignore" },
    );
    const exited = once(ended, "exit");
    ended.kill(signal);
    await exited;
    assert.equal(ended.exitCode, null);
    assert.equal(ended.signalCode, signal);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          await stopChild(ended);
          await stopChild(remaining);
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("cleanup hung after signal exit")),
            150,
          );
        }),
      ]);
      assert.ok(remaining.exitCode !== null || remaining.signalCode !== null);
    } finally {
      clearTimeout(timeout);
      if (remaining.exitCode === null && remaining.signalCode === null) {
        const done = once(remaining, "exit");
        remaining.kill("SIGKILL");
        await done;
      }
    }
  });
}
