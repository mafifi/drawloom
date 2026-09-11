import { writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createLocalTemporalManager } from "../dist/index.js";
import { review } from "./recovery.mjs";
const root = process.argv[2];
const manager = createLocalTemporalManager({ dataDirectory: root });
const registration = await manager.prepare({ projectId: "crash", installationId: "crash", packageDirectory: resolve("packages/orchestration/temporal-orchestration"), entrypoint: "fixtures/recovery.mjs" });
await registration.attach([{ id: "write", version: "1", run: async (value) => { await writeFile(join(root, "effect.txt"), "one write"); return value * 2; } }, { id: "slow", version: "1", run: () => 0 }]);
const run = await registration.orchestrator.start("durable", review, 4);
for (;;) {
  const snapshot = await registration.orchestrator.get(run);
  if (snapshot.pendingInputs.length) { await writeFile(join(root, "ready.json"), JSON.stringify({ run, request: snapshot.pendingInputs[0] })); break; }
  await new Promise((resolve) => setTimeout(resolve, 30));
}
await new Promise(() => {});
