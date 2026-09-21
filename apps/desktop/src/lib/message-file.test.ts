import { expect, test } from "vitest";
import { messageFile } from "./message-file.js";

test("message files use the bound project and existing file route", () => {
  expect(messageFile("/work/project/audio.wav", "thread", "/work/project")?.url).toBe(
    "/api/files?conversationId=thread&path=audio.wav",
  );
  for (const path of [
    "/etc/passwd",
    "../other.wav",
    "/work/project/../other.wav",
    "//evil.test/a",
    "javascript:x",
  ])
    expect(messageFile(path, "thread", "/work/project")).toBeUndefined();
});
