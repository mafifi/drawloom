import { afterEach, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
Bun.plugin({ name: 'orchestration-view-model-tests', setup(build) {
  build.onLoad({ filter: /orchestration-view-model\.svelte\.ts$/ }, async ({ path }) => ({
    contents: compileModule(new Bun.Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text()), { filename: path, generate: 'client' }).js.code, loader: 'js',
  }));
} });
const { createOrchestrationViewModel } = await import('./orchestration-view-model.svelte.js');
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const owner = { installationId: 'installation', title: 'Public example', readiness: { status: 'ready' as const } };
const run = { runId: 'run', identity: 'request', workflow: 'example', version: '1', status: 'running', cancellationRequested: false, childRunIds: [], pendingInputs: ['review'], unresolvedEffects: [], steps: [], stepsTruncated: false };

test('lists by explicit project and retains failed-read feedback', async () => {
  const urls: string[] = [];
  globalThis.fetch = (async (url) => { urls.push(String(url)); return Response.json([owner]); }) as typeof fetch;
  const vm = createOrchestrationViewModel(); await vm.open('project-a');
  expect(vm.owners).toEqual([owner]); expect(urls[0]).toContain('projectId=project-a');
  globalThis.fetch = Object.assign(async () => new Response(null, { status: 503 }), { preconnect: original.preconnect });
  await vm.selectOwner(owner.installationId);
  expect(vm.error).toContain('unavailable'); expect(vm.owners).toEqual([owner]);
});

test('navigation discards late pages and does not send cancellation', async () => {
  let release!: (response: Response) => void; const methods: string[] = [];
  globalThis.fetch = (async (url, init) => { methods.push(init?.method ?? 'GET'); if (String(url).includes('/owners')) return Response.json([owner]); return new Promise<Response>(resolve => { release = resolve; }); }) as typeof fetch;
  const vm = createOrchestrationViewModel(); await vm.open('a'); const pending = vm.selectOwner(owner.installationId);
  await vm.open('b'); release(Response.json({ runs: [run] })); await pending;
  expect(vm.runs).toEqual([]); expect(vm.projectId).toBe('b'); expect(methods).not.toContain('POST');
});

test('input submission binds the exact displayed request and refreshes that run', async () => {
  const commands: unknown[] = [];
  globalThis.fetch = (async (url, init) => {
    if (init?.method === 'POST') { commands.push(JSON.parse(String(init.body))); return Response.json({ ...run, status: 'completed', pendingInputs: [] }); }
    if (String(url).includes('/owners')) return Response.json([owner]);
    return Response.json({ runs: [run] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel(); await vm.open('a'); await vm.selectOwner(owner.installationId);
  await vm.respond('run', 'not-pending', 'true'); expect(commands).toHaveLength(0);
  await vm.respond('run', 'review', '{bad'); expect(commands).toHaveLength(0);
  await vm.respond('run', 'review', '{"approved":true}');
  expect(commands).toEqual([{ action: 'respond', projectId: 'a', installationId: 'installation', runId: 'run', requestId: 'review', value: { approved: true } }]);
  expect(vm.runs[0]?.status).toBe('completed');
});

test('a late command cannot overwrite another project and pending is action-specific', async () => {
  let release!: (response: Response) => void;
  let commandSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (url, init) => {
    if (init?.method === 'POST') { commandSignal=init.signal; return new Promise<Response>((resolve,reject) => { release = resolve; init.signal?.addEventListener('abort',()=>reject(Error('Request aborted'))); }); }
    if (String(url).includes('/owners')) return Response.json([owner]); return Response.json({ runs: [run] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel(); await vm.open('a'); await vm.selectOwner(owner.installationId);
  const cancelling = vm.cancel('run'); expect(vm.pendingAction).toEqual({ action: 'cancel', runId: 'run' });
  await vm.open('b'); expect(commandSignal?.aborted??false).toBe(false); release(Response.json({ ...run, cancellationRequested: true })); await cancelling;
  expect(vm.runs).toEqual([]); expect(vm.pendingAction).toBeUndefined();
});

test('refresh stays on the chosen bounded page and does not overlap reads', async () => {
  const urls: string[] = []; let release!: (response: Response) => void;
  globalThis.fetch = (async url => {
    urls.push(String(url)); if (String(url).includes('/owners')) return Response.json([owner]);
    if (!String(url).includes('cursor=')) return Response.json({ runs: [run], cursor: 'page-two' });
    return new Promise<Response>(resolve => { release = resolve; });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel(); await vm.open('a'); await vm.selectOwner(owner.installationId);
  const more = vm.more(); expect(vm.loadingAction).toBe('more'); await vm.refresh(); expect(urls).toHaveLength(3);
  release(Response.json({ runs: [{ ...run, runId: 'second' }] })); await more;
  const refresh = vm.refresh(); expect(urls.at(-1)).toContain('cursor=page-two');
  release(Response.json({ runs: [{ ...run, runId: 'second' }] })); await refresh;
  expect(vm.runs.map(item => item.runId)).toEqual(['second']);
});

test('cancellation interrupts a pending read and stale read cannot undo its result', async () => {
  let reads = 0, posts = 0; let release!: (response: Response) => void;
  globalThis.fetch = (async (url, init) => {
    if (init?.method === 'POST') { posts++; return Response.json({ ...run, cancellationRequested: true }); }
    if (String(url).includes('/owners')) return Response.json([owner]);
    if (++reads === 1) return Response.json({ runs: [run] });
    return new Promise<Response>(resolve => { release = resolve; });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel(); await vm.open('a'); await vm.selectOwner(owner.installationId);
  const reading = vm.refresh(); await vm.cancel('run');
  expect(posts).toBe(1); expect(vm.runs[0]?.cancellationRequested).toBe(true);
  release(Response.json({ runs: [run] })); await reading;
  expect(vm.runs[0]?.cancellationRequested).toBe(true); expect(vm.loading).toBe(false);
});

test('step browsing replaces bounded pages and ignores late pages after navigation', async () => {
  const urls: string[] = []; let release!: (response: Response) => void;
  globalThis.fetch = (async url => {
    urls.push(String(url));
    if (String(url).includes('/owners')) return Response.json([owner]);
    if (String(url).includes('/steps')) {
      if (String(url).includes('cursor=')) return new Promise<Response>(resolve => { release = resolve; });
      return Response.json({ steps: [{ stepId: 'one', status: 'completed', attempts: 1 }], cursor: 'step-next' });
    }
    return Response.json({ runs: [{ ...run, stepsTruncated: true }] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel(); await vm.open('a'); await vm.selectOwner(owner.installationId);
  await vm.browseSteps('run');
  expect(vm.stepPage?.steps.map(step => step.stepId)).toEqual(['one']);
  expect(urls.at(-1)).toContain('runId=run'); expect(urls.at(-1)).toContain('limit=20');
  const more = vm.browseSteps('run', true);
  expect(vm.stepAction).toEqual({ runId: 'run', kind: 'more' });
  release(Response.json({ steps: [{ stepId: 'two', status: 'completed', attempts: 2 }], cursor: 'step-last' })); await more;
  expect(vm.stepPage?.steps.map(step => step.stepId)).toEqual(['two']);
  const stale = vm.browseSteps('run', true);
  await vm.open('b'); release(Response.json({ steps: [{ stepId: 'stale', status: 'completed', attempts: 1 }] })); await stale;
  expect(vm.stepPage).toBeUndefined();
});

test('server validation feedback is visible and leaves the input unresolved', async () => {
  globalThis.fetch = (async (url, init) => {
    if (init?.method === 'POST') return Response.json({ error: 'Input does not match this request. Correct the JSON and submit again.' }, { status: 400 });
    if (String(url).includes('/owners')) return Response.json([owner]); return Response.json({ runs: [run] });
  }) as typeof fetch;
  const vm = createOrchestrationViewModel(); await vm.open('a'); await vm.selectOwner(owner.installationId);
  await vm.respond('run', 'review', '{}');
  expect(vm.error).toContain('Correct the JSON'); expect(vm.runs[0]?.pendingInputs).toEqual(['review']);
});
