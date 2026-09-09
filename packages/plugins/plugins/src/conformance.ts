import { z } from "zod";
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
