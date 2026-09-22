import { createServer } from "node:http";
import { readControl, readReceipt, writeReceipt } from "./native-recovery-fixture.mjs";

function response(body, status = 200) {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function createRecoveryMcpServer(root) {
  let callCount = 0;
  let closed = false;
  const sockets = new Set();
  const waitForRelease = async (operationId) => {
    while (!closed) {
      const control = await readControl(root, "effect-release");
      if (control?.operationId === operationId) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw Error("Synthetic MCP server closed");
  };
  const server = createServer(async (request, reply) => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    let output;
    try {
      if (request.method !== "POST") output = response({ error: "Method not allowed" }, 405);
      else {
        const message = JSON.parse(raw);
        if (message.id === undefined) output = { status: 202, headers: {}, body: "" };
        else if (message.method === "initialize")
          output = response({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "drawloom-native-recovery", version: "1" },
            },
          });
        else if (message.method === "tools/list")
          output = response({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              tools: [
                {
                  name: "hold",
                  description:
                    "Record a synthetic effect start and await an exact release receipt.",
                  inputSchema: {
                    type: "object",
                    additionalProperties: false,
                    required: ["runId", "threadId", "turnId", "operationId"],
                    properties: {
                      runId: { type: "string" },
                      threadId: { type: "string" },
                      turnId: { type: "string" },
                      operationId: { type: "string" },
                    },
                  },
                },
              ],
            },
          });
        else if (message.method === "tools/call" && message.params?.name === "hold") {
          callCount++;
          if (callCount !== 1 || (await readReceipt(root, "effect-started")))
            throw Error("Duplicate holding effect dispatch");
          const input = message.params.arguments;
          const receipt = {
            kind: "effect-started",
            runId: input.runId,
            threadId: input.threadId,
            turnId: input.turnId,
            operationId: input.operationId,
          };
          await writeReceipt(root, "effect-started", receipt);
          await waitForRelease(input.operationId);
          await writeReceipt(root, "effect-finished", {
            kind: "effect-finished",
            operationId: input.operationId,
          });
          output = response({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              content: [{ type: "text", text: "Synthetic hold released" }],
            },
          });
        } else
          output = response({
            jsonrpc: "2.0",
            id: message.id,
            error: { code: -32601, message: "Method not found" },
          });
      }
    } catch {
      output = response({ error: "Invalid synthetic MCP request" }, 400);
    }
    reply.writeHead(output.status, output.headers);
    reply.end(output.body);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    async close() {
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
