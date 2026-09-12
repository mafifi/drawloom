import { expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
Bun.plugin({ name: 'knowledge-view-model-tests', setup(build) {
  build.onLoad({ filter: /knowledge-view-model\.svelte\.ts$/ }, async ({ path }) => ({
    contents: compileModule(new Bun.Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text()), { filename: path, generate: 'client' }).js.code, loader: 'js',
  }));
} });
const { createKnowledgeViewModel } = await import('./knowledge-view-model.svelte.js');
const record = (id: string) => ({ ref: { type: 'source' as const, origin: 'public', id, revision: '1' }, body: id, status: 'active' as const, confidence: {}, provenance: { producer: { type: 'test', id: 'fixture' }, inputs: [] } });
const page = (id: string) => ({ kind: 'ok', mode: 'lexical', semantic: { status: 'unavailable' }, items: [{ record: record(id), relevance: 1 }], bytes: 100 });

test('late search cannot replace a newer query and close discards pending pages', async () => {
  const responses: Array<(value: unknown) => void> = [];
  const vm = createKnowledgeViewModel({ send: async () => new Promise(resolve => responses.push(resolve)) });
  vm.actions.setQuery('earlier'); const earlier = vm.actions.search();
  vm.actions.setQuery('newer'); const newer = vm.actions.search();
  responses[1]!(page('newer')); await newer;
  responses[0]!(page('earlier')); await earlier;
  expect(vm.presentation.results.map(item => item.record.ref.id)).toEqual(['newer']);
  const late = vm.actions.search(); vm.close(); responses[2]!(page('late')); await late;
  expect(vm.presentation.results).toEqual([]);
});

test('evidence denial clears previous material and commands contain no browser subject', async () => {
  const commands: unknown[] = [];
  const vm = createKnowledgeViewModel({ send: async command => {
    commands.push(command);
    if (command.action === 'evidence' && command.request.root.id === 'first') return { kind: 'ok', records: [record('first')], links: [], bytes: 100 };
    return { kind: 'denied' };
  } });
  await vm.actions.inspect(record('first').ref); expect(vm.presentation.evidence?.records.length).toBe(1);
  await vm.actions.inspect(record('denied').ref); expect(vm.presentation.evidence).toBeUndefined();
  expect(vm.presentation.error).toContain('permission');
  expect(commands.every(value => !JSON.stringify(value).includes('subject'))).toBe(true);
});

test('opening knowledge does not download models or start assessments', async () => {
  const commands: unknown[] = [];
  const vm = createKnowledgeViewModel({ send: async command => { commands.push(command); throw Error('Not configured'); } });
  await vm.open();
  expect(commands).toEqual([{ action: 'status' }]);
  expect(vm.presentation.error).toContain('Not configured');
});

const status = (paused = false) => ({ availability: 'ready', message: 'Ready', configuration: { embeddingModel: 'qwen3-embedding-0.6b-mlx', assessmentModel: 'gpt-5.6-terra', assessmentTimeoutMs: 300000, maxAutomaticStartsPerDay: 6, maxAutomaticMillisecondsPerDay: 1800000 }, models: [{ id: 'qwen3-embedding-0.6b-mlx', title: 'Qwen MLX', licence: 'Apache-2.0 model and conversion', source: 'https://example.invalid/model', modelDirectory: '/data/models/active/qwen', runtimeDirectory: '/data/models/runtime/mlx', prerequisites: 'Apple Silicon and uv', runtime: { package: 'mlx-embeddings', version: '0.1.0', licence: 'GPL-3.0-only' }, weightsBytes: 10, state: 'missing' }], indexing: 'unavailable', maintenance: { state: paused ? 'paused' : 'idle', pendingUpdates: 0, message: 'Ready', automaticStartsToday: 0, automaticMillisecondsToday: 0 } });

test('source collection requires its own explicit action and does not submit filesystem authority', async () => {
  const commands: unknown[] = [];
  const vm = createKnowledgeViewModel({send: async command => { commands.push(command); return status(); }});
  await vm.open(); await vm.actions.source(true); await vm.actions.source(false);
  expect(commands).toEqual([{action:'status'},{action:'source',enabled:true},{action:'source',enabled:false}]);
  expect(vm.presentation.pendingAction).toBeUndefined();
});
test('a status read started before a pause cannot overwrite the pause response', async () => {
  let release!: (value: unknown) => void;
  const vm = createKnowledgeViewModel({ send: async command => command.action === 'status' ? new Promise(resolve => { release = resolve; }) : status(true) });
  const reading = vm.open(); await vm.actions.pause(true); release(status(false)); await reading;
  expect(vm.presentation.status?.maintenance.state).toBe('paused');
});
test('status remains readable while a download request is pending', async () => {
  let release!: (value: unknown) => void; let reads = 0;
  const vm = createKnowledgeViewModel({ send: async command => {
    if (command.action === 'download') return new Promise(resolve => { release = resolve; });
    reads++; return status();
  } });
  const downloading = vm.actions.download('qwen3-embedding-0.6b-mlx');
  await vm.actions.refresh(); expect(reads).toBe(1);
  release(status()); await downloading;
});

test('download suppresses duplicates while cancel remains available and a settled cancellation can retry', async () => {
  const commands: unknown[] = [];
  let finishDownload!: (value: unknown) => void;
  let attempts = 0;
  const withModelState = (state: 'cancelled' | 'ready') => ({ ...status(), models: status().models.map(model => ({ ...model, state })) });
  const vm = createKnowledgeViewModel({ send: async command => {
    commands.push(command);
    if (command.action === 'download' && attempts++ === 0) return new Promise(resolve => { finishDownload = resolve; });
    if (command.action === 'cancel_download') return withModelState('cancelled');
    return withModelState('ready');
  } });
  const first = vm.actions.download('qwen3-embedding-0.6b-mlx');
  await vm.actions.download('qwen3-embedding-0.6b-mlx');
  expect(commands.filter(command => (command as { action: string }).action === 'download')).toHaveLength(1);
  const cancelling = vm.actions.cancelDownload('qwen3-embedding-0.6b-mlx');
  finishDownload(withModelState('cancelled'));
  await Promise.all([first, cancelling]);
  expect(vm.presentation.status?.models[0]?.state).toBe('cancelled');
  await vm.actions.download('qwen3-embedding-0.6b-mlx');
  expect(vm.presentation.status?.models[0]?.state).toBe('ready');
  expect(commands.map(command => (command as { action: string }).action)).toEqual(['download', 'cancel_download', 'download']);
});

test('current-file download bytes pass through presentation without being replaced by total weights', async () => {
  const progress = { ...status(), models: status().models.map(model => ({ ...model, state: 'downloading' as const, message: 'Downloading tokenizer.json', receivedBytes: 2_097_152, expectedBytes: 8_388_608 })) };
  const vm = createKnowledgeViewModel({ send: async () => progress });
  await vm.open();
  expect(vm.presentation.status?.models[0]).toMatchObject({ receivedBytes: 2_097_152, expectedBytes: 8_388_608, weightsBytes: 10, message: 'Downloading tokenizer.json' });
});
