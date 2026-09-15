import { expect, test, spyOn } from "bun:test";
import * as synthetic from "@drawloom/synthetic-agent";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createSqliteConversationHistory } from "@drawloom/sqlite-conversation-history";
import { createTestDesktopApplication as createDesktopApplication } from "./test-project.fixture.js";
import { serveDesktop } from "./server.js";

test("authenticated cached search, exact around reads, and durable conversation organisation preserve ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-history-search-"));
  let app = await createDesktopApplication(root);
  let server: ReturnType<typeof serveDesktop> | undefined;
  try {
    const initial = await app.snapshot(),
      first = initial.selectedId,
      projectId = initial.selectedProjectId!;
    const store = createSqliteConversationHistory(join(root, "history.sqlite"));
    await store.commit(first, {
      expectedRevision: 0,
      entries: [
        {
          id: "one",
          position: [0, 0],
          role: "user",
          text: "A quiet public synthetic beginning",
          assets: [],
          state: "complete",
        },
        {
          id: "needle",
          position: [0, 1],
          role: "assistant",
          text: "The harbour lighthouse needle appears here",
          assets: [],
          state: "complete",
        },
        {
          id: "three",
          position: [0, 2],
          role: "assistant",
          text: "A bounded ending",
          assets: [],
          state: "complete",
        },
      ],
    });
    await store.close();
    await app.command({ kind: "set_conversation_pinned", conversationId: first, pinned: true });
    expect((await app.snapshot()).conversations.find((c) => c.id === first)?.pinned).toBe(true);
    await app.command({
      kind: "rename_conversation",
      conversationId: first,
      title: "Harbour notes",
    });
    expect((await app.snapshot()).conversations[0]).toMatchObject({
      title: "Harbour notes",
      manualTitle: "Harbour notes",
      archived: false,
      projectId,
    });
    const around = await app.historyAround(first, { entryId: "needle", before: 1, after: 1 });
    expect(around.entries.map((entry) => entry.id)).toEqual(["one", "needle", "three"]);
    expect(around.anchorIndex).toBe(1);
    const byTitle = await app.searchConversations({
      query: "harbour",
      projectId,
      archived: "active",
    });
    expect(byTitle.items).toContainEqual(
      expect.objectContaining({
        conversationId: first,
        title: "Harbour notes",
        match: "title",
        archived: false,
        projectId,
      }),
    );
    const titlePage = await app.searchConversations({
      query: "harbour",
      projectId,
      archived: "active",
      limit: 1,
    });
    expect(titlePage).toMatchObject({ hasMore: true, items: [{ match: "title" }] });
    const messagePage = await app.searchConversations({
      query: "harbour",
      projectId,
      archived: "active",
      limit: 1,
      cursor: titlePage.cursor,
    });
    expect(messagePage.items).toContainEqual(
      expect.objectContaining({ entryId: "needle", match: "message" }),
    );
    await app.command({
      kind: "rename_conversation",
      conversationId: first,
      title: "Renamed harbour",
    });
    await expect(
      app.searchConversations({
        query: "harbour",
        projectId,
        archived: "active",
        limit: 1,
        cursor: titlePage.cursor,
      }),
    ).rejects.toMatchObject({ code: "invalid_cursor" });
    await app.command({
      kind: "rename_conversation",
      conversationId: first,
      title: "Harbour notes",
    });
    const byMessage = await app.searchConversations({
      query: "lighthouse",
      projectId,
      archived: "active",
    });
    expect(byMessage.items).toContainEqual(
      expect.objectContaining({
        conversationId: first,
        entryId: "needle",
        match: "message",
        snippet: expect.stringContaining("lighthouse"),
      }),
    );
    await app.command({ kind: "archive_conversation", conversationId: first });
    expect(
      (await app.searchConversations({ query: "lighthouse", projectId, archived: "active" })).items,
    ).toEqual([]);
    expect(
      (await app.searchConversations({ query: "lighthouse", projectId, archived: "archived" }))
        .items[0],
    ).toMatchObject({ conversationId: first, archived: true });
    await app.close();
    app = await createDesktopApplication(root);
    expect((await app.snapshot()).conversations.find((c) => c.id === first)?.pinned).toBe(true);
    await app.command({ kind: "set_conversation_pinned", conversationId: first, pinned: false });
    expect((await app.snapshot()).conversations.find((c) => c.id === first)?.pinned).toBe(false);
    expect((await app.snapshot()).conversations[0]).toMatchObject({
      title: "Harbour notes",
      manualTitle: "Harbour notes",
      archived: true,
      projectId,
    });
    await app.command({ kind: "restore_conversation", conversationId: first });
    server = serveDesktop(app, resolve("apps/desktop/build"));
    expect((await fetch(server.origin + "/api/conversations/search?q=lighthouse")).status).toBe(
      401,
    );
    expect(
      (
        await fetch(
          server.origin + "/api/history/around?conversationId=" + first + "&entryId=needle",
        )
      ).status,
    ).toBe(401);
    const boot = await fetch(server.url, { redirect: "manual" }),
      headers = { cookie: boot.headers.get("set-cookie")!.split(";")[0]! };
    expect(
      (
        await fetch(
          server.origin +
            "/api/conversations/search?" +
            new URLSearchParams({ q: "lighthouse", projectId, archived: "active" }),
          { headers },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await fetch(
          server.origin +
            "/api/history/around?" +
            new URLSearchParams({
              conversationId: first,
              entryId: "needle",
              before: "1",
              after: "1",
            }),
          { headers },
        )
      ).status,
    ).toBe(200);
  } finally {
    if (server) await server.close();
    else await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("archive and restore roll back metadata and selection when project persistence fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-history-rollback-"));
  const app = await createDesktopApplication(root);
  const stateDirectory = join(root, "state");
  try {
    const id = (await app.snapshot()).selectedId;
    await chmod(stateDirectory, 0o500);
    await expect(
      app.command({ kind: "set_conversation_pinned", conversationId: id, pinned: true }),
    ).rejects.toThrow();
    expect((await app.snapshot()).conversations.find((c) => c.id === id)?.pinned ?? false).toBe(
      false,
    );
    await expect(
      app.command({ kind: "archive_conversation", conversationId: id }),
    ).rejects.toThrow();
    expect((await app.snapshot()).conversations.find((c) => c.id === id)?.archived).toBe(false);
    expect((await app.snapshot()).selectedId).toBe(id);
    await chmod(stateDirectory, 0o700);
    await app.command({ kind: "archive_conversation", conversationId: id });
    await chmod(stateDirectory, 0o500);
    await expect(
      app.command({ kind: "restore_conversation", conversationId: id }),
    ).rejects.toThrow();
    expect((await app.snapshot()).conversations.find((c) => c.id === id)?.archived).toBe(true);
  } finally {
    await chmod(stateDirectory, 0o700).catch(() => {});
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("archive rejects active work and manual titles survive automatic naming", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-history-organise-"));
  let finish!: () => void;
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const original = synthetic.createSyntheticDriver;
  const replacement = spyOn(synthetic, "createSyntheticDriver").mockImplementation((respond) =>
    original(async (text, context) => {
      await held;
      return respond(text, context);
    }),
  );
  const app = await createDesktopApplication(root);
  try {
    const id = (await app.snapshot()).selectedId;
    await app.command({ kind: "rename_conversation", conversationId: id, title: "Chosen by hand" });
    await app.command({
      kind: "send",
      conversationId: id,
      text: "This automatic title must not replace the manual title",
      attachmentKeys: [],
      contextArtifactIds: [],
    });
    expect((await app.snapshot()).conversations.find((c) => c.id === id)?.title).toBe(
      "Chosen by hand",
    );
    await app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" });
    expect((await app.snapshot()).selectedId).not.toBe(id);
    expect((await app.snapshot()).archiveBlockedConversationIds).toContain(id);
    await expect(app.command({ kind: "archive_conversation", conversationId: id })).rejects.toThrow(
      "active",
    );
  } finally {
    finish();
    replacement.mockRestore();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("archive rejects a known unresolved approval even after provider operation completion", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-history-pending-"));
  const replacement = spyOn(synthetic, "createSyntheticDriver").mockImplementation(
    () =>
      ({
        driverId: "synthetic",
        async openSession(input: any) {
          const queue: any[] = [];
          let wake: (() => void) | undefined,
            closed = false;
          const emit = (value: any) => {
            queue.push(value);
            wake?.();
            wake = undefined;
          };
          return {
            status: "ok" as const,
            value: {
              sessionId: input.sessionId,
              reviewerModes: ["human"] as const,
              signals() {
                return {
                  async *[Symbol.asyncIterator]() {
                    while (!closed || queue.length) {
                      if (queue.length) yield queue.shift();
                      else await new Promise<void>((resolve) => (wake = resolve));
                    }
                  },
                };
              },
              async execute(operation: any) {
                emit({ kind: "operation.started", operationId: operation.operationId });
                emit({
                  kind: "approval.requested",
                  request: {
                    approvalId: "pending-approval",
                    operationId: operation.operationId,
                    summary: "Synthetic pending approval",
                    options: [{ optionId: "decline", label: "Decline" }],
                  },
                });
                emit({ kind: "operation.completed", operationId: operation.operationId });
                return { status: "ok" as const, value: { operationId: operation.operationId } };
              },
              async resolveApproval() {
                return {
                  status: "rejected" as const,
                  failure: { code: "invalid_interaction" as const, message: "invalid interaction" },
                };
              },
              async respondToInput() {
                return {
                  status: "rejected" as const,
                  failure: { code: "invalid_interaction" as const, message: "invalid interaction" },
                };
              },
              async close() {
                closed = true;
                wake?.();
                return { status: "ok" as const, value: undefined };
              },
            },
          };
        },
      }) as any,
  );
  const app = await createDesktopApplication(root);
  try {
    const id = (await app.snapshot()).selectedId;
    await app.command({
      kind: "send",
      conversationId: id,
      text: "Pending interaction",
      attachmentKeys: [],
      contextArtifactIds: [],
    });
    for (let i = 0; i < 50 && (await app.snapshot()).activeOperation; i++) await Bun.sleep(2);
    expect((await app.snapshot()).activeOperation).toBeUndefined();
    await app.command({ kind: "create_conversation", workbenchId: "text", provider: "synthetic" });
    expect((await app.snapshot()).selectedId).not.toBe(id);
    expect((await app.snapshot()).archiveBlockedConversationIds).toContain(id);
    await expect(app.command({ kind: "archive_conversation", conversationId: id })).rejects.toThrow(
      "approval",
    );
  } finally {
    replacement.mockRestore();
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
