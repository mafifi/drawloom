import { expect, test } from "vitest";
import { queueDesktopRequest } from "./request-queue.js";

test("queue admission and invocation cannot be separated by shutdown", async () => {
  let running = true;
  let late = 0;
  const result = queueDesktopRequest(
    Promise.resolve(),
    () => running,
    () => {
      if (!running) late++;
    },
  );
  queueMicrotask(() => {
    running = false;
  });
  await result.catch(() => {});
  expect(late).toBe(0);
});

test("a request waiting behind a predecessor is not dispatched after shutdown", async () => {
  let release!: () => void;
  const prior = new Promise<void>((resolve) => {
    release = resolve;
  });
  let running = true;
  let calls = 0;
  const result = queueDesktopRequest(
    prior,
    () => running,
    () => {
      calls++;
    },
  );
  running = false;
  release();
  await expect(result).rejects.toThrow(/closing/);
  expect(calls).toBe(0);
});
