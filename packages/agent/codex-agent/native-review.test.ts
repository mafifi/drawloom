import { expect, test } from 'bun:test';
import { createCodexDriver } from './src/index.js';
import type { AgentSessionSignal } from '@drawloom/agent';
import type { RpcMessage, RpcTransport } from '@drawloom/host';

function fixture(version = 'Codex Desktop/0.153.4 (Mac OS; arm64) unknown (drawloom; 0.0.0)', reviewerEcho: string | undefined = 'user') {
  let receive!: (message: RpcMessage) => void;
  let turn = 0;
  const requests: { method: string; params: unknown }[] = [];
  const replies: { id: string | number; result: unknown }[] = [];
  const transport: RpcTransport = {
    async request(method, params) {
      requests.push({ method, params });
      if (method === 'initialize') return { userAgent: version };
      if (method === 'thread/start' || method === 'thread/resume') return { thread: { id: 'native-thread' }, approvalsReviewer: reviewerEcho };
      if (method === 'turn/start') return { turn: { id: `turn-${++turn}` } };
      return {};
    },
    notify() {}, respond(id, result) { replies.push({ id, result }); },
    subscribe(handler) { receive = handler; return () => {}; }, async close() {},
  };
  const driver = createCodexDriver({ connect: async () => transport, store: { async get() { return undefined; }, async set() {} } });
  return { driver, requests, replies, emit(message: RpcMessage) { receive(message); } };
}
async function session(f: ReturnType<typeof fixture>, id = 'session') {
  const opened = await f.driver.openSession({ sessionId: id, context: { text: '' }, tools: { id: 'none', tools: [] } });
  if (opened.status !== 'ok') throw Error('Session did not open');
  const s = opened.value;
  const iterator = s.signals()[Symbol.asyncIterator]();
  return { s, next: async () => (await iterator.next()).value as AgentSessionSignal };
}
function approval(id: number, args = { text: 'Revised passage' }): RpcMessage {
  return { id, method: 'mcpServer/elicitation/request', params: {
    threadId: 'native-thread', turnId: 'turn-1', serverName: 'drawloom', mode: 'form',
    message: 'Allow document edit?', requestedSchema: { type: 'object', properties: {} },
    _meta: { codex_approval_kind: 'mcp_tool_call', tool_title: 'Edit document', tool_params: args },
  } };
}
test('native reviewer defaults human and delegated selection is passed to the next turn', async () => {
  const f = fixture(); const { s, next } = await session(f);
  try {
    expect(s.reviewerModes).toEqual(['human', 'delegated']);
    expect((await s.execute({ operationId: 'one', text: 'work' })).status).toBe('ok'); await next();
    expect(f.requests.find(r => r.method === 'turn/start')?.params).toMatchObject({ approvalsReviewer: 'user' });
    f.emit({ method: 'turn/completed', params: { threadId: 'native-thread', turn: { id: 'turn-1', status: 'completed' } } }); await next();
    expect((await s.execute({ operationId: 'two', text: 'work', reviewer: 'delegated' })).status).toBe('ok'); await next();
    expect(f.requests.filter(r => r.method === 'turn/start').at(-1)?.params).toMatchObject({ approvalsReviewer: 'auto_review' });
    expect((await s.steer?.({ operationId: 'two', text: 'change reviewer', reviewer: 'human' }))?.status).toBe('rejected');
  } finally { await s.close(); }
});
test('unsupported native review is reported and never silently downgraded', async () => {
  const f = fixture('codex/0.100.0'); const { s } = await session(f);
  try {
    expect(s.reviewerModes).toEqual(['human']);
    expect(await s.execute({ operationId: 'one', text: 'work', reviewer: 'delegated' })).toMatchObject({ status: 'rejected', failure: { code: 'provider_rejected' } });
    expect(f.requests.filter(r => r.method === 'turn/start')).toHaveLength(0);
  } finally { await s.close(); }
});
test('a provider that does not confirm the native reviewer cannot claim review support', async () => {
  const f = fixture('Codex Desktop/0.153.4', 'auto_review');
  const opened = await f.driver.openSession({ sessionId: 'mismatched', context: { text: '' }, tools: { id: 'none', tools: [] } });
  expect(opened.status).toBe('rejected');
  expect(f.requests.filter(r => r.method === 'turn/start')).toHaveLength(0);
});
for (const [label, action] of [['Approve once', 'accept'], ['Deny', 'decline'], ['Cancel', 'cancel']] as const) {
  test(`native MCP ${label} resolves only the exact originating request once`, async () => {
    const f = fixture(); const { s, next } = await session(f);
    try {
      await s.execute({ operationId: 'one', text: 'edit' }); await next();
      f.emit(approval(11));
      const event = await next(); expect(event.kind).toBe('approval.requested');
      if (event.kind !== 'approval.requested') throw Error('Not an execution approval');
      expect(event.request.details).toContain('Revised passage');
      expect(f.replies).toHaveLength(0);
      const option = event.request.options.find(o => o.label === label)!;
      const response = { approvalId: event.request.approvalId, optionId: option.optionId };
      expect((await s.resolveApproval({ ...response, arguments: {} } as typeof response)).status).toBe('rejected');
      expect((await s.resolveApproval(response)).status).toBe('ok');
      expect(f.replies).toEqual([{ id: 11, result: { action } }]);
      expect((await s.resolveApproval(response)).status).toBe('rejected');
    } finally { await s.close(); }
  });
}
test('unmarked elicitation remains input rather than an execution approval', async () => {
  const f = fixture(); const { s, next } = await session(f);
  try {
    await s.execute({ operationId: 'one', text: 'question' }); await next();
    const message = approval(11); const params = message.params as Record<string, unknown>; delete params._meta;
    f.emit(message);
    expect((await next()).kind).toBe('input.requested');
  } finally { await s.close(); }
});
test('a repeated provider request with changed arguments cannot reuse the original approval', async () => {
  const f = fixture(); const { s, next } = await session(f);
  try {
    await s.execute({ operationId: 'one', text: 'edit' }); await next();
    f.emit(approval(11)); const first = await next();
    if (first.kind !== 'approval.requested') throw Error('No approval');
    f.emit(approval(11, { text: 'Different edit' }));
    expect((await next()).kind).toBe('operation.failed');
    expect((await s.resolveApproval({ approvalId: first.request.approvalId, optionId: first.request.options[0]!.optionId })).status).toBe('rejected');
    expect(f.replies).toHaveLength(0);
  } finally { await s.close(); }
});
test('an approval cannot resolve an identically numbered request in a different conversation', async () => {
  const a = fixture(), b = fixture(); const first = await session(a, 'a'), second = await session(b, 'b');
  try {
    for (const entry of [first, second]) { await entry.s.execute({ operationId: 'one', text: 'edit' }); await entry.next(); }
    a.emit(approval(11)); b.emit(approval(11));
    const approvalA = await first.next(); await second.next();
    if (approvalA.kind !== 'approval.requested') throw Error('No approval');
    expect((await second.s.resolveApproval({ approvalId: approvalA.request.approvalId, optionId: approvalA.request.options[0]!.optionId })).status).toBe('rejected');
    expect(b.replies).toHaveLength(0);
  } finally { await first.s.close(); await second.s.close(); }
});
for (const end of ['resolved', 'stop', 'completed', 'restart'] as const) {
  test(`${end} invalidates native approval, including identical IDs in a reopened session`, async () => {
    const f = fixture(); const { s, next } = await session(f);
    await s.execute({ operationId: 'one', text: 'edit' }); await next();
    f.emit(approval(11)); const event = await next();
    if (event.kind !== 'approval.requested') throw Error('Not approval');
    const response = { approvalId: event.request.approvalId, optionId: event.request.options[0]!.optionId };
    if (end === 'resolved') { f.emit({ method: 'serverRequest/resolved', params: { threadId: 'native-thread', requestId: 11 } }); await next(); }
    if (end === 'stop') await s.interrupt?.('one');
    if (end === 'completed') { f.emit({ method: 'turn/completed', params: { threadId: 'native-thread', turn: { id: 'turn-1', status: 'completed' } } }); await next(); }
    if (end === 'restart') {
      await s.close();
      const reopened = await session(f); await reopened.s.execute({ operationId: 'one', text: 'new' }); await reopened.next();
      const request = approval(11); (request.params as Record<string, unknown>).turnId = 'turn-2'; f.emit(request); await reopened.next();
      expect((await reopened.s.resolveApproval(response)).status).toBe('rejected'); await reopened.s.close();
    }
    expect((await s.resolveApproval(response)).status).toBe('rejected');
    expect(f.replies.some(r => (r.result as { action?: string }).action === 'accept')).toBe(false);
    await s.close();
  });
}
for (const status of ['approved', 'denied', 'timedOut', 'aborted'] as const) {
  test(`native automatic review reports ${status} through safe existing observations`, async () => {
    const f = fixture(); const { s, next } = await session(f);
    try {
      await s.execute({ operationId: 'one', text: 'edit', reviewer: 'delegated' }); await next();
      const params = { threadId: 'native-thread', turnId: 'turn-1', reviewId: 'private-review', targetItemId: null,
        startedAtMs: 1, action: { type: 'mcpToolCall', server: 'drawloom', toolName: 'text.edit' }, review: { status: 'inProgress' } };
      f.emit({ method: 'item/autoApprovalReview/started', params });
      expect(await next()).toMatchObject({ kind: 'provider.observation', name: 'approval-review', summary: expect.stringContaining('in progress') });
      f.emit({ method: 'item/autoApprovalReview/completed', params: { ...params, completedAtMs: 2, decisionSource: 'agent', review: { status, rationale: 'Scoped to the requested edit' } } });
      const result = await next(); expect(result).toMatchObject({ kind: 'provider.observation', name: 'approval-review', summary: expect.stringContaining('Scoped to the requested edit') });
      expect(JSON.stringify(result)).not.toContain('private-review'); expect(f.replies).toHaveLength(0);
    } finally { await s.close(); }
  });
}
test('automatic-review observations cannot be attributed to a human-review turn', async () => {
  const f = fixture(); const { s, next } = await session(f);
  try {
    await s.execute({ operationId: 'one', text: 'edit' }); await next();
    f.emit({ method: 'item/autoApprovalReview/completed', params: { threadId: 'native-thread', turnId: 'turn-1', action: { type: 'mcpToolCall', toolName: 'text.edit' }, review: { status: 'approved' } } });
    f.emit({ method: 'turn/completed', params: { threadId: 'native-thread', turn: { id: 'turn-1', status: 'completed' } } });
    expect((await next()).kind).toBe('operation.completed');
  } finally { await s.close(); }
});
for (const [phase, status] of [['started', 'approved'], ['completed', 'inProgress']] as const) {
  test(`automatic-review ${phase} rejects mismatched ${status} status`, async () => {
    const f = fixture(); const { s, next } = await session(f);
    try {
      await s.execute({ operationId: 'one', text: 'edit', reviewer: 'delegated' }); await next();
      f.emit({ method: `item/autoApprovalReview/${phase}`, params: { threadId: 'native-thread', turnId: 'turn-1', action: { type: 'mcpToolCall', toolName: 'text.edit' }, review: { status } } });
      expect(await next()).toMatchObject({ kind: 'operation.failed', failure: { code: 'invalid_provider_response' } });
    } finally { await s.close(); }
  });
}
