import { beforeAll, describe, expect, test } from 'bun:test';
import { plugin } from 'bun';
import { readFile } from 'node:fs/promises';
import { compile, compileModule } from 'svelte/compiler';
import { render } from 'svelte/server';

plugin({ name: 'workflow-run-server-components', setup(build) {
  build.onLoad({ filter: /\.svelte$/ }, async ({ path }) => ({ contents: compile(await readFile(path, 'utf8'), { filename: path, generate: 'server' }).js.code, loader: 'js' }));
  build.onLoad({ filter: /\.svelte\.js$/ }, async ({ path }) => ({ contents: compileModule(await readFile(path, 'utf8'), { filename: path, generate: 'server' }).js.code, loader: 'js' }));
} });

let WorkflowRun;
beforeAll(async () => { ({ WorkflowRun } = await import('@drawloom/ui')); });
const base = { runId: 'run-a', identity: 'request-a', workflow: 'sample', version: '1', status: 'running', cancellationRequested: false, childRunIds: [], unresolvedEffects: [], pendingInputs: [], stepsTruncated: false, steps: [] };
const markup = (run = {}, extra = {}) => render(WorkflowRun, { props: { run: { ...base, ...run }, title: 'Prepare documents', ...extra } }).body;

describe('WorkflowRun controlled presentation', () => {
  test('exports a real reusable component', () => { expect(WorkflowRun).toBeTypeOf('function'); });
  test('shows logical step names while retaining exact identity as a tooltip', () => {
    const html = markup({ steps: [{ stepId: 'run-a/prepare', attempts: 1, status: 'completed' }] });
    expect(html).toContain('title="run-a/prepare"');
    expect(html).not.toContain('>run-a/prepare<');
    expect(html).toContain('>prepare<');
  });
  test('step disclosure uses one interactive trigger, not nested buttons', () => {
    const html = markup({ steps: [{ stepId: 'prepare', attempts: 1, status: 'completed' }] });
    expect(html.match(/<button\b/g)).toHaveLength(1);
  });
  test('shows waiting and attempts without exposing task payloads', () => {
    const html = markup({ pendingInputs: ['review'], steps: [{ stepId: 'prepare', attempts: 2, status: 'completed', result: 'PRIVATE_RESULT_SENTINEL' }] });
    expect(html).toContain('Waiting for input');
    expect(html).toContain('prepare');
    expect(html).toContain('2 attempts');
    expect(html).not.toContain('PRIVATE_RESULT_SENTINEL');
  });
  test('reports uncertainty separately even when the workflow failed', () => {
    const html = markup({ status: 'failed', unresolvedEffects: ['prepare'] });
    expect(html).toContain('Failed');
    expect(html).toContain('Outcome needs checking');
    expect(html).toContain('prepare');
  });
  test('cancel is explicit and unavailable after request or completion', () => {
    let calls = 0;
    const oncancel = () => { calls++; };
    expect(markup({}, { oncancel })).toContain('Cancel run');
    expect(calls).toBe(0);
    const requested = markup({ cancellationRequested: true }, { oncancel });
    expect(requested).toContain('Cancellation requested');
    expect(requested).not.toContain('Cancel run');
    expect(markup({ status: 'completed' }, { oncancel })).not.toContain('Cancel run');
  });
  test('pending cancellation feedback belongs to its button and bounded summaries stay explicit', () => {
    const html = markup({ stepsTruncated: true }, { oncancel() {}, cancelPending: true });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Cancelling');
    expect(html).toContain('More steps are available');
  });
});
