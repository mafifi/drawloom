import { ToolExposureSchema, type ToolExposure } from "@drawloom/tools";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
export async function createMcpToolServer(options: {
  exposure: ToolExposure;
  invoke: (
    metadata: unknown,
    name: string,
    args: unknown,
    signal: AbortSignal,
  ) => Promise<unknown>;
}): Promise<{ url: string; token: string; close(): Promise<void> }> {
  const exposure = ToolExposureSchema.parse(structuredClone(options.exposure));
  const token = randomBytes(32).toString("hex");
  const active = new Set<Server>();
  // MCP requires an object result schema; canonical scalar values use a value envelope.
  const tools = exposure.tools.map((t) => {
    const inputSchema = z
      .object({ type: z.literal("object") })
      .passthrough()
      .parse(t.inputSchema);
    return {
      name: t.name,
      description: t.description,
      ...(t.annotations ? { annotations: t.annotations } : {}),
      inputSchema,
      outputSchema: {
        type: "object" as const,
        properties: {
          value: z.record(z.string(), z.unknown()).parse(t.outputSchema),
        },
        required: ["value"],
        additionalProperties: false,
      },
    };
  });
  const http = createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer " + token) {
      res.writeHead(401).end();
      return;
    }
    if (req.url !== "/mcp" || req.method !== "POST") {
      res.writeHead(404).end();
      return;
    }
    const server = new Server(
      { name: "drawloom-tools", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    active.add(server);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      try {
        return CallToolResultSchema.parse(
          await options.invoke(
            request.params._meta,
            request.params.name,
            request.params.arguments ?? {},
            extra.signal,
          ),
        );
      } catch {
        return {
          isError: true,
          content: [
            { type: "text" as const, text: "Tool invocation unavailable" },
          ],
        };
      }
    });
    res.on("close", () => {
      active.delete(server);
      void server.close();
    });
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk);
        size += bytes.length;
        if (size > 4 * 1024 * 1024) {
          res.writeHead(413).end();
          return;
        }
        chunks.push(bytes);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === "string") headers.set(key, value);
      await server.connect(transport);
      const response = await transport.handleRequest(
        new Request("http://127.0.0.1/mcp", {
          method: "POST",
          headers,
          body: Buffer.concat(chunks),
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(0, "127.0.0.1", () => resolve());
  });
  const address = http.address();
  if (!address || typeof address === "string")
    throw Error("MCP server unavailable");
  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    token,
    async close() {
      if (closed) return;
      closed = true;
      await Promise.all([...active].map((s) => s.close()));
      await new Promise<void>((resolve, reject) => {
        http.close((error) =>
          error && error.message !== "Server is not running."
            ? reject(error)
            : resolve(),
        );
        http.closeAllConnections();
      });
    },
  };
}
