import { AsyncLocalStorage } from "node:async_hooks";
import {
  AuthZenRequestSchema,
  type Authorizer,
  type AuthorizationEvaluationOptions,
  type AuthorizationResult,
} from "@drawloom/authorization";
import {
  KnowledgeWorkerAuthorizationResponseSchema,
  KnowledgeWorkerCancellationSchema,
  KnowledgeWorkerOperationSchema,
} from "@drawloom/knowledge";

/** Stdio-only adapter; there is deliberately no worker policy or scheduler. */
export function createWorkerAuthorizer(write: (value: unknown) => Promise<void>) {
  type Scope = {
    lifetime: string;
    operationId: string;
    operation: AuthorizationEvaluationOptions;
    controller: AbortController;
  };
  const storage = new AsyncLocalStorage<Scope>();
  const active = new Map<string, Scope>();
  const seen = new Set<string>();
  let lifetime: string | undefined,
    closed = false,
    decisionId = 0;
  const pending = new Map<
    string,
    { scope: Scope; decisionId: number; finish(result: AuthorizationResult): void }
  >();
  function cancel(value: unknown) {
    const parsed = KnowledgeWorkerCancellationSchema.safeParse(value);
    if (!parsed.success || parsed.data.lifetime !== lifetime) return;
    active.get(parsed.data.operationId)?.controller.abort();
  }
  function response(id: string, value: unknown) {
    const entry = pending.get(id);
    // A stale/duplicate/unsolicited reply cannot acquire a pending decision.
    if (!entry) return false;
    const parsed = KnowledgeWorkerAuthorizationResponseSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.lifetime !== entry.scope.lifetime ||
      parsed.data.operationId !== entry.scope.operationId ||
      parsed.data.decisionId !== entry.decisionId
    ) {
      entry.finish({ kind: "failure", code: "malformed_result" });
      return false;
    }
    entry.finish(parsed.data.result);
    return true;
  }
  const authorizer: Authorizer = {
    async authorize(value, parent) {
      const scope = storage.getStore();
      if (closed) return { kind: "failure", code: "shutdown" };
      if (!scope || !active.has(scope.operationId))
        return { kind: "failure", code: "invalid_facts" };
      const parsed = AuthZenRequestSchema.safeParse(value);
      if (!parsed.success) return { kind: "failure", code: "invalid_facts" };
      if (scope.operation.signal.aborted || parent.signal.aborted)
        return { kind: "failure", code: "cancelled" };
      let remaining = 0;
      try {
        remaining = Math.min(2000, scope.operation.remainingMs(), parent.remainingMs());
      } catch {}
      if (!Number.isFinite(remaining) || remaining <= 0)
        return { kind: "failure", code: "budget_exhausted" };
      const number = ++decisionId;
      const id = `authorization:${number}`;
      return new Promise((resolve) => {
        const finish = (result: AuthorizationResult) => {
          if (!pending.delete(id)) return;
          clearTimeout(timer);
          scope.operation.signal.removeEventListener("abort", abort);
          parent.signal.removeEventListener("abort", abort);
          resolve(
            scope.operation.remainingMs() <= 0
              ? { kind: "failure", code: "budget_exhausted" }
              : scope.operation.signal.aborted || parent.signal.aborted
                ? { kind: "failure", code: "cancelled" }
                : result,
          );
        };
        const abort = () => finish({ kind: "failure", code: "cancelled" });
        const timer = setTimeout(
          () => finish({ kind: "failure", code: "budget_exhausted" }),
          remaining,
        );
        pending.set(id, { scope, decisionId: number, finish });
        scope.operation.signal.addEventListener("abort", abort, { once: true });
        parent.signal.addEventListener("abort", abort, { once: true });
        void write({
          id,
          method: "knowledge.authorize",
          params: {
            lifetime: scope.lifetime,
            operationId: scope.operationId,
            decisionId: number,
            request: parsed.data,
          },
        }).catch(() => finish({ kind: "failure", code: "unavailable" }));
      });
    },
  };
  return {
    authorizer,
    cancel,
    response,
    async run<T>(
      value: unknown,
      work: (params: unknown, operation: AuthorizationEvaluationOptions) => Promise<T>,
    ): Promise<T> {
      if (closed) throw Error("Worker closed");
      const envelope = KnowledgeWorkerOperationSchema.parse(value);
      lifetime ??= envelope.lifetime;
      if (lifetime !== envelope.lifetime || seen.has(envelope.operationId))
        throw Error("Invalid operation correlation");
      seen.add(envelope.operationId);
      const controller = new AbortController(),
        deadline = performance.now() + envelope.remainingMs;
      const scope = {
        lifetime,
        operationId: envelope.operationId,
        controller,
        operation: { signal: controller.signal, remainingMs: () => deadline - performance.now() },
      };
      const timer = setTimeout(() => controller.abort(), envelope.remainingMs);
      active.set(envelope.operationId, scope);
      try {
        return await storage.run(scope, () => work(envelope.params, scope.operation));
      } finally {
        clearTimeout(timer);
        active.delete(envelope.operationId);
        controller.abort();
      }
    },
    close() {
      if (closed) return;
      closed = true;
      for (const entry of [...pending.values()])
        entry.finish({ kind: "failure", code: "shutdown" });
      for (const entry of active.values()) entry.controller.abort();
      active.clear();
    },
  };
}
