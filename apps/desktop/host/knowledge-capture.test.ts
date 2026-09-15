import { expect, test } from "bun:test";
import { z } from "zod";
import { createNodeJsonStore } from "@drawloom/node-host";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IntakeInput } from "@drawloom/knowledge";
import { createDesktopEvidence } from "./evidence.js";
import * as capture from "./knowledge-tools.js";
import { defineTool } from "@drawloom/tools";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { toolOutcomeProjectors, textPlugin } from "./composition.js";

test("contrasting public tools project only selected validated outcomes through the real gateway", async () => {
  const directory = await mkdtemp(join(tmpdir(), "knowledge-projectors-"));
  try {
    const store = createNodeJsonStore(directory);
    const evidence = await createDesktopEvidence(store, "two-consumers");
    const saved: IntakeInput[] = [];
    let enabled = true;
    let invocation = 0;
    const archive = defineTool({
      name: "public.archive_check",
      description: "Validate a synthetic archive result",
      input: z.strictObject({}),
      output: z.strictObject({
        format: z.enum(["zip", "tar"]),
        verified: z.boolean(),
        debug: z.string(),
      }),
      execute: () => ({ format: "zip" as const, verified: true, debug: "NOT-SELECTED" }),
    });
    const projectors = new Map(toolOutcomeProjectors);
    projectors.set(archive.name, {
      id: "public.archive-check@1",
      project(value) {
        const result = z
          .object({ format: z.enum(["zip", "tar"]), verified: z.boolean() })
          .parse(value);
        return { body: `Archive validation: ${result.format}; verified=${result.verified}.` };
      },
    });
    const collector = await capture.createKnowledgeOutcomeCapture({
      store,
      conversationId: "two-consumers",
      projectId: "fixed",
      evidence,
      projectors,
      enabled: async () => enabled,
      ingest: async (input) => {
        saved.push(input);
        return { kind: "accepted", revision: "saved" };
      },
    });
    const tools = [...textPlugin.prepare({})().tools!, archive];
    const gateway = createLocalToolGateway({
      tools,
      policy: () => true,
      nextInvocationId: () => `invocation-${++invocation}`,
      evidence: {
        async record(record) {
          if (record.kind === "started") await collector.started(record);
          await evidence.record(record);
          if (record.kind === "finished") await collector.finished(record.result);
        },
      },
    });
    const binding = gateway.bind("operation");
    expect(
      (
        await gateway.invoke(
          binding,
          "text.word_count",
          { text: "private example words" },
          new AbortController().signal,
        )
      ).outcome.status,
    ).toBe("ok");
    expect(
      (await gateway.invoke(binding, archive.name, {}, new AbortController().signal)).outcome
        .status,
    ).toBe("ok");
    expect(saved.map((input) => ("record" in input ? input.record.body : ""))).toEqual([
      "The text inspection counted 3 words.",
      "Archive validation: zip; verified=true.",
    ]);
    expect(JSON.stringify(saved)).not.toContain("NOT-SELECTED");
    expect(JSON.stringify(saved)).not.toContain("private example words");
    enabled = false;
    await gateway.invoke(binding, archive.name, {}, new AbortController().signal);
    expect(saved[2]).toMatchObject({ record: { confidence: { contentCaptured: false } } });
    enabled = true;
    await collector.recover();
    expect(saved).toHaveLength(3);
    enabled = false;
    await collector.started({ kind: "started", invocationId: "before-enable", tool: archive.name });
    enabled = true;
    await collector.finished({
      invocationId: "before-enable",
      evidence: "recorded",
      outcome: {
        status: "ok",
        value: { format: "zip", verified: true, debug: "secret" },
        text: "secret",
      },
    });
    expect(saved[3]).toMatchObject({ record: { confidence: { contentCaptured: false } } });
    await collector.started({ kind: "started", invocationId: "uncertain", tool: archive.name });
    await collector.finished({
      invocationId: "uncertain",
      evidence: "recorded",
      outcome: { status: "failed", code: "handler_failed", execution: "unknown" },
    });
    expect(saved[4]).toMatchObject({
      record: { confidence: { contentCaptured: false, operationStatus: "unknown" } },
    });
    await collector.started({
      kind: "started",
      invocationId: "recursive",
      tool: "knowledge.evidence",
    });
    expect(collector.pending()).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("selected outcomes survive restart and authorization failure without repeating effects or capturing old history", async () => {
  expect(typeof capture.createKnowledgeOutcomeCapture).toBe("function");
  const directory = await mkdtemp(join(tmpdir(), "knowledge-capture-"));
  try {
    const store = createNodeJsonStore(directory);
    const evidence = await createDesktopEvidence(store, "conversation");
    let enabled = true;
    let denied = true;
    const saved: IntakeInput[] = [];
    const options = {
      store,
      conversationId: "conversation",
      projectId: "fixed-project",
      evidence,
      enabled: async () => enabled,
      ingest: async (input: IntakeInput) => {
        if (denied) return { kind: "denied" as const };
        saved.push(input);
        return { kind: "duplicate" as const, revision: "retained" };
      },
      projectors: new Map([
        [
          "public.measure",
          {
            id: "public.measure@1",
            project: (value: unknown) => ({
              body: `Measured ${z.object({ count: z.number() }).parse(value).count} items.`,
            }),
          },
        ],
      ]),
    };
    const first = await capture.createKnowledgeOutcomeCapture(options);
    await first.started({
      kind: "started",
      invocationId: "selected",
      operationId: "execution",
      tool: "public.measure",
    });
    const result = {
      invocationId: "selected",
      operationId: "execution",
      evidence: "recorded" as const,
      outcome: {
        status: "ok" as const,
        value: { count: 3, privatePayload: "must not retain" },
        text: "raw hidden payload",
      },
    };
    await evidence.record({
      kind: "started",
      invocationId: "selected",
      operationId: "execution",
      tool: "public.measure",
    });
    await evidence.record({ kind: "finished", result });
    await first.finished(result);
    expect(first.pending()).toMatchObject([{ failure: "denied" }]);
    expect(saved).toEqual([]);
    enabled = false;
    denied = false;
    const restarted = await capture.createKnowledgeOutcomeCapture(options);
    await restarted.recover();
    expect(restarted.pending()).toMatchObject([{ failure: "disabled" }]);
    enabled = true;
    await restarted.recover();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      record: {
        body: "Measured 3 items.",
        confidence: {
          contentCaptured: true,
          projectId: "fixed-project",
          conversationId: "conversation",
        },
        provenance: { producer: { id: "public.measure@1" } },
      },
    });
    expect(JSON.stringify(saved)).not.toContain("privatePayload");
    expect(JSON.stringify(saved)).not.toContain("raw hidden payload");
    expect(restarted.pending()).toEqual([]);
    await (await capture.createKnowledgeOutcomeCapture(options)).recover();
    expect(saved).toHaveLength(1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
