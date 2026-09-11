import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createDesktopApplication } from './application.js';
import { serveDesktop } from './server.js';

test('workflow HTTP is authenticated, bounded, scope validated and separate from long operator work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-workflow-http-'));
  const app = await createDesktopApplication(root);
  const run = { runId: 'run', identity: 'request', workflow: 'documents', version: '1', status: 'running' as const, steps: [],
    pendingInputs: ['review'], childRunIds: [], unresolvedEffects: [], cancellationRequested: false, stepsTruncated: false };
  const seen: unknown[] = [];
  let release!: () => void, entered!: () => void;
  const enteredCommand = new Promise<void>(resolve => { entered = resolve; });
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const server = serveDesktop({ ...app,
    workflowOwners: async id => { seen.push(id); return [{ installationId: 'i', title: 'Documents', readiness: { status: 'ready' } }]; },
    workflowRuns: async input => { seen.push(input); return { runs: [run] }; },
    workflowSteps: async input => { seen.push(input); return { steps: [{ stepId: 'one', attempts: 1, status: 'completed' }] }; },
    workflowCommand: async input => { seen.push(input); return { ...run, cancellationRequested: true }; },
    command: async () => { entered(); await waiting; return app.snapshot(); },
  }, resolve('apps/desktop/build'));
  try {
    const url = server.origin + '/api/orchestration/runs';
    expect((await fetch(url + '?projectId=p&installationId=i')).status).toBe(401);
    const boot = await fetch(server.url, { redirect: 'manual' });
    const headers = { cookie: boot.headers.get('set-cookie')!.split(';')[0]!, origin: server.origin, 'Content-Type': 'application/json' };
    const command = JSON.stringify({ action: 'cancel', projectId: 'p', installationId: 'i', runId: 'run' });
    expect((await fetch(url, { method: 'POST', headers: { ...headers, origin: 'https://evil.invalid' }, body: command })).status).toBe(403);
    expect((await fetch(url + '?projectId=p&installationId=i&limit=101', { headers })).status).toBe(400);
    expect((await fetch(url + '?projectId=p&installationId=i&limit=20', { headers })).status).toBe(200);
    expect((await fetch(server.origin + '/api/orchestration/steps?projectId=p&installationId=i&runId=run&limit=20', { headers })).status).toBe(200);
    const before = seen.length;
    expect((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action: 'respond', projectId: 'p', installationId: 'i', runId: 'run', requestId: 'review', value: 'x'.repeat(65536) }) })).status).toBe(413);
    expect(seen.length).toBe(before);
    const long = fetch(server.origin + '/api/command', { method: 'POST', headers, body: '{}' });
    await enteredCommand;
    const cancelled = await fetch(url, { method: 'POST', headers, body: command, signal: AbortSignal.timeout(1500) });
    expect(cancelled.status).toBe(200); expect(await cancelled.json()).toMatchObject({ runId: 'run', cancellationRequested: true });
    release(); await long;
  } finally { release(); await server.close(); await rm(root, { recursive: true, force: true }); }
});
