import { describe, expect, test } from "bun:test";
import { z } from "zod";
import type { Binding, EvidenceRecord, GatewayFactory, ToolContext } from "./contract.ts";
import { defineTool } from "./authoring.ts";

export const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

export const toolConformance = (name: string, factory: GatewayFactory) => {
  describe(name, () => {
    const setup = (options: {
      execute?: (input: { text: string }, context: ToolContext) => Promise<{ count: number }>;
      render?: (value: { count: number }) => string;
      record?: (record: EvidenceRecord) => Promise<void>;
    } = {}) => {
      const a: Binding = Object.freeze({ operationId: "operation-a" });
      const b: Binding = Object.freeze({ operationId: "operation-b" });
      const active = new Set<Binding>([a, b]);
      const records: EvidenceRecord[] = [];
      const effects: string[] = [];
      const tool = defineTool({
        name: "word_count", description: "Count whitespace-separated words.",
        input: z.strictObject({ text: z.string() }),
        output: z.strictObject({ count: z.number().int().nonnegative() }),
        execute: async (input, context) => {
          effects.push(context.operationId);
          return options.execute ? options.execute(input, context)
            : { count: input.text.trim() ? input.text.trim().split(/\s+/u).length : 0 };
        },
        ...(options.render ? { render: options.render } : {}),
      });
      const gateway = factory({ tools: [tool], allowed: (binding) => active.has(binding),
        record: options.record ?? (async (record) => { records.push(record); }),
      });
      const signal = new AbortController().signal;
      return { a, b, active, records, effects, gateway, signal, tool };
    };

    test("returns canonical data and default JSON presentation after acknowledged evidence", async () => {
      const s = setup();
      const result = await s.gateway.invoke(s.a, "word_count", { text: "one two three" }, s.signal);
      expect(result.outcome).toEqual({ status: "succeeded", value: { count: 3 }, text: '{"count":3}' });
      expect(result.evidence).toBe("recorded");
      expect(s.effects).toEqual(["operation-a"]);
      expect(s.records.map((r) => [r.kind, r.invocationId])).toEqual([
        ["started", result.invocationId], ["finished", result.invocationId],
      ]);
    });
    test("custom presentation leaves the canonical value intact", async () => {
      const s = setup({ render: ({ count }) => `${count} words` });
      expect((await s.gateway.invoke(s.a, "word_count", { text: "one two" }, s.signal)).outcome)
        .toEqual({ status: "succeeded", value: { count: 2 }, text: "2 words" });
    });
    test("a renderer cannot mutate canonical output", async () => {
      const s = setup({ render: (value) => { value.count = 99; return "custom text"; } });
      expect((await s.gateway.invoke(s.a, "word_count", { text: "one two" }, s.signal)).outcome)
        .toMatchObject({ value: { count: 2 }, text: "custom text" });
    });
    test("validation failures identify the invalid path without reflecting values", async () => {
      const s = setup({ execute: async () => ({ count: -1 }) });
      const invalidInput = await s.gateway.invoke(s.a, "word_count", { text: 42 }, s.signal);
      expect(invalidInput.outcome).toMatchObject({ code: "invalid_input", path: ["text"] });
      const invalidOutput = await s.gateway.invoke(s.a, "word_count", { text: "x" }, s.signal);
      expect(invalidOutput.outcome).toMatchObject({ code: "invalid_output", path: ["count"], execution: "completed" });
    });
    test("rejects invalid arguments and unknown tools without effects", async () => {
      const s = setup();
      for (const args of [{ text: 42 }, { text: "one", operationId: "operation-b" }]) {
        expect((await s.gateway.invoke(s.a, "word_count", args, s.signal)).outcome)
          .toMatchObject({ code: "invalid_input", execution: "not_started" });
      }
      expect((await s.gateway.invoke(s.a, "missing", {}, s.signal)).outcome)
        .toMatchObject({ code: "unknown_tool", execution: "not_started" });
      expect(s.effects).toEqual([]);
    });
    test("rejects a forged handle even if its operation name matches", async () => {
      const s = setup();
      expect((await s.gateway.invoke({ operationId: "operation-b" }, "word_count", { text: "x" }, s.signal)).outcome)
        .toMatchObject({ code: "denied", execution: "not_started" });
      expect(s.effects).toEqual([]);
    });
    test("start acknowledgement failure prevents effects", async () => {
      const s = setup({ record: async () => { throw new Error("private sink failure"); } });
      const result = await s.gateway.invoke(s.a, "word_count", { text: "x" }, s.signal);
      expect(result).toMatchObject({ evidence: "start_failed", outcome: { code: "evidence_unavailable", execution: "not_started" } });
      expect(s.effects).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("private sink failure");
    });
    test("outcome acknowledgement failure retains the known result and never repeats an effect", async () => {
      const s = setup({ record: async (r) => { if (r.kind === "finished") throw new Error("sink unavailable"); } });
      const result = await s.gateway.invoke(s.a, "word_count", { text: "x" }, s.signal);
      expect(result).toMatchObject({ evidence: "outcome_failed", outcome: { status: "succeeded", value: { count: 1 } } });
      expect(s.effects).toEqual(["operation-a"]);
    });
    test("rechecks revocation after waiting for the start acknowledgement", async () => {
      const entered = deferred(); const release = deferred();
      const s = setup({ record: async (r) => { if (r.kind === "started") { entered.resolve(); await release.promise; } } });
      const pending = s.gateway.invoke(s.a, "word_count", { text: "x" }, s.signal);
      await entered.promise;
      s.active.delete(s.a); release.resolve();
      expect((await pending).outcome).toMatchObject({ code: "denied", execution: "not_started" });
      expect(s.effects).toEqual([]);
    });
    test("overlapping calls preserve origin and a late A call cannot use B authority", async () => {
      const entered = deferred(); const release = deferred();
      const s = setup({ execute: async (_input, ctx) => {
        if (ctx.operationId === "operation-a") { entered.resolve(); await release.promise; }
        return { count: ctx.operationId === "operation-a" ? 1 : 2 };
      } });
      const pendingA = s.gateway.invoke(s.a, "word_count", { text: "x" }, s.signal);
      await entered.promise; s.active.delete(s.a);
      const resultB = await s.gateway.invoke(s.b, "word_count", { text: "x" }, s.signal);
      const lateA = await s.gateway.invoke(s.a, "word_count", { text: "x" }, s.signal);
      release.resolve(); const resultA = await pendingA;
      expect(resultA.outcome).toMatchObject({ value: { count: 1 } });
      expect(resultB.outcome).toMatchObject({ value: { count: 2 } });
      expect(lateA.outcome).toMatchObject({ code: "denied", execution: "not_started" });
      expect(s.effects).toEqual(["operation-a", "operation-b"]);
      expect(s.records.filter((r) => r.invocationId === resultA.invocationId).every((r) => r.operationId === "operation-a")).toBe(true);
    });
    test("pre-aborted work never enters the handler", async () => {
      const s = setup(); const controller = new AbortController(); controller.abort();
      expect((await s.gateway.invoke(s.a, "word_count", { text: "x" }, controller.signal)).outcome)
        .toMatchObject({ code: "cancelled", execution: "not_started" });
      expect(s.effects).toEqual([]);
    });
    test("cancellation during start acknowledgement prevents dispatch", async () => {
      const entered = deferred(); const release = deferred();
      const s = setup({ record: async (r) => { if (r.kind === "started") { entered.resolve(); await release.promise; } } });
      const controller = new AbortController();
      const pending = s.gateway.invoke(s.a, "word_count", { text: "x" }, controller.signal);
      await entered.promise; controller.abort(); release.resolve();
      expect((await pending).outcome).toMatchObject({ code: "cancelled", execution: "not_started" });
      expect(s.effects).toEqual([]);
    });
    test("a timeout signal still waits for a non-cooperative handler to settle", async () => {
      const entered = deferred(); const release = deferred();
      const s = setup({ execute: async () => { entered.resolve(); await release.promise; return { count: 1 }; } });
      const controller = new AbortController();
      let settled = false;
      const pending = s.gateway.invoke(s.a, "word_count", { text: "x" }, controller.signal)
        .then((result) => { settled = true; return result; });
      await entered.promise; controller.abort(new DOMException("Timeout", "TimeoutError"));
      await Promise.resolve(); expect(settled).toBe(false);
      release.resolve();
      expect((await pending).outcome).toMatchObject({ code: "cancelled", execution: "completed" });
      expect(s.effects).toEqual(["operation-a"]);
    });
    test("cancellation after an effect waits for settlement and does not claim rollback", async () => {
      const entered = deferred(); const release = deferred();
      const s = setup({ execute: async (_input, ctx) => {
        entered.resolve(); await release.promise;
        ctx.signal.throwIfAborted(); return { count: 1 };
      } });
      const controller = new AbortController();
      const pending = s.gateway.invoke(s.a, "word_count", { text: "x" }, controller.signal);
      await entered.promise; controller.abort(); release.resolve();
      expect((await pending).outcome).toMatchObject({ code: "cancelled", execution: "unknown" });
      expect(s.effects).toEqual(["operation-a"]);
    });
    test("invalid output and handler throws do not retry or leak raw errors", async () => {
      for (const execute of [async () => ({ count: -1 }), async () => { throw new Error("private credential"); }]) {
        const s = setup({ execute });
        const result = await s.gateway.invoke(s.a, "word_count", { text: "x" }, s.signal);
        expect(result.outcome.status).toBe("failed");
        expect(s.effects).toEqual(["operation-a"]);
        expect(JSON.stringify(result)).not.toContain("private credential");
      }
    });
    test("renderer failure is separate from handler failure", async () => {
      const s = setup({ render: () => { throw new Error("private renderer"); } });
      expect((await s.gateway.invoke(s.a, "word_count", { text: "x" }, s.signal)).outcome)
        .toMatchObject({ code: "presentation_failed", execution: "completed" });
      expect(s.effects).toEqual(["operation-a"]);
    });
    test("duplicate tool identities cannot silently replace a definition", () => {
      const s = setup();
      expect(() => factory({ tools: [s.tool, s.tool], allowed: () => true, record: async () => {} })).toThrow();
    });
  });
};
