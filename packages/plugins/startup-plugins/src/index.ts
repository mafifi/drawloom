import {
  SkillSchema,
  PluginRequirementSchema,
  WorkbenchViewSchema,
  type PluginInstaller,
  type PluginRegistry,
} from "@drawloom/plugins";
import { WorkbenchSchema } from "@drawloom/workbench";
import { ToolExposureSchema, type ToolDefinition } from "@drawloom/tools";
import { z } from "zod";
function unique(items: readonly string[], kind: string) {
  const seen = new Set<string>();
  for (const id of items) {
    z.string().min(1).parse(id);
    if (seen.has(id)) throw Error(`Duplicate ${kind} identity: ${id}`);
    seen.add(id);
  }
  return seen;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
export function createPluginRegistry(
  installs: readonly PluginInstaller[],
  capabilities: readonly string[],
): PluginRegistry {
  unique(
    installs.map((i) => i.plugin.id),
    "plugin",
  );
  const available = unique(capabilities, "capability");
  // Parse every configuration before executing trusted contribution functions.
  const prepared = installs.map(({ plugin, config }) => plugin.prepare(config));
  for (const { plugin } of installs)
    for (const raw of plugin.requires) {
      const req = PluginRequirementSchema.parse(raw);
      if (req.kind === "capability" && !available.has(req.id))
        throw Error(`Missing capability: ${req.id}`);
    }
  const contributions = prepared.map((prepare) => prepare());
  const tools: ToolDefinition[] = contributions.flatMap((c) => [
    ...(c.tools ?? []),
  ]);
  const skills = contributions
    .flatMap((c) => [...(c.skills ?? [])])
    .map((s) => SkillSchema.parse(s));
  const workbenches = contributions
    .flatMap((c) => [...(c.workbenches ?? [])])
    .map((w) => WorkbenchSchema.parse(w));
  const views = contributions.flatMap((contribution, index) =>
    (contribution.views ?? []).map((raw) => {
      const view = WorkbenchViewSchema.parse(raw);
      if (!contribution.workbenches?.some(w => w.id === view.workbenchId))
        throw Error('View must belong to a workbench contributed by its plugin');
      return { ...view, pluginId: installs[index]!.plugin.id };
    }),
  );
  unique(views.map(v => v.id), 'view');
  unique(views.map(v => v.workbenchId), 'workbench view');
  unique(views.map(v => v.entrypoint), 'view entrypoint');
  const toolIds = unique(
    tools.map((t) => t.name),
    "tool",
  );
  const skillIds = unique(
    skills.map((s) => s.id),
    "skill",
  );
  unique(
    workbenches.map((w) => w.id),
    "workbench",
  );
  for (const t of tools) {
    ToolExposureSchema.shape.tools.element.parse({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      outputSchema: t.outputSchema,
    });
    for (const method of [
      "parseInput",
      "parseOutput",
      "execute",
      "render",
    ] as const)
      if (typeof t[method] !== "function")
        throw Error("Invalid tool definition");
  }
  for (const { plugin } of installs)
    for (const req of plugin.requires) {
      if (
        (req.kind === "tool" && !toolIds.has(req.id)) ||
        (req.kind === "skill" && !skillIds.has(req.id))
      )
        throw Error(`Missing ${req.kind}: ${req.id}`);
    }
  for (const workbench of workbenches) {
    for (const tool of workbench.tools)
      if (!toolIds.has(tool)) throw Error(`Missing workbench tool: ${tool}`);
    for (const skill of workbench.skills)
      if (!skillIds.has(skill))
        throw Error(`Missing workbench skill: ${skill}`);
  }
  return Object.freeze({
    plugins: freeze(
      installs.map((i) => ({ id: i.plugin.id, version: i.plugin.version })),
    ),
    tools: Object.freeze([...tools]),
    skills: freeze(skills),
    workbenches: freeze(workbenches),
    views: freeze(views),
  });
}
