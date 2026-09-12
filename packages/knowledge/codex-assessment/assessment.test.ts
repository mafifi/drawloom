import { expect, test } from "bun:test";
import { createCodexAssessment } from "./src/index.js";
import type { JsonStore, JsonValue, RpcMessage, RpcTransport } from "@drawloom/host";
import type { AssessmentRequest, RecordRef, TrustedKnowledgeSubject } from "@drawloom/knowledge";
import { knowledgeAssessmentConformance } from "@drawloom/knowledge/conformance";

const subject = { type: "user", id: "owner", properties: {} } as TrustedKnowledgeSubject;
const source = { type: "source" as const, origin: "public-test", id: "note", revision: "r1" };
const request: AssessmentRequest = { requestId: "assessment-1", payloadFingerprint: "payload-1", evidence: { roots: [{ unitId: "unit-1", root: source }], complete: true, records: [{ ref: source, body: "The public library closes Monday.", status: "active", confidence: {}, provenance: { producer: { type: "test", id: "public" }, inputs: [] } }], links: [] } };
type FailurePoint = "initialize" | "model/list" | "thread/start" | "thread/memoryMode/set" | "turn/start";

function fixture(options: { readonly failAt?: FailurePoint | 'turn/interrupt'; readonly hangAt?: string; readonly deniedRefs?: readonly string[]; readonly model?: string; readonly effort?: string; readonly answer?: unknown; readonly write?: () => Promise<void>; readonly authorize?: (action: string) => Promise<void>; readonly handle?: (method: string, params: unknown) => Promise<unknown> } = {}) {
  const saved = new Map<string, JsonValue>(); const calls: string[] = []; const resolverRefs: Array<string | undefined> = []; const listeners = new Set<(message: RpcMessage) => void>(); let closed = 0, interrupted = false;
  const store: JsonStore = { async get(key) { return saved.get(key); }, async set(key, value) { await options.write?.(); saved.set(key, structuredClone(value)); } };
  const transport: RpcTransport = {
    async request(method, params) {
      calls.push(method);
      const handled = await options.handle?.(method, params); if (handled !== undefined) return handled;
      if (method === options.hangAt) return new Promise(() => {});
      if (method === options.failAt) throw new Error(`failed ${method}`);
      if (method === "initialize") return { userAgent: "codex/0.153.4" };
      if (method === "model/list") return { data: [{ id: options.model ?? "gpt-5.6-terra", model: options.model ?? "gpt-5.6-terra", supportedReasoningEfforts: [{ reasoningEffort: options.effort ?? "low" }] }], nextCursor: null };
      if (method === "thread/start") return { thread: { id: "native-thread" } };
      if (method === "thread/memoryMode/set") return {};
      if (method === "turn/start") return { turn: { id: "native-turn", status: "inProgress" } };
      if (method === "thread/turns/list") return { data: [{ id: "native-turn", status: interrupted ? "interrupted" : "completed" }], nextCursor: null };
      if (method === "thread/items/list") return { data: [{ turnId: 'native-turn', item: { type: "agentMessage", id: "answer", text: JSON.stringify(options.answer ?? { proposals: [{ id: "library-hours", previous: null, text: "The library is closed Monday.", confidenceJson: "{}", withdraw: false, supportingIndices: [0], contraryIndices: [] }] }) } }], nextCursor: null };
      if (method === "turn/interrupt") { interrupted = true; return {}; }
      throw new Error(`Unexpected method ${method}`);
    },
    notify() {}, respond() {},
    subscribe(message) { listeners.add(message); return () => listeners.delete(message); },
    async close() { closed++; },
  };
  const provider = createCodexAssessment({ model: options.model ?? "gpt-5.6-terra", effort: options.effort ?? "low", workingDirectory: "/private/tmp", timeoutMs: 20, store, connect: async () => transport,
    authorizer: { async authorize(value) { await options.authorize?.(value.action.name); return { decision: value.subject.id === subject.id && !options.deniedRefs?.includes(value.resource.id) }; } },
    resolveResource: async ({ ref }) => { resolverRefs.push(ref?.id); return { type: ref ? "knowledge-record" : "model-destination", id: ref?.id ?? "codex", properties: {} }; },
  });
  return { provider, calls, saved, resolverRefs, emit: (message: RpcMessage) => { for (const listener of listeners) listener(message); }, closed: () => closed };
}

function withHiddenInput(): AssessmentRequest {
  const hidden: RecordRef = { type: "source", origin: "public-test", id: "hidden-input", revision: "r1" };
  return { ...request, evidence: { ...request.evidence, records: [{ ...request.evidence.records[0]!, provenance: { producer: { type: "test", id: "public" }, inputs: [hidden] } }], links: [{ from: source, to: hidden, relation: "support" }] } };
}

test("denies native submission when an allowed record names a denied evidence input", async () => {
  const f = fixture({ deniedRefs: ["hidden-input"] });
  try {
    expect((await f.provider.assess(subject, withHiddenInput())).kind).toBe("denied");
    expect(f.calls).toEqual([]);
    expect(f.resolverRefs).toContain("hidden-input");
  } finally { await f.provider.close(); }
});

test("every root in a maintenance batch requires disclosure authority before connecting", async () => {
  const hidden = { ...source, id: "denied-second-root" };
  const f = fixture({ deniedRefs: [hidden.id] });
  try {
    const batched: AssessmentRequest = { ...request, evidence: { ...request.evidence,
      roots: [...request.evidence.roots, { unitId: "unit-2", root: hidden }],
      records: [...request.evidence.records, { ...request.evidence.records[0]!, ref: hidden }],
    } };
    expect((await f.provider.assess(subject, batched)).kind).toBe("denied");
    expect(f.calls).toEqual([]);
    expect(f.resolverRefs).toContain(hidden.id);
  } finally { await f.provider.close(); }
});

test("classifies failures before turn submission as failures and releases the connection", async () => {
  for (const failAt of ["initialize", "model/list", "thread/start", "thread/memoryMode/set"] as const) {
    const f = fixture({ failAt });
    try {
      expect((await f.provider.assess(subject, request)).kind).toBe("failure");
      expect(f.closed()).toBeGreaterThan(0);
    } finally { await f.provider.close(); }
  }
});

test("a lost turn-start result remains uncertain and is never submitted twice", async () => {
  const f = fixture({ failAt: "turn/start" });
  try {
    expect((await f.provider.assess(subject, request)).kind).toBe("uncertain");
    expect((await f.provider.assess(subject, request)).kind).toBe("uncertain");
    expect(f.calls.filter((call) => call === "turn/start")).toHaveLength(1);
  } finally { await f.provider.close(); }
});

test("cancellation does not wait behind a hung assessment or reauthorize submitted evidence", async () => {
  const f = fixture({ hangAt: "model/list" });
  try {
    const assessing = f.provider.assess(subject, request);
    await Bun.sleep(1);
    const cancelled = await Promise.race([f.provider.cancel(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint }), Bun.sleep(100).then(() => "timed-out" as const)]);
    expect(cancelled).not.toBe("timed-out");
    if (cancelled !== "timed-out") expect(cancelled.kind).toBe("cancelled");
    await assessing;
  } finally { await f.provider.close(); }
});

test("revoked evidence disclosure after start does not prevent an owned turn from stopping", async () => {
  const deniedRefs: string[] = []; const f = fixture({ deniedRefs });
  try {
    expect((await f.provider.assess(subject, request)).kind).toBe("running");
    deniedRefs.push(source.id);
    expect((await f.provider.cancel(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint })).kind).toBe("cancelled");
    expect(f.calls).toContain("turn/interrupt");
  } finally { await f.provider.close(); }
});

test("native intervention preserves uncertainty until native terminal evidence is read", async () => {
  const f = fixture();
  try {
    expect((await f.provider.assess(subject, request)).kind).toBe("running");
    f.emit({ id: 7, method: "approval/request", params: {} });
    await Bun.sleep(1);
    expect([...f.saved.values()].some(value => (value as {outcome?: {kind: string}}).outcome?.kind === 'uncertain')).toBe(true);
    expect((await f.provider.reconcile(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint })).kind).toBe("completed");
    const changed = createCodexAssessment({ model: "gpt-5.6-sol", effort: "low", workingDirectory: "/private/tmp", timeoutMs: 20, store: { get: async (key) => f.saved.get(key), set: async (key, value) => { f.saved.set(key, value); } }, connect: async () => { throw new Error("must not connect"); }, authorizer: { async authorize() { return { decision: true }; } }, resolveResource: async ({ ref }) => ({ type: ref ? "knowledge-record" : "model-destination", id: ref?.id ?? "codex", properties: {} }) });
    try { expect((await changed.reconcile(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint })).kind).toBe("conflict"); } finally { await changed.close(); }
  } finally { await f.provider.close(); }
});

test('an operation shares one deadline across sequential provider requests', async () => {
  const f = fixture({ handle: async method => { if (method === 'initialize' || method === 'model/list') await Bun.sleep(14); } });
  try { expect((await f.provider.assess(subject, request)).kind).not.toBe('running'); expect(f.calls).not.toContain('turn/start'); }
  finally { await f.provider.close(); }
});

test('a timed-out never-connected request does not strand connection admission', async () => {
  let attempts = 0;
  const values = new Map<string, JsonValue>();
  const provider = createCodexAssessment({ model: 'gpt-5.6-terra', effort: 'low', workingDirectory: '/private/tmp', timeoutMs: 10,
    store: { get: async key => values.get(key), set: async (key,value) => { values.set(key,value); } },
    connect: async () => { attempts++; return new Promise(() => {}); },
    authorizer: { authorize: async () => ({decision: true}) }, resolveResource: async () => ({ type: 'test',id:'local',properties:{} }),
  });
  try { await provider.assess(subject, request); await provider.assess(subject, { ...request, requestId: 'second' }); expect(attempts).toBe(2); }
  finally { await provider.close(); }
});

test('late cancellation cannot overwrite a concurrently persisted completed outcome', async () => {
  let release: ((value: unknown) => void) | undefined, reads = 0;
  const f = fixture({ handle: async method => {
    if (method === 'turn/interrupt') return {};
    if (method === 'thread/turns/list' && ++reads === 1) return new Promise(resolve => { release = resolve; });
  } });
  try {
    await f.provider.assess(subject, request);
    const identity = {requestId: request.requestId, payloadFingerprint: request.payloadFingerprint};
    const cancelled = f.provider.cancel(subject, identity);
    for (let i=0; i<10 && !release; i++) await Bun.sleep(1);
    expect((await f.provider.reconcile(subject, identity)).kind).toBe('completed');
    release?.({data:[{id:'native-turn',status:'inProgress'}],nextCursor:null});
    expect((await cancelled).kind).toBe('too_late');
    expect((await f.provider.reconcile(subject, identity)).kind).toBe('completed');
  } finally { await f.provider.close(); }
});

test('a cancellation resumed after its authorization deadline cannot interrupt later work', async () => {
  let release: (() => void) | undefined;
  const f = fixture({ authorize: async action => { if (action === 'assess.cancel') await new Promise<void>(resolve => { release = resolve; }); } });
  try {
    await f.provider.assess(subject, request);
    const identity = {requestId: request.requestId, payloadFingerprint: request.payloadFingerprint};
    expect((await f.provider.cancel(subject, identity)).kind).toBe('uncertain');
    expect((await f.provider.reconcile(subject, identity)).kind).toBe('completed');
    const closes = f.closed(); release?.(); await Bun.sleep(1);
    expect(f.calls).not.toContain('turn/interrupt'); expect(f.closed()).toBe(closes);
  } finally { await f.provider.close(); }
});

test('native intervention closes its exact transport even when receipt persistence stalls', async () => {
  let stalled = false;
  const f = fixture({ write: async () => { if (stalled) await new Promise(() => {}); } });
  try {
    await f.provider.assess(subject, request); stalled = true;
    f.emit({id:7,method:'approval/request',params:{}}); await Bun.sleep(1);
    expect(f.closed()).toBe(1);
  } finally { await f.provider.close(); }
});

test('shutdown closes a connection belonging to a later generation', async () => {
  const f = fixture({ handle: async method => method === 'thread/turns/list' ? {data:[{id:'native-turn',status:'inProgress'}],nextCursor:null} : undefined });
  await f.provider.assess(subject, request);
  f.emit({id:7,method:'approval/request',params:{}}); await Bun.sleep(1);
  expect((await f.provider.reconcile(subject, {requestId:request.requestId,payloadFingerprint:request.payloadFingerprint})).kind).toBe('running');
  const before = f.closed(); await f.provider.close(); expect(f.closed()).toBe(before+1);
});

test("invalid model citations fail after completion without publication", async () => {
  const f = fixture({ answer: { proposals: [{ id: "bad", previous: null, text: "unsupported", confidenceJson: "{}", withdraw: false, supportingIndices: [99], contraryIndices: [] }] } });
  try {
    await f.provider.assess(subject, request);
    expect((await f.provider.reconcile(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint })).kind).toBe("failure");
  } finally { await f.provider.close(); }
});

test("passes the shared assessment conformance suite", async () => {
  const f = fixture();
  const denied = { type: "user", id: "visitor", properties: {} } as TrustedKnowledgeSubject;
  try {
    await knowledgeAssessmentConformance({ assessment: f.provider, authorizedSubject: subject, deniedSubject: denied, evidence: request.evidence });
  } finally { await f.provider.close(); }
});

test('simultaneous identical requests submit at most once', async () => {
  const f = fixture();
  try { await Promise.all([f.provider.assess(subject, request), f.provider.assess(subject, request)]); expect(f.calls.filter(method => method === 'turn/start')).toHaveLength(1); }
  finally { await f.provider.close(); }
});

test('unconfirmed interruption remains uncertain rather than falsely cancelled', async () => {
  const f = fixture({ failAt: 'turn/interrupt' });
  try {
    await f.provider.assess(subject, request);
    expect((await f.provider.cancel(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint })).kind).toBe('uncertain');
    expect((await f.provider.reconcile(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint })).kind).toBe('completed');
  } finally { await f.provider.close(); }
});

test('a delayed pre-submission RPC cannot submit after cancellation', async () => {
  let release!: (value: unknown) => void;
  const f = fixture({ handle: async method => method === 'thread/start' ? new Promise(resolve => { release = resolve; }) : undefined });
  try {
    const active = f.provider.assess(subject, request);
    for (let i=0; i<10 && !release; i++) await Bun.sleep(1);
    await f.provider.cancel(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint });
    release({ thread: { id: 'late-thread' } }); await active;
    expect(f.calls.filter(method => method === 'turn/start')).toHaveLength(0);
  } finally { await f.provider.close(); }
});

test('lost submission is recovered by its exact persisted native marker', async () => {
  let marker = '';
  const f = fixture({ handle: async (method, params) => {
    if (method === 'turn/start') { marker = String((params as { input: { text: string }[] }).input[0]!.text).split('\n')[0]!; throw Error('lost response'); }
    if (method === 'thread/items/list' && !(params as { cursor?: string }).cursor) return { data: [{ turnId: 'native-turn', item: { type: 'userMessage', id: 'request', content: [{ type: 'text', text: marker }] } }], nextCursor: 'answer' };
    return undefined;
  } });
  try {
    await f.provider.assess(subject, request);
    expect((await f.provider.reconcile(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint })).kind).toBe('completed');
    expect(f.calls).toContain('thread/items/list');
    expect(f.calls.filter(method => method === 'turn/start')).toHaveLength(1);
  } finally { await f.provider.close(); }
});

test('reconciling an active turn keeps its App Server process alive', async () => {
  const f = fixture({ handle: async method => method === 'thread/turns/list' ? { data: [{ id: 'native-turn', status: 'inProgress' }], nextCursor: null } : undefined });
  try {
    await f.provider.assess(subject, request);
    expect((await f.provider.reconcile(subject, { requestId: request.requestId, payloadFingerprint: request.payloadFingerprint })).kind).toBe('running');
    expect(f.closed()).toBe(0);
  } finally { await f.provider.close(); }
});
