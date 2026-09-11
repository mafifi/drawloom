import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDesktopApplication } from '../host/application.ts';
import { createInstallationStore } from '../host/plugin-installations.ts';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createLocalTemporalManager } from '@drawloom/temporal-orchestration';
import { command } from '../../../packages/orchestration/temporal-orchestration/dist/processes.js';

// This capture is at the application composition root: prepare/attach/dispatch
// and restoration all remain real. The test never supplies or calls handlers.
const base = await realpath(await mkdtemp(join(tmpdir(), 'drawloom-installed-temporal-')));
const root = join(base, 'data'), pkg = join(base, 'package'), directory = join(base, 'project');
let app;
let registration;
const preparedOwners = [];
async function open() {
  registration = undefined;
  return createDesktopApplication(root, { orchestration: { manager: async () => {
    const manager = createLocalTemporalManager({ dataDirectory: root });
    return { ...manager, async prepare(owner) {
      preparedOwners.push(owner);
      registration = await manager.prepare(owner);
      return registration;
    } };
  } } });
}
async function waitForInput(run) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const snapshot = await registration.orchestrator.get(run);
    if (snapshot.pendingInputs.length) return snapshot;
    if (['failed', 'cancelled'].includes(snapshot.status)) throw Error(`Unexpected run status: ${snapshot.status}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw Error('Installed workflow did not reach its input wait');
}
try {
  await mkdir(pkg); await mkdir(directory);
  for (const [source, output] of [['installed-workflow.mjs', 'workflows.mjs'], ['installed-backend.mjs', 'backend.mjs']]) {
    await command('bun', ['build', resolve('packages/orchestration/temporal-orchestration/fixtures', source), '--target', 'browser', '--outfile', join(pkg, output)]);
  }
  await writeFile(join(pkg, 'plugin.json'), JSON.stringify({ $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'specimen-catalog',
    extensions: { 'io.github.mafifi.drawloom': { version: 1, backend: { entrypoint: './backend.mjs' }, workflows: { entrypoint: './workflows.mjs' },
      requires: [{ kind: 'capability', id: 'host' }], optional: [{ kind: 'capability', id: 'orchestration' }] } },
  }));
  const installed = await createInstallationStore(createNodeJsonStore(join(root, 'state')));
  const installationId = await installed.add(pkg);
  await installed.configure(installationId, { enabled: true, trustedBackend: true, servers: [], configuration: {} });
  app = await open();
  const snapshot = await app.command({ kind: 'add_project', directory });
  const projectId = snapshot.selectedProjectId;
  assert.ok(projectId);
  assert.equal(registration?.readiness().status, 'ready', 'The installed desktop loader must attach actual workflow handlers');
  const state = createNodeJsonStore(join(root, 'projects', projectId, 'state'));
  const stored = key => state.get(JSON.stringify(['plugin', installationId, key]));
  const run = await registration.orchestrator.start('specimen-001', registration.registry.workflows[0], '  moss  ');
  const waiting = await waitForInput(run);
  assert.equal(waiting.status, 'running');
  assert.equal(await stored('counter'), 1);
  assert.equal(await stored('activations'), 1);
  assert.equal((await app.snapshot()).conversations.length, 0);
  await app.close(); app = undefined;

  app = await open();
  await app.restore();
  assert.equal(registration?.readiness().status, 'ready');
  assert.deepEqual(preparedOwners.map(owner => [owner.projectId, owner.installationId, owner.packageDirectory]), [[projectId, installationId, pkg], [projectId, installationId, pkg]]);
  assert.equal(await stored('activations'), 2);
  const restored = await waitForInput(run);
  assert.deepEqual(restored.pendingInputs, waiting.pendingInputs);
  assert.equal(await stored('counter'), 1);
  await registration.orchestrator.respond(run, restored.pendingInputs[0], true);
  assert.equal(await registration.orchestrator.result(run), 'MOSS:confirmed');
  assert.equal((await registration.orchestrator.get(run)).status, 'completed');
  assert.equal(await stored('counter'), 1);
  assert.equal((await app.snapshot()).conversations.length, 0);
  console.log('INSTALLED_HOST_TEMPORAL_OK');
} finally { await app?.close(); await rm(base, { recursive: true, force: true }); }
