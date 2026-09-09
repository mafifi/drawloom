import { test, expect } from "bun:test";
import { createMcpToolServer } from "./src/index.js";
import { defineTool } from "@drawloom/tools";
import { createLocalToolGateway } from "../../tools/local-tools/src/index.js";
import { createCodexToolBridge } from "../../agent/codex-agent/src/index.js";
import { z } from "zod";
test("MCP executes through the gateway and delayed origins cannot borrow authority", async () => {
  let sequence = 0;
  let effects = 0;
  const gateway = createLocalToolGateway({
    tools: [
      defineTool({
        name: "count",
        description: "Count",
        input: z.strictObject({ text: z.string() }),
        output: z.strictObject({ count: z.number() }),
        execute: ({ text }) => {
          effects++;
          return { count: text.length };
        },
      }),
    ],
    policy: () => true,
    evidence: { record: async () => {} },
    nextInvocationId: () => String(++sequence),
  });
  const bridge = createCodexToolBridge(gateway);
  bridge.publish("thread", "a", gateway.bind("operation-a"));
  const server = await createMcpToolServer({
    exposure: gateway.exposure,
    invoke: bridge.call,
  });
  const call = async (turn: string, args: unknown) => {
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + server.token,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "count",
          arguments: args,
          _meta: {
            callId: "call",
            "x-codex-turn-metadata": { thread_id: "thread", turn_id: turn },
          },
        },
      }),
    });
    return response.json();
  };
  try {
    expect(await call("a", { text: "hello" })).toMatchObject({
      result: {
        isError: false,
        structuredContent: { value: { count: 5 } },
        _meta: { operationId: "operation-a" },
      },
    });
    bridge.retire("thread", "a");
    bridge.publish("thread", "b", gateway.bind("operation-b"));
    expect(await call("a", { text: "delayed" })).toMatchObject({
      result: { isError: true },
    });
    expect(await call("b", { text: 3 })).toMatchObject({
      result: { isError: true, _meta: { execution: "not_started" } },
    });
    expect(effects).toBe(1);
  } finally {
    await server.close();
  }
});
test("MCP authentication, schema projection and canonical result boundary", async () => {
  const server = await createMcpToolServer({
    exposure: {
      id: "test",
      tools: [
        {
          name: "text.count",
          description: "Count",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
          outputSchema: { type: "number" },
        },
      ],
    },
    invoke: async (meta, name, args) => ({
      content: [{ type: "text", text: "5" }],
      structuredContent: { value: 5 },
      isError: false,
      _meta: { invocationId: "1" },
    }),
  });
  const call = async (method: string, params: unknown) => {
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + server.token,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return response.json();
  };
  try {
    expect((await fetch(server.url, { method: "POST" })).status).toBe(401);
    expect(await call("tools/list", {})).toMatchObject({
      result: { tools: [{ name: "text.count" }] },
    });
    expect(
      await call("tools/call", {
        name: "text.count",
        arguments: { text: "hello" },
        _meta: { callId: "call" },
      }),
    ).toMatchObject({
      result: { structuredContent: { value: 5 }, _meta: { invocationId: "1" } },
    });
  } finally {
    await server.close();
  }
});
