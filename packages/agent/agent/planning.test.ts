import { expect, test } from "bun:test";
import { agentPlanningConformance } from "./src/planning-conformance.js";
import { AgentOperationInputSchema, AgentSessionSignalSchema } from "./src/index.js";
test("deterministic planning capability runs shared conformance, including unsupported", async () => {
  for (const supported of [true, false])
    await agentPlanningConformance(
      async () => ({
        sessionId: "deterministic",
        modes: supported ? ["default", "plan"] : [],
        reviewerModes: ["human"],
        async execute(input) {
          return supported
            ? { status: "ok", value: { operationId: input.operationId } }
            : {
                status: "rejected",
                failure: { code: "provider_rejected", message: "Mode unavailable" },
              };
        },
        async resolveApproval() {
          return { status: "ok", value: undefined };
        },
        async respondToInput() {
          return { status: "ok", value: undefined };
        },
        async close() {
          return { status: "ok", value: undefined };
        },
        async *signals() {},
      }),
      supported,
    );
});

test("native planning mode is validated separately from user text", () => {
  expect(
    AgentOperationInputSchema.safeParse({ operationId: "op", text: "Inspect", mode: "plan" })
      .success,
  ).toBe(true);
  expect(
    AgentOperationInputSchema.safeParse({ operationId: "op", text: "Inspect", mode: "invented" })
      .success,
  ).toBe(false);
});
test("proposed plan snapshots retain identity and distinguish partial from authoritative completion", () => {
  expect(
    AgentSessionSignalSchema.safeParse({
      kind: "plan.proposed",
      operationId: "op",
      proposalId: "p",
      text: "Plan",
      state: "complete",
    }).success,
  ).toBe(true);
  expect(
    AgentSessionSignalSchema.safeParse({
      kind: "plan.proposed",
      operationId: "op",
      proposalId: "",
      text: "Plan",
      state: "complete",
    }).success,
  ).toBe(false);
});
