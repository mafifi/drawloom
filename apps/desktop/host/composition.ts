import { z } from 'zod';
import { definePlugin, type PluginInstaller } from '@drawloom/plugins';
import { defineTool } from '@drawloom/tools';
export type { DesktopExtension, DesktopExtensionFactory } from '@drawloom/desktop-host';
export const textPlugin = definePlugin({
  id: 'synthetic.text', version: '1.0.0', config: z.strictObject({}),
  contribute: () => ({
    tools: [defineTool({ name: 'text.word_count', description: 'Count words in supplied text', input: z.strictObject({ text: z.string() }), output: z.strictObject({ count: z.number().int().nonnegative() }), execute: ({ text }) => ({ count: text.trim() ? text.trim().split(/\s+/u).length : 0 }) })],
    skills: [], workbenches: [{ id: 'text', title: 'Text studio', description: 'Local synthetic text inspection', tools: ['text.word_count'], skills: [] }],
  }),
});
