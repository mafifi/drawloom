import { expect, test } from 'bun:test';
import type { RpcMessage, RpcTransport } from '@drawloom/host';
import { createLiveBudget, cleanupLiveThreads, type LiveBudgetState } from './learning-live-budget.js';

function native(options: { fail?: boolean; held?: Promise<unknown>; turns?: { id: string; status: string }[] } = {}) {
  const calls: string[] = []; let receive: (message: RpcMessage) => void = () => {};
  const rpc: RpcTransport = {
    async request(method) {
      calls.push(method);
      if (method === 'thread/start') return { thread: { id: 'owned' } };
      if (method === 'thread/turns/list') return { data: options.turns ?? [], nextCursor: null };
      if (method === 'turn/start' || method === 'turn/steer') {
        if (options.fail) throw Error('unknown send');
        return options.held ?? { turn: { id: 'turn' } };
      }
      if (method === 'turn/interrupt' && options.turns) options.turns = options.turns.map(t => ({ ...t, status: 'interrupted' }));
      return {};
    }, notify() {}, respond() {}, subscribe(next) { receive = next; return () => {}; }, async close() { calls.push('close'); },
  };
  return { rpc, calls, emit: (message: RpcMessage) => receive(message) };
}

test('failed foreground and assessor sends consume the same allowance before transport dispatch', async () => {
  const persisted: number[] = [];
  const budget = createLiveBudget({ persist: state => persisted.push(state.attempts.length) });
  const a = native({ fail: true }), b = native();
  const foreground = budget.wrap(a.rpc, 'foreground'), assessor = budget.wrap(b.rpc, 'assessment');
  await foreground.request('thread/start', {});
  for (let i = 0; i < 12; i++) {
    try { await (i % 2 ? assessor : foreground).request(i % 2 ? 'turn/steer' : 'turn/start', { threadId: 'owned' }); } catch {}
  }
  await expect(assessor.request('turn/start', { threadId: 'owned' })).rejects.toThrow('allowance');
  expect(a.calls.filter(m => m === 'turn/start')).toHaveLength(6);
  expect(b.calls.filter(m => m === 'turn/steer')).toHaveLength(6);
  expect(budget.state.attempts.filter(a => a.outcome === 'uncertain')).toHaveLength(6);
  expect(persisted).toContain(12);
  budget.dispose();
});

test('deadline remains fixed across connections and interrupts an unacknowledged native submission', async () => {
  let now = 100; let expire = () => {}; let stopped = 0;
  const budget = createLiveBudget({ now: () => now, persist() {}, schedule: callback => { expire = callback; return () => {}; }, onExpire: async () => { stopped++; } });
  const a = native({ held: new Promise(() => {}) });
  const rpc = budget.wrap(a.rpc, 'assessment'); await rpc.request('thread/start', {});
  const first = rpc.request('turn/start', { threadId: 'owned' });
  now = 600_100; expire();
  await expect(first).rejects.toThrow('deadline');
  await budget.waitForExpiry();
  await expect(budget.wrap(native().rpc, 'foreground').request('turn/steer', { threadId: 'owned' })).rejects.toThrow('deadline');
  expect(stopped).toBe(1); expect(budget.state.firstSubmissionAt).toBe(100);
  expect(budget.state.attempts[0]?.outcome).toBe('uncertain');
  expect(budget.state.threads).toEqual(['owned']); budget.dispose();
});

test('durable receipt failure prevents model dispatch', async () => {
  const a = native(); const budget = createLiveBudget({ initial: { threads: ['owned'], attempts: [] }, persist() { throw Error('disk full'); } });
  await expect(budget.wrap(a.rpc, 'foreground').request('turn/start', { threadId: 'owned' })).rejects.toThrow('disk full');
  expect(a.calls).toEqual([]); budget.dispose();
});

test('restoring a receipt preserves consumed attempts and the original deadline', async () => {
  let now = 1;
  const first = createLiveBudget({ now: () => now, persist() {} });
  const rpc = first.wrap(native().rpc, 'foreground');
  await rpc.request('thread/start', {});
  for (let i = 0; i < 11; i++) await rpc.request('turn/start', { threadId: 'owned' });
  first.dispose();
  const restored = createLiveBudget({ initial: structuredClone(first.state), now: () => now, persist() {} });
  await restored.wrap(native().rpc, 'assessment').request('turn/start', { threadId: 'owned' });
  await expect(restored.wrap(native().rpc, 'foreground').request('turn/start', { threadId: 'owned' })).rejects.toThrow('allowance');
  now = 600_001;
  await expect(restored.wrap(native().rpc, 'foreground').request('turn/start', { threadId: 'owned' })).rejects.toThrow('deadline');
  expect(restored.state.firstSubmissionAt).toBe(1); restored.dispose();
});

test('expiry still interrupts when persistence fails, without throwing from the timer', async () => {
  let broken = false, expire = () => {}, stopped = false;
  const budget = createLiveBudget({ persist() { if (broken) throw Error('disk failed'); }, schedule: callback => { expire = callback; return () => {}; }, onExpire: async () => { stopped = true; } });
  const rpc = budget.wrap(native().rpc, 'foreground'); await rpc.request('thread/start', {}); await rpc.request('turn/start', { threadId: 'owned' });
  broken = true; expect(() => expire()).not.toThrow(); await budget.waitForExpiry(); expect(stopped).toBe(true); budget.dispose();
});

test('unowned submissions and uncertain thread creation stop before model work', async () => {
  const n = native(); const budget = createLiveBudget({ persist() {} });
  await expect(budget.wrap(n.rpc, 'foreground').request('turn/start', { threadId: 'someone-elses-thread' })).rejects.toThrow('owned');
  expect(n.calls).toEqual([]);
  const broken = { ...n.rpc, request: async () => { throw Error('lost thread/start reply'); } };
  await expect(budget.wrap(broken, 'foreground').request('thread/start', {})).rejects.toThrow('lost');
  expect(budget.state.uncertainThreadStarts).toBe(1);
  await expect(budget.wrap(n.rpc, 'foreground').request('thread/start', {})).rejects.toThrow('uncertain'); budget.dispose();
});

test('cleanup interrupts owners, closes them before archive, and retains unresolved identities', async () => {
  const a = native({ turns: [{ id: 'turn', status: 'inProgress' }] });
  const budget = createLiveBudget({ persist() {} });
  const rpc = budget.wrap(a.rpc, 'foreground');
  await rpc.request('thread/start', {}); await rpc.request('turn/start', { threadId: 'owned' });
  const order: string[] = [];
  const result = await cleanupLiveThreads(['owned'], {
    attempts: budget.state.attempts, interruptOwners: budget.interruptOwners,
    connect: async () => a.rpc,
    save: () => { order.push('saved'); },
    closeOwners: async () => { order.push('owners-closed'); },
  });
  expect(a.calls.indexOf('turn/interrupt')).toBeLessThan(a.calls.indexOf('thread/archive'));
  expect(a.calls).toContain('thread/archive');
  expect(result[0]?.outcome).toBe('archived');
  expect(order.indexOf('owners-closed')).toBeGreaterThan(order.indexOf('saved'));
  const unknown = native({ turns: [] });
  const retained = await cleanupLiveThreads(['owned'], { attempts: [{ role: 'foreground', method: 'turn/start', threadId: 'owned', submittedAt: 1, outcome: 'uncertain' }], connect: async () => unknown.rpc, save() {}, closeOwners: async () => {} });
  expect(retained[0]?.outcome).toBe('retained-uncertain');
  expect(unknown.calls).not.toContain('thread/archive');
  budget.dispose();
});

test('owner-close or status failure cannot archive a thread', async () => {
  const a = native({ turns: [{ id: 't', status: 'completed' }] });
  const results = await cleanupLiveThreads(['owned'], { connect: async () => a.rpc, save() {}, closeOwners: async () => { throw Error('still open'); } });
  expect(results[0]?.outcome).toBe('retained-uncertain'); expect(a.calls).not.toContain('thread/archive');
});

test('cleanup includes native identities discovered while owners finish closing', async () => {
  const ids: string[] = []; const n = native();
  const results = await cleanupLiveThreads(ids, { connect: async () => n.rpc, save() {}, closeOwners: async () => { ids.push('owned'); } });
  expect(results[0]?.outcome).toBe('archived'); expect(n.calls).toContain('thread/archive');
});

test('evidence write failure still closes owners and prevents archive', async () => {
  const n = native(); let closed = false;
  await expect(cleanupLiveThreads(['owned'], { connect: async () => n.rpc, save() { throw Error('disk failed'); }, closeOwners: async () => { closed = true; } })).rejects.toThrow('disk failed');
  expect(closed).toBe(true); expect(n.calls).not.toContain('thread/archive');
});

test('deadline interruption reaches the owning transport, never a different recovery process', async () => {
  let expire = () => {};
  const owner = native({ turns: [{ id: 'turn', status: 'inProgress' }] });
  const recovery = native({ turns: [{ id: 'turn', status: 'interrupted' }] });
  const recoveryRpc = { ...recovery.rpc, request: async (method: string, params: unknown) => {
    if (method === 'turn/interrupt') throw Error('Only the owner can interrupt this turn');
    return recovery.rpc.request(method, params);
  } };
  const budget = createLiveBudget({ persist() {}, schedule: callback => { expire = callback; return () => {}; } });
  const rpc = budget.wrap(owner.rpc, 'foreground');
  await rpc.request('thread/start', {}); await rpc.request('turn/start', { threadId: 'owned' });
  expire(); await budget.waitForExpiry();
  expect(owner.calls).toContain('turn/interrupt');
  const result = await cleanupLiveThreads(budget.state.threads, { attempts: budget.state.attempts, connect: async () => recoveryRpc, save() {}, closeOwners: () => rpc.close() });
  expect(result[0]?.outcome).toBe('archived'); expect(recovery.calls).not.toContain('turn/interrupt'); budget.dispose();
});

test('an old completed turn cannot resolve a later unacknowledged start and the owner is closed', async () => {
  let expire = () => {};
  const owner = native({ held: new Promise(() => {}), turns: [{ id: 'old', status: 'completed' }] });
  const budget = createLiveBudget({ persist() {}, schedule: callback => { expire = callback; return () => {}; } });
  const rpc = budget.wrap(owner.rpc, 'foreground'); await rpc.request('thread/start', {});
  const submission = rpc.request('turn/start', { threadId: 'owned' });
  expire(); await expect(submission).rejects.toThrow('deadline'); await budget.waitForExpiry();
  expect(owner.calls).toContain('close');
  const recovery = native({ turns: [{ id: 'old', status: 'completed' }] });
  const result = await cleanupLiveThreads(budget.state.threads, { attempts: budget.state.attempts, connect: async () => recovery.rpc, save() {}, closeOwners: async () => {} });
  expect(result[0]?.outcome).toBe('retained-uncertain'); expect(recovery.calls).not.toContain('thread/archive'); budget.dispose();
});

test('archive requires terminal evidence for each acknowledged turn identity', async () => {
  const recovery = native({ turns: [{ id: 'old', status: 'completed' }] });
  const attempts: LiveBudgetState['attempts'] = [
    { role: 'foreground', method: 'turn/start', threadId: 'owned', turnId: 'old', submittedAt: 1, outcome: 'accepted' },
    { role: 'foreground', method: 'turn/start', threadId: 'owned', turnId: 'missing-later', submittedAt: 2, outcome: 'accepted' },
  ];
  const result = await cleanupLiveThreads(['owned'], { attempts, connect: async () => recovery.rpc, save() {}, closeOwners: async () => {} });
  expect(result[0]?.outcome).toBe('retained-uncertain'); expect(recovery.calls).not.toContain('thread/archive');
});

test('bounded owner reconciliation closes the owner when its status cannot be established', async () => {
  let expire = () => {}, ownerClosed = false;
  const n = native();
  const owner = { ...n.rpc, request: async (method: string, params: unknown) => method === 'thread/turns/list' ? new Promise<never>(() => {}) : n.rpc.request(method, params), close: async () => { ownerClosed = true; } };
  const budget = createLiveBudget({ persist() {}, ownerTimeoutMs: 10, schedule: callback => { expire = callback; return () => {}; } });
  const rpc = budget.wrap(owner, 'foreground'); await rpc.request('thread/start', {}); await rpc.request('turn/start', { threadId: 'owned' });
  expire(); await budget.waitForExpiry();
  expect(ownerClosed).toBe(true); budget.dispose();
});
