import { z } from "zod";
import { AgentModeSchema, type AgentMode } from "@drawloom/agent";
import type { RpcTransport } from "@drawloom/host";

const presets = z.object({
  data: z.array(
    z.object({
      mode: AgentModeSchema.nullish(),
      model: z.string().min(1).nullish(),
      reasoning_effort: z.string().nullish(),
    }),
  ),
});

/** Optional native capability: a failed discovery never fabricates support. */
export async function readPlanningModes(rpc: RpcTransport, opened: unknown) {
  const model = z.object({ model: z.string().min(1) }).safeParse(opened);
  try {
    const parsed = presets.parse(await rpc.request("collaborationMode/list", {}));
    return parsed.data.flatMap((p) =>
      p.mode && (p.model || model.success)
        ? [
            {
              mode: p.mode,
              model: p.model ?? (model.success ? model.data.model : ""),
              effort: p.reasoning_effort ?? null,
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

export function planningSettings(
  presets: Awaited<ReturnType<typeof readPlanningModes>>,
  mode: AgentMode,
  selection?: { model: string; effort?: string | undefined },
) {
  const preset = presets.find((p) => p.mode === mode);
  if (!preset) return undefined;
  return {
    mode,
    settings: {
      model: selection?.model ?? preset.model,
      reasoning_effort: selection ? (selection.effort ?? null) : preset.effort,
      developer_instructions: null,
    },
  };
}
