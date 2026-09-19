import { z } from "zod";
import { JsonValueSchema } from "@drawloom/host";
import { ToolContentSchema, type ToolContent } from "@drawloom/tools";
import type { HistoryEntry } from "@drawloom/conversation-history";

/** The same typed native boundary feeds live capture and history reconstruction. */
export function nativeToolOutput(item: Record<string, unknown>):
  | {
      origin: Extract<HistoryEntry["origin"], { kind: "tool" }>;
      content: ToolContent;
    }
  | undefined {
  if (
    typeof item.id !== "string" ||
    !item.id ||
    !["completed", "failed"].includes(String(item.status))
  )
    return;
  const result = z
    .object({
      content: ToolContentSchema,
      isError: z.boolean().optional(),
      structuredContent: z.record(z.string(), JsonValueSchema).optional(),
    })
    .safeParse(item.result);
  const error = z.object({ message: z.string() }).safeParse(item.error);
  if (!result.success && item.status !== "failed") return;
  const structured = result.success ? result.data.structuredContent : undefined;
  const content: ToolContent = result.success
    ? result.data.content
    : [
        {
          type: "text",
          text: error.success ? error.data.message : "Tool execution failed; details unavailable.",
        },
      ];
  return {
    origin: {
      kind: "tool",
      source: typeof item.server === "string" && item.server ? item.server.slice(0, 256) : "native",
      callId: item.id,
      title: typeof item.tool === "string" && item.tool ? item.tool : "Tool result",
      outcome:
        item.status === "failed" || (result.success && result.data.isError)
          ? "failed"
          : "completed",
      format: structured ? "json" : "text",
    },
    content: structured
      ? [
          {
            type: "text",
            text: JSON.stringify(
              {
                text: content
                  .filter((part) => part.type === "text")
                  .map((part) => part.text)
                  .join("\n"),
                data: structured,
              },
              null,
              2,
            ),
          },
          ...content.filter((part) => part.type !== "text"),
        ]
      : content,
  };
}
