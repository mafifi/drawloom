import { z } from "zod";
import type { ToolDefinition } from "@drawloom/tools";
import type { Workbench } from "@drawloom/workbench";
export * from './package.js';
import { PluginRequirementSchema, type PluginRequirement } from './requirements.js';
export { PluginRequirementSchema, type PluginRequirement } from './requirements.js';
export const SkillSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  instructions: z.string().min(1),
});
export type Skill = z.infer<typeof SkillSchema>;
/** Provisional, separately built HTML view; trusted startup owns the resource. */
export const WorkbenchViewSchema = z.strictObject({
  id: z.string().min(1).max(256),
  workbenchId: z.string().min(1).max(256),
  title: z.string().min(1).max(120),
  entrypoint: z.string().regex(/^ui:\/\/[A-Za-z0-9._/-]+\.html$/),
});
export type WorkbenchView = z.infer<typeof WorkbenchViewSchema>;
export const RegisteredWorkbenchViewSchema = WorkbenchViewSchema.extend({ pluginId: z.string().min(1) });
export type RegisteredWorkbenchView = z.infer<typeof RegisteredWorkbenchViewSchema>;
export type PluginContributions = {
  tools?: readonly ToolDefinition[];
  skills?: readonly Skill[];
  workbenches?: readonly Workbench[];
  views?: readonly WorkbenchView[];
};
export type PluginDefinition = {
  readonly id: string;
  readonly version: string;
  readonly requires: readonly PluginRequirement[];
  prepare(config: unknown): () => PluginContributions;
};
export type PluginInstaller = { plugin: PluginDefinition; config: unknown };
export const RegisteredContributionSchema = z.strictObject({
  id: z.string().min(1), pluginId: z.string().min(1),
  kind: z.enum(['skill', 'tool', 'workbench', 'view']),
  contributionId: z.string().min(1), title: z.string().min(1), description: z.string(),
});
export type RegisteredContribution = z.infer<typeof RegisteredContributionSchema>;
export type PluginRegistry = {
  readonly contributions: readonly RegisteredContribution[];
  readonly plugins: readonly { id: string; version: string }[];
  readonly tools: readonly ToolDefinition[];
  readonly skills: readonly Skill[];
  readonly workbenches: readonly Workbench[];
  readonly views: readonly RegisteredWorkbenchView[];
};
export function definePlugin<C extends z.ZodType>(definition: {
  id: string;
  version: string;
  config: C;
  requires?: readonly PluginRequirement[];
  contribute: (config: z.output<C>) => PluginContributions;
}): PluginDefinition {
  const id = z.string().min(1).parse(definition.id);
  const version = z
    .string()
    .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
    .parse(definition.version);
  const requires = Object.freeze(
    (definition.requires ?? []).map((r) =>
      Object.freeze(PluginRequirementSchema.parse(r)),
    ),
  );
  return Object.freeze({
    id,
    version,
    requires,
    prepare(config: unknown) {
      const result = definition.config.safeParse(config);
      if (!result.success) {
        const path = result.error.issues[0]?.path.map(String).join(".") ?? "";
        throw Error(`Invalid plugin configuration at ${path || "<root>"}`);
      }
      return () => definition.contribute(result.data);
    },
  });
}
