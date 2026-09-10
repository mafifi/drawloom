import { z } from "zod";
export { packageInspectionConformance, type PackageFixture } from './package-conformance.js';
import {
  definePlugin,
  type PluginInstaller,
  type PluginRegistry,
} from "./index.js";
export async function pluginConformance(
  factory: (
    installs: readonly PluginInstaller[],
    capabilities: readonly string[],
  ) => PluginRegistry,
): Promise<void> {
  const check = (condition: unknown, message: string) => {
    if (!condition) throw Error(message);
  };
  let contributions = 0;
  const plugin = definePlugin({
    id: "synthetic",
    version: "1.0.0",
    config: z.strictObject({ label: z.string() }),
    requires: [{ kind: "capability", id: "agent" }],
    contribute: (config) => {
      contributions++;
      return {
        skills: [
          {
            id: "inspect",
            title: config.label,
            instructions: "Inspect the supplied text",
          },
        ],
        workbenches: [
          {
            id: "text",
            title: "Text",
            description: "Synthetic text",
            tools: [],
            skills: ["inspect"],
          },
        ],
        views: [{ id: 'text.view', workbenchId: 'text', title: 'Text view', entrypoint: 'ui://synthetic/text.html' }],
      };
    },
  });
  let failed = false;
  try {
    factory([{ plugin, config: { label: 3 } }], ["agent"]);
  } catch {
    failed = true;
  }
  check(failed && contributions === 0, "invalid config before contribution");
  failed = false;
  try {
    factory(
      [
        { plugin, config: { label: "Text" } },
        { plugin, config: { label: "Other" } },
      ],
      ["agent"],
    );
  } catch {
    failed = true;
  }
  check(failed, "duplicate plugin");
  failed = false;
  try {
    factory([{ plugin, config: { label: "Text" } }], []);
  } catch {
    failed = true;
  }
  check(failed, "missing public capability");
  const registry = factory([{ plugin, config: { label: "Text" } }], ["agent"]);
  check(registry.skills[0]?.title === "Text", "parsed contribution");
  check(Object.isFrozen(registry.skills), "immutable registry");
  check(registry.contributions?.some(c => c.kind === 'skill' && c.pluginId === 'synthetic' && c.contributionId === 'inspect'), 'skill ownership retained');
  check(!JSON.stringify(registry.contributions).includes('Inspect the supplied text'), 'catalogue does not expose instructions');
  check(registry.views?.[0]?.pluginId === 'synthetic', 'host derives view ownership');
  check(Object.isFrozen(registry.views), 'immutable views');
  const intruder = definePlugin({ id: 'intruder', version: '1.0.0', config: z.strictObject({}), contribute: () => ({ views: [{ id: 'intruder.view', workbenchId: 'text', title: 'Other', entrypoint: 'ui://intruder/view.html' }] }) });
  failed = false;
  try { factory([{ plugin, config: { label: 'Text' } }, { plugin: intruder, config: {} }], ['agent']); } catch { failed = true; }
  check(failed, 'view cannot claim another plugin workbench');
  const multiple = definePlugin({ id: 'multiple', version: '1.0.0', config: z.strictObject({}), contribute: () => ({ workbenches: [{ id: 'multiple', title: 'Multiple', description: '', tools: [], skills: [] }], views: ['a', 'b'].map(id => ({ id, workbenchId: 'multiple', title: id, entrypoint: `ui://multiple/${id}.html` })) }) });
  failed = false;
  try { factory([{ plugin: multiple, config: {} }], []); } catch { failed = true; }
  check(failed, 'one view per workbench');
  const duplicate = definePlugin({
    id: "other",
    version: "1.0.0",
    config: z.strictObject({}),
    contribute: () => ({
      skills: [{ id: "inspect", title: "Other", instructions: "Other" }],
    }),
  });
  failed = false;
  try {
    factory(
      [
        { plugin, config: { label: "Text" } },
        { plugin: duplicate, config: {} },
      ],
      ["agent"],
    );
  } catch {
    failed = true;
  }
  check(failed, "duplicate contributed identity");
}
