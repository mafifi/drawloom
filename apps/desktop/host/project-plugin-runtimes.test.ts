import { expect, test } from "vitest";
import { createProjectPluginRuntimes } from "./project-plugin-runtimes.js";

test("shutdown drains pending creation without publishing and rejects new runtime access", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let creates = 0;
  let closes = 0;
  const runtimes = createProjectPluginRuntimes({
    available: async () => true,
    create: async () => {
      creates++;
      await blocked;
      return { activated: true };
    },
    replace: async () => {},
    close: async () => {
      closes++;
    },
  });
  const first = runtimes.forProject().catch((error: unknown) => error);
  const closing = runtimes.close();
  expect(runtimes.close()).toBe(closing);
  release();
  expect(await first).toBeInstanceOf(Error);
  await closing;
  await expect(runtimes.forProject()).rejects.toThrow(/closed|closing/i);
  expect(creates).toBe(1);
  expect(closes).toBe(1);
});

test("an offline availability recheck cannot return a runtime retired during its wait", async () => {
  let release!: () => void;
  let enter!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  let checks = 0;
  let closes = 0;
  const runtimes = createProjectPluginRuntimes({
    available: async () => {
      if (++checks === 2) {
        enter();
        await blocked;
      }
      return false;
    },
    create: async () => ({ activated: false }),
    replace: async () => {},
    close: async () => {
      closes++;
    },
  });
  const access = runtimes
    .forProject({ id: "offline", name: "Offline", directory: "/offline", device: "1", inode: "1" })
    .catch((error: unknown) => error);
  await entered;
  await runtimes.close();
  release();
  expect(await access).toBeInstanceOf(Error);
  expect(closes).toBe(1);
});

test("both callers sharing reactivation reject a runtime retired before activation finishes", async () => {
  let online = false;
  let release!: () => void;
  let enter!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  let creates = 0;
  let closes = 0;
  const runtimes = createProjectPluginRuntimes({
    available: async () => online,
    create: async (_binding, activated) => {
      if (++creates === 2) {
        enter();
        await blocked;
      }
      return { activated };
    },
    replace: async () => {},
    close: async () => {
      closes++;
    },
  });
  const project = { id: "one", name: "One", directory: "/one", device: "1", inode: "1" };
  await runtimes.forProject(project);
  online = true;
  const first = runtimes.forProject(project).catch((error: unknown) => error);
  const second = runtimes.forProject(project).catch((error: unknown) => error);
  await entered;
  const closing = runtimes.close();
  release();
  const results = await Promise.all([first, second]);
  await closing;
  expect(results.every((result) => result instanceof Error)).toBe(true);
  expect(closes).toBe(1);
});

test("failed retirement still waits for peers and closes runtimes created during cleanup", async () => {
  const runtimes = new Map([
    ["one", Promise.resolve({ id: "one" })],
    ["two", Promise.resolve({ id: "two" })],
  ]);
  const retired: string[] = [];
  const failure = new Error("Failed to close one");
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let settled = false;
  const closing = (await import("./project-plugin-runtimes.js"))
    .retireCreatedRuntimes(runtimes, async (runtime) => {
      if (runtime.id === "one") throw failure;
      if (runtime.id === "two") {
        await blocked;
        runtimes.set("three", Promise.resolve({ id: "three" }));
      }
      retired.push(runtime.id);
    })
    .catch((error: unknown) => {
      settled = true;
      return error;
    });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const settledBeforeRelease = settled;
  release();
  const error = await closing;
  expect(settledBeforeRelease).toBe(false);
  expect(retired).toEqual(["two", "three"]);
  expect(error).toBeInstanceOf(AggregateError);
  expect((error as AggregateError).errors).toContain(failure);
});

test("project runtimes are lazy, share startup, reactivate one offline placeholder, and close once", async () => {
  const available = new Set<string>();
  const created: string[] = [];
  const closed: string[] = [];
  const runtimes = createProjectPluginRuntimes({
    available: async (binding) => available.has(binding.id),
    create: async (binding, activated) => {
      created.push(`${binding?.id ?? "legacy"}:${activated}`);
      return { activated, id: `${binding?.id ?? "legacy"}:${activated}` };
    },
    replace: async (runtime) => {
      closed.push(runtime.id);
    },
    close: async (runtime) => {
      closed.push(runtime.id);
    },
  });
  const project = {
    id: "one",
    name: "One",
    directory: "/one",
    device: "device",
    inode: "inode",
  };

  expect(created).toEqual([]);
  const [first, shared] = await Promise.all([
    runtimes.forProject(project),
    runtimes.forProject(project),
  ]);
  expect(first).toBe(shared);
  expect(created).toEqual(["one:false"]);

  available.add("one");
  const active = await runtimes.forProject(project);
  expect(active).not.toBe(first);
  expect(created).toEqual(["one:false", "one:true"]);
  expect(closed).toEqual(["one:false"]);

  await runtimes.close();
  expect(closed).toEqual(["one:false", "one:true"]);
});

test("retirement includes runtimes created while retirement is in progress", async () => {
  let release!: () => void;
  const first = new Promise<{ id: string }>((resolve) => {
    release = () => resolve({ id: "one" });
  });
  const runtimes = new Map<string, Promise<{ id: string }>>([["one", first]]);
  const retired: string[] = [];
  const retirement = (await import("./project-plugin-runtimes.js")).retireCreatedRuntimes(
    runtimes,
    async (runtime) => {
      retired.push(runtime.id);
      if (runtime.id === "one") runtimes.set("two", Promise.resolve({ id: "two" }));
    },
  );
  release();
  await retirement;
  expect(retired).toEqual(["one", "two"]);
});
