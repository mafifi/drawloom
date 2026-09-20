import { z } from "zod";
import {
  AgentForkInputSchema,
  AgentForkReceiptSchema,
  type AgentForkReceipt,
  type AgentForks,
  type AgentResult,
} from "@drawloom/agent";
import type { JsonStore, JsonValue, RpcTransport } from "@drawloom/host";

const historyTurns = z.record(
  z.string().min(1),
  z.strictObject({
    threadId: z.string().min(1),
    operationId: z.string().min(1).optional(),
  }),
);
export const NativeForkHistorySchema = z.strictObject({
  nativeId: z.string().min(1),
  turns: historyTurns,
});
const savedReceipt = AgentForkReceiptSchema.extend({
  nativeId: z.string().min(1).nullable(),
  history: historyTurns,
});
const source = z.object({
  thread: z.object({
    id: z.string(),
    turns: z.array(
      z.object({
        id: z.string().min(1),
        status: z.enum(["completed", "interrupted", "failed", "inProgress"]),
      }),
    ),
  }),
});
const rejected = (message: string): AgentResult<never> => ({
  status: "rejected",
  failure: { code: "invalid_state", message },
});

/** Native fork submission and recovery only; never submits a model turn. */
export function createCodexForks(options: {
  rpc: RpcTransport;
  connect(): Promise<RpcTransport>;
  store: JsonStore;
  sessionId: string;
  threadId: string;
  configuration: Record<string, JsonValue>;
  available(): boolean;
  reserve<T>(action: () => Promise<T>): Promise<T>;
}): AgentForks {
  const submitting = new Set<string>();
  const writers = new Map<string, RpcTransport>();
  const releaseWriter = async (requestId: string) => {
    const writer = writers.get(requestId);
    if (!writer) return;
    await writer.close();
    writers.delete(requestId);
  };
  const key = (requestId: string) => `codex-fork:${JSON.stringify([options.sessionId, requestId])}`;
  const present = async (raw: unknown): Promise<AgentForkReceipt> => {
    const receipt = savedReceipt.parse(raw);
    if (receipt.state === "pending" && !receipt.nativeId && !submitting.has(receipt.requestId))
      receipt.state = "unknown";
    if (receipt.nativeId) {
      await releaseWriter(receipt.requestId);
      const targetKey = "codex:" + receipt.sessionId;
      const existing = await options.store.get(targetKey);
      if (
        existing !== undefined &&
        z.object({ threadId: z.string() }).parse(existing).threadId !== receipt.nativeId
      )
        throw Error("Fork target is already associated with another conversation");
      const existingOperations = z
        .record(z.string(), z.string())
        .parse((await options.store.get("codex-operations:" + receipt.sessionId)) ?? {});
      for (const [turnId, origin] of Object.entries(receipt.history)) {
        if (!origin.operationId) continue;
        if (existingOperations[turnId] && existingOperations[turnId] !== origin.operationId)
          throw Error("Fork history operation identity conflicts with its retained prefix");
        existingOperations[turnId] = origin.operationId;
      }
      await options.store.set(
        "codex-fork-history:" + receipt.sessionId,
        z.json().parse({
          nativeId: receipt.nativeId,
          turns: receipt.history,
        }),
      );
      await options.store.set("codex-operations:" + receipt.sessionId, existingOperations);
      await options.store.set(targetKey, {
        threadId: receipt.nativeId,
        materialized: true,
      });
      receipt.state = "created";
    }
    return {
      requestId: receipt.requestId,
      sessionId: receipt.sessionId,
      state: receipt.state,
    };
  };
  return {
    async read(requestId) {
      if (!requestId) return rejected("A fork request identity is required");
      try {
        const saved = await options.store.get(key(requestId));
        return {
          status: "ok",
          value: saved === undefined ? null : await present(saved),
        };
      } catch {
        return rejected("The fork receipt could not be recovered; no retry occurred");
      }
    },
    create(raw) {
      return options.reserve(async () => {
        const parsed = AgentForkInputSchema.safeParse(raw);
        if (!parsed.success || parsed.data.sessionId === options.sessionId)
          return rejected("A distinct fork destination is required");
        const input = parsed.data;
        try {
          const saved = await options.store.get(key(input.requestId));
          if (saved !== undefined) {
            if (savedReceipt.parse(saved).sessionId !== input.sessionId)
              return rejected("This fork request belongs to another destination");
            return { status: "ok", value: await present(saved) };
          }
          if (!options.available())
            return rejected("Wait for the source operation to finish before forking");
          const targetKey = "codex-fork-target:" + input.sessionId;
          const reservation = await options.store.get(targetKey);
          const ownReservation = z
            .object({ source: z.literal(options.sessionId), requestId: z.literal(input.requestId) })
            .safeParse(reservation).success;
          if (
            (await options.store.get("codex:" + input.sessionId)) !== undefined ||
            (reservation !== undefined && !ownReservation)
          )
            return rejected("The fork destination is already reserved");
          const current = source.parse(
            await options.rpc.request("thread/read", {
              threadId: options.threadId,
              includeTurns: true,
            }),
          ).thread;
          if (
            current.id !== options.threadId ||
            current.turns.some((turn) => turn.status === "inProgress")
          )
            return rejected("Wait for the source operation to finish before forking");
          const last = current.turns.at(-1);
          if (!last) return rejected("There is no completed history to fork");
          if (!options.available())
            return rejected("The source conversation changed before forking");
          const receipt: z.infer<typeof savedReceipt> = {
            ...input,
            state: "pending",
            nativeId: null,
            history: {},
          };
          const sourceOperations = z
            .record(z.string(), z.string())
            .parse((await options.store.get("codex-operations:" + options.sessionId)) ?? {});
          const priorRaw = await options.store.get("codex-fork-history:" + options.sessionId);
          const prior =
            priorRaw === undefined ? undefined : NativeForkHistorySchema.parse(priorRaw);
          if (prior && prior.nativeId !== options.threadId)
            throw Error("Fork source lineage mismatch");
          for (const turn of current.turns)
            receipt.history[turn.id] = prior?.turns[turn.id] ?? {
              threadId: options.threadId,
              ...(sourceOperations[turn.id] ? { operationId: sourceOperations[turn.id] } : {}),
            };
          await options.store.set(targetKey, {
            source: options.sessionId,
            requestId: input.requestId,
          });
          await options.store.set(key(input.requestId), z.json().parse(receipt));
          submitting.add(input.requestId);
          try {
            // A fork is loaded in the submitting App Server and holds its native
            // writer lease. Use a short-lived connection so an independent
            // session can resume it without closing the parent or its children.
            const forkRpc = await options.connect();
            writers.set(input.requestId, forkRpc);
            await forkRpc.request("initialize", {
              clientInfo: { name: "drawloom-fork", version: "0.0.0" },
              capabilities: { experimentalApi: true },
            });
            forkRpc.notify("initialized");
            const result = z.object({ thread: z.object({ id: z.string().min(1) }) }).parse(
              await forkRpc.request("thread/fork", {
                ...options.configuration,
                threadId: options.threadId,
                lastTurnId: last.id,
                excludeTurns: true,
                ephemeral: false,
                deferGoalContinuation: false,
              }),
            );
            if (result.thread.id === options.threadId)
              throw Error("Fork reused the source identity");
            receipt.nativeId = result.thread.id;
            // Retain native identity before local registration. A later read repairs registration.
            await options.store.set(key(input.requestId), z.json().parse(receipt));
          } catch {
            receipt.state = "unknown";
            await options.store.set(key(input.requestId), z.json().parse(receipt));
            if (!receipt.nativeId) return { status: "ok", value: await present(receipt) };
          } finally {
            submitting.delete(input.requestId);
            await releaseWriter(input.requestId);
          }
          return { status: "ok", value: await present(receipt) };
        } catch {
          return rejected("Fork state could not be recovered; no automatic retry occurred");
        }
      });
    },
  };
}
