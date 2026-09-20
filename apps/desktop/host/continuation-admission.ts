import type { AgentResult } from "@drawloom/agent";
import { AgentChildAdmissionSchema, type AgentChildAdmission } from "@drawloom/agent";
import { z } from "zod";
import type { JsonStore } from "@drawloom/host";

export type ChildOperationState = {
  active?: string;
  childOperations?: Map<string, { executionId: string; operationId: string }>;
};

/** Runtime operation ownership only. Native provider remains the child scheduler. */
export function createChildAdmission(options: {
  store: JsonStore;
  conversationId: string;
  running(): boolean;
  state(): ChildOperationState | undefined;
  verify(): Promise<void>;
  begin(operationId: string): void;
}) {
  const retired = new Set<string>();
  let mutations: Promise<unknown> = Promise.resolve();
  const denied = (): AgentResult<never> => ({
    status: "rejected",
    failure: {
      code: "invalid_state",
      message: "Native child execution could not be bound to this conversation",
    },
  });
  return {
    admit(raw: AgentChildAdmission): Promise<AgentResult<{ operationId: string }>> {
      const next = mutations.then(async (): Promise<AgentResult<{ operationId: string }>> => {
        const parsed = AgentChildAdmissionSchema.safeParse(raw);
        const state = options.state();
        if (!parsed.success || !state || !options.running()) return denied();
        const input = parsed.data;
        const key = JSON.stringify([input.childId, input.executionId]);
        if (retired.has(key)) return denied();
        try {
          await options.verify();
        } catch {
          return denied();
        }
        if (state !== options.state() || !options.running()) return denied();
        const previous = state.childOperations?.get(input.childId);
        if (previous)
          return previous.executionId === input.executionId
            ? { status: "ok", value: { operationId: previous.operationId } }
            : denied();
        // An execution receipt is correlation, not cached permission. Verification
        // above and the gateway's current authorization still run on recovery.
        const receiptKey = `child-operation:${JSON.stringify([options.conversationId, input.childId, input.executionId])}`;
        let operationId: string;
        try {
          const saved = await options.store.get(receiptKey);
          operationId = saved === undefined ? crypto.randomUUID() : z.string().min(1).parse(saved);
          if (saved === undefined) await options.store.set(receiptKey, operationId);
        } catch {
          return denied();
        }
        if (state !== options.state() || !options.running()) return denied();
        state.childOperations ??= new Map();
        state.childOperations.set(input.childId, {
          executionId: input.executionId,
          operationId,
        });
        try {
          options.begin(operationId);
        } catch {
          state.childOperations.delete(input.childId);
          retired.add(key);
          return denied();
        }
        return { status: "ok", value: { operationId } };
      });
      mutations = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
    retire(operationId: string) {
      const operations = options.state()?.childOperations;
      for (const [childId, value] of operations ?? []) {
        if (value.operationId !== operationId) continue;
        retired.add(JSON.stringify([childId, value.executionId]));
        operations?.delete(childId);
      }
    },
  };
}
export function createContinuationAdmission(options: {
  running(): boolean;
  state(): { active?: string } | undefined;
  verify(): Promise<void>;
  begin(operationId: string): void;
}) {
  return async (): Promise<AgentResult<{ operationId: string }>> => {
    const denied = (): AgentResult<{ operationId: string }> => ({
      status: "rejected",
      failure: {
        code: "provider_unavailable",
        message: "Native continuation could not be bound to an available conversation",
      },
    });
    const state = options.state();
    if (!state || state.active || !options.running()) return denied();
    try {
      await options.verify();
    } catch {
      return denied();
    }
    if (options.state() !== state || state.active || !options.running()) return denied();
    const operationId = crypto.randomUUID();
    state.active = operationId;
    try {
      options.begin(operationId);
    } catch {
      delete state.active;
      return denied();
    }
    return { status: "ok", value: { operationId } };
  };
}
