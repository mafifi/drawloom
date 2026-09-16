import { test, expect } from "bun:test";
import { mkdtemp, mkdir, rm, rename } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDesktopApplication } from "./application.js";
import type { createLocalTemporalManager } from "@drawloom/temporal-orchestration";

// This lane exercises persisted projects and navigation, not Temporal recovery.
// Restoring conversations must not start a real external runtime in this fixture.
const unavailableOrchestration = async (): Promise<
  ReturnType<typeof createLocalTemporalManager>
> => ({
  prepare: async () => {
    throw Error("Orchestration unavailable in project-state fixture");
  },
  prepareHost: async () => {
    throw Error("Orchestration unavailable in project-state fixture");
  },
  listOwners: async () => [],
  listHostOwners: async () => [],
  hasUnfinishedInstallation: async () => false,
  close: async () => {},
});

test("desktop foreground tools use the startup-selected authorizer", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-foreground-policy-"));
  await mkdir(join(root, "working"));
  let allow = false,
    decisions = 0;
  const app = await createDesktopApplication(join(root, "data"), {
    authorizer: {
      authorize: async (request) => {
        expect(request.action.name).toBe("invoke");
        decisions++;
        return { decision: allow };
      },
    },
  });
  try {
    await app.command({ kind: "add_project", directory: join(root, "working") });
    const created = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "synthetic",
    });
    const send = async () => {
      await app.command({
        kind: "send",
        conversationId: created.selectedId,
        text: "Inspect public example",
        attachmentKeys: [],
        contextArtifactIds: [],
      });
      for (let i = 0; i < 100 && (await app.snapshot()).activeOperation; i++)
        await new Promise((resolve) => setTimeout(resolve, 5));
      expect((await app.snapshot()).activeOperation).toBeUndefined();
    };
    await send();
    expect(decisions).toBeGreaterThan(0);
    expect((await app.snapshot()).activity.at(-1)?.outcome).toEqual({
      status: "failed",
      code: "denied",
      execution: "not_started",
    });
    allow = true;
    await send();
    expect((await app.snapshot()).activity.at(-1)?.outcome.status).toBe("ok");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("new conversations require a directory and workbench state stays with its project across navigation and restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-project-app-"));
  let app: Awaited<ReturnType<typeof createDesktopApplication>> | undefined;
  try {
    await mkdir(join(root, "one"));
    await mkdir(join(root, "two"));
    app = await createDesktopApplication(join(root, "data"), {
      orchestration: { manager: unavailableOrchestration },
    });
    expect((await app.snapshot()).conversations).toHaveLength(0);
    await expect(
      app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" }),
    ).rejects.toThrow("project");
    const first = await app.command({ kind: "add_project", directory: join(root, "one") });
    const one = first.selectedProjectId!;
    const c1 = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "synthetic",
    });
    await app.command({
      kind: "send",
      conversationId: c1.selectedId,
      text: "Only project one",
      attachmentKeys: [],
      contextArtifactIds: [],
    });
    for (let i = 0; i < 100 && (await app.snapshot()).activeOperation; i++)
      await new Promise((r) => setTimeout(r, 5));
    expect((await app.snapshot()).operator.artifacts.length).toBeGreaterThan(0);
    await app.command({ kind: "add_project", directory: join(root, "two") });
    const c2 = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "synthetic",
    });
    expect(c2.operator.artifacts).toHaveLength(0);
    await app.command({ kind: "select_conversation", conversationId: c1.selectedId });
    expect((await app.snapshot()).selectedProjectId).toBe(one);
    expect((await app.snapshot()).operator.artifacts.length).toBeGreaterThan(0);
    await app.close();
    app = await createDesktopApplication(join(root, "data"), {
      orchestration: { manager: unavailableOrchestration },
    });
    expect((await app.snapshot()).selectedProjectId).toBe(one);
    expect((await app.snapshot()).operator.artifacts.length).toBeGreaterThan(0);
    await app.command({ kind: "select_conversation", conversationId: c2.selectedId });
    expect((await app.snapshot()).operator.artifacts).toHaveLength(0);
  } finally {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("explicitly adding a replaced directory creates a new binding, never retargets old conversations", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-replaced-project-"));
  await mkdir(join(root, "working"));
  const app = await createDesktopApplication(join(root, "data"));
  try {
    await app.command({ kind: "add_project", directory: join(root, "working") });
    const old = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "synthetic",
    });
    await rename(join(root, "working"), join(root, "original"));
    await mkdir(join(root, "working"));
    const next = await app.command({ kind: "add_project", directory: join(root, "working") });
    expect(next.selectedProjectId).not.toBe(old.selectedProjectId);
    expect(next.projects).toHaveLength(2);
    expect(next.conversations[0]?.projectId).toBe(old.selectedProjectId);
    await expect(app.openWorkingFile(old.selectedId, "file.txt")).rejects.toThrow("changed");
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
