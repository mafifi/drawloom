import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import type { PluginBackendFactory } from "@drawloom/desktop-host";

const backend: PluginBackendFactory = async ({ capabilities }) => {
  const store = capabilities.host!.store;
  const uri = "ui://example/view.html";
  const server = new McpServer({ name: "public-choice", version: "1.0.0" });
  registerAppResource(server, "Choices", uri, {}, async () => ({
    contents: [
      {
        uri,
        mimeType: RESOURCE_MIME_TYPE,
        text: `<!doctype html><p>Public fixture</p><p id="bridge-ready"></p><script>
      let initialized = false;
      const send = message => parent.postMessage(message, '*');
      addEventListener('message', event => {
        const message = event.data;
        if (!message || message.jsonrpc !== '2.0') return;
        if (message.id === 'fixture-initialize') {
          initialized = true;
          document.querySelector('#bridge-ready').textContent = 'Bridge ready';
          send({ jsonrpc: '2.0', method: 'ui/notifications/initialized' });
          setTimeout(() => {
            if (!initialized) return;
            send({ jsonrpc: '2.0', id: 'late-message', method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Late fixture message' }] } });
            send({ jsonrpc: '2.0', id: 'late-tool', method: 'tools/call', params: { name: 'example.inspect', arguments: { choice: 'second' } } });
          }, 3000);
        } else if (message.method === 'ui/resource-teardown') {
          initialized = false;
          send({ jsonrpc: '2.0', id: message.id, result: {} });
        }
      });
      send({ jsonrpc: '2.0', id: 'fixture-initialize', method: 'ui/initialize', params: { appCapabilities: {}, appInfo: { name: 'Public fixture', version: '1.0.0' }, protocolVersion: '2025-06-18' } });
    </script>`,
      },
    ],
  }));
  const current = async () => ({
    content: [],
    structuredContent: { choice: (await store.get("example.choice")) ?? "first" },
  });
  registerAppTool(
    server,
    "example.open",
    { inputSchema: {}, _meta: { ui: { resourceUri: uri, visibility: ["app"] } } },
    current,
  );
  registerAppTool(
    server,
    "example.inspect",
    {
      inputSchema: { choice: z.enum(["first", "second"]) },
      _meta: { ui: { visibility: ["app"] } },
    },
    async ({ choice }) => {
      await store.set("example.choice", choice);
      return current();
    },
  );
  registerAppTool(
    server,
    "example.reference",
    { inputSchema: {}, _meta: { ui: { visibility: ["app"] } } },
    async () => ({
      content: [
        {
          type: "resource_link" as const,
          uri: "document://example/guide",
          name: "Writing guide",
          mimeType: "text/plain",
        },
      ],
    }),
  );
  server.registerResource(
    "Writing guide",
    "document://example/guide",
    { mimeType: "text/plain" },
    async () => {
      await store.set("example.reads", Number((await store.get("example.reads")) ?? 0) + 1);
      return {
        contents: [
          { uri: "document://example/guide", text: "Use simple words.", mimeType: "text/plain" },
        ],
      };
    },
  );
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  await server.connect(peer);
  return {
    contributions: {
      workbenches: [{ id: "example", title: "Example", description: "", tools: [], skills: [] }],
      views: [
        { id: "example.view", workbenchId: "example", title: "Example view", entrypoint: uri },
      ],
    },
    servers: [{ name: "editor", transport }],
    dispose: () => server.close(),
  };
};
export default backend;
