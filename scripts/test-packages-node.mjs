import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { HistoryEntrySchema, HistoryPageOptionsSchema, HistoryReadBatchSchema } from '../packages/observability/conversation-history/dist/index.js';
import { conversationHistoryConformance } from '../packages/observability/conversation-history/dist/conformance.js';
import { toolConformance } from "../packages/tools/tools/dist/conformance.js";
import { agentConformance } from "../packages/agent/agent/dist/conformance.js";
import { pluginConformance } from "../packages/plugins/plugins/dist/conformance.js";
import { hostConformance } from "../packages/host/host/dist/conformance.js";
import { createLocalToolGateway } from "../packages/tools/local-tools/dist/index.js";
import {
  syntheticAgentFixture,
  codexAgentFixture,
} from "./agent-conformance-fixtures.mjs";
import { createPluginRegistry } from "../packages/plugins/startup-plugins/dist/index.js";
import {
  createNodeJsonStore,
  createNodeAssetStore,
  createStdioTransport,
} from "../packages/host/node-host/dist/index.js";
await toolConformance(createLocalToolGateway);
assert.equal(typeof conversationHistoryConformance, 'function');
assert.equal(HistoryPageOptionsSchema.safeParse({ limit: 201 }).success, false);
assert.equal(HistoryReadBatchSchema.safeParse({ entries: [], checkpoints: [], hasOlder: false }).success, true);
assert.equal(HistoryEntrySchema.safeParse({ id: 'portable', position: [-1, 0], role: 'user', text: 'Node contract smoke', assets: [], state: 'complete' }).success, true);
await pluginConformance(createPluginRegistry);
await agentConformance(syntheticAgentFixture);
await agentConformance(codexAgentFixture);
await hostConformance(async () => {
  const root = await mkdtemp(join(tmpdir(), "drawloom-node-"));
  return {
    store: createNodeJsonStore(join(root, "store")),
    assets: createNodeAssetStore(join(root, "assets")),
    transport: createStdioTransport({
      command: process.execPath,
      args: [
        "-e",
        `let b='';process.stdin.on('data',d=>{b+=d;let i;while((i=b.indexOf('\\n'))>=0){let m=JSON.parse(b.slice(0,i));b=b.slice(i+1);process.stdout.write(JSON.stringify({id:m.id,result:m.params})+'\\n')}})`,
      ],
    }),
    close: () => rm(root, { recursive: true, force: true }),
  };
});
console.log(
  "Node shared conformance: tools, synthetic agent, Codex agent, plugins, host passed; portable history schema/export smoke passed (SQLite remains Bun-only)",
);
for (const file of [
  'packages/knowledge/sqlite-knowledge/sqlite-knowledge.node-check.ts',
  'packages/knowledge/local-embeddings/mlx-worker.node-check.mjs',
  'packages/knowledge/local-knowledge-runtime/runtime.node-check.ts',
  'packages/knowledge/local-knowledge-runtime/semantic.node-check.ts',
]) {
  const checked = spawnSync(process.execPath, ['--test', file], { stdio: 'inherit' });
  if (checked.error) throw checked.error;
  assert.equal(checked.status, 0, `Node knowledge check failed: ${file}`);
}
