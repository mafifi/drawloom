import { test, expect } from 'bun:test';
import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectPackage } from '@drawloom/local-plugin-packages';
import { createBackendLoader } from '../../apps/desktop/host/plugin-backend.js';
import { connectMcpApp } from '../../apps/desktop/host/mcp-app.js';
import { createMemoryOrchestrator } from '../adr-0017-orchestration/memory.js';
import { arithmetic, numberTask } from '@drawloom/orchestration/conformance-fixtures';
import { registerWorkflow } from '@drawloom/orchestration';

test('prebuilt enhanced package receives the accepted orchestration interface through supported entrypoint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-enhanced-proof-'));
  const loader = createBackendLoader();
  try {
    const fixture = join(import.meta.dir, 'fixtures/enhanced');
    const build = await Bun.build({ entrypoints: [join(fixture, 'backend.ts')], outdir: root, target: 'bun', naming: 'backend.js' });
    expect(build.success).toBe(true);
    await copyFile(join(fixture, 'plugin.json'), join(root, 'plugin.json'));
    const inventory = await inspectPackage(root);
    let calls = 0;
    const orchestration = createMemoryOrchestrator('packaged', (_name, value) => { calls++; return Number(value) * 2; }, { workflows: [registerWorkflow(arithmetic)], tasks: [numberTask] });
    const options = { installationId: 'enhanced', dataDirectory: join(root, 'data'), configuration: {}, trusted: true, available: [], capabilities: {} };
    expect((await loader.activate(inventory, options)).status).toBe('unavailable');
    const activated = await loader.activate(inventory, { ...options, capabilities: { orchestration } });
    expect(activated.status).toBe('ready');
    if (activated.status !== 'ready') throw Error('Backend unavailable');
    const transport = activated.backend.servers?.[0]?.transport; if (!transport) throw Error('Server missing');
    const app = await connectMcpApp({ transport, toolName: 'open' }, 'ui://control/view.html');
    try {
      for (let repeat = 0; repeat < 2; repeat++) expect((await app.callTool({ name: 'calculate', arguments: { request: 'stable', value: 6 } })).structuredContent).toEqual({ value: 12 });
      expect(calls).toBe(1);
      await expect(app.callTool({ name: 'orchestration.start', arguments: {} })).rejects.toThrow();
    } finally { await app.close(); }
  } finally { await loader.close(); await rm(root, { recursive: true, force: true }); }
});
