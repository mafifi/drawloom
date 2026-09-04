import {
  AgentSessionSignalSchema,
  type AgentApprovalResolution,
  type AgentDriver,
  type AgentInputResolution,
  type AgentOperationInput,
  type AgentResult,
  type AgentSession,
  type AgentSessionOpenInput,
  type AgentSessionSignal,
  type AgentSteeringInput,
  type CompiledContext,
  type JsonValue,
} from "./contract.ts";
import {
  isRecord,
  type CodexNotification,
  type CodexServerRequest,
  type CodexTransport,
  type JsonRecord,
  type JsonRpcId,
} from "./app-server-client.ts";

type ContinuityStore = Map<string, string>;

type ActiveOperation = {
  readonly operationId: string;
  readonly providerTurnId: string;
  interruptRequest: Promise<AgentResult<void>> | undefined;
};

type PendingApproval = {
  readonly rpcId: JsonRpcId;
  readonly providerResponses: ReadonlyMap<string, unknown>;
};

type PendingInput = {
  readonly rpcId: JsonRpcId;
  readonly response: (resolution: AgentInputResolution) => unknown;
};

type DriverOptions = {
  readonly transport: CodexTransport;
  readonly continuityStore?: ContinuityStore;
  readonly cwd?: string;
};

const rejected = <T>(
  code:
    | "invalid_state"
    | "invalid_interaction"
    | "provider_unavailable"
    | "provider_rejected",
  message: string,
): AgentResult<T> => ({ status: "rejected", failure: { code, message } });

const safeString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const renderContext = (context: CompiledContext): string =>
  Object.entries(context)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, entry]) => `${name}: ${entry.value}`)
    .join("\n");

const spikeInstructions = (context: CompiledContext): string =>
  [
    "This is a deterministic Drawloom integration probe.",
    "Follow explicit requests to call a named MCP or terminal tool exactly as written; do not simulate tool results in prose.",
    renderContext(context),
  ].join("\n");

class SignalQueue implements AsyncIterable<AgentSessionSignal> {
  private readonly values: AgentSessionSignal[] = [];
  private readonly waiters: Array<
    (result: IteratorResult<AgentSessionSignal>) => void
  > = [];
  private ended = false;
  private iteratorIssued = false;

  public push(signal: AgentSessionSignal): void {
    if (this.ended) throw new Error("Cannot emit after signal stream closure");
    const parsed = AgentSessionSignalSchema.parse(signal);
    const waiter = this.waiters.shift();
    if (waiter) waiter({ done: false, value: parsed });
    else this.values.push(parsed);
  }

  public end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }

  public [Symbol.asyncIterator](): AsyncIterator<AgentSessionSignal> {
    if (this.iteratorIssued) {
      throw new Error("The session signal stream has one consumer.");
    }
    this.iteratorIssued = true;
    return {
      next: async (): Promise<IteratorResult<AgentSessionSignal>> => {
        const value = this.values.shift();
        if (value) return { done: false, value };
        if (this.ended) return { done: true, value: undefined };
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}

export class CodexSpikeDriver implements AgentDriver {
  public readonly driverId = "codex-app-server-spike";
  private readonly transport: CodexTransport;
  private readonly continuityStore: ContinuityStore;
  private readonly cwd: string;

  public constructor({ transport, continuityStore, cwd }: DriverOptions) {
    this.transport = transport;
    this.continuityStore = continuityStore ?? new Map();
    this.cwd = cwd ?? process.cwd();
  }

  public async openSession(
    input: AgentSessionOpenInput,
  ): Promise<AgentResult<AgentSession>> {
    const providerThreadId = this.continuityStore.get(input.sessionId);
    try {
      const result = await this.transport.request(
        providerThreadId ? "thread/resume" : "thread/start",
        providerThreadId
          ? {
              threadId: providerThreadId,
              developerInstructions: spikeInstructions(input.context),
            }
          : {
              ephemeral: false,
              approvalPolicy: "on-request",
              sandbox: "workspace-write",
              cwd: this.cwd,
              developerInstructions: spikeInstructions(input.context),
              config: { mcp_servers: input.tools.mcpServers },
            },
      );
      const thread = isRecord(result) ? result.thread : undefined;
      const threadId = isRecord(thread) ? safeString(thread.id) : undefined;
      if (!threadId) {
        return rejected(
          "provider_rejected",
          "Codex did not return a usable thread.",
        );
      }
      this.continuityStore.set(input.sessionId, threadId);
      await this.transport.request("thread/memoryMode/set", {
        threadId,
        mode: "disabled",
      });
      return {
        status: "ok",
        value: new CodexSpikeSession(input.sessionId, threadId, this.transport),
      };
    } catch {
      return rejected(
        "provider_unavailable",
        "Codex app-server was unavailable while opening the session.",
      );
    }
  }
}

class CodexSpikeSession implements AgentSession {
  public readonly steer = async (
    input: AgentSteeringInput,
  ): Promise<AgentResult<void>> => {
    if (!this.active || this.active.operationId !== input.operationId) {
      return rejected("invalid_state", "The target operation is not active.");
    }
    try {
      await this.transport.request("turn/steer", {
        threadId: this.providerThreadId,
        expectedTurnId: this.active.providerTurnId,
        input: [{ type: "text", text: input.text, text_elements: [] }],
        additionalContext: input.additionalContext,
      });
      return { status: "ok", value: undefined };
    } catch {
      return rejected("provider_rejected", "Codex rejected steering.");
    }
  };

  public readonly interrupt = async (
    operationId: string,
  ): Promise<AgentResult<void>> => {
    if (this.interruptedOperationIds.has(operationId)) {
      return { status: "ok", value: undefined };
    }
    if (!this.active || this.active.operationId !== operationId) {
      return rejected("invalid_state", "The target operation is not active.");
    }
    if (this.active.interruptRequest) return this.active.interruptRequest;
    const active = this.active;
    const interruptRequest = (async (): Promise<AgentResult<void>> => {
      try {
        await this.transport.request("turn/interrupt", {
          threadId: this.providerThreadId,
          turnId: active.providerTurnId,
        });
        return { status: "ok", value: undefined };
      } catch {
        if (this.active === active) active.interruptRequest = undefined;
        return rejected("provider_rejected", "Codex rejected interruption.");
      }
    })();
    active.interruptRequest = interruptRequest;
    return interruptRequest;
  };

  private readonly queue = new SignalQueue();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly pendingInputs = new Map<string, PendingInput>();
  private readonly messageIds = new Map<string, string>();
  private readonly unsubscribeNotification: () => void;
  private readonly unsubscribeRequest: () => void;
  private readonly unsubscribeFailure: () => void;
  private readonly interruptedOperationIds = new Set<string>();
  private readonly bufferedNotifications: CodexNotification[] = [];
  private readonly bufferedRequests: CodexServerRequest[] = [];
  private active: ActiveOperation | undefined;
  private startingOperationId: string | undefined;
  private signalConsumerAttached = false;
  private closed = false;
  private transportFailed = false;
  private nextApprovalId = 1;
  private nextInputId = 1;
  private nextMessageId = 1;

  public constructor(
    public readonly sessionId: string,
    private readonly providerThreadId: string,
    private readonly transport: CodexTransport,
  ) {
    this.unsubscribeNotification = transport.onNotification((notification) =>
      this.handleNotification(notification),
    );
    this.unsubscribeRequest = transport.onRequest((request) =>
      this.handleRequest(request),
    );
    this.unsubscribeFailure = transport.onFailure(() =>
      this.handleTransportFailure(),
    );
  }

  public signals(): AsyncIterable<AgentSessionSignal> {
    if (this.signalConsumerAttached) {
      throw new Error("The session signal stream has one consumer.");
    }
    this.signalConsumerAttached = true;
    return this.queue;
  }

  public async execute(
    input: AgentOperationInput,
  ): Promise<AgentResult<{ readonly operationId: string }>> {
    if (this.closed || this.transportFailed) {
      return rejected("invalid_state", "The session is closed.");
    }
    if (!this.signalConsumerAttached) {
      return rejected(
        "invalid_state",
        "Attach the signal consumer before executing an operation.",
      );
    }
    if (this.active || this.startingOperationId) {
      return rejected("invalid_state", "Another operation is already active.");
    }
    this.startingOperationId = input.operationId;
    try {
      const result = await this.transport.request("turn/start", {
        threadId: this.providerThreadId,
        input: [{ type: "text", text: input.text, text_elements: [] }],
        additionalContext: input.additionalContext,
        effort: "low",
        summary: "concise",
      });
      const turn = isRecord(result) ? result.turn : undefined;
      const providerTurnId = isRecord(turn) ? safeString(turn.id) : undefined;
      if (!providerTurnId) {
        this.clearStartingOperation();
        return rejected(
          "provider_rejected",
          "Codex did not accept the operation.",
        );
      }
      if (this.transportFailed || this.closed) {
        this.clearStartingOperation();
        return rejected(
          "provider_unavailable",
          "Codex app-server became unavailable while starting the operation.",
        );
      }
      this.active = {
        operationId: input.operationId,
        providerTurnId,
        interruptRequest: undefined,
      };
      this.startingOperationId = undefined;
      this.emit({ kind: "operation.started", operationId: input.operationId });
      for (const notification of this.bufferedNotifications.splice(0)) {
        this.handleNotification(notification);
      }
      for (const request of this.bufferedRequests.splice(0)) {
        this.handleRequest(request);
      }
      return {
        status: "ok",
        value: { operationId: input.operationId },
      };
    } catch {
      this.clearStartingOperation();
      return rejected(
        "provider_unavailable",
        "Codex app-server was unavailable while starting the operation.",
      );
    }
  }

  public async resolveApproval(
    input: AgentApprovalResolution,
  ): Promise<AgentResult<void>> {
    const pending = this.pendingApprovals.get(input.approvalId);
    const response = pending?.providerResponses.get(input.optionId);
    if (!pending || response === undefined) {
      return rejected("invalid_interaction", "The approval is not pending.");
    }
    this.pendingApprovals.delete(input.approvalId);
    this.transport.respond(pending.rpcId, response);
    this.emit({
      kind: "approval.resolved",
      approvalId: input.approvalId,
      optionId: input.optionId,
    });
    return { status: "ok", value: undefined };
  }

  public async respondToInput(
    input: AgentInputResolution,
  ): Promise<AgentResult<void>> {
    const pending = this.pendingInputs.get(input.requestId);
    if (!pending) {
      return rejected("invalid_interaction", "The input request is not pending.");
    }
    this.pendingInputs.delete(input.requestId);
    this.transport.respond(pending.rpcId, pending.response(input));
    this.emit({ kind: "input.resolved", requestId: input.requestId });
    return { status: "ok", value: undefined };
  }

  public async close(): Promise<AgentResult<void>> {
    if (this.closed) return { status: "ok", value: undefined };
    this.closed = true;
    if (this.active) {
      const active = this.active;
      try {
        await this.transport.request("turn/interrupt", {
          threadId: this.providerThreadId,
          turnId: active.providerTurnId,
        });
      } catch {
        // Local closure still preserves the terminal invariant.
      }
      this.finishOperation({
        kind: "operation.interrupted",
        operationId: active.operationId,
      });
    }
    this.invalidateInteractions();
    this.clearStartingOperation();
    this.unsubscribeNotification();
    this.unsubscribeRequest();
    this.unsubscribeFailure();
    this.queue.end();
    await this.transport.close();
    return { status: "ok", value: undefined };
  }

  private emit(signal: AgentSessionSignal): void {
    this.queue.push(signal);
  }

  private finishOperation(
    signal:
      | Extract<AgentSessionSignal, { kind: "operation.completed" }>
      | Extract<AgentSessionSignal, { kind: "operation.failed" }>
      | Extract<AgentSessionSignal, { kind: "operation.interrupted" }>,
  ): void {
    if (!this.active || this.active.operationId !== signal.operationId) return;
    this.emit(signal);
    this.active = undefined;
    this.invalidateInteractions();
  }

  private invalidateInteractions(): void {
    this.pendingApprovals.clear();
    this.pendingInputs.clear();
  }

  private clearStartingOperation(): void {
    this.startingOperationId = undefined;
    this.bufferedNotifications.splice(0);
    this.bufferedRequests.splice(0);
  }

  private handleTransportFailure(): void {
    if (this.closed || this.transportFailed) return;
    this.transportFailed = true;
    this.clearStartingOperation();
    if (this.active) {
      this.finishOperation({
        kind: "operation.failed",
        operationId: this.active.operationId,
        failure: {
          code: "provider_unavailable",
          summary: "Codex app-server became unavailable.",
        },
      });
    }
    this.invalidateInteractions();
    this.queue.end();
  }

  private providerMessageId(providerId: string): string {
    const existing = this.messageIds.get(providerId);
    if (existing) return existing;
    const messageId = `message-${this.nextMessageId++}`;
    this.messageIds.set(providerId, messageId);
    return messageId;
  }

  private handleNotification(notification: CodexNotification): void {
    if (!this.active) {
      if (this.startingOperationId) this.bufferedNotifications.push(notification);
      return;
    }
    if (!isRecord(notification.params)) return;
    const params = notification.params;
    const turnId = safeString(params.turnId);
    const turn = isRecord(params.turn) ? params.turn : undefined;
    const notificationTurnId = turnId ?? (turn ? safeString(turn.id) : undefined);
    if (
      notificationTurnId &&
      notificationTurnId !== this.active.providerTurnId
    ) {
      return;
    }
    const operationId = this.active.operationId;

    if (notification.method === "item/agentMessage/delta") {
      const providerMessageId = safeString(params.itemId);
      if (!providerMessageId || typeof params.delta !== "string") return;
      this.emit({
        kind: "message.delta",
        operationId,
        messageId: this.providerMessageId(providerMessageId),
        ...this.phase(params.phase),
        delta: params.delta,
      });
      return;
    }

    if (notification.method === "item/completed" && isRecord(params.item)) {
      const item = params.item;
      if (item.type === "agentMessage") {
        const providerMessageId = safeString(item.id);
        if (!providerMessageId || typeof item.text !== "string") return;
        this.emit({
          kind: "message.completed",
          operationId,
          messageId: this.providerMessageId(providerMessageId),
          ...this.phase(item.phase),
          text: item.text,
        });
        return;
      }
      if (item.type === "collabAgentToolCall" || item.type === "subAgentActivity") {
        this.emit({
          kind: "provider.observation",
          operationId,
          name: "delegation",
          summary: "Codex reported provider-native delegated activity.",
        });
      }
      return;
    }

    if (notification.method === "thread/tokenUsage/updated") {
      this.emit({
        kind: "provider.observation",
        operationId,
        name: "usage",
        summary: "Codex reported updated token usage.",
      });
      return;
    }

    if (
      notification.method === "item/reasoning/summaryTextDelta" ||
      notification.method === "item/reasoning/summaryPartAdded"
    ) {
      this.emit({
        kind: "provider.observation",
        operationId,
        name: "reasoning-summary",
        summary: "Codex reported a safe reasoning-summary update.",
      });
      return;
    }

    if (notification.method !== "turn/completed") return;
    const status = turn ? safeString(turn.status) : undefined;
    if (status === "completed") {
      this.finishOperation({ kind: "operation.completed", operationId });
    } else if (status === "interrupted") {
      this.interruptedOperationIds.add(operationId);
      this.finishOperation({ kind: "operation.interrupted", operationId });
    } else {
      this.finishOperation({
        kind: "operation.failed",
        operationId,
        failure: {
          code: "provider_rejected",
          summary: "Codex reported that the operation failed.",
        },
      });
    }
  }

  private phase(value: unknown): { readonly phase?: "commentary" | "final" } {
    if (value === "commentary" || value === "analysis") {
      return { phase: "commentary" };
    }
    if (value === "final" || value === "final_answer") {
      return { phase: "final" };
    }
    return {};
  }

  private handleRequest(request: CodexServerRequest): void {
    if (!this.active) {
      if (this.startingOperationId) this.bufferedRequests.push(request);
      return;
    }
    if (!isRecord(request.params)) return;
    const params = request.params;
    const requestThreadId =
      safeString(params.threadId) ?? safeString(params.conversationId);
    const requestTurnId = safeString(params.turnId);
    if (
      requestThreadId !== this.providerThreadId ||
      (requestTurnId !== undefined &&
        requestTurnId !== this.active.providerTurnId)
    ) {
      return;
    }
    if (
      request.method === "item/commandExecution/requestApproval" ||
      request.method === "item/fileChange/requestApproval" ||
      request.method === "execCommandApproval" ||
      request.method === "applyPatchApproval"
    ) {
      this.registerApproval(request, params);
      return;
    }
    if (request.method === "item/tool/requestUserInput") {
      this.registerToolInput(request, params);
      return;
    }
    if (request.method === "mcpServer/elicitation/request") {
      this.registerMcpInput(request, params);
    }
  }

  private registerApproval(request: CodexServerRequest, params: JsonRecord): void {
    const legacy =
      request.method === "execCommandApproval" ||
      request.method === "applyPatchApproval";
    if (legacy) {
      const providerResponses = new Map<string, unknown>([
        ["approved", { decision: "approved" }],
        ["approved_for_session", { decision: "approved_for_session" }],
        [
          "denied",
          { decision: { denied: { rejection: "Denied by Drawloom." } } },
        ],
        ["abort", { decision: "abort" }],
      ]);
      const approvalId = `approval-${this.nextApprovalId++}`;
      this.pendingApprovals.set(approvalId, {
        rpcId: request.id,
        providerResponses,
      });
      this.emit({
        kind: "approval.requested",
        request: {
          approvalId,
          operationId: this.active!.operationId,
          summary:
            safeString(params.reason) ?? "Codex requested execution approval.",
          options: [...providerResponses.keys()].map((optionId) => ({
            optionId,
            label: optionId,
          })),
        },
      });
      return;
    }
    const defaults = ["accept", "acceptForSession", "decline", "cancel"];
    const decisions = Array.isArray(params.availableDecisions)
      ? params.availableDecisions
      : defaults;
    const providerResponses = new Map<string, unknown>();
    const options = decisions.map((decision, index) => {
      const optionId = safeString(decision) ?? `option-${index + 1}`;
      providerResponses.set(optionId, { decision });
      return {
        optionId,
        label: safeString(decision) ?? this.objectDecisionLabel(decision),
      };
    });
    const approvalId = `approval-${this.nextApprovalId++}`;
    this.pendingApprovals.set(approvalId, {
      rpcId: request.id,
      providerResponses,
    });
    this.emit({
      kind: "approval.requested",
      request: {
        approvalId,
        operationId: this.active!.operationId,
        summary:
          safeString(params.reason) ?? "Codex requested execution approval.",
        options,
      },
    });
  }

  private objectDecisionLabel(value: unknown): string {
    if (!isRecord(value)) return "provider option";
    return Object.keys(value)[0] ?? "provider option";
  }

  private registerToolInput(request: CodexServerRequest, params: JsonRecord): void {
    const questions = Array.isArray(params.questions)
      ? params.questions.filter(isRecord)
      : [];
    const firstQuestion = questions[0];
    const requestId = `input-${this.nextInputId++}`;
    const responseSchema: JsonValue = {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        questions.flatMap((question) => {
          const id = safeString(question.id);
          return id
            ? [[id, { type: "object", required: ["answers"] } as JsonValue]]
            : [];
        }),
      ),
    };
    this.pendingInputs.set(requestId, {
      rpcId: request.id,
      response: (resolution) => ({
        answers: resolution.action === "submit" ? resolution.value : {},
      }),
    });
    this.emit({
      kind: "input.requested",
      request: {
        requestId,
        operationId: this.active!.operationId,
        prompt:
          (firstQuestion && safeString(firstQuestion.question)) ??
          "Codex requested input.",
        responseSchema,
      },
    });
  }

  private registerMcpInput(request: CodexServerRequest, params: JsonRecord): void {
    const requestId = `input-${this.nextInputId++}`;
    const schema = JsonValueFromUnknown(params.requestedSchema);
    this.pendingInputs.set(requestId, {
      rpcId: request.id,
      response: (resolution) =>
        resolution.action === "submit"
          ? { action: "accept", content: resolution.value }
          : { action: "cancel" },
    });
    this.emit({
      kind: "input.requested",
      request: {
        requestId,
        operationId: this.active!.operationId,
        prompt: safeString(params.message) ?? "An MCP server requested input.",
        ...(schema === undefined ? {} : { responseSchema: schema }),
      },
    });
  }
}

const JsonValueFromUnknown = (value: unknown): JsonValue | undefined => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    const values = value.map(JsonValueFromUnknown);
    return values.every((item) => item !== undefined)
      ? (values as JsonValue[])
      : undefined;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(([key, item]) => [
      key,
      JsonValueFromUnknown(item),
    ] as const);
    if (entries.some(([, item]) => item === undefined)) return undefined;
    return Object.fromEntries(entries) as JsonValue;
  }
  return undefined;
};
