/** Use the already available Playwright runtime; do not install browser packages. */
import { createRequire } from 'node:module';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const root = await mkdtemp(join(tmpdir(), 'drawloom-otel-browser-'));
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [], telemetry = [], requests = [], readiness = [];
page.on('request', r => { if (r.url().includes('/api/command')) requests.push(r.headers().traceparent); });
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.url().includes('/api/telemetry/v1/traces')) telemetry.push({ status: r.status() }); });
try {
  await page.goto(process.env.DRAWLOOM_BROWSER_URL);
  await page.waitForTimeout(1000);
  console.log(JSON.stringify({ url: page.url(), errors, body: (await page.locator('body').innerText()).slice(0, 3000), inputs: await page.locator('textarea').evaluateAll(elements => elements.map(e => ({ placeholder: e.placeholder }))) }));
  await page.getByPlaceholder('Ask or make a change…').waitFor();
  console.log((await page.locator('body').innerText()).slice(0, 8000));
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.getByPlaceholder('Ask or make a change…').fill(`A synthetic ${theme} draft for diagnostic proof.`);
    const started = performance.now();
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.locator('.user-message').filter({ hasText: `A synthetic ${theme} draft for diagnostic proof.` }).waitFor();
    await page.waitForFunction(() => document.querySelector('textarea')?.value === '');
    await page.getByText('Saved your text as a draft.', { exact: false }).first().waitFor();
    readiness.push({ theme, visibleMs: performance.now() - started });
    await page.screenshot({ path: join(root, `desktop-${theme}.png`) });
  }
  await page.waitForTimeout(1500);
  const identity = { url: page.url(), title: await page.title(), text: await page.locator('body').innerText() };
  await writeFile(join(root, 'browser.json'), JSON.stringify({ identity, errors, telemetry, requests, readiness }, null, 2));
  console.log(JSON.stringify({ root, errors, telemetry, requests, readiness, title: identity.title }));
  if (errors.length || !telemetry.some(r => r.status === 204)) throw Error('Browser telemetry proof did not pass');
} finally { await browser.close(); }
