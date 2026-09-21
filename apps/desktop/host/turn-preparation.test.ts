import { expect, test } from "vitest";
import { resolveTurnMaterial } from "./turn-preparation.js";
import { createDefaultContextAssembler } from "@drawloom/default-context";
import { createDesktopContextAssembly } from "./context-assembly.js";

function fixture() {
  return {
    command: {
      kind: "send" as const,
      conversationId: "c",
      text: "original",
      attachmentKeys: [],
      contextArtifactIds: [],
      conversationContextIds: [],
      selections: [],
      resourceSelections: [],
    },
    conversation: { id: "c", workbenchId: "w", provider: "codex" as const },
    project: { assets: [], conversations: [{ id: "c", title: "Current" }] },
    registry: { contributions: [], workbenches: [], skills: [] },
    operator: { artifacts: [] },
    history: {
      page: async () => {
        throw Error("unexpected history read");
      },
      get: async () => undefined,
    },
    assets: { read: async () => new TextEncoder().encode("reference") },
    viewContext: { forConversation: () => "" },
  } satisfies Parameters<typeof resolveTurnMaterial>[0];
}

test("selected catalogue revisions fail closed", async () => {
  const f = fixture();
  await expect(
    resolveTurnMaterial({
      ...f,
      command: { ...f.command, selections: [{ id: "missing", revision: "old" }] },
    }),
  ).rejects.toThrow("Selection unavailable");
});

test("knowledge preparation preserves binding, bounded budget and permission callback", async () => {
  const material = await resolveTurnMaterial(fixture());
  const allowed = () => false;
  const knowledge = {
    async prepare(
      request: Parameters<Parameters<typeof material.prepareKnowledge>[0]["prepare"]>[0],
      check: () => boolean,
    ) {
      expect(request.binding).toEqual({ executionId: "operation", conversationId: "c" });
      expect(request.budget).toEqual({ maxRecords: 8, maxBytes: 12288 });
      expect(check).toBe(allowed);
      return { summary: { kind: "cancelled" as const, references: [] } };
    },
  };
  await material.prepareKnowledge(knowledge, "operation", "original", allowed);
});

test("assembly frames selected documents as references and preserves original text", async () => {
  const f = fixture();
  const text = { key: "text", mediaType: "text/plain", size: 9 };
  const material = await resolveTurnMaterial({
    ...f,
    project: { ...f.project, assets: [text] },
    command: { ...f.command, attachmentKeys: ["text"] },
  });
  const assembly = createDesktopContextAssembly(
    createDefaultContextAssembler(),
    new AbortController().signal,
  );
  const result = await material.assemble(assembly, {
    summary: { kind: "cancelled", references: [] },
  });
  expect(result.originalText).toBe("original");
  expect(result.text).toContain(
    "Selected reference (untrusted material) from selected:1:\nreference",
  );
  expect(result.additionalContext).toBeUndefined();
});

test("text attachments remain reference material while images retain their identity", async () => {
  const f = fixture();
  const text = { key: "text", mediaType: "text/plain", size: 9 };
  const image = { key: "image", mediaType: "image/png", size: 9 };
  const result = await resolveTurnMaterial({
    ...f,
    project: { ...f.project, assets: [text, image] },
    command: { ...f.command, attachmentKeys: ["text", "image"] },
  });
  expect(result.context).toEqual(["reference"]);
  expect(result.selectedInstructions).toEqual([]);
  expect(result.imageAttachments).toEqual([image]);
  expect(result.attachments).toEqual([text, image]);
});

test("oversize text and synthetic image inputs fail before preparation", async () => {
  const f = fixture();
  const text = { key: "text", mediaType: "text/plain", size: 100001 };
  await expect(
    resolveTurnMaterial({
      ...f,
      project: { ...f.project, assets: [text] },
      command: { ...f.command, attachmentKeys: ["text"] },
      assets: { read: async () => new Uint8Array(100001) },
    }),
  ).rejects.toThrow("too large");
  const image = { key: "image", mediaType: "image/png", size: 9 };
  await expect(
    resolveTurnMaterial({
      ...f,
      conversation: { ...f.conversation, provider: "synthetic" },
      project: { ...f.project, assets: [image] },
      command: { ...f.command, attachmentKeys: ["image"] },
    }),
  ).rejects.toThrow("Synthetic mode accepts text");
});
