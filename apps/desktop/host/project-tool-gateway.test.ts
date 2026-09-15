import { expect, test } from "bun:test";
import { createProjectToolGatewayAccess } from "./project-tool-gateway.js";

function setup() {
  let owner: { conversationId: string; projectId: string; workbenchId: string } | undefined = {
    conversationId: "conversation",
    projectId: "project",
    workbenchId: "workbench",
  };
  const grants = new Map([["workbench", new Set(["tool.allowed"])]]);
  const events: string[] = [];
  let rejectEvidence = false;
  const access = createProjectToolGatewayAccess({
    projectId: "project",
    workbenchIds: ["workbench"],
    grants,
    ownerForOperation: () => owner,
    evidenceFor: async (conversationId) => ({
      record: async () => {
        events.push(`evidence:${conversationId}`);
        if (rejectEvidence) throw Error("evidence unavailable");
      },
    }),
    recoveryFor: async (conversationId) => ({
      record: async () => {
        events.push(`recovery:${conversationId}`);
      },
    }),
  });
  return {
    access,
    events,
    grants,
    rejectEvidence: () => (rejectEvidence = true),
    setOwner: (next: typeof owner) => (owner = next),
  };
}

test("foreground policy denies another project, another workbench, and a revoked grant", () => {
  const fixture = setup();
  expect(fixture.access.allowed("operation", "tool.allowed")).toBe(true);
  fixture.setOwner({
    conversationId: "conversation",
    projectId: "other",
    workbenchId: "workbench",
  });
  expect(fixture.access.allowed("operation", "tool.allowed")).toBe(false);
  fixture.setOwner({ conversationId: "conversation", projectId: "project", workbenchId: "other" });
  expect(fixture.access.allowed("operation", "tool.allowed")).toBe(false);
  fixture.setOwner({
    conversationId: "conversation",
    projectId: "project",
    workbenchId: "workbench",
  });
  expect(fixture.access.allowed("operation", "tool.allowed")).toBe(true);
  fixture.grants.get("workbench")!.delete("tool.allowed");
  expect(fixture.access.allowed("operation", "tool.allowed")).toBe(false);
});

test("foreground evidence rejects when its operation owner has disappeared", async () => {
  const fixture = setup();
  fixture.setOwner(undefined);
  await expect(
    fixture.access.record({
      kind: "started",
      invocationId: "invocation",
      operationId: "operation",
      tool: "tool.allowed",
    }),
  ).rejects.toThrow("No active operation owns this tool invocation");
  expect(fixture.events).toEqual([]);
});

test("finished foreground evidence is persisted before resource recovery", async () => {
  const fixture = setup();
  await fixture.access.record({
    kind: "finished",
    result: {
      invocationId: "invocation",
      operationId: "operation",
      evidence: "recorded",
      outcome: {
        status: "ok",
        value: null,
        text: "done",
        content: [{ type: "text", text: "done" }],
      },
    },
  });
  expect(fixture.events).toEqual(["evidence:conversation", "recovery:conversation"]);
});

test("failed foreground evidence does not attempt resource recovery", async () => {
  const fixture = setup();
  fixture.rejectEvidence();
  await expect(
    fixture.access.record({
      kind: "finished",
      result: {
        invocationId: "invocation",
        operationId: "operation",
        evidence: "outcome_failed",
        outcome: { status: "failed", code: "handler_failed", execution: "unknown" },
      },
    }),
  ).rejects.toThrow("evidence unavailable");
  expect(fixture.events).toEqual(["evidence:conversation"]);
});
