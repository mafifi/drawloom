import { test, expect } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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

test("host owners persist and list outside plugin installation ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-host-owner-"));
  const manager = provider.createLocalTemporalManager({ dataDirectory: root });
  try {
    const orchestration = join(root, "orchestration");
    await mkdir(join(orchestration, "owners"), { recursive: true });
    await mkdir(join(orchestration, "host-owners"), { recursive: true });
    await writeFile(join(orchestration, "owners", "plugin.json"), JSON.stringify({
      projectId: "project", installationId: "installation", packageDirectory: "/plugin", entrypoint: "workflow.mjs", bundleFingerprint: "plugin-bundle", owner: "plugin-owner",
    }));
    await writeFile(join(orchestration, "host-owners", "host.json"), JSON.stringify({
      capabilityId: "knowledge-maintenance", packageDirectory: "/host", entrypoint: "workflow.mjs", bundleFingerprint: "host-bundle", owner: "host-owner",
    }));
    const listHostOwners = Reflect.get(manager, "listHostOwners");
    expect(listHostOwners).toBeFunction();
    expect(await listHostOwners.call(manager)).toEqual([{
      capabilityId: "knowledge-maintenance", packageDirectory: "/host", entrypoint: "workflow.mjs", bundleFingerprint: "host-bundle", owner: "host-owner",
    }]);
    expect(await manager.listOwners()).toHaveLength(1);
    expect(await manager.hasUnfinishedInstallation("knowledge-maintenance")).toBe(false);
  } finally { await manager.close(); await rm(root, { recursive: true, force: true }); }
});

test("host preparation has a strict host capability scope and no project or installation identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-prepare-host-"));
  const manager = provider.createLocalTemporalManager({ dataDirectory: root, temporalPath: "/missing-temporal" });
  try {
    const prepareHost = Reflect.get(manager, "prepareHost");
    expect(prepareHost).toBeFunction();
    await expect(prepareHost.call(manager, {
      capabilityId: "knowledge-maintenance", projectId: "fake", installationId: "fake",
      packageDirectory: resolve("packages/orchestration/temporal-orchestration"), entrypoint: "fixtures/workflows.mjs",
    })).rejects.toThrow();
    const outside = join(root, "outside.mjs");
    await writeFile(outside, "throw Error('must not import')");
    const pkg = join(root, "package");
    await mkdir(pkg);
    await symlink(outside, join(pkg, "workflow.mjs"));
    await expect(prepareHost.call(manager, { capabilityId: "knowledge-maintenance", packageDirectory: pkg, entrypoint: "workflow.mjs" })).rejects.toThrow("containment");
    expect(await manager.listOwners()).toEqual([]);
    expect(await manager.listHostOwners()).toEqual([]);
  } finally { await manager.close(); await rm(root, { recursive: true, force: true }); }
});
