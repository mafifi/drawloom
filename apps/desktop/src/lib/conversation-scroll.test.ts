import { expect, test } from "bun:test";
import { ConversationScroll, conversationTurns } from "./conversation-scroll.js";

test("opening waits for history and follows the tail, including late media layout", () => {
  const state = new ConversationScroll();
  expect(state.update("a", true, false, false)).toBe(false);
  expect(state.update("a", false, true, false)).toBe(true);
  expect(state.following).toBe(true);
  state.scrolled(100, 400, 2000);
  expect(state.update("a", false, true, false)).toBe(false);
  expect(state.update("b", true, false, false)).toBe(false);
  expect(state.update("b", false, true, false)).toBe(true);
});

test("search and earlier navigation override tail following, latest explicitly restores it", () => {
  const state = new ConversationScroll();
  expect(state.update("a", false, true, true)).toBe(false);
  expect(state.following).toBe(false);
  state.latest();
  expect(state.update("a", false, true, false)).toBe(true);
  state.leaveTail();
  expect(state.following).toBe(false);
  state.scrolled(1600, 400, 2000);
  expect(state.following).toBe(true);
});

test("rail groups user turns with bounded response previews, including attachment-only prompts", () => {
  expect(
    conversationTurns([
      { id: "orphan", role: "assistant", text: "Earlier response" },
      { id: "a", role: "user", text: "  First\n request " },
      { id: "b", role: "assistant", text: "x".repeat(1000) },
      { id: "c", role: "user", text: "" },
    ]),
  ).toEqual([
    { id: "a", prompt: "First request", response: `${"x".repeat(159)}…` },
    { id: "c", prompt: "Message with attachments", response: "" },
  ]);
});
