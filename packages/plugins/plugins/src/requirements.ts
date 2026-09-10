import { z } from 'zod';
export const PluginRequirementSchema = z.strictObject({
  kind: z.enum(['capability', 'tool', 'skill']), id: z.string().min(1),
});
export type PluginRequirement = z.infer<typeof PluginRequirementSchema>;
