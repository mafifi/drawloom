import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { createLocalTemporalManager } from "@drawloom/temporal-orchestration";
import { createOrchestrationComposition } from "./orchestration-composition.js";

test("desktop orchestration shares one lazy manager with host-owned orchestration", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-orchestration-composition-"));
  let creates = 0;
  let closes = 0;
  const manager = {
    listOwners: async () => [],
    hasUnfinishedInstallation: async () => false,
    close: async () => {
      closes++;
    },
  } as unknown as ReturnType<typeof createLocalTemporalManager>;
  const composition = createOrchestrationComposition({
    dataDirectory: root,
    createManager: async () => {
      creates++;
      return manager;
    },
    ensureProject: async () => {},
  });
  try {
    expect(creates).toBe(0);
    await composition.host.restore();
    expect(creates).toBe(0);
    expect(await composition.manager()).toBe(manager);
    expect(await composition.manager()).toBe(manager);
    expect(creates).toBe(1);
    await composition.host.close();
    expect(closes).toBe(0);
    await composition.closeManager();
    expect(closes).toBe(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
