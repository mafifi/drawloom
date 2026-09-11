// Run file-delivery-host.ts first; pass its browser.json path and an installed
// Playwright path. All media and screenshots are synthetic and stay in its temp dir.
import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { DRAWLOOM_FILE_TEST_METADATA, DRAWLOOM_PLAYWRIGHT_PATH }=process.env;
if(!DRAWLOOM_FILE_TEST_METADATA||!DRAWLOOM_PLAYWRIGHT_PATH)throw Error('Set fixture metadata and installed Playwright paths');
const fixture=JSON.parse(await readFile(DRAWLOOM_FILE_TEST_METADATA,'utf8'));
const {chromium}=await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1360,height:900}});
await context.addCookies([{name:'drawloom_'+new URL(fixture.origin).port,value:new URL(fixture.url).searchParams.get('token'),url:fixture.origin}]);
const page=await context.newPage();const errors=[];const requests=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(r.url().includes('/api/files?'))requests.push({url:new URL(r.url()).pathname,range:r.headers().range});});
const report={videoBytes:(await stat(fixture.video)).size,themes:[],requests,errors};
try{
  await context.request.post(fixture.origin+'/api/command',{headers:{origin:fixture.origin},data:{kind:'select_conversation',conversationId:fixture.conversationId}});
  await page.goto(fixture.origin);
  const card=page.getByRole('region',{name:'Synthetic working video',exact:true});
  await card.waitFor();assert.equal(requests.length,0,'no eager working-file read');
  for(const theme of ['light','dark']){
    await page.emulateMedia({colorScheme:theme});
    await card.getByRole('button',{name:'Preview working file',exact:true}).click();
    const video=card.locator('video');await video.waitFor();
    await video.evaluate(v=>v.readyState>=1?undefined:new Promise((resolve,reject)=>{v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',()=>reject(Error('Video decode failed')),{once:true});}));
    assert.equal(Math.round(await video.evaluate(v=>v.duration)),30);
    await video.evaluate(v=>{v.currentTime=20;});
    await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.seeking&&v.currentTime>=19.9;},{},{timeout:10000});
    await video.evaluate(v=>v.play());
    await page.waitForFunction(()=>document.querySelector('video')?.currentTime>20.1);
    await video.evaluate(v=>v.pause());
    await page.screenshot({path:join(fixture.root,`files-${theme}.png`),fullPage:true});
    await card.getByRole('button',{name:'Preview working file',exact:true}).click();
    assert.equal(await page.locator('video').count(),0,'closing preview releases video');
    report.themes.push({theme,metadata:true,seek:true,playback:true,closed:true});
  }
  const unknown=page.getByRole('region',{name:'Unknown working format',exact:true});
  await unknown.getByRole('button',{name:'Preview working file',exact:true}).click();
  const downloaded=page.waitForEvent('download');await unknown.getByRole('link',{name:'Save file'}).click();
  assert.equal(await (await downloaded).failure(),null);
  report.unknownDownload=true;
  const invalid=page.getByRole('region',{name:'Invalid media',exact:true});
  await invalid.getByRole('button',{name:'Preview working file',exact:true}).click();
  await invalid.getByText('This file could not be loaded.',{exact:false}).waitFor();
  await invalid.getByRole('button',{name:'Preview working file',exact:true}).click();
  report.invalidMediaFeedback=true;
  // Existing attachment input sends File directly, not JSON/base64.
  await page.getByLabel('Choose attachments',{exact:true}).setInputFiles(fixture.video);
  await page.getByRole('button',{name:'Remove synthetic.mp4',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
  // Full delivery of >16 MiB is covered by host integration; this checks native
  // browser File and durable draft references using a real encoded video.
  await page.waitForFunction(()=>document.querySelector('input[type=file]')?.value==='');
  await page.reload();await page.getByRole('button',{name:'Remove synthetic.mp4',exact:true}).waitFor();
  report.uploadAndReload=true;
  await page.getByRole('button',{name:'Add project',exact:true}).click();
  await page.getByLabel('Project folder',{exact:true}).fill(fixture.other);
  await page.getByLabel('Name (optional)',{exact:true}).fill('Second project');
  await page.locator('form').getByRole('button',{name:'Add project',exact:true}).click();
  await page.getByRole('button',{name:'Back to conversation',exact:true}).click();
  await page.getByRole('main').getByRole('button',{name:'New conversation',exact:true}).click();
  await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  assert.equal(await page.getByRole('region',{name:'Synthetic working video',exact:true}).count(),0);
  await page.getByRole('textbox',{name:'Message',exact:true}).fill('Second project keeps its own draft');
  await page.getByRole('button',{name:'Public media',exact:true}).focus();await page.keyboard.press('Enter');
  await card.waitFor();assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'');
  report.projectSwitch=true;
  // Exercise the actual opaque MCP App iframe and standard resourceDomains.
  const opened=await context.request.post(fixture.origin+'/api/command',{headers:{origin:fixture.origin},data:{kind:'create_conversation',workbenchId:'media-check',provider:'synthetic'}});
  assert.equal(opened.status(),200);const owner=await opened.json();
  const mounted=await context.request.post(fixture.origin+'/api/view-session',{headers:{origin:fixture.origin},data:{conversationId:owner.selectedId,viewId:'media-check.view',action:'open'}});
  assert.equal(mounted.status(),200);
  await page.goto(fixture.origin);
  // The fixture intentionally needs no UI RPC to test native resource loading.
  await page.evaluate(({id})=>{const frame=document.createElement('iframe');frame.id='media-csp-check';frame.sandbox.add('allow-scripts');frame.src='/api/views/media-check.view?conversationId='+id;document.body.append(frame);},{id:owner.selectedId});
  const frame=await (await page.locator('#media-csp-check').elementHandle()).contentFrame();
  await frame.waitForFunction(()=>window.inlineAllowed===true&&document.querySelector('#approved')?.naturalWidth===1&&document.querySelector('#project')?.readyState>=1);
  assert.deepEqual(await frame.evaluate(()=>({remoteScript:Boolean(window.remoteScriptRan),blockedImage:document.querySelector('#blocked').naturalWidth})),{remoteScript:false,blockedImage:0});
  const scopedUrl=await frame.locator('#project').evaluate(v=>v.currentSrc);
  await context.request.post(fixture.origin+'/api/command',{headers:{origin:fixture.origin},data:{kind:'select_conversation',conversationId:fixture.conversationId}});
  assert.equal((await context.request.get(scopedUrl,{headers:{range:'bytes=0-1'}})).status(),403);
  await page.goto(fixture.origin);await card.waitFor();
  report.mcpMedia={approvedOrigin:true,projectMedia:true,blockedOrigin:true,remoteScriptBlocked:true,revokedAfterNavigation:true};
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:join(fixture.root,'files-narrow.png'),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
  report.narrow=true;
  assert.deepEqual(errors,[]);
  await writeFile(join(fixture.root,'browser-results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}catch(error){console.error('Original browser failure:',String(error));console.error(JSON.stringify({requests,media:await page.locator('video').evaluateAll(nodes=>nodes.map(v=>({time:v.currentTime,seeking:v.seeking,ready:v.readyState,error:v.error?.message,network:v.networkState,src:v.currentSrc,buffered:Array.from({length:v.buffered.length},(_,i)=>[v.buffered.start(i),v.buffered.end(i)])}))).catch(()=>[])}));throw error;}finally{await browser.close();}
