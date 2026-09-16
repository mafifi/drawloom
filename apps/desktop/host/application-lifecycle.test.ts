import { expect, test } from "bun:test";
import { createApplicationLifecycle } from "./application-lifecycle.js";

test("closing rejects new work and drains admitted work before releasing dependencies", async () => {
  const lifecycle = createApplicationLifecycle();
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  const admitted = lifecycle.run(async () => {
    await blocked;
    calls.push("work");
  });
  const closing = lifecycle.close(
    () => {
      calls.push("cancel");
    },
    async () => {
      calls.push("release");
    },
  );
  expect(lifecycle.state).toBe("closing");
  await expect(
    lifecycle.run(async () => {
      calls.push("late");
    }),
  ).rejects.toThrow(/closing/);
  expect(calls).toEqual(["cancel"]);
  release();
  await admitted;
  await closing;
  expect(calls).toEqual(["cancel", "work", "release"]);
  expect(lifecycle.state).toBe("closed");
});

test("cleanup failure is retained and concurrent closes join the same operation", async () => {
  const lifecycle = createApplicationLifecycle();
  const failure = Error("cleanup");
  let calls = 0;
  const first = lifecycle.close(
    () => {},
    async () => {
      calls++;
      throw failure;
    },
  );
  const second = lifecycle.close(
    () => {},
    async () => {
      calls++;
    },
  );
  expect(first).toBe(second);
  await expect(first).rejects.toBe(failure);
  expect(lifecycle.state).toBe("closed");
  expect(calls).toBe(1);
  expect(
    lifecycle.close(
      () => {},
      async () => {},
    ),
  ).toBe(first);
});

test("a cancellation hook failure cannot bypass draining or dependency cleanup", async () => {
  const lifecycle = createApplicationLifecycle();
  const failure = Error("cancel hook failed");
  let released = false;
  const closing = Promise.resolve().then(() =>
    lifecycle.close(
      () => {
        throw failure;
      },
      async () => {
        released = true;
      },
    ),
  );
  await expect(closing).rejects.toBeInstanceOf(AggregateError);
  expect(released).toBe(true);
  expect(lifecycle.state).toBe("closed");
});

test("optional background startup checks shutdown again at dispatch", async () => {
  const lifecycle = createApplicationLifecycle();
  let starts = 0;
  const starting = lifecycle.run(() => {
    lifecycle.assertRunning();
    starts++;
  });
  const closing = lifecycle.close(
    () => {},
    async () => {},
  );
  await expect(starting).rejects.toThrow(/closing/);
  await closing;
  expect(starts).toBe(0);
});
