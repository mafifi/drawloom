import { test, expect } from 'bun:test';
import { App } from '@modelcontextprotocol/ext-apps';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { connectMcpApp } from '../../apps/desktop/host/mcp-app.ts';
import { createPluginViewBridge } from '../../apps/desktop/src/lib/plugin-view-bridge.ts';
import { createMemoryOrchestrator } from '../adr-0017-orchestration/memory.ts';
import { arithmetic, numberTask } from '../adr-0017-orchestration/fixtures.ts';
import { registerWorkflow } from '../adr-0017-orchestration/contract.ts';
import { createBackendControl } from './backend-control.ts';

test('existing trusted backend composition can call orchestration while the App receives only tool results', async () => {
  let tasks = 0;
  const engine = createMemoryOrchestrator('enhanced-control', (_name, input) => { tasks++; return Number(input) * 2; },
    { workflows: [registerWorkflow(arithmetic)], tasks: [numberTask] });
  for (const enabled of [false, true]) {
    const server = createBackendControl(enabled ? { orchestration: engine } : {});
    const [hostTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const host = await connectMcpApp({ transport: hostTransport, toolName: 'open' }, 'ui://control/view.html');
    const bridge = createPluginViewBridge({ theme: 'light', callTool: p => host.callTool(p) });
    const app = new App({ name: 'control', version: '1' }, {}, { autoResize: false });
    try {
      const [parent, child] = InMemoryTransport.createLinkedPair();
      await bridge.connect(parent); await app.connect(child);
      const result = await app.callServerTool({ name: 'calculate', arguments: { request: 'first', value: 4 } });
      if (enabled) {
        expect(result.structuredContent).toEqual({ value: 8 });
        await app.callServerTool({ name: 'calculate', arguments: { request: 'first', value: 4 } });
        expect(tasks).toBe(1);
      } else { expect(result.isError).toBe(true); expect(tasks).toBe(0); }
      await expect(app.callServerTool({ name: 'orchestration.start', arguments: {} })).rejects.toThrow();
      expect(JSON.stringify(app.getHostCapabilities())).not.toContain('orchestration');
    } finally { await app.close(); await bridge.close(); await host.close(); await server.close(); }
  }
});
