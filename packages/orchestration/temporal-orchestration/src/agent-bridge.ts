import { z } from "zod";
import type {
  AgentDriver,
  AgentSession,
  AgentSessionOpenInput,
  AgentOperationInput,
  AgentApprovalResolution,
  AgentInputResolution,
  AgentResult,
  AgentSessionSignal,
} from "@drawloom/agent";
import { createHash } from "node:crypto";
import type { JsonStore } from "@drawloom/host";
import { canonical, StepFailure } from "@drawloom/orchestration";
const Receipt = z.strictObject({
  sessionId: z.string(),
  operationId: z.string(),
  fingerprint: z.string(),
  status: z.enum([
    "submitting",
    "running",
    "completed",
    "failed",
    "interrupted",
    "unknown",
    "denied",
  ]),
});
type Receipt = z.infer<typeof Receipt>;
/** Host owns the bridge and its independent configured context/tool authority.
 * JsonStore has no compare-and-swap: one bridge writer per owner is required.
 * AgentDriver has no reattach/lookup; persisted incomplete receipts become unknown.
 */
export function createAgentBridge(
  owner: string,
  driver: AgentDriver,
  store: JsonStore,
  authority: Omit<AgentSessionOpenInput, "sessionId">,
) {
  const openings = new Map<string, Promise<string>>();
  const cancellationRequests = new Map<string, Promise<void>>();
  const cancellationEffects = new Set<string>();
  type Approval = Extract<
    AgentSessionSignal,
    { kind: "approval.requested" }
  >["request"];
  type Input = Extract<
    AgentSessionSignal,
    { kind: "input.requested" }
  >["request"];
  const approvals = new Map<string, Map<string, Approval>>();
  const inputs = new Map<string, Map<string, Input>>();
  const sessions = new Map<
    string,
    { session: AgentSession; active?: string; opening: boolean }
  >();
  const receipts = new Map<string, Receipt>();
  const waiters = new Map<string, (() => void)[]>();
  const key = (session: string, operation: string) =>
    JSON.stringify([owner, session, operation]);
  const owned = (id: string) => {
    const value = sessions.get(id);
    if (!value) throw new StepFailure("denied", "Not an owned open session");
    return value;
  };
  const unwrap = <T>(result: AgentResult<T>): T => {
    if (result.status !== "ok")
      throw new StepFailure(
        result.failure.code === "provider_unavailable" ? "unknown" : "denied",
        result.failure.message,
      );
    return result.value;
  };
  const save = async (receipt: Receipt) => {
    const id = key(receipt.sessionId, receipt.operationId);
    receipts.set(id, receipt);
    await store.set(id, receipt);
    for (const wake of waiters.get(id) ?? []) wake();
    waiters.delete(id);
  };
  const inspect = async (
    sessionId: string,
    operationId: string,
  ): Promise<Receipt> => {
    if (
      !sessions.has(sessionId) &&
      !(await store.get(key(sessionId, "$session")))
    )
      throw new StepFailure("denied", "Unknown owned session");
    const id = key(sessionId, operationId);
    const current = receipts.get(id);
    if (current) return { ...current };
    const saved = await store.get(id);
    if (!saved) throw new StepFailure("invalid", "Unknown operation");
    const receipt = Receipt.parse(saved);
    if (["running", "submitting"].includes(receipt.status))
      receipt.status = "unknown";
    receipts.set(id, receipt);
    return { ...receipt };
  };
  return {
    create(name: string): Promise<string> {
      const existing = openings.get(name);
      if (existing) return existing;
      const opening = Promise.resolve().then(async () => {
        const sessionId = JSON.stringify([
          owner,
          z.string().min(1).parse(name),
        ]);
        if (sessions.has(sessionId)) return sessionId;
        const marker = await store.get(key(sessionId, "$session"));
        if (marker)
          throw new StepFailure(
            "unknown",
            "Session already opened; AgentDriver cannot reattach",
          );
        // Write intent first: failed/lost opens must never cause blind resubmission.
        await store.set(key(sessionId, "$session"), { status: "opening" });
        const session = unwrap(
          await driver.openSession({ ...authority, sessionId }),
        );
        const state = { session, opening: false } as {
          session: AgentSession;
          active?: string;
          opening: boolean;
        };
        sessions.set(sessionId, state);
        approvals.set(sessionId, new Map());
        inputs.set(sessionId, new Map());
        void (async () => {
          for await (const signal of session.signals()) {
            if (signal.kind === "approval.requested")
              approvals
                .get(sessionId)!
                .set(signal.request.approvalId, signal.request);
            if (signal.kind === "approval.resolved")
              approvals.get(sessionId)!.delete(signal.approvalId);
            if (signal.kind === "input.requested")
              inputs
                .get(sessionId)!
                .set(signal.request.requestId, signal.request);
            if (signal.kind === "input.resolved")
              inputs.get(sessionId)!.delete(signal.requestId);
            if (!("operationId" in signal)) continue;
            const id = key(sessionId, signal.operationId),
              receipt = receipts.get(id);
            if (!receipt) continue;
            const status =
              signal.kind === "operation.completed"
                ? "completed"
                : signal.kind === "operation.failed"
                  ? "failed"
                  : signal.kind === "operation.interrupted"
                    ? "interrupted"
                    : undefined;
            if (status) {
              if (state.active === signal.operationId) delete state.active;
              await save({ ...receipt, status });
            }
          }
        })().catch(async () => {
          if (state.active) {
            const receipt = receipts.get(key(sessionId, state.active));
            if (receipt) await save({ ...receipt, status: "unknown" });
          }
        });
        return sessionId;
      });
      openings.set(name, opening);
      return opening;
    },
    async submit(sessionId: string, input: AgentOperationInput) {
      const state = owned(sessionId),
        id = key(sessionId, input.operationId),
        fingerprint = createHash("sha256")
          .update(canonical(input))
          .digest("hex");
      if (state.opening)
        throw new StepFailure("invalid", "Concurrent submission");
      state.opening = true;
      try {
        const previous = receipts.get(id) ?? (await store.get(id));
        if (previous) {
          const receipt = Receipt.parse(previous);
          if (receipt.fingerprint !== fingerprint)
            throw new StepFailure("invalid", "Conflicting operation");
          return inspect(sessionId, input.operationId);
        }
        if (state.active)
          throw new StepFailure("invalid", "Concurrent submission");
        const receipt: Receipt = {
          sessionId,
          operationId: input.operationId,
          fingerprint,
          status: "submitting",
        };
        state.active = input.operationId;
        await save(receipt);
        try {
          unwrap(await state.session.execute(input));
          const latest = receipts.get(id)!;
          if (latest.status === "submitting")
            await save({ ...latest, status: "running" });
        } catch (error) {
          const latest = receipts.get(id)!;
          if (latest.status === "submitting" || latest.status === "running")
            await save({
              ...latest,
              status:
                error instanceof StepFailure && error.code === "denied"
                  ? "denied"
                  : "unknown",
            });
          if (receipts.get(id)!.status === "denied") delete state.active;
        }
        return inspect(sessionId, input.operationId);
      } finally {
        state.opening = false;
      }
    },
    inspect,
    interactions(sessionId: string) {
      owned(sessionId);
      return structuredClone({
        approvals: [...approvals.get(sessionId)!.values()],
        inputs: [...inputs.get(sessionId)!.values()],
      });
    },
    async result(sessionId: string, operationId: string): Promise<Receipt> {
      for (;;) {
        const receipt = await inspect(sessionId, operationId);
        if (!["running", "submitting"].includes(receipt.status)) return receipt;
        const id = key(sessionId, operationId);
        await new Promise<void>((resolve) => {
          const list = waiters.get(id) ?? [];
          list.push(resolve);
          waiters.set(id, list);
          if (!["running", "submitting"].includes(receipts.get(id)!.status))
            resolve();
        });
      }
    },
    async steer(sessionId: string, input: AgentOperationInput) {
      const session = owned(sessionId).session;
      if (!session.steer)
        throw new StepFailure("invalid", "Unsupported steering");
      unwrap(await session.steer(input));
    },
    async interrupt(sessionId: string, operationId: string) {
      const session = owned(sessionId).session;
      if (!session.interrupt)
        throw new StepFailure("invalid", "Unsupported interruption");
      unwrap(await session.interrupt(operationId));
    },
    async resolveApproval(sessionId: string, input: AgentApprovalResolution) {
      unwrap(await owned(sessionId).session.resolveApproval(input));
    },
    async respondToInput(sessionId: string, input: AgentInputResolution) {
      unwrap(await owned(sessionId).session.respondToInput(input));
    },
    async close() {
      await Promise.all([...sessions.values()].map((s) => s.session.close()));
    },
    /** A request/connection close is not confirmation that external effects stopped. */
    async requestCancellation() {
      await Promise.all(
        [...sessions.values()].map((state) => {
          const existing = cancellationRequests.get(state.session.sessionId);
          if (existing) return existing;
          if (state.active)
            cancellationEffects.add(key(state.session.sessionId, state.active));
          const request = (async () => {
            try {
              if (state.session.interrupt && state.active)
                unwrap(await state.session.interrupt(state.active));
              else unwrap(await state.session.close());
            } catch {
              /* Unavailable/denied control does not resolve the effect. */
            }
          })();
          cancellationRequests.set(state.session.sessionId, request);
          return request;
        }),
      );
      return {
        status: "unknown" as const,
        unresolvedEffects: [...cancellationEffects],
      };
    },
  };
}

export { dispatchAgentTask } from "./agent-task-host.js";
