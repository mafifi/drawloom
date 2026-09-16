import { appendFile, access } from "node:fs/promises";
import { join } from "node:path";
import { serveLocalKnowledgeWorker } from "../dist/worker-server.js";

const launch = JSON.parse(process.argv[2]);
await serveLocalKnowledgeWorker({
  ...launch,
  connectCodex: async () => ({
    async request(method) {
      await appendFile(join(launch.root, "native-calls.jsonl"), JSON.stringify({ method }) + "\n");
      if (method === "initialize") return { userAgent: "codex/0.153.4" };
      if (method === "model/list")
        return {
          data: [
            { model: "gpt-5.6-terra", supportedReasoningEfforts: [{ reasoningEffort: "low" }] },
          ],
          nextCursor: null,
        };
      if (method === "thread/start") return { thread: { id: "synthetic-thread" } };
      if (method === "thread/memoryMode/set") return {};
      if (method === "turn/start") {
        if (
          await access(join(launch.root, "hang-submission")).then(
            () => true,
            () => false,
          )
        )
          await new Promise(() => {});
        return { turn: { id: "synthetic-turn", status: "inProgress" } };
      }
      if (method === "thread/turns/list")
        return { data: [{ id: "synthetic-turn", status: "inProgress" }], nextCursor: null };
      if (method === "turn/interrupt" || method === "thread/archive") return {};
      throw Error("Unsupported synthetic method");
    },
    notify() {},
    respond() {},
    subscribe() {
      return () => {};
    },
    async close() {},
  }),
});
