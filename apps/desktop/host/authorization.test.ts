import { test, expect } from "bun:test";
import { createDesktopAuthorization } from "./authorization.js";
import { createGrantRefresh } from "./grant-refresh.js";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { defineTool, type ToolEvidence } from "@drawloom/tools";
import { z } from "zod";

const request = {
  subject: { type: "operation", id: "op", properties: { granted: false } },
  action: { name: "invoke" },
  resource: { type: "tool", id: "tool", properties: {} },
};
test("startup replacement can allow without grants while independent ownership stays required", async () => {
  const host = createDesktopAuthorization({ authorize: async () => ({ decision: true }) });
  let owned = true;
  const tool = host.tools({ owns: () => owned, facts: () => request, background: () => false });
  const snapshot = tool.authority.resolve("op", "tool")!;
  expect(
    await tool.authorizer.authorize(snapshot.request, {
      signal: new AbortController().signal,
      remainingMs: () => 1000,
    }),
  ).toEqual({ decision: true });
  owned = false;
  expect(tool.authority.isCurrent("op", snapshot.generation)).toBe(false);
  expect(tool.authority.resolve("op", "tool")).toBeUndefined();
  host.shutdown();
});
test("foreground and workflow use independent pools on the same host scheduler", async () => {
  const host = createDesktopAuthorization({ authorize: () => new Promise(() => {}) });
  const options = { signal: new AbortController().signal, remainingMs: () => 1000 };
  const background = host.tools({ owns: () => true, facts: () => request, background: () => true });
  const foreground = host.tools({
    owns: () => true,
    facts: () => request,
    background: () => false,
  });
  const pending = Array.from({ length: 12 }, () =>
    background.authorizer.authorize(request, options),
  );
  expect(await background.authorizer.authorize(request, options)).toEqual({
    kind: "failure",
    code: "overflow",
  });
  const admitted = foreground.authorizer.authorize(request, options);
  host.shutdown();
  expect(await admitted).toEqual({ kind: "failure", code: "shutdown" });
  await Promise.all(pending);
});
test("grant refresh success and failure invalidate snapshots", async () => {
  const host = createDesktopAuthorization();
  let fail = false;
  const access = host.tools({ owns: () => true, facts: () => request, background: () => false });
  const refresh = createGrantRefresh(
    new Map(),
    async () => {
      if (fail) throw Error("unavailable");
      return true;
    },
    () => new Set<string>(),
    host.invalidate,
  );
  let generation = access.authority.resolve("op", "tool")!.generation;
  await refresh(["workbench"]);
  expect(access.authority.isCurrent("op", generation)).toBe(false);
  generation = access.authority.resolve("op", "tool")!.generation;
  await refresh(["workbench"]);
  expect(access.authority.isCurrent("op", generation)).toBe(true);
  host.invalidate("another-operation");
  expect(access.authority.isCurrent("op", generation)).toBe(true);
  generation = access.authority.resolve("op", "tool")!.generation;
  fail = true;
  await expect(refresh(["workbench"])).rejects.toThrow();
  expect(access.authority.isCurrent("op", generation)).toBe(false);
  host.shutdown();
});

test("a real second-decision timeout records terminal failure without dispatch", async () => {
  let calls = 0,
    decisions = 0;
  const host = createDesktopAuthorization({
    authorize: async () => {
      if (++decisions === 1) return { decision: true };
      return new Promise(() => {});
    },
  });
  const deadline = performance.now() + 100;
  const records: ToolEvidence[] = [];
  const gateway = createLocalToolGateway({
    authorization: host.tools({
      owns: () => true,
      facts: () => request,
      background: () => false,
      remainingMs: () => deadline - performance.now(),
    }),
    tools: [
      defineTool({
        name: "tool",
        description: "test",
        input: z.string(),
        output: z.string(),
        execute: (value) => {
          calls++;
          return value;
        },
      }),
    ],
    nextInvocationId: () => "timeout",
    evidence: {
      async record(record) {
        records.push(record);
      },
    },
  });
  const result = await gateway.invoke(
    gateway.bind("op"),
    "tool",
    "x",
    new AbortController().signal,
  );
  expect(result.outcome).toEqual({
    status: "failed",
    code: "authorization_failed",
    authorizationFailure: "budget_exhausted",
    execution: "not_started",
  });
  expect(records.at(-1)).toEqual({ kind: "finished", result });
  expect(decisions).toBe(2);
  expect(calls).toBe(0);
  host.shutdown();
});

test("shutdown during an awaited decision preserves the scheduler failure in terminal evidence", async () => {
  let entered!: () => void;
  const entry = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const host = createDesktopAuthorization({
    authorize: () => {
      entered();
      return new Promise(() => {});
    },
  });
  const records: ToolEvidence[] = [];
  const gateway = createLocalToolGateway({
    authorization: host.tools({ owns: () => true, facts: () => request, background: () => false }),
    tools: [],
    nextInvocationId: () => "shutdown",
    evidence: {
      async record(record) {
        records.push(record);
      },
    },
  });
  const pending = gateway.invoke(
    gateway.bind("op"),
    "unknown-tool",
    {},
    new AbortController().signal,
  );
  await entry;
  host.shutdown();
  const result = await pending;
  expect(result.outcome).toEqual({
    status: "failed",
    code: "authorization_failed",
    authorizationFailure: "shutdown",
    execution: "not_started",
  });
  expect(records.at(-1)).toEqual({ kind: "finished", result });
});
