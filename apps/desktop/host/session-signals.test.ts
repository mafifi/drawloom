import { expect, test } from "bun:test";
import type { AgentSession, AgentSessionSignal } from "@drawloom/agent";
import type { HistoryEntry } from "@drawloom/conversation-history";
import type { Asset } from "@drawloom/host";
import { createSessionSignalReader } from "./session-signals.js";
import { createDesktopSessions } from "./desktop-sessions.js";

function fixture(signals: AgentSessionSignal[]) {
  const written: Omit<HistoryEntry, "position">[] = [];
  const events: string[] = [];
  const session: AgentSession = {
    sessionId: "conversation",
    reviewerModes: ["human"],
    execute: async ({ operationId }) => ({ status: "ok", value: { operationId } }),
    resolveApproval: async () => ({ status: "ok", value: undefined }),
    respondToInput: async () => ({ status: "ok", value: undefined }),
    close: async () => ({ status: "ok", value: undefined }),
    async *signals() {
      yield* signals;
    },
  };
  const state = {
    session,
    signals: [] as AgentSessionSignal[],
    active: "op",
    close: async () => {},
  };
  const options = {
    conversationId: "conversation",
    state,
    historyWriter: {
      write: async (entry: Omit<HistoryEntry, "position">) => {
        written.push(entry);
      },
      writeAsset: async () => {},
      flush: async () => {
        events.push("flush");
      },
      reportStorageFailure: () => {
        events.push("storage-failed");
      },
      unavailable: async () => {
        events.push("unavailable");
      },
    },
    submissions: new Map(),
    approvals: {
      admit: () => {},
      invalidate: () => {
        events.push("invalidate");
      },
    },
    operationTelemetry: { signal: () => {} },
    project: { assets: [] as Asset[] },
    persist: async () => {},
    controller: () => undefined,
    synchronizeHistory: async () => {},
    notice: (message: string) => {
      events.push(message);
    },
  } satisfies Parameters<typeof createSessionSignalReader>[0];
  return { options, state, written, events };
}

test("proposed plan updates replace one retained item without becoming assistant prose", async () => {
  const f = fixture([
    {
      kind: "plan.proposed",
      operationId: "op",
      proposalId: "proposal",
      text: "Draft",
      state: "partial",
    },
    {
      kind: "plan.proposed",
      operationId: "op",
      proposalId: "proposal",
      text: "Final",
      state: "complete",
    },
  ]);
  await createSessionSignalReader(f.options).read();
  expect(f.written).toHaveLength(2);
  expect(f.written.map((e) => e.id)).toEqual(["op:proposal", "op:proposal"]);
  expect(f.written[1]).toMatchObject({
    origin: { kind: "proposal" },
    text: "Final",
    state: "complete",
  });
});

test("plan snapshots retain chronology and empty replacement without fabricated messages", async () => {
  const f = fixture([
    {
      kind: "plan.updated",
      operationId: "op",
      plan: { steps: [{ text: "Inspect", status: "pending" }] },
    },
    { kind: "message.completed", operationId: "op", messageId: "answer", text: "Found it" },
    { kind: "plan.updated", operationId: "op", plan: { steps: [] } },
  ]);
  await createSessionSignalReader(f.options).read();
  expect(f.written.map((e) => e.origin.kind)).toEqual(["plan", "assistant", "plan"]);
  expect(f.written[2]?.origin).toEqual({ kind: "plan", plan: { steps: [] } });
  expect(f.written[0]?.operationId).toBe("op");
});

test("returning to an earlier plan snapshot creates a later retained update", async () => {
  const first = { steps: [{ text: "Inspect", status: "pending" as const }] };
  const f = fixture([
    { kind: "plan.updated", operationId: "op", plan: first },
    { kind: "plan.updated", operationId: "op", plan: { steps: [] } },
    { kind: "plan.updated", operationId: "op", plan: first },
  ]);
  await createSessionSignalReader(f.options).read();
  expect(new Set(f.written.map((entry) => entry.id)).size).toBe(3);
});

test("completed native user messages retain the matching original display receipt", async () => {
  const f = fixture([
    {
      kind: "message.completed",
      operationId: "op",
      messageId: "message",
      role: "user",
      text: "wire references",
      displayId: "display",
    },
  ]);
  f.options.submissions.set("op", [
    { displayId: "display", text: "original", assets: [], selections: [], resources: [] },
  ]);
  await createSessionSignalReader(f.options).read();
  expect(f.written[0]?.text).toBe("original");
  expect(f.written[0]?.id).toBe("op:message");
  expect(f.options.submissions.get("op")).toEqual([]);
});

test("terminal signals flush interrupted partial messages and release the active operation", async () => {
  const f = fixture([
    { kind: "message.delta", operationId: "op", messageId: "message", delta: "partial" },
    { kind: "operation.completed", operationId: "op" },
  ]);
  await createSessionSignalReader(f.options).read();
  expect(f.written.at(-1)?.state).toBe("interrupted");
  expect(f.state.active).toBeUndefined();
  expect(f.events).toEqual(["invalidate", "flush"]);
});

test("real signal processing failure still marks history unavailable when session close also fails", async () => {
  const f = fixture([
    { kind: "message.delta", operationId: "op", messageId: "message", delta: "partial" },
  ]);
  f.options.historyWriter.write = async () => {
    throw Error("history write failed");
  };
  const registry = createDesktopSessions();
  const state = await registry.connect("conversation", async (own) => {
    own(async () => {
      throw Error("native close failed");
    });
    return f.state;
  });
  const reader = createSessionSignalReader(f.options);
  await registry.watch("conversation", state, reader.read, reader.unavailable);
  expect(registry.get("conversation")).toBeUndefined();
  expect(f.events).toContain("unavailable");
  expect(f.state.active).toBeUndefined();
  await expect(registry.close()).rejects.toBeInstanceOf(AggregateError);
});

test("artifact storage failure still attempts workbench intake and reports its independent failure", async () => {
  const asset = { key: "asset", mediaType: "text/plain", size: 1 };
  const f = fixture([{ kind: "artifact.available", operationId: "op", asset }]);
  let intake = 0;
  await createSessionSignalReader({
    ...f.options,
    persist: async () => {
      throw Error("project storage failed");
    },
    controller: () => ({
      observeArtifact: async () => {
        intake++;
        throw Error("intake failed");
      },
    }),
  }).read();
  expect(f.options.project.assets).toEqual([asset]);
  expect(intake).toBe(1);
  expect(f.events).toContain("storage-failed");
  expect(f.events).toContain(
    "The provider returned an asset, but workbench intake could not be saved. No execution was retried.",
  );
});
