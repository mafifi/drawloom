import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { orchestrationConformance, taskHandler } from "@drawloom/orchestration/conformance";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
import * as provider from "./dist/index.js";
import * as agent from "./dist/agent-bridge.js";
import { review, active, transformed } from "./fixtures/recovery.mjs";
import { workflows } from "@drawloom/orchestration/conformance-fixtures";
import { command } from "./dist/processes.js";
import { createReceiptDispatcher } from "./dist/receipts.js";
import { matchTaskHandlers } from "@drawloom/orchestration";
import { z } from "zod";

async function until(read, predicate) {
  for (let i = 0; i < 300; i++) { const value = await read(); if (predicate(value)) return value; await new Promise((resolve) => setTimeout(resolve, 30)); }
  throw Error("Expected state was not reached");
}

// Bun discovers .test.mjs too, but its node:test shim cannot reliably mix with
// bun:test suites. These are explicitly Node-only opt-in checks.
if (!process.versions.bun) {
test("real local Temporal runs unchanged shared conformance in Node", { skip: process.env.DRAWLOOM_TEMPORAL_TEST !== "1", timeout: 120000 }, async () => {
  assert.equal(typeof provider.createLocalTemporalManager, "function");
  const root = await mkdtemp(join(tmpdir(), "drawloom-temporal-supported-"));
  const manager = provider.createLocalTemporalManager({ dataDirectory: root });
  const bridges = new Map();
  let current;
  try {
    await orchestrationConformance(async () => {
      const registration = await manager.prepare({ projectId: "public", installationId: "conformance", packageDirectory: resolve("packages/orchestration/temporal-orchestration"), entrypoint: "fixtures/workflows.mjs" });
      current = registration;
      const attempts = [];
      const store = new Map();
      await registration.attach(registration.registry.tasks.map((task) => ({
        id: task.id, version: task.version,
        async run(input, context) {
          attempts.push(context);
          if (!task.id.startsWith("agent.")) return taskHandler(task.id, input, context);
          let bridge = bridges.get(context.runId);
          if (!bridge) {
            bridge = agent.createAgentBridge(context.runId, createSyntheticDriver(() => context.runId.endsWith("/background") ? new Promise(() => {}) : "Synthetic result"), { get: async (key) => store.get(key), set: async (key, value) => { store.set(key, value); } }, { context: { text: "" }, tools: { id: "none", tools: [] } });
            bridges.set(context.runId, bridge);
          }
          return agent.dispatchAgentTask(bridge, task.id, input, context);
        },
      })));
      return { engine: registration.orchestrator, attempts, dispose: async () => {} };
    });
    const background = await current.orchestrator.start("background", workflows.backgroundAgent, null);
    await until(() => current.orchestrator.get(background), (snapshot) => snapshot.pendingInputs.length > 0);
    await current.orchestrator.cancel(background);
    await assert.rejects(current.orchestrator.result(background));
    assert.ok((await current.orchestrator.get(background)).unresolvedEffects.length > 0, "cancellation must retain uncertainty for an owned native submission");
  } finally {
    await manager.close();
    for (const bridge of bridges.values()) await bridge.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("full local close/reopen preserves input and completed effects, isolates owners, and refuses changed bundles", { skip: process.env.DRAWLOOM_TEMPORAL_TEST !== "1", timeout: 120000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-temporal-recovery-"));
  const pkg = join(root, "packaged"); await mkdir(pkg);
  // Bundles its own Zod copy; registration must accept trait-compatible schemas.
  await command("bun", ["build", resolve("packages/orchestration/temporal-orchestration/fixtures/recovery.mjs"), "--target", "browser", "--outfile", join(pkg, "workflow.mjs")]);
  const original = await readFile(join(pkg, "workflow.mjs"), "utf8");
  const owner = { projectId: "project", installationId: "installation", packageDirectory: pkg, entrypoint: "workflow.mjs" };
  let manager = provider.createLocalTemporalManager({ dataDirectory: root });
  let writes = 0, slowCalls = 0;
  const handlers = [ { id: "write", version: "1", run: (input) => { writes++; return input * 2; } }, { id: "slow", version: "1", run: () => { slowCalls++; return new Promise(() => {}); } } ];
  try {
    let registration = await manager.prepare(owner);
    await assert.rejects(registration.orchestrator.start("before-ready", review, 3), /not ready/);
    await registration.attach(handlers);
    const transformedRun = await registration.orchestrator.start('transformed', transformed, null);
    const transformedWait = await until(() => registration.orchestrator.get(transformedRun), state => state.pendingInputs.length > 0 || state.status !== 'running');
    assert.equal(transformedWait.status, 'running', 'JSON-preserving transforms must be valid input schemas');
    await registration.orchestrator.respond(transformedRun, transformedWait.pendingInputs[0], '  retained  ');
    assert.equal(await registration.orchestrator.result(transformedRun), 'retained');
    const run = await registration.orchestrator.start("review", review, 3);
    const pending = await until(() => registration.orchestrator.get(run), (snapshot) => snapshot.pendingInputs.length > 0);
    const other = await manager.prepare({ ...owner, projectId: "other" }); await other.attach(handlers);
    const second = await other.orchestrator.start("other-review", review, 4);
    await assert.rejects(other.orchestrator.get(run), /owner/);
    const another = await registration.orchestrator.start("second", review, 5);
    const hostRegistration = await manager.prepareHost({ capabilityId: "knowledge-maintenance", packageDirectory: pkg, entrypoint: "workflow.mjs" });
    await hostRegistration.attach(handlers);
    const hostRun = await hostRegistration.orchestrator.start("nightloom", review, 2);
    await until(() => hostRegistration.orchestrator.get(hostRun), (state) => state.pendingInputs.length > 0);
    assert.notEqual(hostRun.split("/")[0], run.split("/")[0], "host and plugin run identities must occupy separate owner namespaces");
    assert.equal(await hostRegistration.orchestrator.start("nightloom", review, 2), hostRun, "same host start identity and fingerprint replays safely");
    await assert.rejects(hostRegistration.orchestrator.start("nightloom", review, 3), /Conflicting start/);
    assert.equal((await manager.listHostOwners()).length, 1);
    assert.equal((await manager.listOwners()).length, 2);
    assert.equal(await manager.hasUnfinishedInstallation("knowledge-maintenance"), false, "host capabilities never become plugin installation guards");
    const page = await registration.orchestrator.list({ limit: 1 }); assert.ok(page.cursor);
    await assert.rejects(other.orchestrator.list({ cursor: page.cursor }), /cursor/);
    await until(() => registration.orchestrator.get(another), (state) => state.pendingInputs.length > 0);
    await until(() => other.orchestrator.get(second), (state) => state.pendingInputs.length > 0);
    assert.equal(await manager.hasUnfinishedInstallation(owner.installationId), true);
    const before = writes;
    await manager.close();
    manager = provider.createLocalTemporalManager({ dataDirectory: root });
    assert.equal((await manager.listOwners()).length, 2);
    assert.equal((await manager.listHostOwners()).length, 1);
    assert.equal(await manager.hasUnfinishedInstallation(owner.installationId), true);
    await writeFile(join(pkg, "workflow.mjs"), `${original}\nthrow Error('Changed code must not be imported');\n`);
    await assert.rejects(manager.prepare(owner), /bundle changed/);
    await assert.rejects(manager.prepareHost({ capabilityId: "knowledge-maintenance", packageDirectory: pkg, entrypoint: "workflow.mjs" }), /bundle changed/);
    await writeFile(join(pkg, "workflow.mjs"), original);
    registration = await manager.prepare(owner); await registration.attach(handlers);
    assert.equal((await registration.orchestrator.get(run)).status, "running");
    assert.equal(writes, before);
    await registration.orchestrator.respond(run, pending.pendingInputs[0], null);
    assert.equal(await registration.orchestrator.result(run), 6);
    assert.equal(writes, before);
    const running = await registration.orchestrator.start("active-loss", active, 1);
    await until(async () => slowCalls, (count) => count === 1);
    await manager.close();
    manager = provider.createLocalTemporalManager({ dataDirectory: root });
    registration = await manager.prepare(owner); await registration.attach(handlers);
    await assert.rejects(registration.orchestrator.result(running));
    const failed = await registration.orchestrator.get(running);
    assert.equal(failed.status, "failed"); assert.equal(failed.cancellationRequested, false);
    assert.ok(failed.unresolvedEffects.length > 0); assert.equal(slowCalls, 1);
    await registration.orchestrator.cancel(another);
    await assert.rejects(registration.orchestrator.result(another));
    assert.equal((await registration.orchestrator.get(another)).cancellationRequested, true);
  } finally { await manager.close(); await rm(root, { recursive: true, force: true }); }
});

test("Bun desktop client makes actual service requests with Node-only workers", { skip: process.env.DRAWLOOM_TEMPORAL_TEST !== "1", timeout: 60000 }, async () => {
  const output = await command("bun", [resolve("packages/orchestration/temporal-orchestration/fixtures/bun-client.mjs")], 55000);
  assert.match(output, /BUN_CLIENT_OK/);
});

test("whole-host process loss reclaims dead ownership and reopens durable input without redispatch", { skip: process.env.DRAWLOOM_TEMPORAL_TEST !== "1", timeout: 60000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-temporal-crash-"));
  const child = spawn(process.execPath, [resolve("packages/orchestration/temporal-orchestration/fixtures/crash-host.mjs"), root], { stdio: ["ignore", "ignore", "pipe"] });
  let manager;
  try {
    const saved = await until(async () => { try { return JSON.parse(await readFile(join(root, "ready.json"), "utf8")); } catch { return null; } }, (value) => value !== null);
    await new Promise((resolve) => { child.once("exit", resolve); child.kill("SIGKILL"); });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    manager = provider.createLocalTemporalManager({ dataDirectory: root });
    assert.equal(await manager.hasUnfinishedInstallation("crash"), true);
    const registration = await manager.prepare({ projectId: "crash", installationId: "crash", packageDirectory: resolve("packages/orchestration/temporal-orchestration"), entrypoint: "fixtures/recovery.mjs" });
    let dispatches = 0;
    await registration.attach([{ id: "write", version: "1", run: () => { dispatches++; return 8; } }, { id: "slow", version: "1", run: () => 0 }]);
    assert.equal((await registration.orchestrator.get(saved.run)).status, "running");
    await registration.orchestrator.respond(saved.run, saved.request, null);
    assert.equal(await registration.orchestrator.result(saved.run), 8);
    assert.equal(dispatches, 0); assert.equal(await readFile(join(root, "effect.txt"), "utf8"), "one write");
  } finally { child.kill("SIGKILL"); await manager?.close(); await rm(root, { recursive: true, force: true }); }
});

test("killed effect writer leaves durable intent: absent recovery is unknown and receipt-only recovery never resubmits", { skip: process.env.DRAWLOOM_TEMPORAL_TEST !== "1", timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-effect-crash-"));
  const child = spawn(process.execPath, [resolve("packages/orchestration/temporal-orchestration/fixtures/crash-receipt.mjs"), root], { stdio: "ignore" });
  const task = { id: "effect", version: "1", input: z.number(), output: z.number() };
  const request = { runId: "owner/run", stepId: "owner/run/effect", task: "effect", version: "1", input: 3, attempt: 2, maxAttempts: 2 };
  let calls = 0;
  try {
    await until(async () => { try { return await readFile(join(root, "effect.txt"), "utf8"); } catch { return ""; } }, (value) => value === "effect submitted");
    await new Promise((resolve) => { child.once("exit", resolve); child.kill("SIGKILL"); });
    const withoutRecovery = createReceiptDispatcher(root, "owner", matchTaskHandlers({ workflows: [], tasks: [task] }, [{ id: task.id, version: task.version, run: () => { calls++; return 6; } }]));
    await assert.rejects(withoutRecovery.dispatch(request), /unknown/);
    const recovered = createReceiptDispatcher(root, "owner", matchTaskHandlers({ workflows: [], tasks: [task] }, [{ id: task.id, version: task.version, run: () => { calls++; return 6; }, recover: async () => { assert.equal(await readFile(join(root, "effect.txt"), "utf8"), "effect submitted"); return { status: "completed", output: 6 }; } }]));
    assert.equal(await recovered.dispatch(request), 6); assert.equal(calls, 0);
  } finally { child.kill("SIGKILL"); await rm(root, { recursive: true, force: true }); }
});
}
