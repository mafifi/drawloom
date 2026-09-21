import { afterEach, expect, test } from "vitest";
import { createConversationNavigationViewModel } from "./conversation-navigation-view-model.svelte.js";
const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});
const hit = (id: string, extra = {}) => ({
  conversationId: id,
  title: `Title ${id}`,
  workbenchId: "text",
  provider: "synthetic" as const,
  archived: false,
  match: "title" as const,
  ...extra,
});

test("search waits 200ms, defaults to active conversations across projects, and paginates by cursor", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    return Response.json(
      urls.length === 1
        ? { items: [hit("a")], cursor: "next", hasMore: true }
        : { items: [hit("b")], hasMore: false },
    );
  }) as typeof fetch;
  const vm = createConversationNavigationViewModel();
  vm.openSearch();
  vm.query = "needle";
  expect(urls).toEqual([]);
  await new Promise((resolve) => setTimeout(resolve, 220));
  expect(urls[0]).toContain("/api/conversations/search?");
  expect(urls[0]).toContain("q=needle");
  expect(urls[0]).toContain("archived=active");
  expect(urls[0]).toContain("limit=25");
  expect(urls[0]).not.toContain("projectId=");
  await vm.more();
  expect(urls[1]).toContain("cursor=next");
  expect(vm.results.map((item: { conversationId: string }) => item.conversationId)).toEqual([
    "a",
    "b",
  ]);
  vm.closeSearch();
});

test("late search responses cannot replace a newer query and changing filters restarts the page", async () => {
  const releases: Array<(value: Response) => void> = [];
  globalThis.fetch = Object.assign(
    async () => new Promise<Response>((resolve) => releases.push(resolve)),
    { preconnect: original.preconnect },
  );
  const vm = createConversationNavigationViewModel();
  vm.openSearch();
  vm.query = "old";
  await new Promise((resolve) => setTimeout(resolve, 220));
  vm.query = "new";
  await new Promise((resolve) => setTimeout(resolve, 220));
  releases[1]!(Response.json({ items: [hit("new")], hasMore: false }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  releases[0]!(Response.json({ items: [hit("old")], hasMore: false }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(vm.results.map((item: { conversationId: string }) => item.conversationId)).toEqual([
    "new",
  ]);
  vm.projectId = "project-a";
  await new Promise((resolve) => setTimeout(resolve, 220));
  expect(vm.results).toEqual([]);
  expect(vm.loading).toBe(true);
  vm.dispose();
});

test("opening a result binds its stable message identity and management errors retain rename draft", async () => {
  const selected: unknown[] = [],
    around: unknown[] = [],
    commands: unknown[] = [];
  const vm = createConversationNavigationViewModel({
    selectConversation: async (id: string) => {
      selected.push(id);
      return true;
    },
    openAround: async (id: string, entryId: string) => {
      around.push([id, entryId]);
      return true;
    },
    command: async (value: unknown) => {
      commands.push(value);
      return false;
    },
    commandError: () => "Title could not be saved.",
  });
  await vm.openResult({
    ...hit("a"),
    match: "message",
    entryId: "entry-7",
    snippet: "<b>plain</b>",
  });
  expect(selected).toEqual(["a"]);
  expect(around).toEqual([["a", "entry-7"]]);
  vm.beginRename({ id: "a", title: "Old title" });
  vm.renameDraft = " Revised ";
  expect(await vm.saveRename()).toBe(false);
  expect(vm.renameDraft).toBe(" Revised ");
  expect(vm.managementError).toBe("Title could not be saved.");
  expect(commands).toEqual([
    { kind: "rename_conversation", conversationId: "a", title: "Revised" },
  ]);
});

test("an expired pagination cursor restarts the same query and filters from its first page", async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url) => {
    urls.push(String(url));
    if (urls.length === 1)
      return Response.json({ items: [hit("a")], cursor: "expired", hasMore: true });
    if (urls.length === 2) return Response.json({ error: "invalid_cursor" }, { status: 409 });
    return Response.json({ items: [hit("fresh")], hasMore: false });
  }) as typeof fetch;
  const vm = createConversationNavigationViewModel();
  vm.openSearch();
  vm.query = "needle";
  vm.archived = "all";
  vm.projectId = "project-a";
  await new Promise((resolve) => setTimeout(resolve, 220));
  await vm.more();
  expect(urls).toHaveLength(3);
  expect(urls[2]).not.toContain("cursor=");
  expect(urls[2]).toContain("archived=all");
  expect(urls[2]).toContain("projectId=project-a");
  expect(vm.results.map((item: { conversationId: string }) => item.conversationId)).toEqual([
    "fresh",
  ]);
  vm.dispose();
});

test("a failed exact-hit read keeps search open and exposes an inline error", async () => {
  const vm = createConversationNavigationViewModel({
    selectConversation: async () => true,
    openAround: async () => false,
  });
  vm.openSearch();
  expect(await vm.openResult({ ...hit("a"), match: "message", entryId: "missing" })).toBe(false);
  expect(vm.searchOpen).toBe(true);
  expect(vm.searchError).toContain("matching message");
});
