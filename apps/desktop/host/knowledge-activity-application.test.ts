import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createManagedLocalKnowledgeClient } from '@drawloom/local-knowledge-runtime';
import { createDesktopApplication } from './application.js';
import { serveDesktop } from './server.js';
import { createKnowledgeActivityFixture } from '../tests/knowledge-activity-fixture.js';

test('authenticated Activity uses the composed Nightloom registration without a selected project and rejects command/scope forgery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-knowledge-activity-'));
  const fixture = createKnowledgeActivityFixture();
  const service = createManagedLocalKnowledgeClient({ root: join(root, 'knowledge'), workingDirectory: root });
  const app = await createDesktopApplication(root, { knowledge: { service }, orchestration: { manager: async () => fixture.manager } });
  const host = serveDesktop(app, resolve('apps/desktop/build'));
  try {
    expect((await app.snapshot()).selectedProjectId).toBeUndefined();
    expect(await app.knowledgeActivityOwner()).toMatchObject({ readiness: { status: 'unavailable' } });
    expect(fixture.calls.prepared).toBe(0);
    await app.restore();
    // This existing control awaits composition; browsing itself never prepares.
    await app.knowledgeCommand({ action: 'pause', paused: true });
    expect(fixture.calls).toMatchObject({ prepared: 1, attached: 1, started: 0 });
    const base = host.origin + '/api/knowledge-activity/';
    expect((await fetch(base + 'runs')).status).toBe(401);
    const boot = await fetch(host.url, { redirect: 'manual' });
    const headers = { cookie: boot.headers.get('set-cookie')!.split(';')[0]!, origin: host.origin, 'Content-Type': 'application/json' };
    expect((await fetch(base + 'owner', { headers })).status).toBe(200);
    const listed = await fetch(base + 'runs?limit=1', { headers });
    expect(listed.status).toBe(200);
    const page = await listed.json();
    expect(page).toMatchObject({ cursor: 'older', runs: [{ displayStatus: 'Needs attention' }] });
    expect(JSON.stringify(page)).not.toContain('SENTINEL');
    for (const suffix of ['runs?projectId=forged', 'runs?installationId=forged', 'runs?capabilityId=forged', 'runs?limit=101', 'owner?projectId=forged', 'run?runId=unknown', 'steps?runId=unknown']) {
      const response = await fetch(base + suffix, { headers }); expect(response.status).toBe(400); expect(await response.text()).not.toContain('SENTINEL');
    }
    for (const path of ['owner', 'runs', 'run', 'steps']) for (const method of ['POST', 'PUT', 'DELETE']) expect((await fetch(base + path, { method, headers, body: '{}' })).status).toBe(405);
    for (const path of ['run', 'steps']) expect((await fetch(base + path + '?runId=synthetic-nightloom-run&limit=1', { headers })).status).toBe(200);
    expect((await fetch(base + 'steps?runId=synthetic-nightloom-run&cursor=later-steps&limit=1', { headers })).status).toBe(200);
    const plugin = host.origin + '/api/orchestration/runs';
    expect((await fetch(plugin + '?projectId=forged&installationId=knowledge-maintenance', { headers })).status).toBe(400);
    expect((await fetch(plugin, { method: 'POST', headers, body: JSON.stringify({ action: 'cancel', projectId: 'forged', installationId: 'knowledge-maintenance', runId: 'synthetic-nightloom-run' }) })).status).toBe(400);
    expect(fixture.calls).toMatchObject({ prepared: 1, attached: 1, started: 0 });
  } finally { await host.close(); await rm(root, { recursive: true, force: true }); }
});
