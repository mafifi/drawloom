import { expect, test } from "bun:test";
import { createProjectPluginRuntimes } from "./project-plugin-runtimes.js";

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
