import { createRequire } from 'node:module';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });
const root = await mkdtemp(join(tmpdir(), 'drawloom-aspire-viewer-'));
try {
  await page.goto(process.env.ASPIRE_BROWSER_URL);
  await page.waitForTimeout(1500);
  const section = process.env.ASPIRE_SECTION ?? 'Traces';
  if (!['Traces', 'Structured logs', 'Metrics'].includes(section)) throw Error('Unknown viewer section');
  await page.getByRole('link', { name: section, exact: true }).click();
  await page.waitForTimeout(1000);
  if (section === 'Traces' && process.env.ASPIRE_TRACE_ID) {
    const detail = new URL('/traces/detail/' + process.env.ASPIRE_TRACE_ID, page.url());
    if (process.env.ASPIRE_SPAN_ID) detail.searchParams.set('spanId', process.env.ASPIRE_SPAN_ID);
    await page.goto(detail.href);
    await page.waitForTimeout(1000);
  }
  if (section === 'Metrics') {
    await page.locator('fluent-select[aria-label="Select a resource"]').click();
    await page.getByRole('option', { name: 'drawloom.benchmark', exact: true }).click();
    await page.locator('fluent-select[aria-label="Duration"]').click();
    await page.getByRole('option', { name: 'Last 3 hours', exact: true }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('treeitem', { name: 'operation.duration', exact: true }).click();
    await page.waitForTimeout(1000);
  }
  if (section === 'Structured logs') {
    await page.locator('fluent-select[aria-label="Select a resource"]').click();
    await page.getByRole('option', { name: 'drawloom.benchmark', exact: true }).click();
    await page.locator('input[placeholder="Filter..."]').fill('operation.completed');
    await page.waitForTimeout(1000);
  }
  console.log('CONTROLS', await page.locator('input, select, fluent-combobox, fluent-select').evaluateAll(items => items.map(e => ({ tag: e.tagName, label: e.getAttribute('aria-label'), placeholder: e.getAttribute('placeholder'), text: e.textContent?.slice(0, 180) }))));
  console.log((await page.locator('body').innerText()).slice(0, 4000));
  console.log((await page.getByRole('link').evaluateAll(links => links.map(a => ({ text: a.textContent, href: a.getAttribute('href') })))).slice(0, 25));
  await page.screenshot({ path: join(root, 'viewer.png') });
  console.log(root);
} finally { await browser.close(); }
