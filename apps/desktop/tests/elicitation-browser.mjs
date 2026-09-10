// Built desktop controls against a controlled public form presentation fixture.
// Actual stdio/HTTP package invocation is covered by the integration tests.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_INPUT_TEST_URL, DRAWLOOM_INPUT_TEST_TOKEN } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_INPUT_TEST_URL || !DRAWLOOM_INPUT_TEST_TOKEN) throw Error('Supply browser runtime and disposable authenticated desktop.');
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE });
const url = new URL(DRAWLOOM_INPUT_TEST_URL);
try {
  for (const [colorScheme, width] of [['light', 1280], ['dark', 1280], ['dark', 390]]) {
    const context = await browser.newContext({ colorScheme, viewport: { width, height: 1100 } });
    await context.addCookies([{ name: 'drawloom_' + url.port, value: DRAWLOOM_INPUT_TEST_TOKEN, url: url.origin }]);
    const page = await context.newPage(), errors = [], commands = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      const initial = await (await context.request.get(url.origin + '/api/state')).json();
      const snapshot = initial.sections;
      const form = requestId => ({ requestId, source: 'package:public-stationery:choices', invocationId: 'invocation-' + requestId, operationId: 'synthetic-operation', params: {
        mode: 'form', message: 'Choose stationery for the public example.', requestedSchema: { type: 'object', properties: {
          paper: { type: 'string', title: 'Paper', oneOf: [{ const: 'plain', title: 'Plain' }, { const: 'lined', title: 'Lined' }] },
          copies: { type: 'integer', title: 'Copies', minimum: 1, default: 2 },
          recycled: { type: 'boolean', title: 'Recycled', default: true },
          colours: { type: 'array', title: 'Colours', items: { anyOf: [{ const: 'blue', title: 'Blue' }, { const: 'red', title: 'Red' }] }, default: ['blue'] },
          note: { type: 'string', title: 'Note', default: 'Example' },
        }, required: ['paper', 'copies', 'recycled', 'colours'] },
      } });
      snapshot.elicitations = [form('form-accept')];
      let revision = 0;
      await page.route('**/api/state*', route => route.fulfill({ json: { kind: 'snapshot', token: `form-${++revision}`, sections: snapshot, removed: [] } }));
      await page.route('**/api/command', async route => {
        const command = route.request().postDataJSON(); commands.push(command);
        assert.equal(command.kind, 'elicitation'); assert.equal(command.conversationId, snapshot.selectedId);
        if (command.result.action === 'accept') {
          assert.deepEqual(command.result.content, { paper: 'lined', copies: 3, recycled: true, colours: ['blue', 'red'], note: 'Reviewed example' });
          snapshot.elicitations = [form('form-decline')];
        } else if (command.result.action === 'decline') snapshot.elicitations = [form('form-cancel')];
        else snapshot.elicitations = [];
        await route.fulfill({ json: snapshot });
      });
      await page.goto(url.origin);
      await page.getByText('Choose stationery for the public example.', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Paper' }).click();
      await page.getByRole('option', { name: 'Lined', exact: true }).click();
      await page.getByRole('spinbutton', { name: 'Copies' }).fill('3');
      await page.getByRole('checkbox', { name: 'Red', exact: true }).click();
      await page.getByRole('textbox', { name: 'Note', exact: true }).fill('Reviewed example');
      assert.equal(await page.getByRole('button', { name: 'Paper' }).innerText(), 'Lined');
      await page.screenshot({ path: `/tmp/drawloom-elicitation-${colorScheme}-${width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
      await page.getByRole('button', { name: 'Decline', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.getByText('Choose stationery for the public example.', { exact: true }).waitFor({ state: 'hidden' });
      assert.deepEqual(commands.map(command => command.result.action), ['accept', 'decline', 'cancel']);
      assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      console.log(JSON.stringify({ colorScheme, width, typedForm: true, actions: commands.map(command => command.result.action), pageErrors: errors.length }));
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
