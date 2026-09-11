import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createLocalTemporalManager } from "../dist/index.js";
import { arithmetic } from "@drawloom/orchestration/conformance-fixtures";
const root = await mkdtemp(join(tmpdir(), "drawloom-bun-client-"));
const manager = createLocalTemporalManager({ dataDirectory: root });
try {
  const registration = await manager.prepare({ projectId: "bun", installationId: "synthetic", packageDirectory: resolve("packages/orchestration/temporal-orchestration"), entrypoint: "fixtures/workflows.mjs" });
  await registration.attach(registration.registry.tasks.map((task) => ({ id: task.id, version: task.version, run: (value) => value * 2 })));
  const run = await registration.orchestrator.start("actual-bun-request", arithmetic, 7);
  assert.equal(await registration.orchestrator.result(run), 14);
  assert.equal((await registration.orchestrator.get(run)).status, "completed");
  console.log("BUN_CLIENT_OK");
} finally { await manager.close(); await rm(root, { recursive: true, force: true }); }
