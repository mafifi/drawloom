import { expect, test } from "vitest";
import { conversationHistoryConformance } from "@drawloom/conversation-history/conformance";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("SQLite implements the conversation history contract", async () => {
  const provider = await import("./src/index.js").catch(() => undefined);
  expect(provider?.createSqliteConversationHistory).toBeTypeOf("function");
  const directory = mkdtempSync(join(tmpdir(), "drawloom-history-conformance-"));
  try {
    await conversationHistoryConformance(() =>
      provider!.createSqliteConversationHistory(join(directory, "history.db")),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
