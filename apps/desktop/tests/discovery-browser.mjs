// Optional synthetic discovery regression against a disposable desktop.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_INPUT_TEST_URL, DRAWLOOM_INPUT_TEST_TOKEN } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_INPUT_TEST_URL || !DRAWLOOM_INPUT_TEST_TOKEN) throw Error('Set Playwright and disposable host URL/token.');
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
console.log('playwright imported');
const browser = await chromium.launch({ headless: true, executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE });
console.log('browser launched');
const url = new URL(DRAWLOOM_INPUT_TEST_URL);
const entries = Array.from({ length: 4301 }, (_, index) => ({ id: 'app:' + index, origin: 'test', kind: 'app', name: 'Discovery test app ' + index, description: index === 4300 ? 'Beyond initial page' : '', scope: 'workspace', availability: 'available', selectable: true, revision: 'r1' }));
const screenshots = [];

async function check(viewport, colorScheme, label) {
  console.log('checking ' + label);
  const context = await browser.newContext({ viewport, colorScheme });
  await context.addCookies([{ name: 'drawloom_' + url.port, value: DRAWLOOM_INPUT_TEST_TOKEN, url: url.origin }]);
  const page = await context.newPage();
  const errors = [];
  let catalogue = entries;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/discovery?*', route => route.fulfill({ json: { entries: catalogue, categories: [], experimentalPluginDiscovery: false } }));
  try {
    const response = await page.goto(url.href);
    console.log(label + ' navigated ' + response?.status());
    assert.equal(response?.status(), 200, `desktop navigation failed: ${response?.status()}`);
    const text = page.getByRole('textbox', { name: 'Message', exact: true });
    await text.waitFor({ timeout: 10_000 }).catch(async error => {
      throw new Error(`${error.message}\npage errors: ${JSON.stringify(errors)}\nbody: ${(await page.locator('body').innerText()).slice(0, 1000)}`);
    });
    console.log(label + ' composer ready');
    assert.equal(await page.title(), 'Drawloom — Local workbench');
    assert.equal(await page.getByRole('dialog').count(), 0);

    await page.getByRole('button',{name:'Toggle artifact pane',exact:true}).click();
    if (viewport.width <= 1050) {
      await page.getByRole('button',{name:/Back to conversation/}).waitFor();
      assert.equal(await text.isVisible(),false);
      assert.equal(await page.getByRole('dialog').count(),0);
      await page.getByRole('button',{name:/Back to conversation/}).click();
    } else {
      await page.getByRole('complementary',{name:'Artifact and details'}).waitFor();
      assert.equal(await text.isVisible(),true);
      await page.getByRole('button',{name:'Toggle artifact pane',exact:true}).click();
    }

    if (viewport.width < 768) await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const openedAt = Date.now();
    await page.getByRole('button', { name: 'Plugins', exact: true }).click();
    await page.getByRole('heading', { name: 'Plugins', exact: true }).waitFor();
    console.log(label + ' plugins ready');
    await page.getByText('Showing 100 of 4301 matching contributions.', { exact: true }).waitFor();
    const catalogueMs = Date.now() - openedAt;
    assert.ok(catalogueMs < 5000, `Bounded catalogue presentation took ${catalogueMs}ms`);
    console.log(label + ' catalogueMs=' + catalogueMs);
    await page.screenshot({path:`/tmp/drawloom-adr0016-${label}-plugins.png`});
    assert.equal(await page.getByRole('complementary', { name: 'Artifact and details' }).count(), 0);
    await page.getByRole('button', { name: 'Load more contributions', exact: true }).click();
    await page.getByText('Showing 200 of 4301 matching contributions.', { exact: true }).waitFor();
    await page.getByLabel('Find plugins, apps, tools and skills', { exact: true }).fill('Beyond initial page');
    await page.getByText('Showing 1 of 1 matching contributions.', { exact: true }).waitFor();
    await page.getByRole('button', { name: /Back to conversation/ }).click();
    console.log(label + ' inventory passed');

    await text.fill('Use @Beyond');
    await page.getByRole('listbox', { name: 'Integration and context results' }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await text.press('ArrowDown');
    assert.equal(await page.locator('[data-slot="command-item"][aria-selected="true"]').innerText().then(value => value.includes('Discovery test app 4300')), true);
    await page.screenshot({path:`/tmp/drawloom-adr0016-${label}-picker.png`});
    await text.press('Enter');
    assert.equal(await text.inputValue(), 'Use ');
    await page.getByRole('button', { name: /Remove Discovery test app 4300 from test/ }).waitFor();
    await page.getByRole('button', { name: 'Choose a skill', exact: true }).click();
    await page.getByRole('region', { name: 'Skill suggestions' }).waitFor();
    catalogue = [
      {...entries[0],id:'required',kind:'skill',name:'Required skill',scope:'required'},
      {...entries[1],id:'chosen',kind:'skill',name:'Chosen skill'},
    ];
    await page.getByRole('button',{name:'Refresh discovery',exact:true}).click();
    await page.getByText('Chosen skill',{exact:true}).waitFor();
    await text.focus(); await text.press('ArrowDown');
    assert.ok((await page.locator('[data-slot="command-item"][aria-selected="true"]').innerText()).includes('Chosen skill'));
    await text.press('Enter');
    await page.getByRole('button',{name:/Remove Chosen skill from test/}).waitFor();
    await text.fill('@');
    const document = page.locator('[data-slot="command-item"][data-value^="document:"]').first();
    // The populated private walkthrough has text artifacts. Empty public hosts
    // still exercise selectable skills and integration identity above.
    if (await document.count()) {
      await text.press('ArrowDown');
      assert.match(await page.locator('[data-slot="command-item"][aria-selected="true"]').getAttribute('data-value'), /^document:/);
      await text.press('Enter');
      assert.equal(await text.inputValue(), '');
    }
    await page.getByRole('button', { name: 'Choose a skill', exact: true }).click();
    await text.press('Escape');
    assert.equal(await page.getByRole('region', { name: 'Skill suggestions' }).count(), 0);

    const shot = `/tmp/drawloom-adr0016-${label}.png`;
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
    for (const name of ['Send message','Agent provider','Execution review']) {
      const bounds = await page.getByLabel(name,{exact:true}).boundingBox();
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width, `${name} must not be clipped at ${viewport.width}px`);
    }
    await page.screenshot({ path: shot, fullPage: false });
    screenshots.push(shot);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
}

try {
  await check({ width: 1440, height: 1000 }, 'light', 'desktop-light');
  await check({ width: 1440, height: 1000 }, 'dark', 'desktop-dark');
  await check({ width: 760, height: 900 }, 'light', 'narrow-light');
  await check({ width: 760, height: 900 }, 'dark', 'narrow-dark');
  await check({ width: 390, height: 844 }, 'light', 'mobile-light');
  await check({ width: 390, height: 844 }, 'dark', 'mobile-dark');
  console.log(JSON.stringify({ desktopAndNarrow: 'pass', lightAndDark: 'pass', nonModalPicker: 'pass', keyboardSelection: 'pass', dedicatedViews: 'pass', screenshots }));
} finally { await browser.close(); }
