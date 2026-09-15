import { expect, test } from "bun:test";
import { sendLiveTurn, type LiveNativeMessage, type LiveSubmission } from "./learning-live-turn.js";

const completed = (threadId: string, turnId: string): LiveNativeMessage => ({
  role: "foreground",
  message: {
    method: "turn/completed",
    params: { threadId, turn: { id: turnId, status: "completed" } },
  },
});

test("a follow-up selects its target and waits for its exact new turn, not the idle other conversation or old completion", async () => {
  let selectedId = "hostile";
  const commands: string[] = [];
  const submissions: LiveSubmission[] = [
    {
      role: "foreground",
      method: "turn/start",
      params: { threadId: "recall-thread" },
      response: { turn: { id: "old-turn" } },
    },
  ];
  const messages: LiveNativeMessage[] = [completed("recall-thread", "old-turn")];
  const checks: boolean[] = [];
  const result = await sendLiveTurn({
    conversationId: "recall",
    text: "Inspect contrary evidence",
    label: "follow-up",
    submissions,
    messages,
    async command(command) {
      commands.push(command.kind);
      if (command.kind === "select_conversation") {
        selectedId = command.conversationId;
        return;
      }
      submissions.push({
        role: "foreground",
        method: "turn/start",
        params: { threadId: "recall-thread" },
        response: { turn: { id: "new-turn" } },
      });
    },
    async until(check) {
      checks.push(await check());
      messages.push(completed("hostile-thread", "new-turn"));
      checks.push(await check());
      messages.push(completed("recall-thread", "old-turn"));
      checks.push(await check());
      messages.push(completed("recall-thread", "new-turn"));
      checks.push(await check());
    },
  });
  expect(selectedId).toBe("recall");
  expect(commands).toEqual(["select_conversation", "send"]);
  expect(checks).toEqual([false, false, false, true]);
  expect(result).toEqual({
    threadId: "recall-thread",
    turnId: "new-turn",
    messages: [completed("recall-thread", "new-turn")],
  });
});
