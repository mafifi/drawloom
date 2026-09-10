import { z } from "zod";
import { createCodexHistoryReader, nativeMessageId } from "./history.js";
import {
  AgentSessionOpenInputSchema,
  AgentOperationInputSchema,
  AgentApprovalResolutionSchema,
  AgentInputResolutionSchema,
  AgentSessionSignalSchema,
  type AgentDriver,
  type AgentResult,
  type AgentSessionSignal,
  type AgentInputResolution,
  type AgentReviewer,
} from "@drawloom/agent";
import type { JsonStore, RpcTransport, JsonValue } from "@drawloom/host";
import type { ToolExposure, ToolGateway, ToolBinding } from "@drawloom/tools";
export type CodexDriverOptions = {
  /** Trusted host resolves only imported asset keys; provider paths never cross the contract. */
  imageInput?: (asset: import("@drawloom/host").Asset) => Promise<string>;
  /** Decode/copy native image bytes into confined storage, never follow a model-supplied path. */
  captureImage?: (result: string) => Promise<import("@drawloom/host").Asset>;
  connect: () => Promise<RpcTransport>;
  store: JsonStore;
  projection?: (exposure: ToolExposure) => JsonValue;
  onTurnAccepted?: (
    threadId: string,
    turnId: string,
    operationId: string,
  ) => void;
  onTurnFinished?: (threadId: string, turnId: string) => void;
};
const record = z.record(z.string(), z.unknown());
const identifier = z.string().min(1);
const reject = (
  code:
    | "invalid_state"
    | "invalid_interaction"
    | "provider_unavailable"
    | "provider_rejected",
  message = code.replaceAll('_', ' '),
): AgentResult<never> => ({
  status: "rejected",
  failure: { code, message },
});
const ok = (): AgentResult<void> => ({ status: "ok", value: undefined });
export function createCodexDriver(options: CodexDriverOptions): AgentDriver {
  const sessions = new Set<string>();
  return {
    driverId: "codex-app-server",
    async openSession(raw) {
      const parsed = AgentSessionOpenInputSchema.safeParse(raw);
      if (!parsed.success) return reject("invalid_state");
      const input = parsed.data;
      if (sessions.has(input.sessionId)) return reject("invalid_state");
      if (input.tools.tools.length && !options.projection)
        return reject("provider_rejected");
      sessions.add(input.sessionId);
      let transport: RpcTransport | undefined;
      try {
        transport = await options.connect();
        const rpc = transport;
        const initialization = await rpc.request("initialize", {
          clientInfo: { name: "drawloom", version: "0.0.0" },
          capabilities: { experimentalApi: true },
        });
        const { userAgent } = z.object({ userAgent: z.string().min(1) }).parse(initialization);
        // The native MCP-review discriminator and automatic-review wire mapping
        // are verified from 0.153.4. Unknown/older versions must not claim parity.
        const version = /^[^/]+\/(\d+)\.(\d+)\.(\d+)/.exec(userAgent);
        const nativeReview = Boolean(version && (Number(version[1]) > 0 || Number(version[2]) > 153 || (Number(version[2]) === 153 && Number(version[3]) >= 4)));
        if (input.tools.tools.length && !nativeReview) {
          await rpc.close(); sessions.delete(input.sessionId);
          return reject('provider_rejected', 'Native MCP review is unavailable in this Codex version. No tools were dispatched.');
        }
        rpc.notify("initialized");
        const saved = await options.store.get("codex:" + input.sessionId);
        const previous =
          saved === undefined
            ? undefined
            : z.strictObject({ threadId: identifier, materialized: z.boolean().optional() }).parse(saved);
        const resume = previous && previous.materialized !== false;
        const config = {
          mcp_servers: options.projection?.(input.tools) ?? {},
          plugins: {},
          apps: {},
          "features.memories": false,
          ...(nativeReview ? { "features.tool_call_mcp_elicitation": true } : {}),
        };
        const opened = await rpc.request(
          resume ? "thread/resume" : "thread/start",
          {
            ...(resume
              ? { threadId: previous.threadId, excludeTurns: true }
              : { ephemeral: false }),
            approvalPolicy: "on-request",
            ...(nativeReview ? { approvalsReviewer: 'user' } : {}),
            sandbox: "read-only",
            developerInstructions: input.context.text,
            config,
          },
        );
        const threadId = z
          .object({ thread: z.object({ id: identifier }) })
          .parse(opened).thread.id;
        if (nativeReview && record.parse(opened).approvalsReviewer !== 'user') {
          await rpc.close(); sessions.delete(input.sessionId);
          return reject('provider_rejected', 'Codex did not confirm the requested native reviewer. No operation was started.');
        }
        await rpc.request("thread/memoryMode/set", {
          threadId,
          mode: "disabled",
        });
        let materialized = Boolean(resume);
        await options.store.set("codex:" + input.sessionId, { threadId, materialized });
        const operationKey = "codex-operations:" + input.sessionId;
        const operations = z.record(z.string(), z.string()).parse(await options.store.get(operationKey) ?? {});
        const userAssets = new Map<string, import("@drawloom/host").Asset[][]>();
        const mediaPending = new Set<Promise<void>>();
        let closed = false,
          attached = false,
          starting = false;
        let active: { operationId: string; turnId: string } | undefined;
        let sequence = 0;
        const interactionScope = crypto.randomUUID();
        let activeReviewer: AgentReviewer = 'human';
        let interrupting = false;
        let wake: (() => void) | undefined;
        const queue: AgentSessionSignal[] = [];
        const buffered: import("@drawloom/host").RpcMessage[] = [];
        const used = new Set<string>();
        const messageIds = new Map<string, string>();
        const completedMessages = new Set<string>();
        const approvals = new Map<
          string,
          { rpcId: string | number; choices: Map<string, unknown> }
        >();
        const interactionRequests = new Set<string | number>();
        const inputs = new Map<
          string,
          {
            rpcId: string | number;
            schema: z.ZodType;
            answer: (input: AgentInputResolution) => unknown;
          }
        >();
        const interrupts = new Map<string, Promise<AgentResult<void>>>();
        const emit = (signal: AgentSessionSignal) => {
          queue.push(AgentSessionSignalSchema.parse(signal));
          wake?.();
          wake = undefined;
        };
        const finish = (
          kind:
            | "operation.completed"
            | "operation.interrupted"
            | "operation.failed",
          code:
            | "provider_unavailable"
            | "provider_rejected"
            | "invalid_provider_response" = "provider_rejected",
        ) => {
          if (!active) return;
          const last = active;
          active = undefined;
          userAssets.delete(last.turnId);
          approvals.clear();
          inputs.clear();
          messageIds.clear();
          completedMessages.clear();
          try {
            options.onTurnFinished?.(threadId, last.turnId);
          } catch {
            /* Authority owners must also revoke during composition cleanup. */
          }
          emit(
            kind === "operation.failed"
              ? {
                  kind,
                  operationId: last.operationId,
                  failure: {
                    code,
                    summary:
                      code === "provider_unavailable"
                        ? "Provider connection unavailable"
                        : "Provider operation failed",
                  },
                }
              : { kind, operationId: last.operationId },
          );
        };
        const fail = () => {
          if (closed) return;
          finish("operation.failed", "provider_unavailable");
          closed = true;
          sessions.delete(input.sessionId);
          wake?.();
          void rpc.close().catch(() => {});
        };
        const messageId = async (nativeId: string) => {
          let id = messageIds.get(nativeId);
          if (!id) {
            id = await nativeMessageId(nativeId);
            messageIds.set(nativeId, id);
          }
          return id;
        };
        const processMessage = async (message: import("@drawloom/host").RpcMessage) => {
          if (closed) return;
          if (starting && !active) {
            buffered.push(message);
            return;
          }
          if (!active) return;
          try {
            const params = record.parse(message.params);
            if (params.threadId !== threadId) return;
            if (message.method === 'serverRequest/resolved') {
              for (const [approvalId, pending] of approvals) if (pending.rpcId === params.requestId) {
                approvals.delete(approvalId);
                emit({ kind: 'approval.resolved', approvalId });
              }
              for (const [requestId, pending] of inputs) if (pending.rpcId === params.requestId) {
                inputs.delete(requestId);
                emit({ kind: 'input.resolved', requestId });
              }
              return;
            }
            const turn =
              params.turn === undefined ? undefined : record.parse(params.turn);
            if ((params.turnId ?? turn?.id) !== active.turnId) return;
            const operationId = active.operationId;
            if (message.id !== undefined) {
              if (interrupting) return;
              if (interactionRequests.has(message.id)) throw Error('Duplicate native request');
              interactionRequests.add(message.id);
              if (
                message.method === "item/commandExecution/requestApproval" ||
                message.method === "item/fileChange/requestApproval"
              ) {
                const decisions = z
                  .array(z.json())
                  .min(1)
                  .parse(
                    params.availableDecisions ?? [
                      "accept",
                      "acceptForSession",
                      "decline",
                      "cancel",
                    ],
                  );
                const choices = new Map<string, unknown>();
                const options = decisions.map((decision, index) => {
                  const optionId = "option-" + index;
                  choices.set(optionId, { decision });
                  return {
                    optionId,
                    label:
                      typeof decision === "string"
                        ? decision
                        : (Object.keys(record.parse(decision))[0] ??
                          "Provider option"),
                  };
                });
                const approvalId = `${interactionScope}:approval-${++sequence}`;
                approvals.set(approvalId, { rpcId: message.id, choices });
                emit({
                  kind: "approval.requested",
                  request: {
                    approvalId,
                    operationId,
                    summary:
                      typeof params.reason === "string"
                        ? params.reason.slice(0, 4096)
                        : "Provider requested execution approval",
                    options,
                  },
                });
                return;
              }
              if (message.method === "mcpServer/elicitation/request") {
                const meta = params._meta === undefined ? {} : record.parse(params._meta);
                if (meta.codex_approval_kind === 'mcp_tool_call') {
                  if (!nativeReview || params.mode !== 'form') throw Error('Unsupported native approval');
                  const approvalId = `${interactionScope}:approval-${++sequence}`;
                  const choices = new Map<string, unknown>([
                    ['approve', { action: 'accept' }], ['deny', { action: 'decline' }], ['cancel', { action: 'cancel' }],
                  ]);
                  approvals.set(approvalId, { rpcId: message.id, choices });
                  const details = meta.tool_params_display ?? meta.tool_params;
                  emit({ kind: 'approval.requested', request: {
                    approvalId, operationId,
                    summary: z.string().parse(params.message).slice(0, 4096),
                    ...(details === undefined ? {} : { details: (typeof details === 'string' ? details : JSON.stringify(z.json().parse(details), null, 2)).slice(0, 16384) }),
                    options: [{ optionId: 'approve', label: 'Approve once' }, { optionId: 'deny', label: 'Deny' }, { optionId: 'cancel', label: 'Cancel' }],
                  } });
                  return;
                }
                const responseSchema = z
                  .record(z.string(), z.json())
                  .parse(params.requestedSchema);
                const schema = z.fromJSONSchema(responseSchema);
                const requestId = `${interactionScope}:input-${++sequence}`;
                inputs.set(requestId, {
                  rpcId: message.id,
                  schema,
                  answer: (r) =>
                    r.action === "submit"
                      ? { action: "accept", content: r.value }
                      : { action: "cancel" },
                });
                emit({
                  kind: "input.requested",
                  request: {
                    requestId,
                    operationId,
                    prompt: z.string().parse(params.message).slice(0, 8192),
                    responseSchema,
                  },
                });
                return;
              }
              if (message.method === "item/tool/requestUserInput") {
                const questions = z
                  .array(
                    z.object({
                      id: identifier,
                      question: z.string(),
                      isOther: z.boolean().optional(),
                      options: z
                        .array(
                          z.object({
                            label: z.string(),
                            description: z.string().optional(),
                          }),
                        )
                        .nullable()
                        .optional(),
                    }),
                  )
                  .min(1)
                  .parse(params.questions);
                const shape: Record<string, z.ZodType> = {};
                for (const question of questions)
                  shape[question.id] = z.strictObject({
                    answers: z
                      .array(
                        question.options?.length && !question.isOther
                          ? z.enum(
                              question.options.map((o) => o.label) as [
                                string,
                                ...string[],
                              ],
                            )
                          : z.string(),
                      )
                      .min(1),
                  });
                const schema = z.strictObject(shape);
                const requestId = `${interactionScope}:input-${++sequence}`;
                inputs.set(requestId, {
                  rpcId: message.id,
                  schema,
                  answer: (r) => ({
                    answers: r.action === "submit" ? r.value : {},
                  }),
                });
                emit({
                  kind: "input.requested",
                  request: {
                    requestId,
                    operationId,
                    prompt: questions
                      .map((q) =>
                        [
                          q.question,
                          ...(q.options ?? []).map(
                            (option) =>
                              `${option.label}${option.description ? `: ${option.description}` : ""}`,
                          ),
                          ...(q.isOther
                            ? ["Other: enter a custom answer."]
                            : []),
                        ].join("\n"),
                      )
                      .join("\n")
                      .slice(0, 8192),
                    responseSchema: z.json().parse(z.toJSONSchema(schema)),
                  },
                });
                return;
              }
              // Unsupported server interactions cannot be silently abandoned.
              finish("operation.failed", "invalid_provider_response");
              return;
            }
            if (message.method === 'item/autoApprovalReview/started' || message.method === 'item/autoApprovalReview/completed') {
              // Background/provider diagnostics cannot change the review mode chosen for this turn.
              if (activeReviewer !== 'delegated') return;
              const review = z.object({ status: z.enum(['inProgress', 'approved', 'denied', 'timedOut', 'aborted']), rationale: z.string().nullable().optional() }).parse(params.review);
              if ((message.method.endsWith('/started')) !== (review.status === 'inProgress')) throw Error('Invalid native review phase');
              const action = record.parse(params.action);
              const status = { inProgress: 'in progress', approved: 'approved', denied: 'denied', timedOut: 'timed out', aborted: 'cancelled' }[review.status];
              const tool = action.type === 'mcpToolCall' ? z.string().parse(action.toolName).slice(0, 256) : 'provider action';
              emit({ kind: 'provider.observation', operationId, name: 'approval-review', summary: `Automatic review ${status}: ${tool}${review.rationale ? `. ${review.rationale}` : ''}`.slice(0, 4096) });
              return;
            }
            if (message.method === "item/agentMessage/delta") {
              const native = identifier.parse(params.itemId);
              if (completedMessages.has(native)) return;
              emit({
                kind: "message.delta",
                operationId,
                messageId: await messageId(native),
                delta: z.string().parse(params.delta),
              });
              return;
            }
            if (message.method === "item/completed") {
              const item = record.parse(params.item);
              if (item.type === "imageGeneration" && item.status === "completed" && options.captureImage) {
                const native = identifier.parse(item.id);
                if (completedMessages.has(native)) return;
                completedMessages.add(native);
                const result = z.string().parse(item.result);
                const pending = options.captureImage(result).then(async asset => {
                  if (!closed && active?.operationId === operationId) emit({ kind: "artifact.available", operationId, messageId: await messageId(native), asset });
                }).catch(() => { /* Media capture is history/display work, not provider execution. */ });
                mediaPending.add(pending);
                void pending.finally(() => mediaPending.delete(pending));
              } else if (item.type === "agentMessage") {
                const native = identifier.parse(item.id);
                if (completedMessages.has(native)) return;
                completedMessages.add(native);
                const phase =
                  item.phase === "final_answer" || item.phase === "final"
                    ? "final"
                    : item.phase === "commentary"
                      ? "commentary"
                      : undefined;
                emit({
                  kind: "message.completed",
                  operationId,
                  messageId: await messageId(native),
                  text: z.string().parse(item.text),
                  ...(phase ? { phase } : {}),
                });
              } else if (item.type === "userMessage") {
                const native = identifier.parse(item.id);
                if (completedMessages.has(native)) return;
                completedMessages.add(native);
                const content = z.array(record).parse(item.content);
                const assets = userAssets.get(active.turnId)?.shift() ?? [];
                emit({
                  kind: "message.completed",
                  operationId,
                  messageId: await messageId(native),
                  role: "user",
                  text: content.filter(value => value.type === "text").map(value => z.string().parse(value.text)).join("\n"),
                  ...(assets.length ? { assets } : {}),
                });
              } else if (
                item.type === "collabAgentToolCall" ||
                item.type === "subAgentActivity"
              )
                emit({
                  kind: "provider.observation",
                  operationId,
                  name: "delegation",
                  summary: "Provider reported delegated activity",
                });
              return;
            }
            if (message.method === "thread/tokenUsage/updated") {
              emit({
                kind: "provider.observation",
                operationId,
                name: "usage",
                summary: "Provider reported updated usage",
              });
              return;
            }
            if (message.method === "item/reasoning/summaryTextDelta") {
              emit({
                kind: "provider.observation",
                operationId,
                name: "reasoning-summary",
                summary: "Provider reported a reasoning summary update",
              });
              return;
            }
            if (message.method === "turn/completed") {
              const status = z
                .enum(["completed", "interrupted", "failed"])
                .parse(turn?.status);
              const complete = () => { if (active?.operationId !== operationId) return; finish(
                status === "completed"
                  ? "operation.completed"
                  : status === "interrupted"
                    ? "operation.interrupted"
                    : "operation.failed",
              ); };
              if (mediaPending.size) void Promise.all([...mediaPending]).then(complete);
              else complete();
            }
          } catch {
            finish("operation.failed", "invalid_provider_response");
          }
        };
        let receiveChain = Promise.resolve();
        const receive = (message: import("@drawloom/host").RpcMessage) => {
          receiveChain = receiveChain.then(() => processMessage(message));
        };
        const unsubscribe = rpc.subscribe(receive, fail);
        const nativeHistory = createCodexHistoryReader((method, params) => rpc.request(method, params), threadId, operations, options.captureImage);
        return {
          status: "ok",
          value: {
            sessionId: input.sessionId,
            reviewerModes: Object.freeze<AgentReviewer[]>(nativeReview ? ['human', 'delegated'] : ['human']),
            history: {
              namespace: nativeHistory.namespace,
              async read(context, readOptions) {
                if (!materialized) return { entries: [], checkpoints: [], hasOlder: false };
                return nativeHistory.read(context, readOptions);
              },
            },
            signals() {
              if (attached) throw Error("Signal consumer already attached");
              attached = true;
              let consumed = false;
              return {
                [Symbol.asyncIterator]() {
                  if (consumed) throw Error("Signal iterable already consumed");
                  consumed = true;
                  return (async function* () {
                    while (!closed || queue.length) {
                      if (queue.length) yield queue.shift()!;
                      else
                        await new Promise<void>((r) => {
                          wake = r;
                        });
                    }
                  })();
                },
              };
            },
            async execute(rawOperation) {
              const p = AgentOperationInputSchema.safeParse(rawOperation);
              if (
                !p.success ||
                closed ||
                !attached ||
                active ||
                starting ||
                used.has(p.data.operationId)
              )
                return reject("invalid_state");
              const operation = p.data;
              if (operation.reviewer === 'delegated' && !nativeReview) return reject('provider_rejected', 'Native delegated review is unavailable in this Codex version.');
              if (operation.attachments?.length && !options.imageInput) return reject("provider_rejected");
              starting = true;
              used.add(operation.operationId);
              try {
                const result = await rpc.request("turn/start", {
                  threadId,
                  ...(nativeReview ? { approvalsReviewer: operation.reviewer === 'delegated' ? 'auto_review' : 'user' } : {}),
                  input: [
                    { type: "text", text: operation.text, text_elements: [] },
                    ...await Promise.all((operation.attachments ?? []).map(async asset => ({ type: "localImage", path: await options.imageInput!(asset) }))),
                  ],
                  ...(operation.additionalContext
                    ? {
                        additionalContext: {
                          drawloom: {
                            kind: "application",
                            value: operation.additionalContext.text,
                          },
                        },
                      }
                    : {}),
                });
                const turnId = z
                  .object({ turn: z.object({ id: identifier }) })
                  .parse(result).turn.id;
                if (closed) return reject("provider_unavailable");
                active = { operationId: operation.operationId, turnId };
                activeReviewer = operation.reviewer ?? 'human';
                interrupting = false;
                operations[turnId] = operation.operationId;
                userAssets.set(turnId, [[...(operation.attachments ?? [])]]);
                emit({
                  kind: "operation.started",
                  operationId: operation.operationId,
                });
                try {
                  options.onTurnAccepted?.(
                    threadId,
                    turnId,
                    operation.operationId,
                  );
                  await options.store.set(operationKey, operations);
                  materialized = true;
                  await options.store.set("codex:" + input.sessionId, { threadId, materialized });
                } catch {
                  finish("operation.failed", "provider_unavailable");
                }
                starting = false;
                for (const event of buffered.splice(0)) receive(event);
                return {
                  status: "ok",
                  value: { operationId: operation.operationId },
                };
              } catch {
                buffered.length = 0;
                return reject("provider_unavailable");
              } finally {
                starting = false;
              }
            },
            async steer(rawSteering) {
              const p = AgentOperationInputSchema.safeParse(rawSteering);
              if (
                !p.success ||
                closed ||
                !active ||
                p.data.operationId !== active.operationId
              )
                return reject("invalid_state");
              if (p.data.reviewer !== undefined && p.data.reviewer !== activeReviewer) return reject('invalid_state');
              try {
                if (p.data.attachments?.length && !options.imageInput) return reject("provider_rejected");
                const queuedAssets = [...(p.data.attachments ?? [])];
                userAssets.get(active.turnId)?.push(queuedAssets);
                await rpc.request("turn/steer", {
                  threadId,
                  expectedTurnId: active.turnId,
                  input: [
                    { type: "text", text: p.data.text, text_elements: [] },
                    ...await Promise.all((p.data.attachments ?? []).map(async asset => ({ type: "localImage", path: await options.imageInput!(asset) }))),
                  ],
                  ...(p.data.additionalContext
                    ? {
                        additionalContext: {
                          drawloom: {
                            kind: "application",
                            value: p.data.additionalContext.text,
                          },
                        },
                      }
                    : {}),
                });
                return ok();
              } catch {
                userAssets.get(active.turnId)?.pop();
                return reject("provider_unavailable");
              }
            },
            interrupt(operationId) {
              const previous = interrupts.get(operationId);
              if (previous) return previous;
              if (closed || !active || active.operationId !== operationId)
                return Promise.resolve(reject("invalid_state"));
              interrupting = true;
              for (const approvalId of approvals.keys()) emit({ kind: 'approval.resolved', approvalId });
              approvals.clear();
              for (const requestId of inputs.keys()) emit({ kind: 'input.resolved', requestId });
              inputs.clear();
              const promise = rpc
                .request("turn/interrupt", { threadId, turnId: active.turnId })
                .then(
                  () => ok(),
                  () => reject("provider_unavailable"),
                );
              interrupts.set(operationId, promise);
              return promise;
            },
            async resolveApproval(rawResolution) {
              const p = AgentApprovalResolutionSchema.safeParse(rawResolution);
              if (!p.success) return reject("invalid_interaction");
              const pending = approvals.get(p.data.approvalId);
              if (!pending || !pending.choices.has(p.data.optionId))
                return reject("invalid_interaction");
              approvals.delete(p.data.approvalId);
              try {
                rpc.respond(
                  pending.rpcId,
                  pending.choices.get(p.data.optionId),
                );
                emit({ kind: "approval.resolved", ...p.data });
                return ok();
              } catch {
                fail();
                return reject("provider_unavailable");
              }
            },
            async respondToInput(rawResolution) {
              const p = AgentInputResolutionSchema.safeParse(rawResolution);
              if (!p.success) return reject("invalid_interaction");
              const pending = inputs.get(p.data.requestId);
              if (
                !pending ||
                (p.data.action === "submit" &&
                  !pending.schema.safeParse(p.data.value).success)
              )
                return reject("invalid_interaction");
              inputs.delete(p.data.requestId);
              try {
                rpc.respond(pending.rpcId, pending.answer(p.data));
                emit({ kind: "input.resolved", requestId: p.data.requestId });
                return ok();
              } catch {
                fail();
                return reject("provider_unavailable");
              }
            },
            async close() {
              if (!closed) {
                await receiveChain;
                finish("operation.interrupted");
                closed = true;
                unsubscribe();
                sessions.delete(input.sessionId);
                wake?.();
                try {
                  await rpc.close();
                } catch {
                  return reject("provider_unavailable");
                }
              }
              return ok();
            },
          },
        };
      } catch {
        sessions.delete(input.sessionId);
        await transport?.close().catch(() => {});
        return reject("provider_unavailable");
      }
    },
  };
}
export function createCodexToolBridge(gateway: ToolGateway): {
  publish(threadId: string, turnId: string, binding: ToolBinding): void;
  retire(threadId: string, turnId: string): void;
  call(
    metadata: unknown,
    name: string,
    args: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
} {
  const origins = new Map<string, ToolBinding>();
  const retired = new Set<string>();
  const key = (thread: string, turn: string) => JSON.stringify([thread, turn]);
  return {
    publish(thread, turn, binding) {
      identifier.parse(thread);
      identifier.parse(turn);
      const k = key(thread, turn);
      if (origins.has(k) || retired.has(k)) throw Error("Origin already used");
      origins.set(k, binding);
    },
    retire(thread, turn) {
      const k = key(thread, turn);
      const binding = origins.get(k);
      if (binding) gateway.revoke(binding);
      origins.delete(k);
      retired.add(k);
    },
    async call(metadata, name, args, signal) {
      const parsed = z
        .object({
          callId: identifier,
          "x-codex-turn-metadata": z.object({
            thread_id: identifier,
            turn_id: identifier,
          }),
        })
        .safeParse(metadata);
      const origin = parsed.success
        ? parsed.data["x-codex-turn-metadata"]
        : undefined;
      const binding = origin
        ? origins.get(key(origin.thread_id, origin.turn_id))
        : undefined;
      if (!binding)
        return {
          isError: true,
          content: [{ type: "text", text: "Origin authority unavailable" }],
        };
      const result = await gateway.invoke(binding, name, args, signal);
      return {
        isError:
          result.outcome.status !== "ok" || result.evidence !== "recorded",
        content: [
          {
            type: "text",
            text:
              result.outcome.status === "ok"
                ? result.outcome.text
                : result.outcome.code,
          },
        ],
        ...(result.outcome.status === "ok"
          ? { structuredContent: { value: result.outcome.value } }
          : {}),
        _meta: {
          invocationId: result.invocationId,
          operationId: result.operationId,
          evidence: result.evidence,
          ...(result.outcome.status === "failed"
            ? { execution: result.outcome.execution }
            : {}),
        },
      };
    },
  };
}
