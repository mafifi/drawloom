/** Opt-in native discovery through the real desktop. Never submits a prompt. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  pathToFileURL(process.env.DRAWLOOM_PLAYWRIGHT_PATH).href
);
const url = (await readFile(process.env.DRAWLOOM_PROOF_LOG, 'utf8')).match(
  /http:\/\/127\.0\.0\.1:\d+\/bootstrap\?token=[a-f0-9]+/,
)?.[0];
assert.ok(url, 'Disposable startup log required');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  colorScheme: 'dark',
});
const errors = [],
  commands = [],
  responses = [];
let start = 0;
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (new URL(request.url()).pathname === '/api/command')
    commands.push(request.postDataJSON()?.kind);
});
page.on('response', async (response) => {
  if (new URL(response.url()).pathname !== '/api/discovery' || !start) return;
  const data = await response.json();
  responses.push({
    ms: performance.now() - start,
    count: data.entries?.length,
    apps: data.entries?.filter((e) => e.kind === 'app').length,
    categories: data.categories?.map((c) => ({
      kind: c.kind,
      status: c.status,
    })),
    next: Boolean(data.nextCursor),
  });
});
try {
  await page.goto(url);
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  assert.equal(await page.title(), 'Drawloom — Local workbench');
  await page.getByLabel('Agent provider', { exact: true }).click();
  start = performance.now();
  await page.getByRole('option', { name: 'Codex', exact: true }).click();
  await page
    .getByRole('button', { name: 'Choose a skill', exact: true })
    .click();
  await page.getByRole('region', { name: 'Skill suggestions' }).waitFor();
  await page
    .locator('[data-slot="command-item"]')
    .first()
    .waitFor({ timeout: 5000 });
  const firstSkillVisibleMs = performance.now() - start;
  // Inventory only: no skill or app is selected and no message is sent.
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'Choose integrations and context',
      exact: true,
    })
    .click();
  await page
    .getByRole('button', { name: 'Load more apps', exact: true })
    .waitFor({ timeout: 40_000 });
  const appsReadyMs = performance.now() - start;
  await page
    .getByRole('button', { name: 'Load more apps', exact: true })
    .click();
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (b) => b.textContent === 'Load more apps' && !b.disabled,
    ),
  );
  const deadline = Date.now() + 10_000;
  while (!responses.some((r) => r.apps === 200) && Date.now() < deadline)
    await page.waitForTimeout(100);
  assert.ok(
    responses.some((r) => r.apps === 200),
    'Explicit app page appeared through real host',
  );
  assert.ok(
    responses.some(
      (r) => r.ms < 2000 && r.categories?.some((c) => c.status === 'loading'),
    ),
    'Registered catalogue responded before native discovery',
  );
  assert.deepEqual(commands, ['create_conversation']);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      { firstSkillVisibleMs, appsReadyMs, commands, errors, responses },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
