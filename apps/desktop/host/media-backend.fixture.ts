import type { PluginBackendFactory } from '@drawloom/desktop-host';
import { createTextController } from './text-controller.js';
const backend: PluginBackendFactory = async ({ capabilities, configuration }) => {
  const { store, assets } = capabilities.host!;
  const controller = await createTextController(store);
  const mov = typeof configuration === 'object' && configuration !== null && 'mov' in configuration && configuration.mov === true;
  const asset = await assets.put(mov ? new Uint8Array([0,0,0,20,102,116,121,112,113,116,32,32]) : new Uint8Array(17 * 1024 * 1024), mov ? 'video/quicktime' : 'video/mp4');
  await controller.observeArtifact({ operationId: 'media-operation', asset });
  return { contributions: { workbenches: [{ id: 'media-example', title: 'Media example', description: 'Public synthetic media fixture', tools: [], skills: [] }] },
    controllers: new Map([['media-example', controller]]), dispose: async () => {} };
};
export default backend;
