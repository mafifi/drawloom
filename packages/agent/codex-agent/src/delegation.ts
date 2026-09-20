import { z } from "zod";
import {
  AgentDelegationSchema,
  type AgentDelegation,
  type AgentDelegations,
  type AgentResult,
  type AgentSessionSignal,
  type AgentChildAdmission,
  AgentApprovalResolutionSchema,
  AgentInputResolutionSchema,
  AgentDelegationRefSchema,
} from "@drawloom/agent";
import type { RpcTransport, RpcMessage, JsonStore } from "@drawloom/host";
import { nativeMessageId, type CaptureToolContent } from "./history.js";
import { nativeToolOutput } from "./native-tool-output.js";
import {
  processNativeInteraction,
  type NativeApproval,
  type NativeInput,
} from "./native-interactions.js";

const id = z.string().min(1);
const nativeThread = z.object({
  id,
  parentThreadId: id.nullable(),
  agentNickname: z.string().nullable().optional(),
  canAcceptDirectInput: z.boolean().nullable(),
  status: z.object({ type: z.string() }),
  turns: z.array(
    z.object({
      id,
      status: z.string(),
      items: z.array(z.unknown()).optional(),
    }),
  ),
});
const page = z.object({
  data: z.array(z.object({ id })),
  nextCursor: id.nullable(),
});
const denied = (message: string): AgentResult<never> => ({
  status: "rejected",
  failure: { code: "provider_rejected", message },
});
// Bound malformed ancestry and pagination without pretending a truncated list is complete.
const maximumAncestryDepth = 64;
const maximumDiscoveryPages = 32;

/** Native discovery is read-only. Entries never grant operation or tool authority. */
export function createCodexDelegations(options: {
  rpc: RpcTransport;
  store: JsonStore;
  threadId: string;
  available(): boolean;
  emit(signal: AgentSessionSignal): void;
  admit(input: AgentChildAdmission): Promise<AgentResult<{ operationId: string }>>;
  accepted(threadId: string, turnId: string, operationId: string): void;
  finished(threadId: string, turnId: string, operationId: string): void;
  nativeReview: boolean;
  captureToolContent?: CaptureToolContent;
  onToolResultDelivered?(value: {
    operationId: string;
    server: string;
    tool: string;
    result: unknown;
  }): void;
  onContextInvalidated?(operationId: string): void;
}) {
  type Execution = {
    threadId: string;
    turnId: string;
    operationId: string;
    approvals: Map<string, NativeApproval>;
    inputs: Map<string, NativeInput>;
    requests: Set<string | number>;
    interrupting: boolean;
    completedItems: Set<string>;
  };
  const executions = new Map<string, Execution>();
  const snapshots = new Map<string, AgentDelegation>();
  const operationIds = new Map<string, string>();
  const origins = new Map<string, { parentThreadId: string; operationId: string }>();
  const originKey = (threadId: string) =>
    `codex-child-origin:${JSON.stringify([options.threadId, threadId])}`;
  const interruptionKey = (threadId: string, turnId: string) =>
    `codex-child-interruption:${JSON.stringify([options.threadId, threadId, turnId])}`;
  const seenExecutions = new Set<string>();
  const requestScope = crypto.randomUUID();
  let requestSequence = 0;
  // A refusal needs no execution authority. Never park an unowned request
  // awaiting a decision that the host cannot safely attribute.
  const refuseUnowned = (message: RpcMessage): boolean => {
    if (message.id === undefined) return false;
    let response: unknown;
    switch (message.method) {
      case "item/commandExecution/requestApproval":
      case "item/fileChange/requestApproval":
        response = { decision: "decline" };
        break;
      case "mcpServer/elicitation/request":
        response = { action: "decline" };
        break;
      case "item/tool/requestUserInput":
        response = { answers: {} };
        break;
      default:
        return false;
    }
    options.rpc.respond(message.id, response);
    return true;
  };
  const finish = (
    execution: Execution,
    status: "completed" | "failed" | "interrupted" | "unknown",
  ) => {
    executions.delete(execution.threadId);
    if (status === "unknown") options.onContextInvalidated?.(execution.operationId);
    const prior = snapshots.get(execution.threadId);
    if (prior) {
      const child: AgentDelegation = {
        ...prior,
        status,
        revision: crypto.randomUUID(),
        result: { state: "unknown" },
        controls: { interrupt: status === "unknown" ? "unknown" : "unavailable" },
      };
      snapshots.set(execution.threadId, child);
      options.emit({ kind: "delegation.updated", child });
    }
    for (const approvalId of execution.approvals.keys())
      options.emit({ kind: "approval.resolved", approvalId });
    for (const requestId of execution.inputs.keys())
      options.emit({ kind: "input.resolved", requestId });
    try {
      options.finished(execution.threadId, execution.turnId, execution.operationId);
    } finally {
      options.emit(
        status === "failed" || status === "unknown"
          ? {
              kind: "operation.failed",
              operationId: execution.operationId,
              failure: {
                code: status === "unknown" ? "provider_unavailable" : "provider_rejected",
                summary:
                  status === "unknown"
                    ? "Child connection lost; native outcome is unknown"
                    : "Native child execution failed",
              },
            }
          : {
              kind: status === "completed" ? "operation.completed" : "operation.interrupted",
              operationId: execution.operationId,
            },
      );
    }
  };
  const references = new Map<string, string>();
  const readNative = async (threadId: string) => {
    const result = z.object({ thread: nativeThread }).parse(
      await options.rpc.request("thread/read", {
        threadId,
        includeTurns: true,
      }),
    ).thread;
    if (result.id !== threadId) throw Error("Native child identity mismatch");
    return result;
  };
  const inspect = async (threadId: string, expectedTurnId?: string): Promise<AgentDelegation> => {
    const thread = await readNative(threadId);
    if (
      expectedTurnId !== undefined &&
      (thread.turns.at(-1)?.id !== expectedTurnId || thread.turns.at(-1)?.status !== "inProgress")
    )
      throw Error("Native child execution is not current");
    const seen = new Set([threadId]);
    let parent = thread.parentThreadId;
    while (parent !== options.threadId) {
      if (!parent || seen.has(parent) || seen.size >= maximumAncestryDepth)
        throw Error("Native child ancestry is unverified");
      seen.add(parent);
      parent = (await readNative(parent)).parentThreadId;
    }
    const childId = await nativeMessageId(`delegation:${options.threadId}:${threadId}`);
    const parentId =
      thread.parentThreadId === options.threadId
        ? null
        : await nativeMessageId(`delegation:${options.threadId}:${thread.parentThreadId}`);
    const last = thread.turns.at(-1);
    const status: AgentDelegation["status"] =
      thread.status.type === "notLoaded"
        ? "unknown"
        : last?.status === "inProgress"
          ? "running"
          : last?.status === "completed"
            ? "completed"
            : last?.status === "failed"
              ? "failed"
              : last?.status === "interrupted"
                ? "interrupted"
                : "unknown";
    const answer = last?.items
      ?.map((item) =>
        z.object({ type: z.literal("agentMessage"), text: z.string() }).safeParse(item),
      )
      .filter((item) => item.success)
      .map((item) => item.data.text)
      .join("\n\n");
    const operationId = last ? operationIds.get(JSON.stringify([threadId, last.id])) : undefined;
    if (!origins.has(threadId)) {
      const retained = await options.store.get(originKey(threadId));
      if (retained !== undefined)
        origins.set(
          threadId,
          z.strictObject({ parentThreadId: id, operationId: id }).parse(retained),
        );
    }
    const interruption = last
      ? await options.store.get(interruptionKey(threadId, last.id))
      : undefined;
    const control = executions.has(threadId)
      ? executions.get(threadId)!.interrupting ||
        (interruption !== undefined && interruption !== null)
        ? "pending"
        : "available"
      : "unknown";
    const snapshot = AgentDelegationSchema.parse({
      id: childId,
      parentId,
      ...(operationId ? { operationId } : {}),
      ...(origins.get(threadId)?.parentThreadId === thread.parentThreadId
        ? { originatingOperationId: origins.get(threadId)!.operationId }
        : {}),
      revision: await nativeMessageId(
        JSON.stringify([
          childId,
          last,
          thread.status,
          thread.canAcceptDirectInput,
          control,
          origins.get(threadId),
        ]),
      ),
      label: thread.agentNickname?.trim() || "Delegated task",
      status,
      result:
        status === "completed" && answer
          ? { state: "available", text: answer }
          : { state: "unknown" },
      // Discovery alone cannot promise an interruptible owned execution.
      controls: { interrupt: control },
    });
    references.set(childId, threadId);
    snapshots.set(threadId, snapshot);
    return snapshot;
  };
  const admitCurrent = async (threadId: string, turnId: string) => {
    const key = JSON.stringify([threadId, turnId]);
    if (seenExecutions.has(key) || executions.has(threadId)) return;
    const child = await inspect(threadId, turnId);
    if (
      !options.available() ||
      child.status !== "running" ||
      seenExecutions.has(key) ||
      executions.has(threadId)
    )
      return;
    seenExecutions.add(key);
    const admitted = await options.admit({
      childId: child.id,
      parentId: child.parentId,
      executionId: await nativeMessageId(key),
      ...(child.originatingOperationId
        ? { originatingOperationId: child.originatingOperationId }
        : {}),
    });
    if (admitted.status !== "ok") return;
    if (!options.available()) {
      options.finished(threadId, turnId, admitted.value.operationId);
      return;
    }
    const execution: Execution = {
      threadId,
      turnId,
      operationId: id.parse(admitted.value.operationId),
      approvals: new Map(),
      inputs: new Map(),
      requests: new Set(),
      interrupting: false,
      completedItems: new Set(),
    };
    executions.set(threadId, execution);
    operationIds.set(key, execution.operationId);
    try {
      options.accepted(threadId, turnId, execution.operationId);
      if (!options.available()) {
        finish(execution, "unknown");
        return;
      }
      options.emit({ kind: "delegation.updated", child: await inspect(threadId) });
      options.emit({
        kind: "operation.started",
        operationId: execution.operationId,
        delegationId: child.id,
      });
    } catch {
      finish(execution, "unknown");
    }
  };
  const capability: AgentDelegations = {
    async list() {
      if (!options.available()) return denied("Native delegation is unavailable");
      try {
        const children = new Map<string, AgentDelegation>();
        const cursors = new Set<string>();
        let cursor: string | undefined;
        for (let count = 0; count < maximumDiscoveryPages; count++) {
          const result = page.parse(
            await options.rpc.request("thread/list", {
              ancestorThreadId: options.threadId,
              limit: 100,
              ...(cursor ? { cursor } : {}),
            }),
          );
          for (const entry of result.data) {
            const native = await readNative(entry.id);
            const latest = native.turns.at(-1);
            if (native.status.type !== "notLoaded" && latest?.status === "inProgress")
              await admitCurrent(entry.id, latest.id);
            const child = await inspect(entry.id);
            children.set(child.id, child);
          }
          if (!result.nextCursor) {
            if (!options.available())
              return denied("Native delegation disconnected during discovery");
            for (const child of children.values())
              options.emit({ kind: "delegation.updated", child });
            return { status: "ok", value: [...children.values()] };
          }
          if (cursors.has(result.nextCursor)) throw Error("Repeated native cursor");
          cursor = result.nextCursor;
          cursors.add(cursor);
        }
        return denied("Native delegation discovery exceeded its bounded page limit");
      } catch {
        return denied("Native child discovery could not be verified");
      }
    },
    async read(childId) {
      const threadId = references.get(childId);
      if (!options.available() || !threadId) return denied("The native child is not available");
      try {
        const child = await inspect(threadId);
        if (!options.available()) return denied("Native delegation disconnected during inspection");
        options.emit({ kind: "delegation.updated", child });
        return { status: "ok", value: child };
      } catch {
        return denied("Native child ancestry could not be verified");
      }
    },
    async interrupt(raw) {
      const parsed = AgentDelegationRefSchema.safeParse(raw);
      if (!parsed.success || !options.available()) return denied("The native child is unavailable");
      const threadId = references.get(parsed.data.id);
      const execution = threadId ? executions.get(threadId) : undefined;
      if (!threadId || !execution || execution.interrupting)
        return denied("The native child has no verified interruptible operation");
      let reserved = false;
      let dispatched = false;
      try {
        const current = await inspect(threadId);
        if (
          current.revision !== parsed.data.revision ||
          current.controls.interrupt !== "available" ||
          executions.get(threadId) !== execution
        )
          return denied("The displayed child has changed; inspect it again");
        execution.interrupting = true;
        reserved = true;
        // Persist before dispatch. An ambiguous response or reconnect cannot
        // turn another click into a second native mutation.
        await options.store.set(interruptionKey(threadId, execution.turnId), {
          operationId: execution.operationId,
        });
        const pending: AgentDelegation = {
          ...current,
          revision: crypto.randomUUID(),
          controls: { interrupt: "pending" },
        };
        snapshots.set(threadId, pending);
        options.emit({ kind: "delegation.updated", child: pending });
        dispatched = true;
        await options.rpc.request("turn/interrupt", {
          threadId,
          turnId: execution.turnId,
        });
        return { status: "ok", value: undefined };
      } catch {
        if (reserved && !dispatched) {
          execution.interrupting = false;
          try {
            await options.store.set(interruptionKey(threadId, execution.turnId), null);
          } catch {
            /* Storage remains unavailable; retained uncertainty cannot grant controls. */
          }
          return denied("Child interruption was not submitted; restore storage and inspect again");
        }
        return denied("Child interruption is unconfirmed; no retry occurred");
      }
    },
  };
  const observeSpawn = async (senderThreadId: string, operationId: string, raw: unknown) => {
    const parsed = z
      .object({
        type: z.literal("collabAgentToolCall"),
        tool: z.literal("spawnAgent"),
        senderThreadId: id,
        receiverThreadIds: z.array(id),
      })
      .safeParse(raw);
    if (!parsed.success || parsed.data.senderThreadId !== senderThreadId) return;
    for (const receiver of parsed.data.receiverThreadIds) {
      const origin = { parentThreadId: senderThreadId, operationId };
      await options.store.set(originKey(receiver), origin);
      origins.set(receiver, origin);
      // Metadata links the originating call; ancestry still comes from native
      // thread state. A successful spawn call never implies child completion.
      if (snapshots.has(receiver)) {
        try {
          options.emit({ kind: "delegation.updated", child: await inspect(receiver) });
        } catch {
          /* Discovery failure does not create authority. */
        }
      }
    }
  };
  const controller = {
    capability,
    observeSpawn,
    async referenceContext(ids: readonly string[]): Promise<string> {
      const entries = [];
      for (const reference of ids) {
        const threadId = references.get(reference);
        if (!threadId || !options.available()) throw Error("Native child reference is unavailable");
        const child = await inspect(threadId);
        entries.push({ reference: child.id, label: child.label, nativeThreadId: threadId });
      }
      return JSON.stringify(entries);
    },
    async process(message: RpcMessage): Promise<boolean> {
      const p = z.record(z.string(), z.unknown()).safeParse(message.params);
      if (!p.success || typeof p.data.threadId !== "string" || p.data.threadId === options.threadId)
        return false;
      const threadId = p.data.threadId;
      if (message.method === "turn/started") {
        try {
          const turnId = z.object({ id }).parse(p.data.turn).id;
          await admitCurrent(threadId, turnId);
        } catch {
          /* Unverified ancestry cannot create authority or justify interrupting another task. */
        }
        return true;
      }
      const execution = executions.get(threadId);
      if (!execution) return refuseUnowned(message);
      const turnId =
        message.method === "turn/completed"
          ? z.object({ id }).safeParse(p.data.turn).data?.id
          : p.data.turnId;
      if (message.method === "serverRequest/resolved") {
        for (const [approvalId, value] of execution.approvals)
          if (value.rpcId === p.data.requestId) {
            execution.approvals.delete(approvalId);
            options.emit({ kind: "approval.resolved", approvalId });
          }
        for (const [requestId, value] of execution.inputs)
          if (value.rpcId === p.data.requestId) {
            execution.inputs.delete(requestId);
            options.emit({ kind: "input.resolved", requestId });
          }
        return true;
      }
      if (turnId !== execution.turnId) {
        // MCP permits null turn correlation. Thread identity alone must not
        // attach an old or standalone request to this execution's authority.
        refuseUnowned(message);
        return true;
      }
      try {
        if (
          (message.method === "item/started" || message.method === "item/completed") &&
          z.object({ type: z.literal("contextCompaction") }).safeParse(p.data.item).success
        ) {
          options.onContextInvalidated?.(execution.operationId);
          return true;
        }
        if (message.method === "item/completed") {
          const item = z.record(z.string(), z.unknown()).parse(p.data.item);
          await observeSpawn(threadId, execution.operationId, item);
          if (item.type === "mcpToolCall") {
            const result = nativeToolOutput(item);
            if (!result || execution.completedItems.has(result.origin.callId)) return true;
            execution.completedItems.add(result.origin.callId);
            if (
              item.status === "completed" &&
              typeof item.server === "string" &&
              typeof item.tool === "string"
            )
              options.onToolResultDelivered?.({
                operationId: execution.operationId,
                server: item.server,
                tool: item.tool,
                result: item.result,
              });
            await options.captureToolContent?.({
              id: `${execution.operationId}:${await nativeMessageId(`${threadId}:${result.origin.callId}`)}`,
              operationId: execution.operationId,
              source: result.origin.source,
              origin: result.origin,
              content: result.content,
            });
          }
          return true;
        }
        if (message.id !== undefined)
          processNativeInteraction({
            message: { ...message, id: message.id },
            params: p.data,
            operationId: execution.operationId,
            nativeReview: options.nativeReview,
            interrupting: execution.interrupting,
            approvals: execution.approvals,
            inputs: execution.inputs,
            interactionRequests: execution.requests,
            nextId: (kind) => `${requestScope}:${kind}-${++requestSequence}`,
            emit: options.emit,
            unsupported: () => finish(execution, "unknown"),
          });
        else if (message.method === "turn/completed") {
          const turn = z
            .object({ status: z.enum(["completed", "failed", "interrupted"]) })
            .parse(p.data.turn);
          finish(execution, turn.status);
          const completed = await inspect(threadId);
          // Notification and read snapshots can cross; never replace confirmed
          // terminal state with an older in-progress snapshot.
          if (completed.status === turn.status)
            options.emit({ kind: "delegation.updated", child: completed });
        }
      } catch {
        if (executions.get(threadId) === execution) finish(execution, "unknown");
      }
      return true;
    },
    resolveApproval(raw: unknown): AgentResult<void> | undefined {
      const parsed = AgentApprovalResolutionSchema.safeParse(raw);
      if (!parsed.success) return undefined;
      for (const execution of executions.values()) {
        const value = execution.approvals.get(parsed.data.approvalId);
        if (!value) continue;
        if (!value.choices.has(parsed.data.optionId) || execution.interrupting)
          return denied("This child approval is unavailable");
        execution.approvals.delete(parsed.data.approvalId);
        try {
          options.rpc.respond(value.rpcId, value.choices.get(parsed.data.optionId));
          options.emit({ kind: "approval.resolved", ...parsed.data });
          return { status: "ok", value: undefined };
        } catch {
          finish(execution, "unknown");
          return denied("Child approval delivery is unconfirmed");
        }
      }
      return undefined;
    },
    respondToInput(raw: unknown): AgentResult<void> | undefined {
      const parsed = AgentInputResolutionSchema.safeParse(raw);
      if (!parsed.success) return undefined;
      for (const execution of executions.values()) {
        const value = execution.inputs.get(parsed.data.requestId);
        if (!value) continue;
        if (
          execution.interrupting ||
          (parsed.data.action === "submit" && !value.schema.safeParse(parsed.data.value).success)
        )
          return denied("This child input response is unavailable or invalid");
        execution.inputs.delete(parsed.data.requestId);
        try {
          options.rpc.respond(value.rpcId, value.answer(parsed.data));
          options.emit({
            kind: "input.resolved",
            requestId: parsed.data.requestId,
          });
          return { status: "ok", value: undefined };
        } catch {
          finish(execution, "unknown");
          return denied("Child input delivery is unconfirmed");
        }
      }
      return undefined;
    },
    close() {
      for (const execution of [...executions.values()]) finish(execution, "unknown");
    },
  };
  // Reconnect discovery and native events share admission ordering. A terminal
  // notification cannot overtake a list-triggered admission and be discarded.
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <T>(action: () => Promise<T>): Promise<T> => {
    const result = queue.then(action);
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    ...controller,
    capability: {
      list: () => serialize(() => capability.list()),
      read: (childId: string) => serialize(() => capability.read(childId)),
      interrupt: (input: import("@drawloom/agent").AgentDelegationRef) =>
        serialize(() => capability.interrupt(input)),
    },
    process: (message: RpcMessage) => serialize(() => controller.process(message)),
  };
}
