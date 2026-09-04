import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "drawloom-adr-0007-interaction-spike",
    version: "0.0.0",
  },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "drawloom_request_one_input",
      description:
        "Request one non-sensitive value, then report whether it was supplied.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "drawloom_request_two_inputs",
      description:
        "Request two independent non-sensitive values concurrently, then return a short acknowledgement.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "drawloom_request_one_input") {
    const response = await server.elicitInput({
      mode: "form",
      message: "Provide the Drawloom spike value.",
      requestedSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
            title: "Value",
            minLength: 1,
          },
        },
        required: ["value"],
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `Form elicitation was advertised by the client; response action: ${response.action}.`,
        },
      ],
    };
  }

  if (request.params.name !== "drawloom_request_two_inputs") {
    throw new Error("Unknown interaction-spike tool");
  }
  const [first, second] = await Promise.all([
    server.elicitInput({
      mode: "form",
      message: "Provide the first Drawloom spike value.",
      requestedSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
            title: "First value",
            minLength: 1,
          },
        },
        required: ["value"],
      },
    }),
    server.elicitInput({
      mode: "form",
      message: "Provide the second Drawloom spike value.",
      requestedSchema: {
        type: "object",
        properties: {
          value: {
            type: "string",
            title: "Second value",
            minLength: 1,
          },
        },
        required: ["value"],
      },
    }),
  ]);

  return {
    content: [
      {
        type: "text",
        text:
          first.action === "accept" && second.action === "accept"
            ? "Both Drawloom spike inputs were received."
            : "At least one Drawloom spike input was not supplied.",
      },
    ],
  };
});

await server.connect(new StdioServerTransport());
