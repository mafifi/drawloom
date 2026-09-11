import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
// Opt-in: an authenticated disposable public text-studio host; no live provider calls.
const {DRAWLOOM_PLAYWRIGHT_PATH, DRAWLOOM_INPUT_TEST_URL, DRAWLOOM_INPUT_TEST_TOKEN, DRAWLOOM_UI_EVIDENCE_DIR:root}=process.env;
if(!DRAWLOOM_PLAYWRIGHT_PATH || !DRAWLOOM_INPUT_TEST_URL || !DRAWLOOM_INPUT_TEST_TOKEN || !root) throw Error('Set Playwright path, disposable host URL/token and UI evidence directory.');
await mkdir(root,{recursive:true});
const {chromium}=await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const host={origin:new URL(DRAWLOOM_INPUT_TEST_URL).origin};
const browser=await chromium.launch({headless:true,executablePath:process.env.DRAWLOOM_BROWSER_EXECUTABLE});
try {
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:'drawloom_'+new URL(host.origin).port,value:DRAWLOOM_INPUT_TEST_TOKEN,url:host.origin}]);
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(host.origin);
const newConversation = page.locator('[data-slot="sidebar-header"]').getByRole('button',{name:'New conversation',exact:true});
await newConversation.click();
// The previous conversation can already show the welcome screen. Wait for the
// pending creation action to regain its idle name before editing the new draft.
await newConversation.waitFor();
await page.getByText('A place to do the work',{exact:true}).waitFor();
await page.getByRole('textbox',{name:'Message',exact:true}).fill('A clearer introduction');
await page.getByLabel('Choose attachments',{exact:true}).setInputFiles({name:'research-notes.txt',mimeType:'text/plain',buffer:Buffer.from('Synthetic research notes')});
await page.getByRole('list',{name:'Attachments',exact:true}).locator('[data-slot="attachment"][data-state="done"]').waitFor();
await page.getByRole('button',{name:'Send message',exact:true}).click();
await page.getByText('Saved your text as a draft.',{exact:false}).last().waitFor();
const message=page.locator('[data-history-id]').filter({hasText:'A clearer introduction'}).last();
assert.ok(await message.getByText('research-notes.txt',{exact:true}).count(),'Sent attachment retains its file title');
assert.equal(await message.getAttribute('data-slot'),'message');
assert.equal(await message.getAttribute('role'),'article','Message keeps named article semantics');
assert.equal(await message.locator('[data-slot="bubble"] [data-slot="attachment"]').count(),0,'Attachments are outside the text bubble');
assert.deepEqual(errors,[]);
await page.screenshot({path:root+'/light.png'});
await page.reload();
await message.getByText('research-notes.txt',{exact:true}).waitFor();
const userStyle=await message.locator('[data-slot="bubble-content"]').evaluate(el=>({background:getComputedStyle(el).backgroundColor,font:getComputedStyle(el).fontSize}));
assert.equal(userStyle.background,'rgb(37, 99, 235)');assert.equal(userStyle.font,'15px');
const files=Array.from({length:7},(_,i)=>({name:`reference-${i}.txt`,mimeType:'text/plain',buffer:Buffer.from(`Synthetic reference ${i}`)}));
await page.getByLabel('Choose attachments',{exact:true}).setInputFiles(files);
await page.locator('[data-slot="attachment"][data-state="uploading"]').first().waitFor({state:'hidden'});
const group=page.getByRole('list',{name:'Attachments',exact:true});
await group.getByText('reference-6.txt',{exact:true}).waitFor();
assert.ok(await group.evaluate(el=>el.scrollWidth>el.clientWidth),'Attachment group actually overflows horizontally');
await group.focus();await page.keyboard.press('End');
await page.getByRole('textbox',{name:'Message',exact:true}).fill('Choose the strongest references, then revise the introduction.');
for(const theme of ['light','dark']) {
 await page.emulateMedia({colorScheme:theme});
 await page.waitForFunction(theme=>getComputedStyle(document.querySelector('[data-slot="attachment"]')).backgroundColor===(theme==='dark'?'rgb(24, 24, 24)':'rgb(255, 255, 255)'),theme);
 await page.waitForFunction(theme=>getComputedStyle(document.querySelector('[data-slot="input-group"]')).backgroundColor===(theme==='dark'?'rgb(42, 42, 42)':'rgb(245, 245, 245)'),theme);
 await page.screenshot({path:root+`/${theme}.png`});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}
await page.setViewportSize({width:390,height:844});
await page.screenshot({path:root+'/narrow.png'});
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.emulateMedia({reducedMotion:'reduce'});
let release;const wait=new Promise(resolve=>release=resolve);
await page.route('**/api/import?*',async route=>{await wait;await route.continue();});
await page.getByLabel('Choose attachments',{exact:true}).setInputFiles({name:'pending.txt',mimeType:'text/plain',buffer:Buffer.from('Slow synthetic upload')});
const pending=page.locator('[data-slot="attachment"][data-state="uploading"]');
await pending.waitFor();
assert.equal(await pending.getAttribute('aria-busy'),'true');
assert.equal(await pending.locator('[data-slot="attachment-title"]').evaluate(el=>getComputedStyle(el).animationName),'none','Reduced motion stops pending title shimmer');
assert.equal(await pending.locator('svg[role="status"]').evaluate(el=>getComputedStyle(el).animationName),'none','Reduced motion stops pending spinner');
release();await pending.waitFor({state:'hidden'});
assert.deepEqual(errors,[]);
console.log(JSON.stringify({sentTitle:true,restoredTitle:true,separateBubble:true,primaryColour:userStyle.background,bodyFont:userStyle.font,horizontalAttachments:true,lightDarkNarrow:true,reducedMotion:true,pageErrors:errors}));
} finally {await browser.close();}
