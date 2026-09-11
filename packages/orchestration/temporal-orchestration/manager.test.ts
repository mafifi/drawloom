import { test, expect } from "bun:test";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import * as provider from "./src/index.js";
test("local manager is lazy, excludes concurrent roots, and rejects escaped module before import", async () => {
  expect(Reflect.get(provider, "createLocalTemporalManager")).toBeFunction();
  const root = await mkdtemp(join(tmpdir(), "drawloom-manager-"));
  const first = provider.createLocalTemporalManager({ dataDirectory: root, temporalPath: "/missing-temporal" });
  const second = provider.createLocalTemporalManager({ dataDirectory: root });
  try {
    expect(await first.listOwners()).toEqual([]);
    await expect(second.listOwners()).rejects.toThrow("owned");
    await writeFile(join(root, "outside.mjs"), "throw Error('must not import')");
    const pkg = join(root, "package");
    await import("node:fs/promises").then((fs) => fs.mkdir(pkg));
    await symlink(join(root, "outside.mjs"), join(pkg, "workflow.mjs"));
    await expect(first.prepare({ projectId: "p", installationId: "i", packageDirectory: pkg, entrypoint: "workflow.mjs" })).rejects.toThrow("containment");
    expect(await first.hasUnfinishedInstallation("i")).toBe(false);
  } finally { await first.close(); await second.close(); await rm(root, { recursive: true, force: true }); }
});
test("missing CLI rejects preparation without leaving owned child processes", async () => {
  expect(Reflect.get(provider, "createLocalTemporalManager")).toBeFunction();
  const root = await mkdtemp(join(tmpdir(), "drawloom-prerequisite-"));
  const manager = provider.createLocalTemporalManager({ dataDirectory: root, temporalPath: "/missing-temporal" });
  try {
    await expect(manager.prepare({ projectId: "p", installationId: "i", packageDirectory: resolve("packages/orchestration/temporal-orchestration"), entrypoint: "fixtures/workflows.mjs" })).rejects.toThrow();
  } finally { await manager.close(); await rm(root, { recursive: true, force: true }); }
});
