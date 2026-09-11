// Optional read-only delivery check for explicitly selected existing media.
// Never imports files or records screenshots/content. Results stay beside the
// caller-supplied output path, not in public evidence automatically.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {DRAWLOOM_FILE_TEST_METADATA,DRAWLOOM_PLAYWRIGHT_PATH,DRAWLOOM_MEDIA_DIRECTORY,DRAWLOOM_MEDIA_FILES,DRAWLOOM_MEDIA_REPORT}=process.env;
if(!DRAWLOOM_FILE_TEST_METADATA||!DRAWLOOM_PLAYWRIGHT_PATH||!DRAWLOOM_MEDIA_DIRECTORY||!DRAWLOOM_MEDIA_FILES||!DRAWLOOM_MEDIA_REPORT)throw Error('Select fixture, browser, media folder/files and private report output');
const files=JSON.parse(DRAWLOOM_MEDIA_FILES);
if(!Array.isArray(files)||!files.every(f=>typeof f==='string'&&!f.includes('/')&&!f.includes('\\')))throw Error('Use filenames within the selected folder');
const fixture=JSON.parse(await readFile(DRAWLOOM_FILE_TEST_METADATA,'utf8'));
const {chromium}=await import(pathToFileURL(DRAWLOOM_PLAYWRIGHT_PATH).href);
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext();
await context.addCookies([{name:'drawloom_'+new URL(fixture.origin).port,value:new URL(fixture.url).searchParams.get('token'),url:fixture.origin}]);
const command=async data=>{const r=await context.request.post(fixture.origin+'/api/command',{headers:{origin:fixture.origin},data});assert.equal(r.status(),200);return r.json();};
try{
  await command({kind:'add_project',directory:DRAWLOOM_MEDIA_DIRECTORY,name:'Private playback check'});
  const state=await command({kind:'create_conversation',workbenchId:'text',provider:'synthetic'});
  const page=await context.newPage();await page.goto(fixture.origin);
  const results=[];
  for(const file of files){
    const url='/api/files?'+new URLSearchParams({conversationId:state.selectedId,path:file});
    const facts=await context.request.head(fixture.origin+url);assert.equal(facts.status(),200);
    const mediaType=facts.headers()['content-type'];
    const result=await page.evaluate(async({url,mediaType})=>{
      const element=document.createElement(mediaType.startsWith('audio/')?'audio':'video');
      element.muted=true;element.preload='metadata';element.src=url;document.body.append(element);
      try{
        await new Promise((resolve,reject)=>{element.onloadedmetadata=resolve;element.onerror=()=>reject(Error('Media cannot be decoded'));});
        const duration=element.duration;const target=duration*0.75;
        const sought=new Promise(resolve=>{element.onseeked=resolve;});element.currentTime=target;await sought;
        await element.play();await new Promise(resolve=>{element.ontimeupdate=()=>{if(element.currentTime>target+0.1)resolve();};});
        element.pause();return {duration,seek:element.currentTime>=target,playback:true};
      }finally{element.pause();element.removeAttribute('src');element.load();element.remove();}
    },{url,mediaType});
    results.push({mediaType,bytes:Number(facts.headers()['content-length']),...result});
  }
  await writeFile(DRAWLOOM_MEDIA_REPORT,JSON.stringify({date:'2026-09-11',scope:'Existing local files through authenticated Drawloom project delivery and native browser media; no import, model call or screenshot',results},null,2));
  console.log(JSON.stringify({checked:results.length,playback:results.every(r=>r.playback),seek:results.every(r=>r.seek)}));
}finally{await browser.close();}
