import { z } from 'zod';
import { definePlugin, type PluginInstaller } from '@drawloom/plugins';
import { defineTool, ToolExposureSchema, type ToolExposure } from '@drawloom/tools';
/** Host policy: unknown is not read-only, and native review never grants tools. */
export function mcpReviewConfiguration(exposure: ToolExposure) {
  return { default_tools_approval_mode: 'prompt', tools: Object.fromEntries(
    ToolExposureSchema.parse(exposure).tools.map(tool => [tool.name, { approval_mode: tool.annotations?.readOnlyHint === true ? 'approve' : 'prompt' }]),
  ) };
}
export const textPlugin = definePlugin({
  id: 'synthetic.text', version: '1.0.0', config: z.strictObject({}),
  contribute: () => ({
    tools: [defineTool({ name: 'text.word_count', description: 'Count words in supplied text', annotations: { readOnlyHint: true }, input: z.strictObject({ text: z.string() }), output: z.strictObject({ count: z.number().int().nonnegative() }), execute: ({ text }) => ({ count: text.trim() ? text.trim().split(/\s+/u).length : 0 }) })],
    skills: [{ id: 'text.clear-writing', title: 'Clear writing', description: 'Help make a draft shorter and easier to read.', instructions: 'Use short sentences and plain language. Preserve the author’s meaning.' }], workbenches: [{ id: 'text', title: 'Text studio', description: 'Local synthetic text inspection', tools: ['text.word_count'], skills: [] }],
  }),
});
