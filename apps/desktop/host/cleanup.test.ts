import { expect, test } from "vitest";
import { cleanup } from "./cleanup.js";

test("cleanup awaits each dependency and retains synchronous and asynchronous failures", async () => {
  const calls: string[] = [];
  const first = new Error("first");
  const second = new Error("second");
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const closing = cleanup([
    () => {
      calls.push("first");
      throw first;
    },
    async () => {
      calls.push("waiting");
      await blocked;
      throw second;
    },
    () => {
      calls.push("last");
    },
  ]);
  await Promise.resolve();
  expect(calls).toEqual(["first", "waiting"]);
  release();
  const error = await closing.catch((error: unknown) => error);
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toEqual([first, second]);
  expect(calls).toEqual(["first", "waiting", "last"]);
});
