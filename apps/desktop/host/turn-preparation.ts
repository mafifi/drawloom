import type { z } from "zod";
import type { Asset, AssetStore } from "@drawloom/host";
import type { ConversationHistoryStore, HistoryEntry } from "@drawloom/conversation-history";
import type { PluginRegistry } from "@drawloom/plugins";
import type { OperatorSnapshot } from "@drawloom/workbench";
import type { DesktopCatalogue, DesktopCommandSchema } from "../src/lib/protocol.js";
import { conversationContext } from "./conversation-context.js";
import type { createKnowledgeHost } from "./knowledge-host.js";
import type { createDesktopContextAssembly } from "./context-assembly.js";

type SendCommand = Extract<z.output<typeof DesktopCommandSchema>, { kind: "send" }>;

/** Private desktop material admission. Execution identity and submission stay with the session owner. */
export async function resolveTurnMaterial({
  command,
  conversation,
  project,
  registry,
  operator,
  history,
  assets,
  viewContext,
  catalogue,
}: {
  command: SendCommand;
  conversation: { id: string; workbenchId: string; provider: "codex" | "synthetic" };
  project: { assets: Asset[]; conversations: { id: string; title: string }[] };
  registry: Pick<PluginRegistry, "contributions" | "workbenches" | "skills">;
  operator: Pick<OperatorSnapshot, "artifacts">;
  history: Pick<ConversationHistoryStore, "get" | "page">;
  assets: Pick<AssetStore, "read">;
  viewContext: { forConversation(id: string): string };
  catalogue?: DesktopCatalogue | undefined;
}) {
  const selected = [...new Map(command.selections.map((s) => [s.id, s])).values()].map(
    (selection) => {
      const entry = catalogue?.entries.find(
        (e) => e.id === selection.id && e.revision === selection.revision,
      );
      if (!entry || !entry.selectable || entry.availability !== "available")
        throw Error("Selection unavailable. Refresh the catalogue and select it again.");
      return entry;
    },
  );
  const selectedInstructions = selected
    .filter((e) => e.origin === "drawloom")
    .flatMap((e) => {
      const contribution = registry.contributions.find((c) => c.id === e.id && c.kind === "skill");
      if (
        !contribution ||
        registry.workbenches
          .find((w) => w.id === conversation.workbenchId)!
          .skills.includes(contribution.contributionId)
      )
        return [];
      return registry.skills
        .filter((s) => s.id === contribution.contributionId)
        .map((s) => s.instructions);
    });
  const attachments = command.attachmentKeys.map((key) => {
    const a = project.assets.find((a) => a.key === key);
    if (!a) throw Error("Attachment unavailable");
    return a;
  });
  const context = command.contextArtifactIds.map((id) => {
    const a = operator.artifacts.find((a) => a.id === id);
    if (!a || a.content.kind !== "text")
      throw Error("Only text documents can be attached as context");
    return a.content.text;
  });
  const selectedResources: NonNullable<HistoryEntry["resources"]> = [];
  context.push(
    ...(await conversationContext(
      history,
      project.conversations,
      conversation.id,
      command.conversationContextIds,
    )),
  );
  for (const selection of command.resourceSelections) {
    const entry = await history.get(conversation.id, selection.entryId);
    const resource = entry?.resources?.find((r) => r.id === selection.resourceId);
    if (!resource?.asset || !["text/plain", "text/markdown"].includes(resource.asset.mediaType))
      throw Error("Only ready text resources can be selected as context");
    const bytes = await assets.read(resource.asset.key);
    if (bytes.length > 100_000) throw Error("Selected context is too large");
    context.push(new TextDecoder().decode(bytes));
    selectedResources.push(resource);
  }
  const imageAttachments: Asset[] = [];
  for (const attachment of attachments) {
    if (["text/plain", "text/markdown"].includes(attachment.mediaType)) {
      const bytes = await assets.read(attachment.key);
      if (bytes.length > 100_000) throw Error("Selected context is too large");
      context.push(new TextDecoder().decode(bytes));
    } else if (attachment.mediaType.startsWith("image/")) imageAttachments.push(attachment);
    else
      throw Error(
        "This file is viewable, but is not supported as direct model input. Use a suitable tool instead.",
      );
  }
  // User-selected documents stay untrusted user content, never developer instructions.
  if (conversation.provider === "synthetic" && imageAttachments.length)
    throw Error(
      "Synthetic mode accepts text. Attachments remain available as artifacts; choose Codex to send images.",
    );
  if (
    context.reduce((size, text) => size + text.length, 0) +
      command.text.length +
      viewContext.forConversation(conversation.id).length >
    200_000
  )
    throw Error("Selected context is too large");

  return {
    selected,
    selectedInstructions,
    attachments,
    context,
    selectedResources,
    imageAttachments,
    prepareKnowledge(
      knowledge: Pick<ReturnType<typeof createKnowledgeHost>, "prepare">,
      operationId: string,
      inputText: string,
      allowed: () => boolean,
    ) {
      return knowledge.prepare(
        {
          request: command.text,
          binding: { executionId: operationId, conversationId: conversation.id },
          budget: {
            maxRecords: 8,
            maxBytes: Math.max(
              1,
              Math.min(
                12288,
                200_000 - inputText.length - selectedInstructions.join("\n").length - 512,
              ),
            ),
          },
        },
        allowed,
      );
    },
    assemble(
      assembly: Pick<ReturnType<typeof createDesktopContextAssembly>, "turn">,
      prepared: Awaited<ReturnType<ReturnType<typeof createKnowledgeHost>["prepare"]>>,
    ) {
      return assembly.turn({
        request: command.text,
        instructions: selectedInstructions.map((text) => ({ text })),
        references: [
          ...context.map((text, index) => ({ text, source: `selected:${index + 1}` })),
          ...(viewContext.forConversation(conversation.id)
            ? [{ text: viewContext.forConversation(conversation.id), source: "active-view" }]
            : []),
        ],
        attachments: imageAttachments,
        selections: selected
          .filter((entry) => entry.origin !== "drawloom")
          .map(({ id, revision }) => ({ id, revision })),
        ...(prepared.references ? { automaticKnowledge: prepared.references } : {}),
      });
    },
  };
}
