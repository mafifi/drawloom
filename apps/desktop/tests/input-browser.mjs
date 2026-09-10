// Optional browser regression against a built desktop using the public Input.
// Supply installed Playwright and an authenticated disposable host explicitly.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_INPUT_TEST_URL, DRAWLOOM_INPUT_TEST_TOKEN } = process.env;
if (!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_INPUT_TEST_URL || !DRAWLOOM_INPUT_TEST_TOKEN) throw Error('Set the Playwright path and disposable input test host URL/token.');
const { chromium } = await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser = await chromium.launch({ headless: true, executablePath: process.env.DRAWLOOM_BROWSER_EXECUTABLE });
const context = await browser.newContext();
const url = new URL(DRAWLOOM_INPUT_TEST_URL);
await context.addCookies([{ name: 'drawloom_' + url.port, value: DRAWLOOM_INPUT_TEST_TOKEN, url: url.origin }]);
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto(url.href);
  const text = page.getByRole('textbox', { name: 'Message', exact: true });
  await text.fill('File binding regression draft');
  assert.equal(await text.inputValue(), 'File binding regression draft');
  const input = page.getByLabel('Choose attachments', { exact: true });
  const file = { name: 'input-binding-proof.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=', 'base64') };
  for (let attempt = 0; attempt < 2; attempt++) {
    await input.setInputFiles(file);
    await page.waitForTimeout(150);
    assert.deepEqual(errors, [], 'file selection must never write a nonempty filename into input.value');
    assert.equal(await input.inputValue(), '', 'consumer can clear file input for same-file reselection');
    await page.getByRole('button', { name: 'Remove input-binding-proof.png', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Importing attachments', exact: true }).waitFor({ state: 'hidden' });
    const preview = page.getByRole('list', { name: 'Attachments', exact: true }).getByRole('img', { name: 'input-binding-proof.png', exact: true });
    await preview.waitFor();
    assert.match(await preview.getAttribute('src'), /^\/api\/assets\//);
    if (attempt === 0) {
      await page.reload();
      await page.getByRole('button', { name: 'Remove input-binding-proof.png', exact: true }).waitFor();
      await preview.waitFor();
      assert.equal(await text.inputValue(), 'File binding regression draft');
    }
    await page.getByRole('button', { name: 'Remove input-binding-proof.png', exact: true }).click();
  }
  await text.fill('Text binding still works');
  assert.equal(await text.inputValue(), 'Text binding still works');
  for (const theme of ['light','dark']) {
    await page.emulateMedia({colorScheme:theme});
    for (const event of ['paste','drop']) {
      const name = `${event}-${theme}.txt`;
      await page.locator(event === 'paste' ? '#message-draft' : 'form.composer').evaluate((element,{event,name}) => {
        const transfer = new DataTransfer(); transfer.items.add(new File(['Synthetic attachment'],name,{type:'text/plain'}));
        element.dispatchEvent(event === 'paste' ? new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true}) : new DragEvent('drop',{dataTransfer:transfer,bubbles:true,cancelable:true}));
      },{event,name});
      const remove = page.getByRole('button',{name:'Remove '+name,exact:true});
      await remove.waitFor();
      await page.getByRole('button',{name:'Importing attachment',exact:true}).waitFor({state:'hidden'});
      await remove.click();
    }
    let fail = true;
    await page.route('**/api/import',route => fail ? route.fulfill({status:400,json:{error:'Synthetic upload failure'}}) : route.continue());
    await input.setInputFiles({name:'retry.txt',mimeType:'text/plain',buffer:Buffer.from('Retry reference')});
    await page.getByRole('list',{name:'Attachments',exact:true}).getByText('Synthetic upload failure',{exact:true}).waitFor();
    fail = false;
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await page.getByRole('button',{name:'Importing attachment',exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.getByText('Synthetic upload failure',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Remove retry.txt',exact:true}).click();
    await page.unroute('**/api/import');
  }
  await text.fill('');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ fileSelection: 'pass', clearing: 'pass', sameFileReselection: 'pass', textBinding: 'pass', attachmentReferenceReload: 'pass', pasteAndDrop:'pass', uploadFailureAndRetry:'pass', lightAndDark:'pass', pageErrors: errors }));
} finally { await browser.close(); }
