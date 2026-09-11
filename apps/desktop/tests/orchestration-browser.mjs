// Opt-in rendered presentation regression. HTTP fixtures are not live Temporal evidence.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_INPUT_TEST_URL, DRAWLOOM_INPUT_TEST_TOKEN, DRAWLOOM_UI_EVIDENCE_DIR } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_INPUT_TEST_URL || !DRAWLOOM_INPUT_TEST_TOKEN || !DRAWLOOM_UI_EVIDENCE_DIR) throw Error('Supply a disposable host, browser runtime and evidence directory.');
await mkdir(DRAWLOOM_UI_EVIDENCE_DIR, { recursive: true });
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE });
const url = new URL(DRAWLOOM_INPUT_TEST_URL);
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, colorScheme: width === 390 ? 'dark' : 'light' });
    await context.addCookies([{ name: 'drawloom_' + url.port, value: DRAWLOOM_INPUT_TEST_TOKEN, url: url.origin }]);
    const page = await context.newPage(); const errors = [], commands = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('400 (Bad Request)')) errors.push(message.text()); });
    let run = { runId: 'run', identity: 'documents-1', workflow: 'Prepare documents', version: '1', status: 'running', cancellationRequested: false,
      pendingInputs: ['review'], childRunIds: [], unresolvedEffects: [], stepsTruncated: true,
      steps: [{ stepId: 'Inspect references', attempts: 1, status: 'completed' }] };
    await page.route('**/api/orchestration/owners?*', route => route.fulfill({ json: [{ installationId: 'documents', title: 'Documents', readiness: { status: 'ready' } }] }));
    await page.route('**/api/orchestration/runs?*', route => route.fulfill({ json: { runs: [run] } }));
    await page.route('**/api/orchestration/steps?*', route => route.fulfill({ json: new URL(route.request().url()).searchParams.has('cursor')
      ? { steps: [{ stepId: 'Assemble document', attempts: 2, status: 'completed' }] }
      : { steps: [{ stepId: 'Prepare reference', attempts: 1, status: 'completed' }], cursor: 'second' } }));
    await page.route('**/api/orchestration/runs', async route => {
      const command = route.request().postDataJSON(); commands.push(command);
      if (command.action === 'respond') return route.fulfill({ status: 400, json: { error: 'Check the requested JSON and submit only if the input is still pending.' } });
      run = { ...run, cancellationRequested: true };
      return route.fulfill({ json: run });
    });
    assert.equal((await page.goto(url.origin))?.status(), 200);
    await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
    assert.equal(await page.title(), 'Drawloom — Local workbench');
    if (width < 768) await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const workflows = page.getByRole('region', { name: 'Local workflows', exact: true });
    await workflows.getByRole('button', { name: 'Documents', exact: true }).click();
    await workflows.getByText('Waiting for input', { exact: true }).waitFor();
    await workflows.getByRole('button', { name: 'Browse all steps' }).click();
    await workflows.getByText('Prepare reference', { exact: true }).waitFor();
    await workflows.getByRole('button', { name: 'More steps', exact: true }).click();
    await workflows.getByText('Assemble document', { exact: true }).waitFor();
    assert.equal(await workflows.getByText('Prepare reference', { exact: true }).count(), 0);
    await workflows.getByRole('textbox', { name: 'review', exact: true }).fill('{"keep":true}');
    await workflows.getByRole('button', { name: 'Submit input' }).click();
    await workflows.getByRole('alert').waitFor();
    assert.equal(await workflows.getByRole('textbox', { name: 'review', exact: true }).count(), 1);
    await workflows.getByRole('button', { name: 'Cancel run' }).click();
    await workflows.getByText('Cancellation requested', { exact: true }).waitFor();
    assert.equal(await workflows.getByRole('textbox', { name: 'review', exact: true }).count(), 0);
    assert.deepEqual(commands.map(command => command.action), ['respond', 'cancel']);
    assert.ok(commands.every(command => command.projectId && command.installationId === 'documents' && command.runId === 'run'));
    assert.equal(await page.locator('vite-error-overlay').count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await workflows.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DRAWLOOM_UI_EVIDENCE_DIR}/workflow-${width}.png` });
    await context.close();
  }
  console.log('Workflow presentation: desktop/light and mobile/dark passed; input error, steps, cancellation and no stale controls.');
} finally { await browser.close(); }
