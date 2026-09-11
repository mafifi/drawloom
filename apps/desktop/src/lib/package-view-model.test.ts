import { afterEach, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
Bun.plugin({ name: 'package-view-model-tests', setup(build) {
  build.onLoad({ filter: /package-view-model\.svelte\.ts$/ }, async ({ path }) => ({
    contents: compileModule(new Bun.Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text()), { filename: path, generate: 'client' }).js.code, loader: 'js',
  }));
} });
const { createPackageViewModel } = await import('./package-view-model.svelte.js');
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const installation = { id: '03f41a9c-8308-4bb0-b00d-00a4c77a2abb', root: '/synthetic', name: 'Reference', enabled: true, trustedBackend: false,
  servers: ['old'], availableServers: [{ name: 'new', transport: 'stdio' }], pendingRestart: false, status: 'ready', diagnostics: [], connections: [] };

test('server choices retain removed selections and configure sends the exact new set', async () => {
  let submitted: unknown;
  globalThis.fetch = (async (_url, input) => { if (input?.body) submitted = JSON.parse(String(input.body)); return Response.json([installation]); }) as typeof fetch;
  const vm = createPackageViewModel(); await vm.refresh();
  expect(vm.serverChoices(installation.id).map(server => server.name)).toEqual(['new', 'old']);
  await vm.configure(installation.id, true, false, ['new']);
  expect(submitted).toEqual({ action: 'configure', id: installation.id, settings: { enabled: true, trustedBackend: false, servers: ['new'] } });
});

test('resource origin settings use the shared exact-origin contract before submitting', async () => {
  const submitted: unknown[] = [];
  globalThis.fetch = (async (_url, input) => { if (input?.body) submitted.push(JSON.parse(String(input.body))); return Response.json([installation]); }) as typeof fetch;
  const vm = createPackageViewModel(); await vm.refresh();
  await vm.configure(installation.id, true, false, ['new'], ['https://media.example', 'http://localhost:8080']);
  expect(submitted).toEqual([{ action: 'configure', id: installation.id, settings: { enabled: true, trustedBackend: false, servers: ['new'], approvedResourceOrigins: ['https://media.example', 'http://localhost:8080'] } }]);
  for (const origin of ['https://*.example', 'https://media.example/path', 'http://untrusted.example']) {
    await vm.configure(installation.id, true, false, ['new'], [origin]);
    expect(vm.error).toContain('exact HTTPS media origin');
  }
  expect(submitted).toHaveLength(1);
});

test('cancel prevents an older authorization installation refresh from replacing newer state', async () => {
  let gets = 0; let release!: (response: Response) => void; let started!: () => void;
  const readStarted = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = (async (url, input) => {
    if (url === '/api/packages/oauth') {
      const action = JSON.parse(String(input?.body)).action;
      return Response.json({ state: action === 'cancel' ? 'cancelled' : 'awaiting-approval', credentialMode: 'session' });
    }
    if (++gets === 2) { started(); return new Promise<Response>(resolve => { release = resolve; }); }
    return Response.json([{ ...installation, status: gets > 2 ? 'disconnected' : 'ready' }]);
  }) as typeof fetch;
  const vm = createPackageViewModel(); await vm.refresh();
  const connecting = vm.authenticate(installation.id, 'remote', 'connect');
  await readStarted;
  await vm.authenticate(installation.id, 'remote', 'cancel');
  expect(vm.installations[0]?.status).toBe('disconnected');
  release(Response.json([installation])); await connecting;
  expect(vm.installations[0]?.status).toBe('disconnected');
  expect(vm.authentication[installation.id + ':remote']?.state).toBe('cancelled');
});

test('a late failed connect cannot publish an error after cancellation', async () => {
  let release!: (response: Response) => void;
  globalThis.fetch = (async (url, input) => {
    if (url !== '/api/packages/oauth') return Response.json([installation]);
    if (JSON.parse(String(input?.body)).action === 'connect') return new Promise<Response>(resolve => { release = resolve; });
    return Response.json({ state: 'cancelled', credentialMode: 'session' });
  }) as typeof fetch;
  const vm = createPackageViewModel(); await vm.refresh();
  const connecting = vm.authenticate(installation.id, 'remote', 'connect');
  await vm.authenticate(installation.id, 'remote', 'cancel');
  release(new Response(null, { status: 400 })); await connecting;
  expect(vm.error).toBe('');
  expect(vm.authentication[installation.id + ':remote']?.state).toBe('cancelled');
});
