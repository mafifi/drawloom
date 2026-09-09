import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  "Node shared conformance: tools, synthetic agent, Codex agent, plugins, host passed",
);
