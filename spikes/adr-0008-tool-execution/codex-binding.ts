import { z } from "zod";
import type { Binding, ToolResult } from "./contract.ts";

export const OriginSchema = z.object({
  callId: z.string().min(1),
  "x-codex-turn-metadata": z.object({ thread_id: z.string().min(1), turn_id: z.string().min(1) }),
});
export type Origin = { callId: string; threadId: string; turnId: string };
export const parseOrigin = (meta: unknown): Origin | undefined => {
  const parsed = OriginSchema.safeParse(meta);
  if (!parsed.success) return undefined;
  const turn = parsed.data["x-codex-turn-metadata"];
  return { callId: parsed.data.callId, threadId: turn.thread_id, turnId: turn.turn_id };
};
export const originKey = (origin: Pick<Origin, "threadId" | "turnId">): string =>
  JSON.stringify([origin.threadId, origin.turnId]);

export class BindingRegistry {
  private readonly bindings = new Map<string, Binding>();
  public bind(origin: Pick<Origin, "threadId" | "turnId">, operationId: string): Binding {
    const key = originKey(origin);
    const existing = this.bindings.get(key);
    if (existing) {
      if (existing.operationId !== operationId) throw new Error("Cannot rebind provider origin");
      return existing;
    }
    const binding = Object.freeze({ operationId });
    this.bindings.set(key, binding);
    return binding;
  }
  public resolve(origin: Pick<Origin, "threadId" | "turnId">): Binding | undefined {
    return this.bindings.get(originKey(origin));
  }
}

export const projectResult = (result: ToolResult) => ({
  isError: result.outcome.status !== "succeeded" || result.evidence !== "recorded",
  content: [{ type: "text" as const, text: result.outcome.status === "succeeded" && result.evidence === "recorded"
    ? result.outcome.text : JSON.stringify(result) }],
  structuredContent: result,
  _meta: { drawloom: { toolInvocationId: result.invocationId } },
});
