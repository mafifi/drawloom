import { z } from "zod";
import type { AgentInputResolution, AgentSessionSignal } from "@drawloom/agent";
import type { RpcMessage } from "@drawloom/host";
const identifier = z.string().min(1);
const record = z.record(z.string(), z.unknown());
export type NativeApproval = {
  rpcId: string | number;
  choices: Map<string, unknown>;
};
export type NativeInput = {
  rpcId: string | number;
  schema: z.ZodType;
  answer(input: AgentInputResolution): unknown;
};
/** Shared wire decoding only; callers must establish exact operation ownership first. */
export function processNativeInteraction(options: {
  message: RpcMessage & { id: string | number };
  params: Record<string, unknown>;
  operationId: string;
  nativeReview: boolean;
  interrupting: boolean;
  approvals: Map<string, NativeApproval>;
  inputs: Map<string, NativeInput>;
  interactionRequests: Set<string | number>;
  nextId(kind: "approval" | "input"): string;
  emit(signal: AgentSessionSignal): void;
  unsupported(): void;
}): void {
  const {
    message,
    params,
    operationId,
    nativeReview,
    interrupting,
    approvals,
    inputs,
    interactionRequests,
    nextId,
    emit,
    unsupported,
  } = options;
  if (interrupting) return;
  if (interactionRequests.has(message.id)) throw Error("Duplicate native request");
  interactionRequests.add(message.id);
  if (
    message.method === "item/commandExecution/requestApproval" ||
    message.method === "item/fileChange/requestApproval"
  ) {
    const decisions = z
      .array(z.json())
      .min(1)
      .parse(params.availableDecisions ?? ["accept", "acceptForSession", "decline", "cancel"]);
    const choices = new Map<string, unknown>();
    const options = decisions.map((decision, index) => {
      const optionId = "option-" + index;
      choices.set(optionId, { decision });
      return {
        optionId,
        label:
          typeof decision === "string"
            ? decision
            : (Object.keys(record.parse(decision))[0] ?? "Provider option"),
      };
    });
    const approvalId = nextId("approval");
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
    if (meta.codex_approval_kind === "mcp_tool_call") {
      if (!nativeReview || params.mode !== "form") throw Error("Unsupported native approval");
      const approvalId = nextId("approval");
      const choices = new Map<string, unknown>([
        ["approve", { action: "accept" }],
        ["deny", { action: "decline" }],
        ["cancel", { action: "cancel" }],
      ]);
      approvals.set(approvalId, { rpcId: message.id, choices });
      const details = meta.tool_params_display ?? meta.tool_params;
      emit({
        kind: "approval.requested",
        request: {
          approvalId,
          operationId,
          summary: z.string().parse(params.message).slice(0, 4096),
          ...(details === undefined
            ? {}
            : {
                details: (typeof details === "string"
                  ? details
                  : JSON.stringify(z.json().parse(details), null, 2)
                ).slice(0, 16384),
              }),
          options: [
            { optionId: "approve", label: "Approve once" },
            { optionId: "deny", label: "Deny" },
            { optionId: "cancel", label: "Cancel" },
          ],
        },
      });
      return;
    }
    const responseSchema = z.record(z.string(), z.json()).parse(params.requestedSchema);
    const schema = z.fromJSONSchema(responseSchema);
    const requestId = nextId("input");
    inputs.set(requestId, {
      rpcId: message.id,
      schema,
      answer: (r) =>
        r.action === "submit" ? { action: "accept", content: r.value } : { action: "cancel" },
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
              ? z.enum(question.options.map((o) => o.label) as [string, ...string[]])
              : z.string(),
          )
          .min(1),
      });
    const schema = z.strictObject(shape);
    const requestId = nextId("input");
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
                (option) => `${option.label}${option.description ? `: ${option.description}` : ""}`,
              ),
              ...(q.isOther ? ["Other: enter a custom answer."] : []),
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
  unsupported();
  return;
}
