import { z } from "zod";
import type { AgentOperationInput } from "@drawloom/agent";
import { ContextPreparationSummarySchema, type ContextPreparationSummary } from "@drawloom/context";
import type { JsonStore } from "@drawloom/host";
import { nativeMessageId } from "./history.js";

const CorrelationSchema = z.strictObject({
  threadId: z.string(),
  sent: z.string(),
  original: z.string(),
  displayId: z.string().uuid().optional(),
  preparation: ContextPreparationSummarySchema.optional(),
});
export function currentReferenceInput(operation: AgentOperationInput): AgentOperationInput {
  if (!operation.references || !operation.referenceSignal?.aborted) return operation;
  const { references: _, ...original } = operation;
  return { ...original, preparation: { kind: "cancelled", references: [] } };
}
/** Exact payload identity plus native conversation scope. Never strip user-authored markers. */
export function createReferenceDisplay(store: JsonStore, threadId: string) {
  const key = async (sent: string) =>
    `codex-display:${(await nativeMessageId(`${threadId}\0${sent}`)).slice(8)}`;
  return {
    async input(operation: AgentOperationInput): Promise<string> {
      if (
        !operation.references &&
        operation.originalDisplayText === undefined &&
        !operation.preparation
      )
        return operation.text;
      const submissionId = operation.displayId ?? crypto.randomUUID();
      const sent = `${operation.text}\n\n<drawloom-reference id="${submissionId}">\n${operation.references?.text ?? "Display correlation only."}\n</drawloom-reference>`;
      const preparation = operation.references
        ? {
            kind: "ready" as const,
            references: operation.references.references,
            receipt: { executionId: operation.operationId, submissionId },
          }
        : operation.preparation;
      // Must finish before dispatch. An uncertain RPC retains this recovery record.
      await store.set(
        await key(sent),
        z.json().parse({
          threadId,
          sent,
          original: operation.originalDisplayText ?? operation.text,
          ...(operation.displayId ? { displayId: operation.displayId } : {}),
          ...(preparation ? { preparation } : {}),
        }),
      );
      return sent;
    },
    async recover(
      sent: string,
    ): Promise<{ text: string; displayId?: string; preparation?: ContextPreparationSummary }> {
      const saved = CorrelationSchema.safeParse(await store.get(await key(sent)));
      if (!saved.success || saved.data.threadId !== threadId || saved.data.sent !== sent)
        return { text: sent };
      return {
        text: saved.data.original,
        ...(saved.data.displayId ? { displayId: saved.data.displayId } : {}),
        ...(saved.data.preparation ? { preparation: saved.data.preparation } : {}),
      };
    },
  };
}
