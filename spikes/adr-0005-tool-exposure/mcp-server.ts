import { randomUUID } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  createToolAuthority,
  type ActiveOperationGrant,
} from "./tool-authority";

const grantPath = process.env.DRAWLOOM_SPIKE_GRANT_PATH;
const evidencePath = process.env.DRAWLOOM_SPIKE_EVIDENCE_PATH;

if (!grantPath || !evidencePath) {
  throw new Error("Spike grant and evidence paths are required");
}

const GrantSchema = z
  .object({
    exposureId: z.string().min(1),
    grantId: z.string().min(1),
    operationId: z.string().min(1),
    allowedTools: z.array(z.string().min(1)),
  })
  .strict();

const authority = createToolAuthority({
  exposure: {
    exposureId: "exposure-1",
    toolSetId: "probe-tools",
    revision: "1",
    tools: [
      {
        name: "drawloom_probe",
        description:
          "Return deterministic evidence identifying the active Drawloom operation grant.",
      },
    ],
  },
  readActiveGrant: async (): Promise<ActiveOperationGrant> =>
    GrantSchema.parse(JSON.parse(await readFile(grantPath, "utf8"))),
});
const serverInstanceId = randomUUID();

const ProbeInputSchema = z
  .object({
    value: z.string().min(1),
  })
  .strict();

const server = new Server(
  {
    name: "drawloom-adr-0005-tool-exposure-spike",
    version: "0.0.0",
  },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: authority.listTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(ProbeInputSchema, { target: "draft-07" }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const input = ProbeInputSchema.parse(request.params.arguments);
  const decision = await authority.invoke(request.params.name, input);
  const evidence = {
    serverInstanceId,
    toolInvocationId: randomUUID(),
    ...decision,
  };
  await appendFile(evidencePath, `${JSON.stringify(evidence)}\n`, "utf8");

  return {
    isError: decision.status === "denied",
    structuredContent: evidence,
    _meta: {
      drawloom: {
        toolInvocationId: evidence.toolInvocationId,
        operationId: decision.operationId,
      },
    },
    content: [
      {
        type: "text",
        text: JSON.stringify(evidence),
      },
    ],
  };
});

await server.connect(new StdioServerTransport());
