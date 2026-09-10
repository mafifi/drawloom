import {
  AgentSessionOpenInputSchema,
  AgentOperationInputSchema,
  AgentSessionSignalSchema,
  type AgentDriver,
  type AgentResult,
  type AgentSessionSignal,
} from "@drawloom/agent";
const reject = (
  code: "invalid_state" | "invalid_interaction" | "provider_unavailable" | "provider_rejected",
): AgentResult<never> => ({
  status: "rejected",
  failure: { code, message: code.replaceAll("_", " ") },
});
export function createSyntheticDriver(
  respond: (text: string, context: string) => Promise<string> | string,
): AgentDriver {
  return {
    driverId: "synthetic",
    async openSession(raw) {
      const parsed = AgentSessionOpenInputSchema.safeParse(raw);
      if (!parsed.success) return reject("invalid_state");
      const input = parsed.data;
      let closed = false,
        attached = false,
        active: string | undefined;
      const used = new Set<string>();
      const queue: AgentSessionSignal[] = [];
      let wake: (() => void) | undefined;
      const emit = (signal: AgentSessionSignal) => {
        queue.push(AgentSessionSignalSchema.parse(signal));
        wake?.();
        wake = undefined;
      };
      return {
        status: "ok",
        value: {
          sessionId: input.sessionId,
          reviewerModes: Object.freeze(['human'] as const),
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
              (p.success && Boolean(p.data.attachments?.length)) ||
              closed ||
              !attached ||
              active ||
              used.has(p.data.operationId)
            )
              return reject("invalid_state");
            const operation = p.data;
            if (operation.reviewer === 'delegated') return reject('provider_rejected');
            active = operation.operationId;
            used.add(active);
            emit({ kind: "operation.started", operationId: active });
            void Promise.resolve()
              .then(() =>
                respond(
                  operation.text,
                  [input.context.text, operation.additionalContext?.text]
                    .filter(Boolean)
                    .join("\n"),
                ),
              )
              .then(
                (text) => {
                  if (active !== operation.operationId || closed) return;
                  emit({
                    kind: "message.completed",
                    operationId: active,
                    messageId: active + ":message",
                    phase: "final",
                    text,
                  });
                  emit({ kind: "operation.completed", operationId: active });
                  active = undefined;
                },
                () => {
                  if (active !== operation.operationId || closed) return;
                  emit({
                    kind: "operation.failed",
                    operationId: active,
                    failure: {
                      code: "provider_unavailable",
                      summary: "Synthetic responder failed",
                    },
                  });
                  active = undefined;
                },
              );
            return {
              status: "ok",
              value: { operationId: operation.operationId },
            };
          },
          async resolveApproval() {
            return reject("invalid_interaction");
          },
          async respondToInput() {
            return reject("invalid_interaction");
          },
          async close() {
            if (!closed) {
              if (active)
                emit({ kind: "operation.interrupted", operationId: active });
              active = undefined;
              closed = true;
              wake?.();
            }
            return { status: "ok", value: undefined };
          },
        },
      };
    },
  };
}
