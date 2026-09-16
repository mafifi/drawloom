import type {
  AuthorizationEvaluationOptions,
  AuthorizationFailureCode,
} from "@drawloom/authorization";
import { AuthorizationResultSchema } from "@drawloom/authorization";
import {
  KnowledgeWorkerAuthorizationRequestSchema,
  type KnowledgeWorkerAuthority,
  type KnowledgeWorkerLease,
} from "@drawloom/knowledge";
import { RpcRequestError, type RpcTransport } from "@drawloom/host";

export function workerFailure(
  method: string,
  params: unknown,
  code: AuthorizationFailureCode,
): unknown {
  if (method === "knowledge.prepare")
    return {
      kind:
        code === "cancelled"
          ? "cancelled"
          : code === "budget_exhausted"
            ? "timeout"
            : "unavailable",
      references: [],
      bytes: 0,
    };
  if (["knowledge.assess", "knowledge.reconcile", "knowledge.cancel-assessment"].includes(method)) {
    const identity = params as { requestId: string; payloadFingerprint: string };
    return {
      kind: "failure",
      requestId: identity.requestId,
      payloadFingerprint: identity.payloadFingerprint,
      code,
    };
  }
  return { kind: "failure", code };
}

/** Host-owned correlation. Worker input cannot select an admission or a scheduler. */
export function createWorkerAuthorizationHost(
  rpc: RpcTransport,
  authority: KnowledgeWorkerAuthority,
  destination: (method: string) => Promise<string>,
) {
  const lifetime = crypto.randomUUID();
  let closed = false;
  type Active = {
    lease: KnowledgeWorkerLease;
    seen: Set<number>;
    fail(code: AuthorizationFailureCode): void;
  };
  const active = new Map<string, Active>();
  const outstanding = new Set<(code: AuthorizationFailureCode) => void>();
  const send = (id: string | number, value: unknown) => {
    try {
      rpc.respond(id, value);
    } catch {
      stop("unavailable");
    }
  };
  const stop = (code: AuthorizationFailureCode) => {
    closed = true;
    for (const fail of [...outstanding]) fail(code);
  };
  const unsubscribe = rpc.subscribe(
    (message) => {
      if (message.id === undefined) {
        stop("invalid_facts");
        return;
      }
      const parsed = KnowledgeWorkerAuthorizationRequestSchema.safeParse(message.params);
      if (message.method !== "knowledge.authorize" || !parsed.success) {
        send(message.id, { kind: "failure", code: "invalid_facts" });
        stop("invalid_facts");
        return;
      }
      const request = parsed.data;
      const entry = active.get(request.operationId);
      const reply = (result: unknown) =>
        send(message.id!, {
          lifetime: request.lifetime,
          operationId: request.operationId,
          decisionId: request.decisionId,
          result,
        });
      if (closed || request.lifetime !== lifetime || !entry || entry.seen.has(request.decisionId)) {
        entry?.fail("invalid_facts");
        reply({ kind: "failure", code: "invalid_facts" });
        return;
      }
      entry.seen.add(request.decisionId);
      if (!entry.lease.isCurrent()) {
        entry.fail("cancelled");
        reply({ kind: "failure", code: "cancelled" });
        return;
      }
      void Promise.resolve()
        .then(() => entry.lease.authorizer.authorize(request.request, entry.lease.operation))
        .then(
          (result) => {
            const parsedResult = AuthorizationResultSchema.safeParse(result);
            reply(
              !entry.lease.isCurrent()
                ? { kind: "failure", code: "cancelled" }
                : parsedResult.success
                  ? parsedResult.data
                  : { kind: "failure", code: "malformed_result" },
            );
          },
          () => reply({ kind: "failure", code: "rejected" }),
        );
    },
    () => stop("unavailable"),
  );

  function request(
    method: string,
    params: unknown,
    parent?: AuthorizationEvaluationOptions,
    background = false,
    lifecycle?: { dispatched(): void; settled(completed: boolean): void },
  ): Promise<unknown> {
    const operationId = crypto.randomUUID();
    const controller = new AbortController();
    let available =
      method === "knowledge.assess" || method === "knowledge.reconcile" ? 300_000 : 30_000;
    try {
      if (parent) available = Math.min(available, parent.remainingMs());
    } catch {
      available = 0;
    }
    if (closed) return Promise.resolve(workerFailure(method, params, "shutdown"));
    if (parent?.signal.aborted) return Promise.resolve(workerFailure(method, params, "cancelled"));
    if (!Number.isFinite(available) || available <= 0)
      return Promise.resolve(workerFailure(method, params, "budget_exhausted"));
    const deadline = performance.now() + available;
    return new Promise((resolve) => {
      let done = false,
        lease: KnowledgeWorkerLease | undefined;
      let sent = false;
      let termination: AuthorizationFailureCode | undefined;
      let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
      const assessment = [
        "knowledge.assess",
        "knowledge.reconcile",
        "knowledge.cancel-assessment",
      ].includes(method);
      const uncertain = () => {
        const identity = params as { requestId: string; payloadFingerprint: string };
        return {
          kind: "uncertain",
          requestId: identity.requestId,
          payloadFingerprint: identity.payloadFingerprint,
        };
      };
      const remainingMs = () => {
        try {
          const value = Math.min(deadline - performance.now(), parent?.remainingMs() ?? Infinity);
          return Number.isFinite(value) ? value : 0;
        } catch {
          return 0;
        }
      };
      const finish = (value: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearTimeout(recoveryTimer);
        active.delete(operationId);
        outstanding.delete(fail);
        parent?.signal.removeEventListener("abort", cancelled);
        lease?.operation.signal.removeEventListener("abort", revoked);
        lease?.dispose();
        controller.abort();
        resolve(value);
      };
      const fail = (code: AuthorizationFailureCode) => {
        if (done || termination) return;
        termination = code;
        try {
          rpc.notify("knowledge.cancel-operation", { lifetime, operationId });
        } catch {}
        if (assessment && sent) {
          // Let the worker preserve its durable submission marker. Losing that
          // answer cannot establish that no external turn was submitted.
          lease?.dispose();
          if (code === "unavailable") {
            finish(uncertain());
            return;
          }
          recoveryTimer = setTimeout(() => finish(uncertain()), 2000);
          return;
        }
        finish(workerFailure(method, params, code));
      };
      const cancelled = () => fail("cancelled");
      const revoked = () =>
        fail(lease?.operation.signal.reason === "shutdown" ? "shutdown" : "cancelled");
      const timer = setTimeout(() => fail("budget_exhausted"), available);
      outstanding.add(fail);
      parent?.signal.addEventListener("abort", cancelled, { once: true });
      // Capture the generation before loading trusted persisted configuration.
      // This getter is host-owned and becomes usable only after loading finishes.
      let assessmentDestination = "";
      try {
        lease = authority.admit(
          {
            operationId,
            method,
            params,
            background,
            get assessmentDestination() {
              return assessmentDestination;
            },
          },
          { signal: controller.signal, remainingMs },
        );
        lease.operation.signal.addEventListener("abort", revoked, { once: true });
      } catch {
        fail("unavailable");
        return;
      }
      void destination(method)
        .then((selectedDestination) => {
          if (done) return;
          if (closed) {
            fail("shutdown");
            return;
          }
          assessmentDestination = selectedDestination;
          if (!lease!.isCurrent()) {
            fail("cancelled");
            return;
          }
          active.set(operationId, { lease: lease!, seen: new Set(), fail });
          const remaining = remainingMs();
          if (!Number.isFinite(remaining) || remaining <= 0) {
            fail("budget_exhausted");
            return;
          }
          sent = true;
          lifecycle?.dispatched();
          let response: Promise<unknown>;
          try {
            response = rpc.request(method, {
              lifetime,
              operationId,
              remainingMs: remaining,
              params,
            });
          } catch {
            lifecycle?.settled(false);
            fail("unavailable");
            return;
          }
          void response.then(
            (value) => {
              try {
                if (termination) {
                  const kind =
                    value && typeof value === "object" ? Reflect.get(value, "kind") : undefined;
                  finish(
                    kind === "failure" ? workerFailure(method, params, termination) : uncertain(),
                  );
                  return;
                }
                if (!lease!.isCurrent()) {
                  fail("cancelled");
                  return;
                }
                if (remainingMs() <= 0) {
                  fail("budget_exhausted");
                  return;
                }
                finish(value);
              } finally {
                lifecycle?.settled(true);
              }
            },
            (error) => {
              fail("unavailable");
              // A remote method error is a completed invocation. Transport loss
              // cannot establish that a dispatched write has finished.
              lifecycle?.settled(error instanceof RpcRequestError);
            },
          );
        })
        .catch(() => fail("unavailable"));
    });
  }
  return {
    request,
    shutdown() {
      stop("shutdown");
      unsubscribe();
    },
  };
}
