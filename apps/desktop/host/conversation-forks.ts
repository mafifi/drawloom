import { z } from "zod";
import { AgentForkReceiptSchema, type AgentForks, type AgentForkReceipt } from "@drawloom/agent";
import type { JsonStore } from "@drawloom/host";
import { ConversationSchema } from "../src/lib/protocol.js";

const record = z.strictObject({
  sourceId: z.string().min(1),
  requestId: z.string().min(1),
  conversation: ConversationSchema,
  phase: z.enum(["prepared", "submitted", "created"]),
});

/** Owns local registration receipts only. Native identity and execution stay with the adapter. */
export function createConversationForks(options: {
  store: JsonStore;
  source(id: string): Promise<z.infer<typeof ConversationSchema>>;
  ready(id: string): Promise<AgentForks>;
  copyHistory(sourceId: string, targetId: string): Promise<void>;
  register(conversation: z.infer<typeof ConversationSchema>): Promise<void>;
}) {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    create(sourceId: string, requestId: string): Promise<AgentForkReceipt> {
      const action = queue.then(async (): Promise<AgentForkReceipt> => {
        const pendingKey = `desktop-fork-pending:${sourceId}`;
        const pending = await options.store.get(pendingKey);
        const request =
          pending === undefined || pending === null ? requestId : z.string().min(1).parse(pending);
        const key = `desktop-fork:${JSON.stringify([sourceId, request])}`;
        const existing = await options.store.get(key);
        const source = ConversationSchema.parse(await options.source(sourceId));
        if (source.id !== sourceId || !source.projectId)
          throw Error("Forking requires a bound native conversation");
        const native = await options.ready(sourceId);
        const saved =
          existing === undefined
            ? record.parse({
                sourceId,
                requestId: request,
                phase: "prepared",
                conversation: {
                  id: crypto.randomUUID(),
                  title: `Fork of ${source.title}`.slice(0, 120),
                  workbenchId: source.workbenchId,
                  projectId: source.projectId,
                  provider: source.provider,
                  reviewer: source.reviewer,
                  ...(source.modelSelection ? { modelSelection: source.modelSelection } : {}),
                  ...(source.mode ? { mode: source.mode } : {}),
                  archived: false,
                  forkedFromId: sourceId,
                },
              })
            : record.parse(existing);
        if (
          saved.sourceId !== sourceId ||
          saved.requestId !== request ||
          saved.conversation.projectId !== source.projectId
        )
          throw Error("Fork recovery no longer matches the original project binding");
        const save = () => options.store.set(key, z.json().parse(saved));
        // Reserve before any provider mutation. A new click cannot replace uncertainty.
        await save();
        await options.store.set(pendingKey, request);
        const result = (state: AgentForkReceipt["state"]): AgentForkReceipt => ({
          requestId: request,
          sessionId: saved.conversation.id,
          state,
        });
        if (saved.phase === "prepared") {
          await options.copyHistory(sourceId, saved.conversation.id);
          saved.phase = "submitted";
          await save();
          const submitted = await native.create({
            requestId: request,
            sessionId: saved.conversation.id,
          });
          if (submitted.status !== "ok") {
            const observed = await native.read(request);
            if (observed.status === "ok" && observed.value === null) {
              // Confirmed non-submission permits a later explicit attempt, not
              // another dispatch in this command. Ambiguity keeps the fence.
              saved.phase = "prepared";
              await save();
            }
            throw Error(submitted.failure.message);
          }
          const receipt = AgentForkReceiptSchema.parse(submitted.value);
          if (receipt.requestId !== request || receipt.sessionId !== saved.conversation.id)
            throw Error("Native fork receipt identity mismatch");
          if (receipt.state !== "created") return result("unknown");
          saved.phase = "created";
          await save();
        } else if (saved.phase === "submitted") {
          const recovered = await native.read(request);
          if (recovered.status !== "ok") throw Error(recovered.failure.message);
          if (!recovered.value) return result("unknown");
          const receipt = AgentForkReceiptSchema.parse(recovered.value);
          if (receipt.requestId !== request || receipt.sessionId !== saved.conversation.id)
            throw Error("Native fork recovery identity mismatch");
          if (receipt.state !== "created") return result("unknown");
          saved.phase = "created";
          await save();
        }
        await options.register(saved.conversation);
        await options.store.set(pendingKey, null);
        return result("created");
      });
      queue = action.catch(() => undefined);
      return action;
    },
  };
}
