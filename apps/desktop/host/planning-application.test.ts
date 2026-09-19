import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, rename, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RpcMessage } from "@drawloom/host";
import { createNodeJsonStore } from "@drawloom/node-host";
import { createDesktopApplication } from "./application.js";

test("installed host path selects planning without a turn and implements the retained proposal exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-planning-app-"));
  const working = join(root, "working");
  await mkdir(working);
  let receive: (message: RpcMessage) => void = () => {};
  const turns: unknown[] = [];
  const app = await createDesktopApplication(join(root, "data"), {
    codex: {
      store: createNodeJsonStore(join(root, "native-state")),
      async connect(cwd) {
        return {
          async request(method, params) {
            if (method === "initialize") return { userAgent: "codex/0.153.4" };
            if (method === "collaborationMode/list")
              return {
                data: [
                  { mode: "plan", model: "test" },
                  { mode: "default", model: "test" },
                ],
              };
            if (method === "model/list") return { data: [], nextCursor: null };
            if (method === "thread/start" || method === "thread/resume")
              return {
                thread: { id: "native", cwd },
                approvalsReviewer: "user",
              };
            if (method === "thread/goal/get") return { goal: null };
            if (method === "thread/read") return { thread: { id: "native", cwd, turns: [] } };
            if (method === "thread/turns/list") return { data: [], nextCursor: null };
            if (method === "turn/start") {
              turns.push(params);
              if (turns.length === 3) {
                await rename(join(root, "data/state"), join(root, "saved-state"));
                await writeFile(join(root, "data/state"), "blocked persistence");
              }
              return { turn: { id: `turn-${turns.length}` } };
            }
            return {};
          },
          notify() {},
          respond() {},
          subscribe(next) {
            receive = next;
            return () => {};
          },
          async close() {},
        };
      },
    },
  });
  try {
    await app.command({ kind: "add_project", directory: working });
    const created = await app.command({
      kind: "create_conversation",
      workbenchId: "text",
      provider: "codex",
    });
    const conversationId = created.selectedId;
    await app.command({ kind: "set_mode", conversationId, mode: "plan" });
    expect(turns).toHaveLength(0);
    await expect(
      app.command({
        kind: "goal",
        conversationId,
        command: { action: "create", objective: "Do work" },
      }),
    ).rejects.toThrow("Leave Plan mode");
    await app.command({
      kind: "send",
      conversationId,
      text: "Plan this",
      attachmentKeys: [],
      contextArtifactIds: [],
    });
    expect(turns[0]).toMatchObject({ collaborationMode: { mode: "plan" } });
    receive({
      method: "item/completed",
      params: {
        threadId: "native",
        turnId: "turn-1",
        item: {
          id: "proposal",
          type: "plan",
          text: "Inspect files. Report findings.",
        },
      },
    });
    receive({
      method: "turn/completed",
      params: {
        threadId: "native",
        turn: { id: "turn-1", status: "completed" },
      },
    });
    for (let i = 0; i < 30; i++) await Bun.sleep(1);
    const proposal = (await app.historyPage(conversationId)).entries.find(
      (e) => e.origin.kind === "proposal",
    );
    expect(proposal?.state).toBe("complete");
    await app.command({
      kind: "implement_plan",
      conversationId,
      proposalId: proposal!.id,
    });
    expect(turns[1]).toMatchObject({
      collaborationMode: { mode: "default" },
      input: [
        {
          type: "text",
          text: expect.stringMatching(
            /^Implement the following plan:\n\nInspect files\. Report findings\.\n\n<drawloom-reference /,
          ),
        },
      ],
    });
    receive({
      method: "turn/completed",
      params: {
        threadId: "native",
        turn: { id: "turn-2", status: "completed" },
      },
    });
    for (let i = 0; i < 30; i++) await Bun.sleep(1);
    await expect(
      app.command({
        kind: "implement_plan",
        conversationId,
        proposalId: proposal!.id,
      }),
    ).rejects.toThrow("already");
    expect(turns).toHaveLength(2);
    try {
      await expect(
        app.command({
          kind: "send",
          conversationId,
          text: "Continue",
          attachmentKeys: [],
          contextArtifactIds: [],
        }),
      ).rejects.toThrow();
      expect((await app.snapshot()).activeOperation).toBeDefined();
    } finally {
      await unlink(join(root, "data/state"));
      await rename(join(root, "saved-state"), join(root, "data/state"));
    }
    receive({
      method: "turn/completed",
      params: {
        threadId: "native",
        turn: { id: "turn-3", status: "completed" },
      },
    });
    for (let i = 0; i < 30; i++) await Bun.sleep(1);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
