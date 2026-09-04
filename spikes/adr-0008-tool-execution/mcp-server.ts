import { readFileSync } from "node:fs";
import { appendFile, open, rename } from "node:fs/promises";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BindingRegistry, originKey, parseOrigin, projectResult } from "./codex-binding.ts";
import { createGateway } from "./gateway.ts";
import { defineTool } from "./authoring.ts";
import { StateSchema } from "./runtime-state.ts";
import type { Binding } from "./contract.ts";

const directory = process.env.DRAWLOOM_TOOL_PROOF_DIR;
if (!directory) throw new Error("Proof runtime directory required");
const statePath = join(directory, "state.json");
const registry = new BindingRegistry();
const origins = new Map<Binding, string>();
const serverInstance = crypto.randomUUID();
const readState = () => StateSchema.parse(JSON.parse(readFileSync(statePath, "utf8")));
const wordCount = defineTool({
  name: "word_count", description: "Count whitespace-separated words in text.",
  input: z.strictObject({ text: z.string() }),
  output: z.strictObject({ count: z.number().int().nonnegative() }),
  execute: async ({ text }, context) => {
    await appendFile(join(directory, "effects.jsonl"), `${JSON.stringify({ operationId: context.operationId })}\n`);
    return { count: text.trim() ? text.trim().split(/\s+/u).length : 0 };
  },
});
const gateway = createGateway({
  tools: [wordCount],
  allowed: (binding, tool) => {
    const key = origins.get(binding);
    return readState().entries.some((entry) => originKey(entry) === key &&
      entry.operationId === binding.operationId && entry.active && entry.allowedTools.includes(tool));
  },
  record: async (record) => {
    const file = await open(join(directory, "evidence.jsonl"), "a", 0o600);
    try { await file.writeFile(`${JSON.stringify(record)}\n`); await file.sync(); }
    finally { await file.close(); }
  },
});

const server = new Server({ name: "drawloom-adr-0008-proof", version: "0.0.0" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: gateway.catalogue().map(({ name, description, inputSchema }) => ({
    name, description, inputSchema: { ...inputSchema, type: "object" as const },
  })),
}));
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const origin = parseOrigin(request.params._meta);
  let binding: Binding = Object.freeze({ operationId: "unbound" });
  if (origin) {
    // Wait for only this exact acceptance mapping if MCP beats turn/start's response.
    for (let attempt = 0; attempt < 100; attempt++) {
      const entry = readState().entries.find((candidate) => originKey(candidate) === originKey(origin));
      if (entry) {
        binding = registry.bind(origin, entry.operationId);
        origins.set(binding, originKey(origin));
        break;
      }
      await Bun.sleep(20);
    }
  }

  // Test-only wire delay: retain A's actual metadata before gateway dispatch.
  // Renaming consumes the marker once even when tools overlap.
  let delay = false;
  try {
    await rename(join(directory, "delay-next"), join(directory, "delay-consumed")); delay = true;
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  if (delay) {
    const payload = JSON.stringify({ name: request.params.name, arguments: request.params.arguments, _meta: request.params._meta });
    await Bun.write(join(directory, "captured-call.json"), payload);
    await Bun.write(join(directory, "delay-entered"), JSON.stringify({ originPresent: Boolean(origin), bound: binding.operationId !== "unbound" }));
    let released = false;
    for (let attempt = 0; attempt < 1500; attempt++) {
      if (await Bun.file(join(directory, "release-delay")).exists()) { released = true; break; }
      await Bun.sleep(20);
    }
    if (!released) throw new Error("Controlled delay timed out");
  }
  const result = await gateway.invoke(binding, request.params.name, request.params.arguments, extra.signal);
  await appendFile(join(directory, "observations.jsonl"), `${JSON.stringify({
    operationId: binding.operationId, invocationId: result.invocationId,
    status: result.outcome.status, evidence: result.evidence,
    ...(result.outcome.status === "failed" ? { code: result.outcome.code } : {}), serverInstance,
  })}\n`);
  return projectResult(result);
});
await server.connect(new StdioServerTransport());
