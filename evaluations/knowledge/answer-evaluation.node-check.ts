import assert from "node:assert/strict";
import test from "node:test";
import type { JsonStore, JsonValue, RpcMessage, RpcTransport } from "@drawloom/host";
import { heldOutQuestions } from "./corpus.ts";
import { runKnowledgeEvaluation } from "./runner.ts";
import {
  buildAnswerPrompt,
  loadAnswerCases,
  parseAnswerEvaluationCli,
  runAnswerCase,
  runAnswerQualityEvaluation,
  scoreAnswer,
  type AnswerEvaluationCase,
} from "./answer-evaluation.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ref = { type: "source" as const, origin: "evaluation-public", id: "museum-access", revision: "r1" };
const evidenceCase: AnswerEvaluationCase = {
  mode: "lexical", questionId: "s1", query: heldOutQuestions.find(question => question.id === "s1")!.query,
  records: [{ ref, body: "The Lantern Museum has a step-free entrance on Willow Lane.", status: "active", confidence: {}, provenance: { producer: { type: "evaluation", id: "fixture" }, inputs: [] } }],
  chains: [{ root: ref, records: [{ ref, body: "The Lantern Museum has a step-free entrance on Willow Lane.", status: "active", confidence: {}, provenance: { producer: { type: "evaluation", id: "fixture" }, inputs: [] } }], links: [], complete: true }],
};

function memoryStore(): JsonStore {
  const values = new Map<string, JsonValue>();
  return { async get(key) { return values.get(key); }, async set(key, value) { values.set(key, structuredClone(value)); } };
}

test("answer prompt contains only the question and retrieved stored evidence, never held-out answers", () => {
  const expected = heldOutQuestions.find(question => question.id === "s1")!.expectedAnswer;
  const prompt = buildAnswerPrompt(evidenceCase);
  assert.match(prompt, /mobility chair/);
  assert.match(prompt, /step-free entrance on Willow Lane/);
  assert.doesNotMatch(prompt, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  assert.doesNotMatch(prompt, /expectedAnswer|relevant|requiredChain/);
});

test("scoring reports citation/current-revision, surface assertions and abstention separately", () => {
  const question = heldOutQuestions.find(value => value.id === "s1")!;
  const scored = scoreAnswer(question, evidenceCase, { answer: "Use the step-free Willow Lane entrance.", citations: [ref], abstained: false });
  assert.deepEqual(scored.citations, { supplied: 1, valid: 1, current: 1, expected: 1, invalid: [] });
  assert.equal(scored.surfaceAssertions.matched, scored.surfaceAssertions.total);
  assert.equal(scored.abstention.expected, false);
  assert.equal(scored.abstention.matched, true);
  assert.equal(scored.limit, "deterministic_surface_checks_are_not_universal_correctness");

  const irrelevant = heldOutQuestions.find(value => value.id === "n1")!;
  const abstained = scoreAnswer(irrelevant, { ...evidenceCase, questionId: "n1", query: irrelevant.query, records: [], chains: [] }, { answer: "The supplied evidence does not state a price.", citations: [], abstained: true });
  assert.deepEqual(abstained.abstention, { expected: true, actual: true, matched: true });
});

test("a lost turn-start response is reconciled by durable marker without a second model call", async () => {
  const store = memoryStore();
  let starts = 0;
  let submittedText = "";
  const first = await runAnswerCase({
    value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, timeoutMs: 1_000,
    connect: async () => scriptedTransport(async (method, params) => {
      if (method === "turn/start") {
        starts++;
        submittedText = String((params as { input?: { text?: unknown }[] }).input?.[0]?.text ?? "");
        throw Error("response lost after submission");
      }
      return baseResponse(method);
    }),
  });
  assert.equal(first.kind, "uncertain");

  const second = await runAnswerCase({
    value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, timeoutMs: 1_000,
    connect: async () => scriptedTransport(async (method, params) => {
      if (method === "thread/turns/list") return { data: [{ id: "turn-1", status: "completed" }], nextCursor: null };
      if (method === "thread/items/list") return { data: [
        { turnId: "turn-1", item: { type: "userMessage", content: [{ type: "text", text: submittedText }] } },
        { turnId: "turn-1", item: { type: "agentMessage", phase: "final", text: JSON.stringify({ answer: "Use Willow Lane.", citations: [ref], abstained: false }) } },
      ], nextCursor: null };
      if (method === "turn/start") starts++;
      return baseResponse(method);
    }, { recoverFromStore: store }),
  });
  assert.equal(second.kind, "completed");
  assert.equal(starts, 1);
});

test("completed cases are cached and unexpected native tool activity is visible in the result", async () => {
  const store = memoryStore();
  let starts = 0;
  const connect = async () => scriptedTransport(async (method) => {
    if (method === "turn/start") { starts++; return { turn: { id: "turn-complete" } }; }
    if (method === "thread/turns/list") return { data: [{ id: "turn-complete", status: "completed" }], nextCursor: null };
    if (method === "thread/items/list") return { data: [
      { turnId: "turn-complete", item: { type: "mcpToolCall", server: "unexpected", tool: "lookup", status: "completed" } },
      { turnId: "turn-complete", item: { type: "agentMessage", phase: "final", text: JSON.stringify({ answer: "Use Willow Lane.", citations: [ref], abstained: false }) } },
    ], nextCursor: null };
    return baseResponse(method);
  }, { nativeMessage: { method: "tool/call", params: { name: "unexpected" } } });
  const first = await runAnswerCase({ value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, connect, timeoutMs: 1_000 });
  assert.equal(first.kind, "completed");
  if (first.kind === "completed") assert.deepEqual(first.nativeActivity, ["tool/call", "item:mcpToolCall"]);
  const cached = await runAnswerCase({ value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, connect: async () => { throw Error("cached case must not connect"); }, timeoutMs: 1_000 });
  assert.equal(cached.kind, "completed");
  assert.equal(starts, 1);
});

test("malformed model output is terminal and is never blindly resubmitted", async () => {
  const store = memoryStore(); let starts = 0;
  const connect = async () => scriptedTransport(async method => {
    if (method === "turn/start") { starts++; return { turn: { id: "turn-invalid" } }; }
    if (method === "thread/turns/list") return { data: [{ id: "turn-invalid", status: "completed" }], nextCursor: null };
    if (method === "thread/items/list") return { data: [{ turnId: "turn-invalid", item: { type: "agentMessage", phase: "final", text: "not json" } }], nextCursor: null };
    return baseResponse(method);
  });
  const first = await runAnswerCase({ value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, connect, timeoutMs: 1_000 });
  assert.deepEqual(first, { kind: "blocked", reason: "invalid_output", nativeActivity: [] });
  const second = await runAnswerCase({ value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, connect, timeoutMs: 1_000 });
  assert.equal(second.kind, "failed");
  assert.equal(starts, 1);
});

test("the case deadline bounds stalled startup and stalled transport cleanup", async () => {
  const stalledAtStartup = await Promise.race([
    runAnswerCase({ value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store: memoryStore(), timeoutMs: 20, connect: async () => new Promise<RpcTransport>(() => {}) }),
    new Promise<"test-timeout">(resolve => setTimeout(() => resolve("test-timeout"), 250)),
  ]);
  assert.notEqual(stalledAtStartup, "test-timeout");
  if (stalledAtStartup !== "test-timeout") assert.equal(stalledAtStartup.kind, "failed");

  const stalledAtClose = await Promise.race([
    runAnswerCase({ value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store: memoryStore(), timeoutMs: 50,
      connect: async () => scriptedTransport(async method => {
        if (method === "turn/start") return { turn: { id: "turn-close" } };
        if (method === "thread/turns/list") return { data: [{ id: "turn-close", status: "completed" }], nextCursor: null };
        if (method === "thread/items/list") return { data: [{ turnId: "turn-close", item: { type: "agentMessage", phase: "final", text: JSON.stringify({ answer: "Use Willow Lane.", citations: [ref], abstained: false }) } }], nextCursor: null };
        return baseResponse(method);
      }, { stallClose: true }),
    }),
    new Promise<"test-timeout">(resolve => setTimeout(() => resolve("test-timeout"), 250)),
  ]);
  assert.notEqual(stalledAtClose, "test-timeout");
  if (stalledAtClose !== "test-timeout") assert.equal(stalledAtClose.kind, "completed");
});

test("the case deadline bounds the initial durable receipt read before any model connection", async () => {
  let connections = 0;
  const store: JsonStore = {
    async get() { return new Promise<JsonValue | undefined>(() => {}); },
    async set() { throw Error("an unread receipt must not be replaced"); },
  };
  const result = await Promise.race([
    runAnswerCase({
      value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, timeoutMs: 20,
      connect: async () => { connections++; throw Error("must not connect before reading durable state"); },
    }),
    new Promise<"test-timeout">(resolve => setTimeout(() => resolve("test-timeout"), 250)),
  ]);
  assert.notEqual(result, "test-timeout");
  if (result !== "test-timeout") assert.equal(result.kind, "uncertain");
  assert.equal(connections, 0);
});

test("a stalled post-acceptance receipt write is bounded and never followed by a regressing write", async () => {
  const values = new Map<string, JsonValue>();
  let writes = 0;
  let starts = 0;
  const store: JsonStore = {
    async get(key) { return values.get(key); },
    async set(key, value) {
      writes++;
      if (writes === 4) return new Promise<void>(() => {});
      values.set(key, structuredClone(value));
    },
  };
  const result = await Promise.race([
    runAnswerCase({
      value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, timeoutMs: 30,
      connect: async () => scriptedTransport(async method => {
        if (method === "turn/start") { starts++; return { turn: { id: "turn-accepted" } }; }
        return baseResponse(method);
      }),
    }),
    new Promise<"test-timeout">(resolve => setTimeout(() => resolve("test-timeout"), 250)),
  ]);
  assert.notEqual(result, "test-timeout");
  if (result !== "test-timeout") assert.equal(result.kind, "uncertain");
  assert.equal(starts, 1);
  assert.equal(writes, 4);
});

test("memory disabling is retried before submission when setup was interrupted", async () => {
  const store = memoryStore(); let memoryCalls = 0; let starts = 0;
  const first = await runAnswerCase({ value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, timeoutMs: 1_000,
    connect: async () => scriptedTransport(async method => {
      if (method === "thread/memoryMode/set") { memoryCalls++; throw Error("lost setup response"); }
      if (method === "turn/start") starts++;
      return baseResponse(method);
    }),
  });
  assert.equal(first.kind, "failed");
  const second = await runAnswerCase({ value: evidenceCase, model: "gpt-5.6-terra", effort: "low", store, timeoutMs: 1_000,
    connect: async () => scriptedTransport(async method => {
      if (method === "thread/memoryMode/set") { memoryCalls++; return {}; }
      if (method === "turn/start") { starts++; return { turn: { id: "turn-after-setup" } }; }
      if (method === "thread/turns/list") return { data: [{ id: "turn-after-setup", status: "completed" }], nextCursor: null };
      if (method === "thread/items/list") return { data: [{ turnId: "turn-after-setup", item: { type: "agentMessage", phase: "final", text: JSON.stringify({ answer: "Use Willow Lane.", citations: [ref], abstained: false }) } }], nextCursor: null };
      return baseResponse(method);
    }),
  });
  assert.equal(second.kind, "completed");
  assert.equal(memoryCalls, 2);
  assert.equal(starts, 1);
});

test("answer contexts reopen the real SQLite run and page each reported stored evidence chain", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-answer-context-"));
  try {
    const report = await runKnowledgeEvaluation({ root });
    const cases = await loadAnswerCases({ databasePath: join(root, "knowledge.sqlite"), mode: "lexical", questions: report.lexical.questions, maxEvidenceBytes: 256 * 1024 });
    assert.equal(cases.length, heldOutQuestions.length);
    for (const value of cases) {
      assert.equal(value.chains.length, value.records.length);
      for (const chain of value.chains) assert.ok(chain.records.some(record => JSON.stringify(record.ref) === JSON.stringify(chain.root)));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("answer context preserves returned synthetic-noise and historical revisions instead of cleaning retrieval with ground truth", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-answer-fairness-"));
  try {
    const report = await runKnowledgeEvaluation({ root, size: 25 });
    const questions = { ...report.lexical.questions, s1: { ...report.lexical.questions.s1!, retrieved: ["inventory-24@r1", "ferry-rule@r1"] } };
    const cases = await loadAnswerCases({ databasePath: join(root, "knowledge.sqlite"), mode: "lexical", questions, maxEvidenceBytes: 256 * 1024 });
    const selected = cases.find(value => value.questionId === "s1")!;
    assert.deepEqual(selected.records.map(record => `${record.ref.id}@${record.ref.revision}`), ["inventory-24@r1", "ferry-rule@r1"]);
    assert.equal(selected.chains.every(chain => chain.complete), true);
    const scored = scoreAnswer(heldOutQuestions.find(question => question.id === "s1")!, selected, { answer: "Willow Lane is step-free.", citations: selected.records.map(record => record.ref), abstained: false });
    assert.equal(scored.citations.current, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("answer evaluation CLI is opt-in and caps the fixed lexical-and-MLX case set", () => {
  assert.deepEqual(parseAnswerEvaluationCli(["--root", "/tmp/output", "--models-root", "/tmp/models"]), {
    root: "/tmp/output", modelsRoot: "/tmp/models", maxCases: 72, timeoutMsPerCase: 300_000, maxEvidenceBytes: 256 * 1024,
  });
  assert.throws(() => parseAnswerEvaluationCli(["--root", "/tmp/output", "--models-root", "/tmp/models", "--max-cases", "73"]), /between 1 and 72/);
});

test("an interrupted evaluation root reuses durable retrieval and completed answer progress", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-answer-resume-")); let starts = 0;
  const connect = async () => scriptedTransport(async method => {
    if (method === "turn/start") { starts++; return { turn: { id: "turn-resume" } }; }
    if (method === "thread/turns/list") return { data: [{ id: "turn-resume", status: "completed" }], nextCursor: null };
    if (method === "thread/items/list") return { data: [{ turnId: "turn-resume", item: { type: "agentMessage", phase: "final", text: JSON.stringify({ answer: "Use Willow Lane.", citations: [ref], abstained: false }) } }], nextCursor: null };
    return baseResponse(method);
  });
  try {
    const options = { root, modelsRoot: join(root, "models"), maxCases: 1, timeoutMsPerCase: 1_000, maxEvidenceBytes: 256 * 1024 };
    const first = await runAnswerQualityEvaluation({ ...options, connect });
    assert.equal(first.summary.completedCases, 1);
    const second = await runAnswerQualityEvaluation({ ...options, connect: async () => { throw Error("completed case must not reconnect"); } });
    assert.equal(second.summary.completedCases, 1);
    assert.equal(starts, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("existing lexical and MLX inputs must identify the same frozen corpus", async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-answer-report-match-"));
  try {
    const databaseRoot = join(root, "database");
    const base = await runKnowledgeEvaluation({ root: databaseRoot });
    const report = (model: "qwen3-embedding-0.6b-mlx", records = base.corpus.records) => ({
      ...base, corpus: { ...base.corpus, records },
      hybrid: { kind: "real_vectors", model, questions: base.lexical.questions },
    });
    const lexicalPath = join(root, "lexical.json"); const mlxPath = join(root, "mlx.json");
    await Promise.all([
      writeFile(lexicalPath, JSON.stringify(report("qwen3-embedding-0.6b-mlx"))),
      writeFile(mlxPath, JSON.stringify(report("qwen3-embedding-0.6b-mlx", 25))),
    ]);
    await assert.rejects(runAnswerQualityEvaluation({
      root: join(root, "answers"), maxCases: 1, timeoutMsPerCase: 1_000, maxEvidenceBytes: 256 * 1024,
      reports: {
        lexical: { reportPath: lexicalPath, databaseRoot },
        "qwen3-embedding-0.6b-mlx": { reportPath: mlxPath, databaseRoot },
      },
      connect: async () => { throw Error("mismatched reports must fail before model connection"); },
    }), /same corpus/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function baseResponse(method: string): unknown {
  if (method === "initialize") return { userAgent: "codex/0.153.4" };
  if (method === "model/list") return { data: [{ model: "gpt-5.6-terra", supportedReasoningEfforts: [{ reasoningEffort: "low" }] }], nextCursor: null };
  if (method === "thread/start") return { thread: { id: "thread-1" } };
  if (method === "thread/memoryMode/set") return {};
  return {};
}

function scriptedTransport(
  request: (method: string, params: unknown) => Promise<unknown>,
  options: { nativeMessage?: RpcMessage; recoverFromStore?: JsonStore; stallClose?: boolean } = {},
): RpcTransport {
  let receive: (message: RpcMessage) => void = () => {};
  return {
    async request(method, params) {
      if (options.nativeMessage && method === "turn/start") queueMicrotask(() => receive(options.nativeMessage!));
      return request(method, params);
    },
    notify() {}, respond() {}, subscribe(next) { receive = next; return () => { receive = () => {}; }; },
    async close() { if (options.stallClose) await new Promise(() => {}); },
  };
}
