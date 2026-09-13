import { expect, test } from "bun:test";
import { createKnowledgeEvaluationPresentationClient } from "./src/client.js";

test("presentation adapter narrows starts to a fixed definition reference and validates every response", async () => {
  const calls: Array<{ operation: string; input: unknown }> = [];
  const responses = new Map<string, unknown>([
    ["readiness", { status: "ready" }],
    ["listDefinitions", { items: [{ ref: { id: "fixed", revision: "r1" }, name: "Fixed", mode: "assess_existing", caseCount: 1, scorerCount: 1 }], hasMore: false }],
    ["assess", { kind: "started", evaluationRunId: "run-1", orchestrationRunId: "workflow-1" }],
  ]);
  const client = createKnowledgeEvaluationPresentationClient(async (operation, input) => {
    calls.push({ operation, input });
    return responses.get(operation);
  });
  expect(await client.readiness()).toEqual({ status: "ready" });
  expect((await client.listDefinitions({ limit: 50 })).items[0]?.ref.id).toBe("fixed");
  expect(await client.assess({
    requestId: "request-1", settings: { repetitions: 1, concurrency: 1 },
    definition: { schemaVersion: 1, id: "fixed", revision: "r1", name: "Browser copy must not cross", mode: "assess_existing", scorers: [{ id: "invented", revision: "r1" }], cases: [{ id: "invented", revision: "r1", input: null, suppliedOutput: null, references: [] }] },
  })).toMatchObject({ kind: "started", evaluationRunId: "run-1" });
  expect(calls.at(-1)).toEqual({ operation: "assess", input: { requestId: "request-1", definition: { id: "fixed", revision: "r1" } } });
  responses.set("listDefinitions", { items: [{ ref: { id: "invalid space", revision: "r1" }, name: "Invalid", mode: "assess_existing", caseCount: 1, scorerCount: 1 }], hasMore: false });
  await expect(client.listDefinitions({})).rejects.toThrow();
});
