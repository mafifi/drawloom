import type { PluginBackendFactory } from '@drawloom/desktop-host';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createBackendControl } from '../../backend-control.js';

const activate: PluginBackendFactory = async context => {
  const server = createBackendControl(context.capabilities);
  const [transport, peer] = InMemoryTransport.createLinkedPair();
  await server.connect(peer);
  return { servers: [{ name: 'arithmetic', transport }], dispose: () => server.close() };
};
export default activate;
