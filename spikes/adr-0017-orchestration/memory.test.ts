import { test, expect } from "bun:test";
import { createMemoryOrchestrator } from "./memory.ts";
import { orchestrationConformance, taskHandler } from "./conformance.ts";
import type { TaskContext } from "./contract.ts";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
import { createAgentBridge } from "./agent-bridge.ts";
import { dispatchAgentTask } from "./agent-task-host.ts";
import { ownedAgents, agentTasks } from "./owned-agent.ts";
import type { Json } from "./contract.ts";
import { z } from "zod";
import { arithmetic, numberTask, fixtureRegistry } from "./fixtures.ts";
import { parse, registerWorkflow, type Workflow } from "./contract.ts";
test("cancellation during input retains a previously submitted active agent effect", async () => {
  const data = new Map<string, Json>();
  const bridge = createAgentBridge(
    "background",
    createSyntheticDriver(() => new Promise<string>(() => {})),
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
  const workflow: Workflow<null, null> = {
    id: "background",
    version: "1",
    input: z.null(),
    output: z.null(),
    async run(c) {
      const agents = ownedAgents(c);
      const sessionId = await agents.create("create", "owned");
      await agents.submit("submit", {
        sessionId,
        operation: { operationId: "active", text: "Background work" },
      });
      await c.input("decision", z.null());
      return null;
    },
  };
  const engine = createMemoryOrchestrator(
    "background",
    (task, input, context) => dispatchAgentTask(bridge, task, input, context),
    {
      workflows: [registerWorkflow(workflow)],
      tasks: Object.values(agentTasks),
    },
    {
      async onCancellation() {
        return (await bridge.requestCancellation()).unresolvedEffects;
      },
    },
  );
  const id = await engine.start("background", workflow, null);
  for (let i = 0; !(await engine.get(id)).pendingInputs.length && i < 100; i++)
    await new Promise((r) => setTimeout(r, 1));
  expect((await engine.get(id)).pendingInputs.length).toBe(1);
  await engine.cancel(id);
  await expect(engine.result(id)).rejects.toThrow();
  const snapshot = await engine.get(id);
  expect(snapshot.status).toBe("cancelled");
  expect(snapshot.unresolvedEffects).toHaveLength(1);
  expect(snapshot.unresolvedEffects[0]).toContain("active");
  await bridge.close();
});
test("proof rejects excess child fanout before creating an unbounded snapshot", async () => {
  const child: Workflow<null, null> = {
    id: "child-limit",
    version: "1",
    input: z.null(),
    output: z.null(),
    async run(c) {
      await c.input("wait", z.null());
      return null;
    },
  };
  const parent: Workflow<null, null> = {
    ...child,
    id: "parent-limit",
    async run(c) {
      await Promise.all(
        Array.from({ length: 101 }, (_, i) => c.child(String(i), child, null)),
      );
      return null;
    },
  };
  const engine = createMemoryOrchestrator("limits", () => null, {
    workflows: [registerWorkflow(child), registerWorkflow(parent)],
    tasks: [],
  });
  const id = await engine.start("bounded", parent, null);
  // A bounded local wait ensures a missing limit fails rather than hangs this test.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    await expect(
      engine.result(id, { signal: controller.signal }),
    ).rejects.toThrow("Child limit");
  } finally {
    clearTimeout(timer);
    await engine.cancel(id);
  }
  expect((await engine.get(id)).childRunIds.length).toBe(100);
});
test("JSON boundary rejects schema transforms that introduce host objects", () => {
  expect(() =>
    parse(
      z.string().transform((s) => new Date(s)),
      "2026-09-10",
    ),
  ).toThrow();
});
test("registered workflow input transform runs once at start boundary", async () => {
  const transformed: Workflow<number, number> = {
    ...arithmetic,
    input: z.number().transform((n) => n + 1),
    run: async (_c, n) => n,
  };
  const engine = createMemoryOrchestrator("transform", () => null, {
    workflows: [registerWorkflow(transformed)],
    tasks: [],
  });
  expect(await engine.result(await engine.start("one", transformed, 3))).toBe(
    4,
  );
});
test("host task dispatch receives registered version and rejects unknown versions", async () => {
  const workflow: Workflow<number, number> = {
    ...arithmetic,
    run: async (c, n) =>
      (await c.task("v1", numberTask, n)) +
      (await c.task("v2", { ...numberTask, version: "2" }, n)),
  };
  const invalid: Workflow<number, number> = {
    ...workflow,
    id: "invalid-task-version",
    run: (c) => c.task("bad", { ...numberTask, version: "404" }, 1),
  };
  const engine = createMemoryOrchestrator(
    "versions",
    (_task, n, c) => Number(n) * (c.taskVersion === "1" ? 2 : 3),
    {
      workflows: [registerWorkflow(workflow), registerWorkflow(invalid)],
      tasks: [numberTask, { ...numberTask, version: "2" }],
    },
  );
  expect(await engine.result(await engine.start("versions", workflow, 3))).toBe(
    15,
  );
  await expect(
    engine.result(await engine.start("unknown", invalid, 1)),
  ).rejects.toThrow("Unregistered task version");
});
test("failed sibling cancellation records unresolved agent wait and requests owned close", async () => {
  let closes = 0;
  const data = new Map<string, Json>();
  const bridges = new Map<string, ReturnType<typeof createAgentBridge>>();
  const pending: Workflow<null, null> = {
    id: "pending-agent",
    version: "1",
    input: z.null(),
    output: z.null(),
    async run(c) {
      const agents = ownedAgents(c);
      const sessionId = await agents.create("create", "owned");
      await agents.submit("submit", {
        sessionId,
        operation: { operationId: "work", text: "wait" },
      });
      await agents.result("result", { sessionId, operationId: "work" });
      return null;
    },
  };
  const failure: Workflow<null, null> = {
    ...pending,
    id: "failure",
    async run(c) {
      await c.sleep("delay", 20);
      throw new Error("Branch failed");
    },
  };
  const parent: Workflow<null, null> = {
    ...pending,
    id: "parent",
    async run(c) {
      await Promise.all([
        c.child("pending", pending, null),
        c.child("failure", failure, null),
      ]);
      return null;
    },
  };
  const engine = createMemoryOrchestrator(
    "cancel-effects",
    async (task, input, context) => {
      let bridge = bridges.get(context.runId);
      if (!bridge) {
        const driver = createSyntheticDriver(
          () => new Promise<string>(() => {}),
        );
        bridge = createAgentBridge(
          context.runId,
          {
            driverId: driver.driverId,
            async openSession(input) {
              const opened = await driver.openSession(input);
              if (opened.status !== "ok") return opened;
              return {
                status: "ok",
                value: {
                  ...opened.value,
                  async close() {
                    closes++;
                    return opened.value.close();
                  },
                },
              };
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
        bridges.set(context.runId, bridge);
      }
      return dispatchAgentTask(bridge, task, input, context);
    },
    {
      workflows: [
        registerWorkflow(parent),
        registerWorkflow(pending),
        registerWorkflow(failure),
      ],
      tasks: Object.values(agentTasks),
    },
  );
  const id = await engine.start("parent", parent, null);
  await expect(engine.result(id)).rejects.toThrow();
  const child = (await engine.get(id)).childRunIds.find((id) =>
    id.includes("pending"),
  )!;
  await expect(engine.result(child)).rejects.toThrow();
  expect((await engine.get(child)).unresolvedEffects.length).toBe(1);
  expect(closes).toBe(1);
  await Promise.all([...bridges.values()].map((b) => b.close()));
});
test("trusted workflow and task registry ignores forged code and schemas and rejects unknown versions", async () => {
  const trusted: Workflow<number, number> = {
    ...arithmetic,
    id: "trusted",
    run: (c) =>
      c.task(
        "number",
        { ...numberTask, input: z.any(), output: z.any() },
        "bad" as unknown as number,
      ),
  };
  const registry = {
    workflows: [registerWorkflow(arithmetic), registerWorkflow(trusted)],
    tasks: [numberTask],
  };
  const engine = createMemoryOrchestrator(
    "registry",
    (_id, n) => Number(n) * 2,
    registry,
  );
  const forged = {
    ...arithmetic,
    input: z.any(),
    output: z.any(),
    run: async () => 999,
  };
  expect(await engine.result(await engine.start("forged", forged, 3))).toBe(6);
  await expect(engine.start("invalid", forged, "bad")).rejects.toThrow();
  await expect(
    engine.start("unknown-version", { ...arithmetic, version: "2" }, 3),
  ).rejects.toThrow();
  await expect(
    engine.result(await engine.start("forged-task", trusted, 3)),
  ).rejects.toThrow();
});
test("memory shared orchestration conformance", () =>
  orchestrationConformance(async () => {
    const attempts: TaskContext[] = [];
    const bridges = new Map<string, ReturnType<typeof createAgentBridge>>();
    const data = new Map<string, Json>();
    const engine = createMemoryOrchestrator(
      "test",
      async (task, input, context) => {
        attempts.push(context);
        let bridge = bridges.get(context.runId);
        if (!bridge) {
          bridge = createAgentBridge(
            context.runId,
            createSyntheticDriver(async () => {
              await new Promise((r) => setTimeout(r, 10));
              return "Synthetic result";
            }),
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
          bridges.set(context.runId, bridge);
        }
        if (task.startsWith("agent."))
          return dispatchAgentTask(bridge, task, input, context);
        return taskHandler(task, input, context);
      },
      fixtureRegistry,
      {
        async onCancellation(runId) {
          return (
            (await bridges.get(runId)?.requestCancellation())
              ?.unresolvedEffects ?? []
          );
        },
      },
    );
    return {
      engine,
      attempts,
      async dispose() {
        await Promise.all([...bridges.values()].map((b) => b.close()));
      },
    };
  }));
