// Opt-in, public synthetic package controls; no provider/model operations.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_INPUT_TEST_URL, DRAWLOOM_INPUT_TEST_TOKEN, DRAWLOOM_PACKAGE_FIXTURE } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_INPUT_TEST_URL || !DRAWLOOM_INPUT_TEST_TOKEN || !DRAWLOOM_PACKAGE_FIXTURE) throw Error('Supply disposable host, package fixture and browser runtime.');
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE });
const url = new URL(DRAWLOOM_INPUT_TEST_URL);
try {
  for (const [colorScheme, width] of [['light', 1280], ['dark', 1280], ['dark', 390]]) {
    const context = await browser.newContext({ colorScheme, viewport: { width, height: 900 } });
    await context.addCookies([{ name: 'drawloom_' + url.port, value: DRAWLOOM_INPUT_TEST_TOKEN, url: url.origin }]);
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    try {
      assert.equal((await page.goto(url.origin))?.status(), 200);
      await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
      assert.equal(await page.title(), 'Drawloom — Local workbench');
      if (width < 768) await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await page.getByRole('button', { name: 'Plugins', exact: true }).click();
      const packages = page.getByRole('region', { name: 'Local plugin packages' });
      await packages.getByRole('textbox', { name: 'Package folder' }).fill(DRAWLOOM_PACKAGE_FIXTURE);
      // The initial installation read disables actions until its result arrives.
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent?.trim() === 'Inspect package' && !button.disabled));
      await packages.getByRole('button', { name: 'Inspect package', exact: true }).focus();
      await page.keyboard.press('Enter');
      await packages.getByText('1 skills · 1 servers · Standard package', { exact: true }).waitFor();
      await packages.getByRole('button', { name: 'Add without activating' }).click();
      await packages.getByRole('button', { name: 'Save activation settings' }).waitFor();
      const backend = packages.getByRole('checkbox', { name: 'Trust this package’s backend to execute in the host process' });
      assert.equal(await backend.getAttribute('aria-checked'), 'false');
      const enabled = packages.getByRole('checkbox', { name: 'Activate configured servers and skills on next restart' });
      if (await enabled.getAttribute('aria-checked') !== 'true') await enabled.click();
      const serverChoice = packages.getByRole('checkbox', { name: /^Server:/ }).first();
      if (await serverChoice.getAttribute('aria-checked') === 'true') await serverChoice.click();
      await packages.getByRole('button', { name: 'Save activation settings' }).click();
      await packages.getByText('Saved. Restart Drawloom to apply these changes.', { exact: true }).waitFor();
      assert.equal(await serverChoice.getAttribute('aria-checked'), 'false');
      await packages.getByRole('textbox', { name: 'Package folder' }).fill('/a/nonexistent/synthetic/package');
      await packages.getByRole('button', { name: 'Inspect package', exact: true }).click();
      await packages.getByRole('alert').waitFor();
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.deepEqual(errors, []);
      assert.equal(await page.locator('vite-error-overlay').count(), 0);
      await page.screenshot({ path: `/tmp/drawloom-adr0018-packages-${colorScheme}-${width}.png` });
      // Controlled HTTP presentation fixture, not a live authorization claim.
      const installation = { id: '03f41a9c-8308-4bb0-b00d-00a4c77a2abb', root: '/synthetic/oauth-package', name: 'OAuth presentation fixture', enabled: true, trustedBackend: false, servers: ['remote'], pendingRestart: false, status: 'partial', diagnostics: [], connections: [{ name: 'remote', status: 'auth-required', transport: 'streamable-http' }] };
      const authActions = []; let statusState = 'denied';
      await page.route('**/api/packages', route => route.fulfill({ json: [installation] }));
      await page.route('**/api/packages/oauth', route => {
        const input = route.request().postDataJSON(); authActions.push(input.action);
        assert.equal(input.id, installation.id); assert.equal(input.server, 'remote');
        const state = input.action === 'connect' ? 'awaiting-approval' : input.action === 'status' ? statusState : input.action === 'cancel' ? 'cancelled' : 'disconnected';
        return route.fulfill({ json: { state, credentialMode: 'session', ...(input.action === 'connect' ? { authorizationUrl: 'https://auth.example/authorize' } : {}), ...(input.action === 'reconnect' ? { restartRequired: true } : {}) } });
      });
      await packages.getByRole('button', { name: 'Refresh', exact: true }).click();
      await packages.getByRole('button', { name: 'Preconfigured OAuth client', exact: true }).click();
      await packages.getByRole('textbox', { name: 'Local registration JSON file' }).fill('/synthetic/client-registration.json');
      await packages.getByRole('button', { name: 'Import client registration', exact: true }).focus();
      await page.keyboard.press('Enter');
      await packages.getByText('remote · auth-required · disconnected', { exact: true }).waitFor();
      assert.equal(await packages.getByRole('textbox', { name: 'Local registration JSON file' }).inputValue(), '');
      await packages.getByRole('button', { name: 'Connect', exact: true }).click();
      await packages.getByRole('link', { name: 'Continue sign-in in your browser' }).waitFor();
      await packages.getByText('Session-only sign-in:', { exact: false }).waitFor();
      await packages.getByRole('button', { name: 'Cancel', exact: true }).click();
      await packages.getByText('remote · auth-required · cancelled', { exact: true }).waitFor();
      assert.equal(await packages.getByRole('link', { name: 'Continue sign-in in your browser' }).count(), 0);
      await packages.getByRole('button', { name: 'Check sign-in', exact: true }).click();
      await packages.getByText('remote · auth-required · denied', { exact: true }).waitFor();
      statusState = 'refresh-failed';
      await packages.getByRole('button', { name: 'Check sign-in', exact: true }).click();
      await packages.getByText('remote · auth-required · refresh-failed', { exact: true }).waitFor();
      await packages.getByRole('button', { name: 'Reconnect', exact: true }).click();
      await packages.getByText('Restart Drawloom to load this server’s newly discovered contributions.', { exact: true }).waitFor();
      await packages.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await packages.getByRole('button', { name: 'Disconnect', exact: true }).waitFor();
      await packages.getByText('remote · auth-required · disconnected', { exact: true }).waitFor();
      assert.equal(await packages.getByText('Restart Drawloom to load this server’s newly discovered contributions.', { exact: true }).count(), 0);
      assert.deepEqual(authActions, ['configure-client', 'connect', 'cancel', 'status', 'status', 'reconnect', 'disconnect']);
      await page.screenshot({ path: `/tmp/drawloom-adr0018-oauth-ui-${colorScheme}-${width}.png` });
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ colorScheme, width, keyboardInspection: true, activationDeferred: true, backendUntrusted: true, failureVisible: true, simulatedOAuthControls: authActions, pageErrors: errors.length }));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
