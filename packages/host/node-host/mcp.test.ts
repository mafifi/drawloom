import { test, expect } from "bun:test";
import { createMcpToolServer } from "./src/index.js";
import { defineTool } from "@drawloom/tools";
import { createLocalToolGateway } from "../../tools/local-tools/src/index.js";
import { createCodexToolBridge } from "../../agent/codex-agent/src/index.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  JSONRPCMessageSchema,
  type JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

class FetchMcpTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  async start(): Promise<void> {}

  async send(message: JSONRPCMessage): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        authorization: "Bearer " + this.token,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(message),
    });
    if (response.status === 202) return;
    if (!response.ok) throw Error("MCP request failed");
    this.onmessage?.(JSONRPCMessageSchema.parse(await response.json()));
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}
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
          annotations: {
            title: "Character count",
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
          },
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
          outputSchema: { type: "number" },
        },
        {
          name: "text.plain",
          description: "No annotations",
          inputSchema: { type: "object" },
          outputSchema: { type: "string" },
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
  const client = new Client({ name: "annotations-test", version: "0.0.0" });
  const transport = new FetchMcpTransport(server.url, server.token);
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
    await client.connect(transport);
    const listed = (await client.listTools()).tools;
    expect(listed[0]?.annotations).toEqual({
      title: "Character count",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(listed[1]?.annotations).toBeUndefined();
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
    await client.close();
    await server.close();
  }
});
test("MCP exposure rejects malformed annotations", async () => {
  for (const annotations of [
    null,
    false,
    0,
    { readOnlyHint: "yes" },
    { unknownHint: true },
  ]) {
    await expect(
      createMcpToolServer({
        exposure: {
          id: "invalid",
          tools: [
            {
              name: "invalid",
              description: "invalid",
              // @ts-expect-error Deliberately exercise an untyped MCP boundary.
              annotations,
              inputSchema: { type: "object" },
              outputSchema: { type: "string" },
            },
          ],
        },
        invoke: async () => ({}),
      }),
    ).rejects.toBeDefined();
  }
});
