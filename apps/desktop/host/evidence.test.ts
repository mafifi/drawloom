import { test, expect } from "bun:test";
import { z } from "zod";
import type { JsonValue, JsonStore } from "@drawloom/host";
import { defineTool } from "@drawloom/tools";
import { createLocalToolGateway } from "@drawloom/local-tools";
import { createDesktopEvidence } from "./evidence.js";
import { createTestDesktopApplication as createDesktopApplication } from './test-project.fixture.js';
import { createNodeJsonStore } from "@drawloom/node-host";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("application snapshot restores outstanding invocation without opening an agent session", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-evidence-restart-"));
  const first = await createDesktopApplication(root),
    id = (await first.snapshot()).selectedId;
  await first.close();
  const sink = await createDesktopEvidence(
    createNodeJsonStore(join(root, "state")),
    id,
  );
  await sink.record({
    kind: "started",
    invocationId: "unfinished",
    operationId: "origin",
    tool: "example.effect",
  });
  const restarted = await createDesktopApplication(root);
  try {
    const snapshot = await restarted.snapshot();
    expect(snapshot.pendingTools).toEqual([
      {
        kind: "started",
        invocationId: "unfinished",
        operationId: "origin",
        tool: "example.effect",
      },
    ]);
    expect(snapshot.activity).toEqual([]);
    expect(snapshot.activeOperation).toBeUndefined();
  } finally {
    await restarted.close();
  }
});

test("desktop does not publish an outcome while its commit is pending", async () => {
  const f = fixture(),
    original = f.store.set;
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>((r) => (release = r)),
    started = new Promise<void>((r) => (entered = r));
  f.store.set = async (k, v) => {
    if (Array.isArray(v) && v.length === 2) {
      entered();
      await waiting;
    }
    await original(k, v);
  };
  const sink = await createDesktopEvidence(f.store, "conversation");
  const gateway = createLocalToolGateway({
    tools: [f.tool],
    policy: () => true,
    evidence: sink,
    nextInvocationId: () => "one",
  });
  const invocation = gateway.invoke(
    gateway.bind("operation"),
    f.tool.name,
    {},
    new AbortController().signal,
  );
  await started;
  expect(sink.activity()).toEqual([]);
  expect(sink.pending()).toHaveLength(1);
  release();
  await invocation;
  expect(sink.activity()[0]?.evidence).toBe("recorded");
  expect(sink.pending()).toEqual([]);
});

function fixture(failAt = 0) {
  let writes = 0,
    entries = 0;
  const data = new Map<string, JsonValue>();
  const store: JsonStore = {
    async get(k) {
      return structuredClone(data.get(k));
    },
    async set(k, v) {
      if (++writes === failAt) throw Error("disk");
      await new Promise((r) => setTimeout(r, 2));
      data.set(k, structuredClone(v));
    },
  };
  const tool = defineTool({
    name: "sample.effect",
    description: "",
    input: z.strictObject({}),
    output: z.number(),
    execute: () => ++entries,
  });
  return { store, tool, entries: () => entries };
}
for (const [failAt, evidence, entered] of [
  [1, "start_failed", 0],
  [2, "outcome_failed", 1],
] as const) {
  test(`desktop evidence ${evidence} is visible without false acknowledgement`, async () => {
    const f = fixture(failAt),
      sink = await createDesktopEvidence(f.store, "conversation");
    const gateway = createLocalToolGateway({
      tools: [f.tool],
      policy: () => true,
      evidence: sink,
      nextInvocationId: () => "invocation",
    });
    const result = await gateway.invoke(
      gateway.bind("operation"),
      f.tool.name,
      {},
      new AbortController().signal,
    );
    expect(f.entries()).toBe(entered);
    expect(result.evidence).toBe(evidence);
    expect(sink.activity()).toEqual([result]);
    const restart = await createDesktopEvidence(f.store, "conversation");
    expect(restart.pending().length).toBe(failAt === 2 ? 1 : 0);
    expect(restart.activity()).toEqual([]);
  });
}
test("overlapping desktop evidence retains every identity and unfinished starts on restart", async () => {
  const f = fixture(),
    sink = await createDesktopEvidence(f.store, "conversation");
  let id = 0;
  const gateway = createLocalToolGateway({
    tools: [f.tool],
    policy: () => true,
    evidence: sink,
    nextInvocationId: () => String(++id),
  });
  await Promise.all(
    Array.from({ length: 8 }, (_, n) =>
      gateway.invoke(
        gateway.bind("operation-" + n),
        f.tool.name,
        {},
        new AbortController().signal,
      ),
    ),
  );
  await sink.record({
    kind: "started",
    invocationId: "unfinished",
    operationId: "lost-operation",
    tool: "sample.effect",
  });
  const restart = await createDesktopEvidence(f.store, "conversation");
  expect(restart.activity()).toHaveLength(8);
  expect(new Set(restart.activity().map((r) => r.invocationId)).size).toBe(8);
  expect(restart.pending()).toEqual([
    {
      kind: "started",
      invocationId: "unfinished",
      operationId: "lost-operation",
      tool: "sample.effect",
    },
  ]);
});
