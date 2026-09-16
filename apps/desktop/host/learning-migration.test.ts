import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeJsonStore } from "@drawloom/node-host";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";
import { createDesktopLearningConsent } from "./learning-migration.js";
import { DEFAULT_LOCAL_LEARNING_SCOPE } from "./learning-consent.js";

test("migration reads the original disk configuration even with a replacement, preserves data and restart grants", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-learning-migration-"));
  try {
    const local = createNodeJsonStore(join(root, "knowledge", "state"));
    const stored = {
      ...DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION,
      captureOutcomes: true,
      automaticContext: true,
    };
    await local.set("configuration", stored);
    await local.set("install-evidence", { preserved: true });
    const store = createNodeJsonStore(join(root, "host-test"));
    const first = createDesktopLearningConsent({
      root,
      store,
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
    });
    expect(await first.permits("automaticContext")).toBe(true);
    const record = await first.record();
    const restarted = createDesktopLearningConsent({
      root,
      store,
      declaration: {
        ...DEFAULT_LOCAL_LEARNING_SCOPE,
        automaticContext: {
          ...DEFAULT_LOCAL_LEARNING_SCOPE.automaticContext,
          destinations: ["new:destination"],
        },
      },
    });
    expect(await restarted.permits("automaticContext")).toBe(false);
    expect(await restarted.record()).toEqual(record);
    expect(await local.get("configuration")).toEqual(stored);
    expect(await local.get("install-evidence")).toEqual({ preserved: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
