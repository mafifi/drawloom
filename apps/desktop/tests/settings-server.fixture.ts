import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { build as esbuild } from "esbuild";
const server = new McpServer({ name: "public-preferences", version: "1" });
const uri = "ui://public-preferences/settings.html";
let value = 3,
  revision = 0;
const appBuild = await esbuild({
  entryPoints: [new URL("./settings-app.fixture.ts", import.meta.url).pathname],
  platform: "browser",
  bundle: true,
  format: "esm",
  minify: true,
  write: false,
});
const javascript = appBuild.outputFiles[0]!.text;
registerAppResource(server, "Preferences", uri, {}, async () => ({
  contents: [
    {
      uri,
      mimeType: RESOURCE_MIME_TYPE,
      text: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;color-scheme:light dark;margin:24px}input,button{font:inherit;margin:12px;padding:8px}main{max-width:640px}h1{font-size:20px}</style></head><body><script type="module">${javascript.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
    },
  ],
}));
registerAppTool(
  server,
  "preferences.open",
  { inputSchema: {}, _meta: { ui: { resourceUri: uri, visibility: ["app"] } } },
  async () => ({
    content: [],
    structuredContent: {
      value,
      revision,
      projectDirectory: process.env.DRAWLOOM_PROJECT_DIR ?? null,
      configurationDirectory: process.env.DRAWLOOM_PLUGIN_CONFIG_DIR ?? null,
      dataDirectory: process.env.PLUGIN_DATA ?? null,
    },
  }),
);
registerAppTool(
  server,
  "preferences.save",
  {
    inputSchema: { value: z.number().int().min(0), revision: z.number().int().min(0) },
    _meta: { ui: { visibility: ["app"] } },
  },
  async (input) => {
    if (input.revision !== revision)
      return {
        isError: true,
        content: [{ type: "text", text: "Preferences changed. Reopen before saving." }],
      };
    value = input.value;
    revision++;
    return { content: [], structuredContent: { value, revision } };
  },
);
await server.connect(new StdioServerTransport());
