import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { HistoryOriginSchema } from "@drawloom/conversation-history";
import { convertConversationHistory } from "@drawloom/sqlite-conversation-history";

const [database, backup, manifest, ...extra] = process.argv.slice(2);
if (!database || !backup || !manifest || extra.length) {
  throw Error(
    "Stop the desktop, then use: bun scripts/convert-history.ts <database> <new-backup> <verified-provenance.json>. No history is inferred or deleted.",
  );
}
const provenance = z
  .array(
    z
      .object({
        conversationId: z.string().min(1),
        id: z.string().min(1),
        origin: HistoryOriginSchema,
      })
      .strict(),
  )
  .parse(JSON.parse(await readFile(resolve(manifest), "utf8")));
const result = convertConversationHistory(resolve(database), resolve(backup), provenance);
console.log(JSON.stringify(result));
