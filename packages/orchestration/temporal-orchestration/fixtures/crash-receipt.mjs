import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { matchTaskHandlers } from "@drawloom/orchestration";
import { createReceiptDispatcher } from "../dist/receipts.js";
const root = process.argv[2];
const task = { id: "effect", version: "1", input: z.number(), output: z.number(), limits: { startToCloseTimeoutMs: 60000 } };
const handlers = matchTaskHandlers({ workflows: [], tasks: [task] }, [{ id: "effect", version: "1", run: async () => { await writeFile(join(root, "effect.txt"), "effect submitted"); return new Promise(() => {}); } }]);
await createReceiptDispatcher(root, "owner", handlers).dispatch({ runId: "owner/run", stepId: "owner/run/effect", task: "effect", version: "1", input: 3, attempt: 1, maxAttempts: 2 });
