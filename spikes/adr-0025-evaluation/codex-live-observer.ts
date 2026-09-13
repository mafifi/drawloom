import type { RpcMessage, RpcTransport } from "@drawloom/host";
import { z } from "zod";
import type { CodexJudgeTokenUsage } from "./codex-passage-judge.ts";

const tokenBreakdownSchema = z.strictObject({
  totalTokens: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative(),
  cacheWriteInputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  reasoningOutputTokens: z.number().int().nonnegative(),
});
const tokenUsageNotificationSchema = z.strictObject({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  tokenUsage: z.strictObject({
    total: tokenBreakdownSchema,
    last: tokenBreakdownSchema,
    modelContextWindow: z.number().int().positive().nullable(),
  }),
});
const reroutedNotificationSchema = z.strictObject({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  fromModel: z.string().min(1),
  toModel: z.string().min(1),
  reason: z.unknown(),
});
const activityTypes = new Set(["commandExecution", "fileChange", "mcpToolCall", "dynamicToolCall", "collabAgentToolCall", "subAgentActivity", "webSearch", "imageView", "imageGeneration"]);
const activityNotificationSchema = z.object({
  threadId: z.string().min(1),
  turnId: z.string().min(1),
  item: z.object({ id: z.string().min(1), type: z.string().min(1) }).passthrough(),
}).passthrough();

export function observeCodexJudgeTransport(inner: RpcTransport, requestedModel: string) {
  const usage = new Map<string, CodexJudgeTokenUsage>();
  const models = new Map<string, string>();
  const activity = new Map<string, Map<string, Set<string>>>();
  const protocolErrors: string[] = [];
  let latestTurnId: string | undefined;
  const transport: RpcTransport = {
    async request(method, params) {
      const result = await inner.request(method, params);
      if (method === "turn/start") {
        const parsed = z.object({ turn: z.object({ id: z.string().min(1) }) }).safeParse(result);
        if (parsed.success) latestTurnId = parsed.data.turn.id;
      }
      return result;
    },
    notify: (method, params) => inner.notify(method, params),
    respond: (id, result) => inner.respond(id, result),
    subscribe(next, fail) {
      return inner.subscribe(message => {
        if (message.method === "thread/tokenUsage/updated") {
          const parsed = tokenUsageNotificationSchema.safeParse(message.params);
          if (parsed.success) usage.set(parsed.data.turnId, parsed.data.tokenUsage.last);
          else protocolErrors.push("Invalid token usage notification");
        }
        if (message.method === "model/rerouted") {
          const parsed = reroutedNotificationSchema.safeParse(message.params);
          if (parsed.success) models.set(parsed.data.turnId, parsed.data.toModel);
          else protocolErrors.push("Invalid model reroute notification");
        }
        if (message.method === "item/started" || message.method === "item/completed") {
          const parsed = activityNotificationSchema.safeParse(message.params);
          if (parsed.success && activityTypes.has(parsed.data.item.type)) {
            const byType = activity.get(parsed.data.turnId) ?? new Map<string, Set<string>>();
            const identities = byType.get(parsed.data.item.type) ?? new Set<string>();
            identities.add(parsed.data.item.id);
            byType.set(parsed.data.item.type, identities);
            activity.set(parsed.data.turnId, byType);
          }
        }
        next(message);
      }, fail);
    },
    close: () => inner.close(),
  };
  return {
    transport,
    protocolErrors,
    take(turnId: string): {
      usage?: CodexJudgeTokenUsage;
      requestedModel: string;
      actualModel: string;
      toolActivity?: Readonly<Record<string, number>>;
    } {
      const measured = usage.get(turnId);
      const actualModel = models.get(turnId) ?? requestedModel;
      const observedActivity = activity.get(turnId);
      const toolActivity = observedActivity ? Object.fromEntries([...observedActivity].map(([type, identities]) => [type, identities.size])) : undefined;
      usage.delete(turnId);
      models.delete(turnId);
      activity.delete(turnId);
      return { ...(measured ? { usage: measured } : {}), requestedModel, actualModel, ...(toolActivity ? { toolActivity } : {}) };
    },
    takeLatest() {
      return latestTurnId ? this.take(latestTurnId) : { requestedModel, actualModel: requestedModel };
    },
  };
}
