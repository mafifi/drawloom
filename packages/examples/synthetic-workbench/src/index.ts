import { z } from "zod";
import { defineTool, type ToolEvidenceSink } from "@drawloom/tools";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { definePlugin } from "@drawloom/plugins";
import { createPluginRegistry } from "@drawloom/startup-plugins";
import { createSyntheticDriver } from "@drawloom/synthetic-agent";
export function createSyntheticWorkbench(evidence: ToolEvidenceSink) {
  const plugin = definePlugin({
    id: "synthetic.text",
    version: "1.0.0",
    config: z.strictObject({}),
    requires: [{ kind: "capability", id: "agent" }],
    contribute: () => ({
      tools: [
        defineTool({
          name: "text.word_count",
          description: "Count whitespace-separated words",
          input: z.strictObject({ text: z.string() }),
          output: z.strictObject({ count: z.number().int().nonnegative() }),
          execute: ({ text }) => ({
            count: text.trim() ? text.trim().split(/\s+/u).length : 0,
          }),
        }),
      ],
      skills: [
        {
          id: "text.inspect",
          title: "Inspect text",
          instructions: "Use text.word_count to inspect supplied text.",
        },
      ],
      workbenches: [
        {
          id: "text",
          title: "Text inspection",
          description: "A local synthetic reference",
          tools: ["text.word_count"],
          skills: ["text.inspect"],
        },
      ],
    }),
  });
  const registry = createPluginRegistry([{ plugin, config: {} }], ["agent"]);
  const granted = new Set<string>();
  let sequence = 0;
  const gateway = createLocalToolGateway({
    tools: registry.tools,
    policy: (operation) => granted.has(operation),
    evidence,
    nextInvocationId: () => `invocation-${++sequence}`,
  });
  return {
    registry,
    gateway,
    driver: createSyntheticDriver((text) => text),
    grant(operationId: string) {
      granted.add(operationId);
    },
    revoke(operationId: string) {
      granted.delete(operationId);
    },
  };
}
