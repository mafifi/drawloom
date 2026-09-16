import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ContextAssembler,
  SessionContextAssemblyInput,
  TurnContextAssemblyInput,
} from "@drawloom/context/assembly";
import { createDefaultContextAssembler } from "@drawloom/default-context";
import { createDesktopApplication } from "./application.js";
import { KNOWLEDGE_RETRIEVAL_GUIDANCE } from "./knowledge-tools.js";
import { createDesktopContextAssembly } from "./context-assembly.js";

async function fixture(assembler: ContextAssembler) {
  const root = await mkdtemp(join(tmpdir(), "drawloom-context-assembly-"));
  await mkdir(join(root, "working"));
  const app = await createDesktopApplication(join(root, "data"), { contextAssembler: assembler });
  await app.command({ kind: "add_project", directory: join(root, "working") });
  const created = await app.command({
    kind: "create_conversation",
    workbenchId: "text",
    provider: "synthetic",
  });
  return {
    app,
    id: created.selectedId,
    send: () =>
      app.command({
        kind: "send",
        conversationId: created.selectedId,
        text: "  Original request\n",
        attachmentKeys: [],
        contextArtifactIds: [],
      }),
    close: async () => {
      await app.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
test("trusted startup assembler receives session and turn inputs through desktop send", async () => {
  const sessions: SessionContextAssemblyInput[] = [];
  const turns: TurnContextAssemblyInput[] = [];
  const base = createDefaultContextAssembler();
  const f = await fixture({
    session: (input, options) => {
      sessions.push(input);
      return base.session(input, options);
    },
    turn: (input, options) => {
      turns.push(input);
      return base.turn(input, options);
    },
  });
  try {
    await f.send();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.guidance.map((item) => item.text)).toContain(KNOWLEDGE_RETRIEVAL_GUIDANCE);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.request).toBe("  Original request\n");
    expect(
      (await f.app.historyPage(f.id)).entries.find((entry) => entry.role === "user")?.text,
    ).toBe("  Original request\n");
  } finally {
    await f.close();
  }
});
for (const stage of ["session", "turn"] as const) {
  test(`mandatory ${stage} assembly failure prevents submission`, async () => {
    const base = createDefaultContextAssembler();
    const f = await fixture({
      ...base,
      [stage]: async () => ({ kind: "failure", code: "unavailable" }),
    });
    try {
      await expect(f.send()).rejects.toThrow("context");
      expect(
        (await f.app.historyPage(f.id)).entries.filter((entry) => entry.role === "user"),
      ).toHaveLength(0);
    } finally {
      await f.close();
    }
  });
}
test("assembler cannot change original user text", async () => {
  const base = createDefaultContextAssembler();
  const f = await fixture({
    ...base,
    async turn(input, options) {
      const result = await base.turn(input, options);
      return result.kind === "ready" ? { ...result, originalText: "rewritten" } : result;
    },
  });
  try {
    await expect(f.send()).rejects.toThrow("context");
  } finally {
    await f.close();
  }
});

test("host rejects changed attachments, selections and automatic reference identities", async () => {
  const base = createDefaultContextAssembler();
  const input: TurnContextAssemblyInput = {
    request: "Question",
    instructions: [],
    references: [],
    attachments: [{ key: "original", mediaType: "image/png", size: 3 }],
    selections: [{ id: "selected", revision: "r1" }],
    automaticKnowledge: { kind: "ready", text: "Record", bytes: 6, references: [] },
  };
  for (const field of ["attachments", "selections", "automaticKnowledge"] as const) {
    const host = createDesktopContextAssembly(
      {
        ...base,
        async turn(value, options) {
          const result = await base.turn(value, options);
          if (result.kind !== "ready") return result;
          if (field === "attachments") return { ...result, attachments: [] };
          if (field === "selections") return { ...result, selections: [] };
          return { ...result, automaticKnowledge: undefined };
        },
      },
      new AbortController().signal,
    );
    await expect(host.turn(input)).rejects.toThrow("context");
  }
});

test("shutdown settles a pending assembler without accepting its late result", async () => {
  const base = createDefaultContextAssembler();
  let finish!: () => void;
  const waiting = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const controller = new AbortController();
  const host = createDesktopContextAssembly(
    {
      ...base,
      async session(input, options) {
        await waiting;
        return base.session(input, options);
      },
    },
    controller.signal,
  );
  const result = host.session({ instructions: [], skills: [], guidance: [] });
  controller.abort();
  await expect(result).rejects.toThrow("context");
  finish();
});
