import { expect, test } from "bun:test";
import * as agent from "./src/index.js";
import { agentDelegationConformance, agentForkConformance } from "./src/delegation-conformance.js";

test("deterministic fork receipts and unsupported forks satisfy shared conformance", async () => {
  const receipts = new Map<string, agent.AgentForkReceipt>();
  let creations = 0;
  await agentForkConformance({
    read: async (id) => ({ status: "ok", value: receipts.get(id) ?? null }),
    create: async (input) => {
      const prior = receipts.get(input.requestId);
      if (prior && prior.sessionId !== input.sessionId)
        return {
          status: "rejected",
          failure: { code: "invalid_state", message: "Request already bound" },
        };
      if (!prior) {
        creations++;
        receipts.set(input.requestId, { ...input, state: "created" });
      }
      return { status: "ok", value: receipts.get(input.requestId)! };
    },
  });
  expect(creations).toBe(1);
  await agentForkConformance(undefined);
});

const child = {
  id: "child-reference",
  parentId: null,
  revision: "snapshot-1",
  label: "Review documentation",
  status: "running",
  result: { state: "unavailable" },
  controls: { interrupt: "unknown" },
};

test("deterministic read-only delegation and absent capabilities satisfy conformance", async () => {
  const snapshot = agent.AgentDelegationSchema.parse(child);
  const reject = (): agent.AgentResult<never> => ({
    status: "rejected",
    failure: {
      code: "invalid_interaction",
      message: "No owned child execution",
    },
  });
  await agentDelegationConformance({
    list: async () => ({ status: "ok", value: [structuredClone(snapshot)] }),
    read: async (id) =>
      id === snapshot.id ? { status: "ok", value: structuredClone(snapshot) } : reject(),
    interrupt: async () => reject(),
  });
  await agentDelegationConformance(undefined);
});

test("delegation descriptors preserve unknown control availability without granting it", () => {
  expect("AgentDelegationSchema" in agent).toBe(true);
  const schema = agent.AgentDelegationSchema;
  expect(schema.parse(child).controls.interrupt).toBe("unknown");
  expect(schema.safeParse({ ...child, controls: { interrupt: true } }).success).toBe(false);
});

test("delegation snapshots reject self-parentage and malformed result availability", () => {
  expect("AgentDelegationSchema" in agent).toBe(true);
  const schema = agent.AgentDelegationSchema;
  expect(schema.safeParse({ ...child, parentId: child.id }).success).toBe(false);
  expect(schema.safeParse({ ...child, result: { state: "available" } }).success).toBe(false);
  expect(schema.safeParse({ ...child, nativeThreadId: "leaked" }).success).toBe(false);
});

test("delegation updates are session scoped and do not invent a parent operation", () => {
  expect(
    agent.AgentSessionSignalSchema.safeParse({ kind: "delegation.updated", child }).success,
  ).toBe(true);
});

test("child operation starts carry explicit execution scope", () => {
  expect(
    agent.AgentSessionSignalSchema.safeParse({
      kind: "operation.started",
      operationId: "child-op",
      delegationId: "child",
    }).success,
  ).toBe(true);
});

test("fork requests require distinct source-independent identity and no implicit execution", () => {
  expect("AgentForkInputSchema" in agent).toBe(true);
  const schema = agent.AgentForkInputSchema;
  expect(schema.safeParse({ requestId: "request-1", sessionId: "fork-1" }).success).toBe(true);
  expect(schema.safeParse({ requestId: "", sessionId: "fork-1" }).success).toBe(false);
  expect(
    schema.safeParse({ requestId: "request-1", sessionId: "fork-1", prompt: "run now" }).success,
  ).toBe(false);
});
