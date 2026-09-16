import { test, expect } from "bun:test";
import { z } from "zod";
import type { AuthorizationResult, Authorizer } from "@drawloom/authorization";
import { defineTool, type ToolEvidence, type ToolAuthorization } from "@drawloom/tools";
import { createLocalToolGateway } from "./src/index.js";

function fixture(authorizer: Authorizer, started = () => {}) {
  let generation = 0;
  let calls = 0;
  const records: ToolEvidence[] = [];
  const authorization: ToolAuthorization = {
    authorizer,
    authority: {
      resolve: (operationId, tool) => ({
        generation,
        request: {
          subject: { type: "operation", id: operationId, properties: {} },
          action: { name: "invoke" },
          resource: { type: "tool", id: tool, properties: {} },
        },
      }),
      isCurrent: (_operationId, value) => value === generation,
      remainingMs: () => 10_000,
    },
  };
  const gateway = createLocalToolGateway({
    authorization,
    tools: [
      defineTool({
        name: "effect",
        description: "effect",
        input: z.string(),
        output: z.string(),
        execute: (value) => {
          calls++;
          return value;
        },
      }),
    ],
    nextInvocationId: () => "invocation",
    evidence: {
      async record(record) {
        records.push(record);
        if (record.kind === "started") started();
      },
    },
  });
  const binding = gateway.bind("operation");
  return {
    gateway,
    binding,
    records,
    calls: () => calls,
    change: () => {
      generation++;
    },
    invoke: () => gateway.invoke(binding, "effect", "x", new AbortController().signal),
  };
}

for (const revocation of ["binding", "generation"])
  for (const decision of [1, 2])
    test(`${revocation} revocation during awaited decision ${decision} prevents execution`, async () => {
      let count = 0;
      let release!: (value: AuthorizationResult) => void;
      let entered!: () => void;
      const entry = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const f = fixture({
        authorize: async () => {
          if (++count !== decision) return { decision: true };
          entered();
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      });
      const pending = f.invoke();
      // A missing async boundary must fail immediately, rather than hang this test.
      await Promise.race([entry, pending]);
      expect(count).toBe(decision);
      if (revocation === "binding") f.gateway.revoke(f.binding);
      else f.change();
      release({ decision: true });
      expect((await pending).outcome).toEqual({
        status: "failed",
        code: "denied",
        execution: "not_started",
      });
      expect(f.calls()).toBe(0);
      expect(f.records.at(-1)?.kind).toBe("finished");
    });

test("grant generation change during evidence invalidates a pending invocation", async () => {
  let decisions = 0;
  const f = fixture(
    {
      authorize: async () => {
        decisions++;
        return { decision: true };
      },
    },
    () => f.change(),
  );
  expect((await f.invoke()).outcome).toEqual({
    status: "failed",
    code: "denied",
    execution: "not_started",
  });
  expect(f.calls()).toBe(0);
  expect(decisions).toBe(1);
});

for (const kind of ["throw", "malformed", "timeout"] as const)
  test(`second decision ${kind} records not-started terminal evidence`, async () => {
    let count = 0;
    const f = fixture({
      authorize: async () => {
        if (++count === 1) return { decision: true };
        if (kind === "throw") throw Error("private");
        if (kind === "malformed") return JSON.parse('{"decision":"yes"}');
        return { kind: "failure", code: "budget_exhausted" };
      },
    });
    const result = await f.invoke();
    expect(result.outcome).toEqual({
      status: "failed",
      code: "authorization_failed",
      authorizationFailure:
        kind === "throw"
          ? "rejected"
          : kind === "malformed"
            ? "malformed_result"
            : "budget_exhausted",
      execution: "not_started",
    });
    expect(f.records.at(-1)).toEqual({ kind: "finished", result });
    expect(f.calls()).toBe(0);
    expect(count).toBe(2);
  });
