import { test, expect } from "bun:test";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
import { createAgentBridge } from "./agent-bridge.ts";
import type { Json } from "./contract.ts";
import { codexAgentFixture } from "../../scripts/agent-conformance-fixtures.mjs";
import { createMemoryOrchestrator } from "./memory.ts";
import { registerWorkflow, type Workflow } from "./contract.ts";
import { ownedAgents, agentTasks } from "./owned-agent.ts";
import { dispatchAgentTask } from "./agent-task-host.ts";
import { z } from "zod";
test("portable facade dispatches Codex inspection, steering, approval, input and interruption", async () => {
  const f = codexAgentFixture();
  const data = new Map<string, Json>();
  const bridge = createAgentBridge(
    "facade",
    f.driver,
    {
      async get(k) {
        return data.get(k);
      },
      async set(k, v) {
        data.set(k, v);
      },
    },
    { context: { text: "" }, tools: { id: "none", tools: [] } },
  );
  const resolutions = z.object({
    approval: agentTasks.resolveApproval.input.shape.resolution,
    input: agentTasks.respondToInput.input.shape.resolution,
  });
  const workflow: Workflow<null, string> = {
    id: "controls",
    version: "1",
    input: z.null(),
    output: z.string(),
    async run(c) {
      const agents = ownedAgents(c);
      const sessionId = await agents.create("create", "conversation");
      await agents.submit("submit", {
        sessionId,
        operation: { operationId: "one", text: "work" },
      });
      const state = await agents.inspect("inspect", {
        sessionId,
        operationId: "one",
      });
      if (state.status !== "running")
        throw new Error("Expected running operation");
      const choice = await c.input("native", resolutions);
      await agents.resolveApproval("approval", {
        sessionId,
        resolution: choice.approval,
      });
      await agents.respondToInput("input", {
        sessionId,
        resolution: choice.input,
      });
      await agents.steer("steer", {
        sessionId,
        operation: { operationId: "one", text: "Refine" },
      });
      await c.input("finish", z.null());
      await agents.result("result", { sessionId, operationId: "one" });
      await agents.submit("submit-two", {
        sessionId,
        operation: { operationId: "two", text: "More" },
      });
      await agents.interrupt("interrupt", { sessionId, operationId: "two" });
      return (
        await agents.inspect("interrupted", { sessionId, operationId: "two" })
      ).status;
    },
  };
  const engine = createMemoryOrchestrator(
    "facade",
    async (task, input, context) => {
      const output = await dispatchAgentTask(bridge, task, input, context);
      if (task === "agent.interrupt") {
        await f.controls!.confirmInterruption();
        await new Promise((r) => setTimeout(r, 1));
      }
      return output;
    },
    {
      workflows: [registerWorkflow(workflow)],
      tasks: Object.values(agentTasks),
    },
  );
  const id = await engine.start("controls", workflow, null);
  async function request() {
    for (let i = 0; i < 100; i++) {
      const snapshot = await engine.get(id);
      const pending = snapshot.pendingInputs[0];
      if (pending) return pending;
      if (snapshot.failure) throw new Error(snapshot.failure);
      await new Promise((r) => setTimeout(r, 1));
    }
    throw new Error("No pending input");
  }
  const first = await request();
  await f.interactions!.request();
  await new Promise((r) => setTimeout(r, 1));
  const sessionId = await bridge.create("conversation"),
    interactions = bridge.interactions(sessionId);
  await engine.respond(id, first, {
    approval: {
      approvalId: interactions.approvals[0]!.approvalId,
      optionId: interactions.approvals[0]!.options[0]!.optionId,
    },
    input: {
      requestId: interactions.inputs[0]!.requestId,
      action: "submit",
      value: { text: "Approved input" },
    },
  });
  const finish = await request();
  await f.complete();
  await engine.respond(id, finish, null);
  expect(await engine.result(id)).toBe("interrupted");
  expect(f.controls!.steeringText()).toContain("Refine");
  expect(f.interactions!.responses().length).toBe(2);
  await bridge.close();
});
test("lost Codex submission response stays unknown without resend and reconciles later completion", async () => {
  const f = codexAgentFixture();
  const data = new Map<string, Json>();
  let executions = 0;
  const driver = {
    driverId: f.driver.driverId,
    async openSession(input: Parameters<typeof f.driver.openSession>[0]) {
      const opened = await f.driver.openSession(input);
      if (opened.status !== "ok") return opened;
      return {
        status: "ok" as const,
        value: {
          ...opened.value,
          async execute(operation: Parameters<typeof opened.value.execute>[0]) {
            executions++;
            await opened.value.execute(operation);
            throw new Error("Lost transport response");
          },
        },
      };
    },
  };
  const store = {
    async get(k: string) {
      return data.get(k);
    },
    async set(k: string, v: Json) {
      data.set(k, v);
    },
  };
  const authority = { context: { text: "" }, tools: { id: "none", tools: [] } };
  const bridge = createAgentBridge("lost", driver, store, authority);
  const session = await bridge.create("conversation");
  expect(
    (await bridge.submit(session, { operationId: "one", text: "work" })).status,
  ).toBe("unknown");
  expect(
    (await bridge.submit(session, { operationId: "one", text: "work" })).status,
  ).toBe("unknown");
  expect(executions).toBe(1);
  const uncertainWorkflow: Workflow<string, null> = {
    id: "uncertain",
    version: "1",
    input: z.string(),
    output: z.null(),
    async run(c, sessionId) {
      await ownedAgents(c).submit("submit", {
        sessionId,
        operation: { operationId: "one", text: "work" },
      });
      return null;
    },
  };
  const engine = createMemoryOrchestrator(
    "uncertain",
    (task, input, context) => dispatchAgentTask(bridge, task, input, context),
    {
      workflows: [registerWorkflow(uncertainWorkflow)],
      tasks: Object.values(agentTasks),
    },
  );
  const unresolved = await engine.start(
    "uncertain",
    uncertainWorkflow,
    session,
  );
  await expect(engine.result(unresolved)).rejects.toThrow("unresolved");
  expect((await engine.get(unresolved)).unresolvedEffects.length).toBe(1);
  expect(executions).toBe(1);
  const restarted = createAgentBridge("lost", driver, store, authority);
  expect((await restarted.inspect(session, "one")).status).toBe("unknown");
  await expect(restarted.create("conversation")).rejects.toThrow(
    "cannot reattach",
  );
  await f.complete();
  await new Promise((r) => setTimeout(r, 1));
  expect((await bridge.inspect(session, "one")).status).toBe("completed");
  const afterCompletion = createAgentBridge("lost", driver, store, authority);
  expect((await afterCompletion.inspect(session, "one")).status).toBe(
    "completed",
  );
  await bridge.close();
});
test("Codex native approvals stay visible and tool grants remain independent", async () => {
  const f = codexAgentFixture();
  const data = new Map<string, Json>();
  const bridge = createAgentBridge(
    "codex",
    f.driver,
    {
      async get(k) {
        return data.get(k);
      },
      async set(k, v) {
        data.set(k, v);
      },
    },
    { context: { text: "" }, tools: f.tools!.exposure },
  );
  const session = await bridge.create("conversation");
  await bridge.submit(session, { operationId: "one", text: "inspect" });
  await f.interactions!.request();
  await new Promise((r) => setTimeout(r, 1));
  const interactions = bridge.interactions(session);
  expect(interactions.approvals.length).toBe(2);
  const approval = interactions.approvals[0]!;
  await bridge.resolveApproval(session, {
    approvalId: approval.approvalId,
    optionId: approval.options[0]!.optionId,
  });
  expect((await f.tools!.invoke("one")).success).toBe(false);
  await f.complete();
  expect((await bridge.result(session, "one")).status).toBe("completed");
  await bridge.close();
});
test("concurrent creates share one owned session", async () => {
  let opens = 0;
  const driver = createSyntheticDriver(() => "done");
  const data = new Map<string, Json>();
  const bridge = createAgentBridge(
    "owner",
    {
      driverId: driver.driverId,
      async openSession(input) {
        opens++;
        return driver.openSession(input);
      },
    },
    {
      async get(k) {
        return data.get(k);
      },
      async set(k, v) {
        data.set(k, v);
      },
    },
    { context: { text: "" }, tools: { id: "none", tools: [] } },
  );
  const [a, b] = await Promise.all([
    bridge.create("same"),
    bridge.create("same"),
  ]);
  expect(a).toBe(b);
  expect(opens).toBe(1);
  await bridge.close();
});
test("owned bridge preserves sequential conversation and refuses concurrency and replay conflicts", async () => {
  const data = new Map<string, Json>();
  let finish!: (s: string) => void;
  const bridge = createAgentBridge(
    "owner",
    createSyntheticDriver(
      () =>
        new Promise((r) => {
          finish = r;
        }),
    ),
    {
      async get(k) {
        return data.get(k);
      },
      async set(k, v) {
        data.set(k, v);
      },
    },
    { context: { text: "" }, tools: { id: "none", tools: [] } },
  );
  const session = await bridge.create("conversation");
  await bridge.submit(session, { operationId: "one", text: "hello" });
  await expect(
    bridge.submit(session, { operationId: "two", text: "concurrent" }),
  ).rejects.toThrow();
  await expect(
    bridge.submit(session, { operationId: "one", text: "different" }),
  ).rejects.toThrow();
  finish("large response stays provider-owned");
  expect((await bridge.result(session, "one")).status).toBe("completed");
  await bridge.submit(session, { operationId: "two", text: "followup" });
  finish("done");
  expect((await bridge.result(session, "two")).status).toBe("completed");
  await expect(bridge.inspect("foreign", "one")).rejects.toThrow();
  await expect(
    bridge.steer(session, { operationId: "steer", text: "x" }),
  ).rejects.toThrow("Unsupported");
  await bridge.close();
  expect(JSON.stringify([...data.values()])).not.toContain("large response");
});
