import { z } from "zod";
import type { ToolDefinition } from "@drawloom/tools";
import type { Workbench } from "@drawloom/workbench";
export const SkillSchema = z.strictObject({
  id: z.string().min(1),
  title: z.string().min(1),
  instructions: z.string().min(1),
});
export type Skill = z.infer<typeof SkillSchema>;
export const PluginRequirementSchema = z.strictObject({
  kind: z.enum(["capability", "tool", "skill"]),
  id: z.string().min(1),
});
export type PluginRequirement = z.infer<typeof PluginRequirementSchema>;
export type PluginContributions = {
  tools?: readonly ToolDefinition[];
  skills?: readonly Skill[];
  workbenches?: readonly Workbench[];
};
export type PluginDefinition = {
  readonly id: string;
  readonly version: string;
  readonly requires: readonly PluginRequirement[];
  prepare(config: unknown): () => PluginContributions;
};
export type PluginInstaller = { plugin: PluginDefinition; config: unknown };
export type PluginRegistry = {
  readonly plugins: readonly { id: string; version: string }[];
  readonly tools: readonly ToolDefinition[];
  readonly skills: readonly Skill[];
  readonly workbenches: readonly Workbench[];
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
