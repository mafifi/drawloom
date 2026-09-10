// Opt-in regression against the existing desktop and a disposable public host.
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(
  pathToFileURL(process.env.DRAWLOOM_PLAYWRIGHT_PATH).href
);
const url = (await readFile(process.env.DRAWLOOM_PROOF_LOG, 'utf8')).match(
  /http:\/\/127\.0\.0\.1:\d+\/bootstrap\?token=[a-f0-9]+/,
)?.[0];
assert.ok(url, 'Disposable host bootstrap URL required');
const bootstrap = new URL(url),
  token = bootstrap.searchParams.get('token');
const output = await mkdtemp(join(tmpdir(), 'drawloom-progressive-discovery-'));
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const entry = (id, kind, name) => ({
  id,
  kind,
  name,
  origin: 'synthetic',
  description: 'Public discovery fixture',
  scope: 'session',
  availability: 'available',
  selectable: true,
  revision: 'r1',
});
try {
  for (const [colorScheme, width] of [
    ['light', 1280],
    ['dark', 1280],
    ['dark', 760],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme,
    });
    await context.addCookies([
      {
        name: 'drawloom_' + bootstrap.port,
        value: token,
        url: bootstrap.origin,
      },
    ]);
    const page = await context.newPage(),
      errors = [];
    let calls = 0,
      pageCalls = 0,
      finished = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/discovery?*', async (route) => {
      calls++;
      const next = new URL(route.request().url()).searchParams.get('cursor');
      if (next) {
        assert.equal(next, 'opaque-next');
        pageCalls++;
        finished = true;
      }
      const ready = calls > 1;
      await route.fulfill({
        json: {
          entries: [
            entry('local', 'skill', 'Ready local skill'),
            ...(ready ? [entry('native', 'skill', 'Native skill')] : []),
            ...(finished ? [entry('later', 'app', 'Later app')] : []),
          ],
          categories: [
            { kind: 'app', status: ready ? 'available' : 'loading' },
          ],
          experimentalPluginDiscovery: false,
          ...(ready && !finished ? { nextCursor: 'opaque-next' } : {}),
        },
      });
    });
    try {
      assert.equal((await page.goto(bootstrap.origin)).status(), 200);
      const message = page.getByRole('textbox', {
        name: 'Message',
        exact: true,
      });
      await message.waitFor();
      assert.equal(await page.title(), 'Drawloom — Local workbench');
      await page
        .getByRole('button', { name: 'Choose a skill', exact: true })
        .click();
      await page
        .getByText('Ready local skill', { exact: true })
        .waitFor({ timeout: 2000 });
      await page
        .getByText('Native skill', { exact: true })
        .waitFor({ timeout: 3000 });
      await page.getByText('Native skill', { exact: true }).click();
      await page
        .getByRole('button', { name: /Remove Native skill from synthetic/ })
        .waitFor();
      await message.fill('@');
      await page
        .getByRole('button', { name: 'Load more apps', exact: true })
        .click();
      await page.getByText('Later app', { exact: true }).waitFor();
      assert.equal(
        pageCalls,
        1,
        'Only explicit Load more fetches another page',
      );
      assert.equal(
        await page
          .getByRole('button', { name: 'Load more apps', exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page.getByText(/Native skill.*unavailable/).count(),
        0,
        'Pagination preserves the chosen skill revision',
      );
      const settled = calls;
      await page.waitForTimeout(1200);
      assert.equal(calls, settled, 'Settled discovery stops polling');
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: join(output, colorScheme + '-' + width + '.png'),
      });
      let release = () => {},
        started = () => {},
        first = true;
      const held = new Promise((resolve) => {
        started = resolve;
      });
      await page.route('**/api/discovery?*', async (route) => {
        const old = first;
        first = false;
        if (old) {
          started();
          await new Promise((resolve) => {
            release = resolve;
          });
        }
        await route.fulfill({
          json: {
            entries: [
              entry(
                old ? 'stale' : 'new',
                'skill',
                old ? 'Wrong conversation skill' : 'New conversation skill',
              ),
            ],
            categories: [],
            experimentalPluginDiscovery: false,
          },
        });
      });
      await page
        .getByRole('button', { name: 'Refresh discovery', exact: true })
        .click();
      await held;
      if (width < 768)
        await page
          .getByRole('button', { name: 'Toggle navigation', exact: true })
          .click();
      await page
        .getByRole('button', { name: 'New conversation', exact: true })
        .first()
        .click();
      await page
        .getByRole('button', { name: 'Choose a skill', exact: true })
        .click();
      await page.getByText('New conversation skill', { exact: true }).waitFor();
      release();
      await page.waitForTimeout(100);
      assert.equal(
        await page
          .getByText('Wrong conversation skill', { exact: true })
          .count(),
        0,
        'Late response cannot cross conversations',
      );
      await page.getByText('New conversation skill', { exact: true }).click();
      await page
        .getByRole('button', { name: 'Choose a skill', exact: true })
        .click();
      await page.route('**/api/discovery?*', (route) =>
        route.fulfill({
          status: 503,
          json: { error: 'Discovery temporarily unavailable' },
        }),
      );
      await page
        .getByRole('button', { name: 'Refresh discovery', exact: true })
        .click();
      await page
        .getByText('Discovery temporarily unavailable', { exact: true })
        .waitFor();
      await page
        .getByRole('button', {
          name: /Remove New conversation skill from synthetic/,
        })
        .click();
      assert.equal(
        await page
          .getByRole('button', {
            name: /Remove New conversation skill from synthetic/,
          })
          .count(),
        0,
      );
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({
          colorScheme,
          width,
          calls,
          pageCalls,
          navigationIsolation: true,
          failedDiscoveryRemoval: true,
          errors: 0,
          passed: true,
        }),
      );
    } finally {
      await context.close();
    }
  }
  console.log(JSON.stringify({ screenshots: output }));
} finally {
  await browser.close();
}
