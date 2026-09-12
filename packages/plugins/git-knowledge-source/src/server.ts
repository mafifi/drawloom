import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GitKnowledgeSource, GitKnowledgeSourceError, gitBatchResult } from "./source.js";

const launch = z.strictObject({
  repository: z.string().min(1), paths: z.array(z.string()).min(1).max(200), dataDirectory: z.string().min(1),
}).parse({
  repository: process.env.GIT_SOURCE_REPOSITORY,
  paths: JSON.parse(process.env.GIT_SOURCE_PATHS ?? "null"),
  dataDirectory: process.env.PLUGIN_DATA,
});
const source = new GitKnowledgeSource(launch);
const server = new McpServer({ name: "git-knowledge-source", version: "0.0.0" });
server.registerTool("git.changes", {
  description: "Inspect configured committed UTF-8 text files. It never reads the worktree or executes repository code.",
  inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async () => {
  try {
    const batch = await source.changes();
    return gitBatchResult(batch);
  } catch (error) {
    const code = error instanceof GitKnowledgeSourceError ? error.code : "unavailable";
    return { isError: true, content: [{ type: "text", text: "git.changes failed: " + code }] };
  }
});
server.registerTool("git.acknowledge", {
  description: "Acknowledge one durably received Git changes batch. This only advances the plugin delivery checkpoint.",
  inputSchema: { token: z.string().min(1).max(256) },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}, async ({ token }) => {
  try {
    await source.acknowledge(token);
    return { content: [{ type: "text", text: "Acknowledged" }] };
  } catch (error) {
    const code = error instanceof GitKnowledgeSourceError ? error.code : "unavailable";
    return { isError: true, content: [{ type: "text", text: "git.acknowledge failed: " + code }] };
  }
});
await server.connect(new StdioServerTransport());
