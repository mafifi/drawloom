import type { JsonStore } from "@drawloom/host";
import { JsonValueSchema } from '@drawloom/host';
import { z } from "zod";
import {
  ToolResultSchema,
  type ToolEvidence,
  type ToolResult,
} from "@drawloom/tools";
import { ToolStartSchema } from "../src/lib/protocol.js";

export async function createDesktopEvidence(
  store: JsonStore,
  conversationId: string,
) {
  const key = "tool-evidence:" + conversationId;
  const schema = z.array(
    z.discriminatedUnion("kind", [
      ToolStartSchema,
      z.strictObject({ kind: z.literal("finished"), result: ToolResultSchema }),
    ]),
  );
  let records = schema.parse((await store.get(key)) ?? []);
  const legacy = z
    .array(ToolResultSchema)
    .parse((await store.get("tool-results:" + conversationId)) ?? []);
  const failures: ToolResult[] = [];
  let queue: Promise<void> = Promise.resolve();
  return {
    toolFor: (invocationId: string) => {
      const started = records.find(r => r.kind === 'started' && r.invocationId === invocationId);
      return started?.kind === 'started' ? started.tool : undefined;
    },
    activity: () =>
      structuredClone([
        ...legacy,
        ...records.flatMap((r) => (r.kind === "finished" ? [r.result] : [])),
        ...failures,
      ]),
    pending: () => {
      const finished = new Set(
        records.flatMap((r) =>
          r.kind === "finished" ? [r.result.invocationId] : [],
        ),
      );
      return structuredClone(
        records.filter(
          (r): r is z.infer<typeof ToolStartSchema> =>
            r.kind === "started" && !finished.has(r.invocationId),
        ),
      );
    },
    record(record: ToolEvidence) {
      const entry = schema.element.parse(record);
      const next = queue.then(async () => {
        const updated = [...records, entry];
        try {
          await store.set(key, JsonValueSchema.parse(updated));
          records = updated;
        } catch (error) {
          failures.push(
            entry.kind === "finished"
              ? { ...entry.result, evidence: "outcome_failed" }
              : {
                  invocationId: entry.invocationId,
                  ...(entry.operationId
                    ? { operationId: entry.operationId }
                    : {}),
                  evidence: "start_failed",
                  outcome: {
                    status: "failed",
                    code: "evidence_failed",
                    execution: "not_started",
                  },
                },
          );
          throw error;
        }
      });
      queue = next.catch(() => {});
      return next;
    },
  };
}
