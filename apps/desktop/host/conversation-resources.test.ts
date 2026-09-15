import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createConversationResources } from "./conversation-resources.js";
import { createDesktopAssets } from "./assets.js";
import { createMediaPolicy } from "./media-policy.js";

test("conversation resources keep one writer per conversation and close owned history", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-conversation-resources-"));
  const history = createSqliteConversationHistory(join(root, "history.sqlite"));
  const state = createNodeJsonStore(join(root, "state"));
  const resources = createConversationResources({
    history,
    evidenceStore: state,
    assets: createDesktopAssets(join(root, "assets")),
    projectAssets: [],
    persist: async () => {},
    mediaPolicy: await createMediaPolicy(state),
    packagesForConversation: async () => ({
      toolSources: new Map(),
      canReadSource: () => false,
    }),
  });
  try {
    expect(resources.writer("one")).toBe(resources.writer("one"));
    expect(resources.writer("one")).not.toBe(resources.writer("two"));
    await resources.writer("one").write({
      id: "entry",
      role: "assistant",
      text: "saved",
      assets: [],
      state: "complete",
    });
    expect((await history.page("one")).entries.map((entry) => entry.text)).toEqual(["saved"]);
    await resources.drainWriters();
    await resources.closeHistory();
    await expect(history.status("one")).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("shutdown drains writers before project persistence and closes history last", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-conversation-resources-"));
  const database = createSqliteConversationHistory(join(root, "history.sqlite"));
  const events: string[] = [];
  const history = {
    ...database,
    commit: async (...args: Parameters<typeof database.commit>) => {
      events.push("writers");
      return database.commit(...args);
    },
    close: async () => {
      events.push("history");
      await database.close();
    },
  };
  const state = createNodeJsonStore(join(root, "state"));
  const resources = createConversationResources({
    history,
    evidenceStore: state,
    assets: createDesktopAssets(join(root, "assets")),
    projectAssets: [],
    persist: async () => {},
    mediaPolicy: await createMediaPolicy(state),
    packagesForConversation: async () => ({ toolSources: new Map(), canReadSource: () => false }),
  });
  try {
    await resources.writer("one").write({
      id: "partial",
      role: "assistant",
      text: "pending",
      assets: [],
      state: "partial",
    });
    await resources.drainWriters();
    events.push("project");
    await resources.closeHistory();
    expect(events).toEqual(["writers", "project", "history"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
