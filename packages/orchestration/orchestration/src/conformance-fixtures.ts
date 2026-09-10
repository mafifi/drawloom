import { z } from "zod";
import { registerWorkflow, type Workflow, type Registry } from "./index.js";
import { agentTasks, ownedAgents } from "./owned-agent.js";
export const numberTask = {
  id: "double",
  version: "1",
  input: z.number(),
  output: z.number(),
};
export const catalogueTask = {
  id: "catalogue",
  version: "1",
  input: z.array(z.string()),
  output: z.array(z.string()),
};
export const catalogue: Workflow<string[], string[]> = {
  ...catalogueTask,
  run: (c, entries) => c.task("index", catalogueTask, entries),
};
export const arithmetic: Workflow<number, number> = {
  id: "arithmetic",
  version: "1",
  input: z.number(),
  output: z.number(),
  async run(c, n) {
    return c.task("double", numberTask, n);
  },
};
export const waiting: Workflow<null, number> = {
  id: "waiting",
  version: "1",
  input: z.null(),
  output: z.number(),
  async run(c) {
    return c.input("answer", z.number());
  },
};
export const conflictingInput: Workflow<null, number> = {
  ...waiting,
  id: "conflicting-input",
  async run(c) {
    await c.input("answer", z.number());
    await c.input("answer", z.string());
    return 1;
  },
};
export const retryBoundary: Workflow<number, number> = {
  ...arithmetic,
  id: "retry-boundary",
  run: (c, maxAttempts) => c.task("bounded", numberTask, 2, { maxAttempts }),
};
export const backgroundAgent: Workflow<null, null> = {
  id: "background-agent",
  version: "1",
  input: z.null(),
  output: z.null(),
  async run(c) {
    const agents = ownedAgents(c);
    const sessionId = await agents.create("create", "owned");
    await agents.submit("submit", {
      sessionId,
      operation: { operationId: "active", text: "Synthetic background work" },
    });
    await c.input("decision", z.null());
    return null;
  },
};
export const retry: Workflow<number, number> = {
  ...arithmetic,
  id: "retry",
  async run(c, n) {
    return c.task("retry", { ...numberTask, id: "fail-once" }, n, {
      maxAttempts: 2,
    });
  },
};
export const denied: Workflow<number, number> = {
  ...arithmetic,
  id: "denied",
  run: (c) =>
    c.task("denied", { ...numberTask, id: "denied" }, 1, { maxAttempts: 3 }),
};
export const invalid: Workflow<number, number> = {
  ...denied,
  id: "invalid",
  run: (c) =>
    c.task("invalid", { ...numberTask, id: "invalid" }, 1, { maxAttempts: 3 }),
};
export const unknown: Workflow<number, number> = {
  ...denied,
  id: "unknown",
  run: (c) =>
    c.task("unknown", { ...numberTask, id: "unknown" }, 1, { maxAttempts: 3 }),
};
export const lostResponse: Workflow<number, number> = {
  ...unknown,
  id: "lost-response",
  run: (c) =>
    c.task("write", { ...numberTask, id: "lost-response" }, 1, {
      maxAttempts: 3,
    }),
};
const BranchOutput = z.strictObject({
  sessionId: z.string(),
  value: z.number(),
});
export const branch: Workflow<number, z.infer<typeof BranchOutput>> = {
  id: "branch",
  version: "1",
  input: z.number(),
  output: BranchOutput,
  async run(c, n) {
    const agents = ownedAgents(c);
    const sessionId = await agents.create("conversation", "conversation");
    await agents.submit("agent-submit", {
      sessionId,
      operation: {
        operationId: "first",
        text: `Inspect synthetic number ${n}`,
      },
    });
    await agents.result("agent-result", { sessionId, operationId: "first" });
    const value =
      n % 2 === 1
        ? await c.task("safe-retry", { ...numberTask, id: "fail-once" }, n, {
            maxAttempts: 2,
          })
        : await c.task("double", numberTask, n);
    return { sessionId, value };
  },
};
const SpineOutput = z.strictObject({
  total: z.number(),
  sessionId: z.string(),
});
export const spine: Workflow<number, z.infer<typeof SpineOutput>> = {
  id: "spine",
  version: "1",
  input: z.number(),
  output: SpineOutput,
  async run(c, n) {
    const agents = ownedAgents(c);
    const sessionId = await agents.create("conversation", "followup");
    await agents.submit("first-submit", {
      sessionId,
      operation: {
        operationId: "first",
        text: "Summarise synthetic arithmetic",
      },
    });
    await agents.result("first-result", { sessionId, operationId: "first" });
    const [left, right] = await Promise.all([
      c.child("left", branch, n),
      c.child("right", branch, n + 1),
    ]);
    const add = await c.input("confirm", z.number());
    // Parent's own conversation is kept across the external input boundary.
    await agents.submit("followup-submit", {
      sessionId,
      operation: { operationId: "followup", text: `Apply addition ${add}` },
    });
    await agents.result("followup-result", {
      sessionId,
      operationId: "followup",
    });
    return { total: left.value + right.value + add, sessionId };
  },
};
export const failedBranch: Workflow<null, number> = {
  ...waiting,
  id: "failed-branch",
  async run(c) {
    await c.sleep("delay", 20);
    return c.task("fail", { ...numberTask, id: "denied" }, 1);
  },
};
export const failedFanout: Workflow<null, number> = {
  ...waiting,
  id: "failed-fanout",
  async run(c) {
    await c.task("completed", numberTask, 5);
    const values = await Promise.all([
      c.child("failure", failedBranch, null),
      c.child("waiting", waiting, null),
    ]);
    return values[0]!;
  },
};
export const defaultRetry: Workflow<number, number> = {
  ...arithmetic,
  id: "default-retry",
  run: (c) => c.task("once", { ...numberTask, id: "fail-once" }, 1),
};
export const duplicateStep: Workflow<number, number> = {
  ...arithmetic,
  id: "duplicate-step",
  async run(c, n) {
    const values = await Promise.all([
      c.task("same", numberTask, n),
      c.task("same", numberTask, n),
    ]);
    return values[0]! + values[1]!;
  },
};
export const conflictingStep: Workflow<number, number> = {
  ...arithmetic,
  id: "conflicting-step",
  async run(c, n) {
    await c.task("same", numberTask, n);
    return c.task("same", numberTask, n + 1);
  },
};
/** Trusted composition registry; no workflow function crosses the provider wire. */
export const workflows = {
  conflictingInput,
  retryBoundary,
  lostResponse,
  backgroundAgent,
  catalogue,
  arithmetic,
  waiting,
  retry,
  denied,
  invalid,
  unknown,
  branch,
  spine,
  failedBranch,
  failedFanout,
  defaultRetry,
  duplicateStep,
  conflictingStep,
};
export const fixtureRegistry: Registry = {
  workflows: [
    registerWorkflow(conflictingInput),
    registerWorkflow(retryBoundary),
    registerWorkflow(lostResponse),
    registerWorkflow(backgroundAgent),
    registerWorkflow(catalogue),
    registerWorkflow(arithmetic),
    registerWorkflow(waiting),
    registerWorkflow(retry),
    registerWorkflow(denied),
    registerWorkflow(invalid),
    registerWorkflow(unknown),
    registerWorkflow(branch),
    registerWorkflow(spine),
    registerWorkflow(failedBranch),
    registerWorkflow(failedFanout),
    registerWorkflow(defaultRetry),
    registerWorkflow(duplicateStep),
    registerWorkflow(conflictingStep),
  ],
  tasks: [
    catalogueTask,
    numberTask,
    ...["fail-once", "denied", "invalid", "unknown", "lost-response"].map(
      (id) => ({
        ...numberTask,
        id,
      }),
    ),
    ...Object.values(agentTasks),
  ],
};
