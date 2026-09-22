import assert from 'node:assert/strict';
import { createLocalTemporalManager } from '../dist/index.js';
const manager = createLocalTemporalManager({ dataDirectory: process.argv[2], runtimeDirectory: process.argv[3] });
try {
  const registration = await manager.prepare({ projectId: 'compiled', installationId: 'synthetic', packageDirectory: process.argv[4], entrypoint: 'workflow.mjs' });
  await registration.attach(registration.registry.tasks.map(task => ({ id: task.id, version: task.version, run: input => input * 2 })));
  const workflow = registration.registry.workflows.find(value => value.id === 'active');
  const run = await registration.orchestrator.start('actual-compiled-request', workflow, 4);
  assert.equal(await registration.orchestrator.result(run), 8);
  assert.equal((await registration.orchestrator.get(run)).status, 'completed');
  console.log('COMPILED_RUNTIME_OK');
} finally { await manager.close(); }
