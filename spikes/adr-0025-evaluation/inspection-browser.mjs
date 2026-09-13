// Opt-in rendered integration test. Uses an installed package in the real host.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [metadataPath, mode = 'exercise'] = process.argv.slice(2);
if (!metadataPath) throw Error('Supply the isolated desktop.json receipt.');
if (!process.env.DRAWLOOM_PLAYWRIGHT_PATH) throw Error('Supply an already installed Playwright runtime path.');
const { chromium } = await import(pathToFileURL(process.env.DRAWLOOM_PLAYWRIGHT_PATH).href);
const fixture = JSON.parse(await readFile(metadataPath, 'utf8'));
const sourceDigest = async () => createHash('sha256').update(await readFile(join(fixture.packageRoot, 'inspection.json'))).digest('hex');
const sourceBefore = await sourceDigest();
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light', reducedMotion: 'reduce' });
const url = new URL(fixture.url);
await context.addCookies([{ name: 'drawloom_' + url.port, value: url.searchParams.get('token'), url: fixture.origin }]);
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const errors = [], consoleErrors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
const marker = 'Inspection QA: the missing source is correctly identified.';
const report = { browser: await browser.version(), browserPath: 'Playwright with installed Chrome; Browser skill not available', mode, errors, consoleErrors, checks: {}, screenshots: [] };
const frameSelector = `iframe[title=${JSON.stringify(fixture.title)}]:not([inert])`;
const frame = () => page.frameLocator(frameSelector);
async function openApp() {
  await page.getByRole('button', { name: 'Toggle artifact pane', exact: true }).waitFor();
  const open = page.getByRole('button', { name: `Open ${fixture.title}`, exact: true });
  if (!(await open.isVisible())) await page.getByRole('button', { name: 'Toggle artifact pane', exact: true }).click();
  await open.click();
  await frame().getByRole('navigation', { name: 'Evaluation cases', exact: true }).waitFor();
}
async function selectRegression() {
  const selected = frame().getByRole('navigation', { name: 'Evaluation cases' }).getByRole('button').filter({ hasText: 'synthetic-regression' }).first();
  await selected.focus();
  await page.keyboard.press('Enter');
  await frame().getByRole('heading', { name: 'Comparison', exact: true }).waitFor();
}
try {
  assert.equal((await page.goto(fixture.origin))?.status(), 200);
  await openApp();
  assert.equal(await page.title(), 'Drawloom — Local workbench');
  report.checks.identityAndMeaningfulContent = true;
  await selectRegression();
  await frame().getByText('required-chain-top-k', { exact: true }).first().waitFor();
  report.checks.perCaseFindingsAndComparison = true;
  if (mode === 'exercise') {
    await frame().getByRole('button', { name: 'Save feedback', exact: true }).click();
    await frame().getByText('Enter an attribution label before saving.', { exact: false }).waitFor();
    await frame().getByLabel('Attribution', { exact: true }).fill('QA operator (synthetic label)');
    await frame().getByLabel('Correction', { exact: true }).fill(marker);
    await frame().getByRole('button', { name: 'incorrect', exact: true }).click();
    await frame().getByRole('button', { name: 'Save feedback', exact: true }).focus();
    await page.keyboard.press('Enter');
    await frame().getByText('Feedback saved. It did not change scores or accept work.', { exact: true }).waitFor();
    report.checks.validatedKeyboardSave = true;
    await frame().getByRole('button', { name: 'Reload findings', exact: true }).click();
  }
  await frame().getByText(marker, { exact: true }).waitFor();
  report.checks.persistedFeedbackVisible = true;
  // Historical CPU answer modes must remain distinct from current MLX retrieval.
  const modes = frame().getByRole('group', { name: 'Comparison modes', exact: true });
  await modes.getByRole('button', { name: 'qwen3-embedding-0.6b', exact: true }).click();
  const historicalCases = frame().getByRole('navigation', { name: 'Evaluation cases', exact: true }).getByRole('button');
  assert.equal(await historicalCases.count(), 24);
  await historicalCases.first().focus();
  await page.keyboard.press('Enter');
  await frame().getByRole('heading', { name: 'Saved output', exact: true }).waitFor();
  await frame().getByText('grounded-answer-heuristic', { exact: true }).first().waitFor();
  assert.match(await historicalCases.first().innerText(), /retained-historical-answer/);
  await modes.getByRole('button', { name: 'All modes', exact: true }).click();
  await selectRegression();
  await frame().getByText(marker, { exact: true }).waitFor();
  report.checks.historicalModeAndCaseIsolation = true;
  const feedbackFields = await frame().getByLabel('Correction', { exact: true }).count();
  assert.equal(feedbackFields, 1);
  for (const [theme, width, height] of [['light', 1440, 1000], ['dark', 1440, 1000], ['dark', 390, 844]]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    if (width < 1050) {
      // The existing shell remounts the artifact surface at its breakpoint.
      // Reopen explicitly and recover saved feedback, not transient selection.
      await page.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).click();
      await selectRegression();
      await frame().getByText(marker, { exact: true }).waitFor();
    }
    await frame().getByRole('heading', { name: 'Comparison', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const element = await page.locator(frameSelector).elementHandle();
    const actualFrame = await element.contentFrame();
    assert.ok(await actualFrame.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'App must not overflow horizontally');
    const path = join(fixture.root, `inspection-${mode}-${theme}-${width}.png`);
    await page.screenshot({ path, fullPage: false, animations: 'disabled' });
    report.screenshots.push(path);
  }
  report.checks.themesNarrowAndReducedMotion = true;
  assert.equal(await page.locator('vite-error-overlay').count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []);
  assert.equal(await sourceDigest(), sourceBefore, 'Feedback must not alter the installed results');
  report.checks.sourceResultsUnchanged = true;
  report.checks.noFrameworkOverlayOrConsoleErrors = true;
  await writeFile(join(fixture.root, `browser-${mode}.json`), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({ path: join(fixture.root, `inspection-${mode}-failure.png`), fullPage: false });
  await writeFile(join(fixture.root, `browser-${mode}-failure.json`), JSON.stringify({ ...report, message: String(error) }, null, 2), { mode: 0o600 });
  throw error;
} finally { await browser.close(); }
