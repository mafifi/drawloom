import { expect, test } from "vitest";
import { mentionToken } from "./mention-token.js";
test("mentions respect caret, selection, whitespace and literal email addresses", () => {
  expect(mentionToken("Ask $edit next", 9)).toEqual({ kind: "skill", start: 4, end: 9 });
  expect(mentionToken("@", 1)).toEqual({ kind: "context", start: 0, end: 1 });
  expect(mentionToken("", 0)).toBeUndefined();
  expect(mentionToken("@foo ", 5)).toBeUndefined();
  expect(mentionToken("a@b", 3)).toBeUndefined();
  expect(mentionToken("$foo", 0)).toBeUndefined();
  expect(mentionToken("$foo", 0, 4)).toBeUndefined();
});
test("slash opens actions at the start without treating URLs or paths as commands", () => {
  expect(mentionToken("/", 1)).toEqual({ kind: "action", start: 0, end: 1 });
  expect(mentionToken("/goal", 5)).toEqual({ kind: "action", start: 0, end: 5 });
  expect(mentionToken("https://example.com", 19)).toBeUndefined();
  expect(mentionToken("/Users/me", 9)).toBeUndefined();
  expect(mentionToken("look /goal", 10)).toBeUndefined();
});
