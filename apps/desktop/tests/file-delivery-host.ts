// Opt-in public browser fixture. Creates only synthetic media in a new temporary
// directory; never opens a provider or installs a plugin. Stop with SIGTERM.
import { mkdtemp, mkdir, open, writeFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createDesktopApplication } from '../host/application.js';
import { createSqliteConversationHistory } from '@drawloom/sqlite-conversation-history';
import { serveDesktop } from '../host/server.js';
import { initializeObservability } from '@drawloom/otel-host';
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createInstallationStore } from '../host/plugin-installations.js';
const root = await realpath(await mkdtemp(join(tmpdir(), 'drawloom-file-browser-')));
const work = join(root, 'project-a'); const other = join(root, 'project-b');
await mkdir(work); await mkdir(other);
const video = join(work, 'synthetic.mp4');
const render = Bun.spawn(['ffmpeg','-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-t','30','-c:v','libx264','-preset','ultrafast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',video],{stdout:'ignore',stderr:'pipe'});
if (await render.exited) throw Error(await new Response(render.stderr).text());
const sparse = await open(join(work,'large.bin'),'w'); await sparse.truncate(512*1024*1024); await sparse.close();
await writeFile(join(work,'unknown.custom'),'Public unknown-format download');
await writeFile(join(work,'invalid.mp4'),'Not an encoded video');
const deliveries: {bytes:unknown;cached:unknown;outcome:unknown;milliseconds:number}[] = [];
const telemetry=initializeObservability({mode:'recording',serviceName:'drawloom.file-verification',exporters:{traces:{export(spans:ReadableSpan[],done){for(const s of spans)if(s.name==='host.file.deliver')deliveries.push({bytes:s.attributes['drawloom.file.bytes'],cached:s.attributes['drawloom.file.cached'],outcome:s.attributes['drawloom.outcome'],milliseconds:s.duration[0]*1000+s.duration[1]/1e6});done({code:0});},async shutdown(){}}}});
const data=join(root,'data');
const originRequests:string[]=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
const allowed=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;originRequests.push('approved:'+path);return new Response(path==='/script'?'window.remoteScriptRan=true':png,{headers:{'Content-Type':path==='/script'?'text/javascript':'image/png'}});}});
const blocked=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){originRequests.push('blocked');return new Response(png,{headers:{'Content-Type':'image/png'}});}});
const pkg=join(root,'media-package');await mkdir(pkg);
const build=await Bun.build({entrypoints:[resolve(import.meta.dir,'file-media-backend.fixture.ts')],target:'bun',outdir:pkg,naming:'backend.mjs'});
if(!build.success)throw Error('Media fixture failed to build');
await writeFile(join(pkg,'plugin.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',name:'media-check',extensions:{'io.github.mafifi.drawloom':{version:1,backend:{entrypoint:'./backend.mjs'},workbenches:[{id:'media-check',title:'Media policy check',openingTool:{server:'media',tool:'media.open'}}]}}}));
const installations=await createInstallationStore(createNodeJsonStore(join(data,'state')));
const installation=await installations.add(pkg);
await installations.configure(installation,{enabled:true,trustedBackend:true,servers:[],configuration:{approved:allowed.url.origin,blocked:blocked.url.origin},approvedResourceOrigins:[allowed.url.origin]});
let app=await createDesktopApplication(data);
await app.command({kind:'add_project',directory:work,name:'Public media'});
const state=await app.command({kind:'create_conversation',workbenchId:'text',provider:'synthetic'});
await app.close();
const history=createSqliteConversationHistory(join(data,'history.sqlite'));
await history.commit(state.selectedId,{expectedRevision:0,entries:[{id:'synthetic-files',position:[0,0],role:'assistant',state:'complete',text:'Public working-file references. Open only the media you want to inspect.',assets:[],resources:[
  {id:'video',title:'Synthetic working video',source:'synthetic',status:'unavailable',uri:pathToFileURL(video).href,mimeType:'video/mp4'},
  {id:'unknown',title:'Unknown working format',source:'synthetic',status:'unavailable',uri:pathToFileURL(join(work,'unknown.custom')).href,mimeType:'application/octet-stream'},
  {id:'invalid',title:'Invalid media',source:'synthetic',status:'unavailable',uri:pathToFileURL(join(work,'invalid.mp4')).href,mimeType:'video/mp4'},
]}]}); await history.close();
app=await createDesktopApplication(data);
const host=serveDesktop(app,resolve('apps/desktop/build'));
const baselineRss=process.memoryUsage().rss;let peakRss=baselineRss;
const sample=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss);},5);
const timings:number[]=[];
const cookie=`drawloom_${new URL(host.origin).port}=${new URL(host.url).searchParams.get('token')}`;
const rangeUrl=host.origin+'/api/files?'+new URLSearchParams({conversationId:state.selectedId,path:'large.bin'});
for(let i=0;i<30;i++){
  const started=performance.now();
  const response=await fetch(rangeUrl,{headers:{cookie,range:`bytes=${i*1024*1024}-${i*1024*1024+65535}`}});
  if(response.status!==206||(await response.arrayBuffer()).byteLength!==65536)throw Error('Range verification failed');
  timings.push(performance.now()-started);
}
clearInterval(sample);peakRss=Math.max(peakRss,process.memoryUsage().rss);
await telemetry.flush();
const sorted=[...timings].sort((a,b)=>a-b);
await writeFile(join(root,'range-measurements.json'),JSON.stringify({sourceBytes:512*1024*1024,repetitions:30,rangeBytes:65536,coldMilliseconds:timings[0],medianMilliseconds:sorted[15],p95Milliseconds:sorted[28],baselineRss,peakRss,scope:'Bun host and HTTP measurement client in the same process; RSS sampled every 5 ms',deliverySpans:deliveries},null,2));
deliveries.length=0;
const meta={root,url:host.url,origin:host.origin,work,other,video,conversationId:state.selectedId,pid:process.pid};
await writeFile(join(root,'browser.json'),JSON.stringify(meta));
console.log(JSON.stringify(meta));
let stopped=false;
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,async()=>{if(stopped)return;stopped=true;await host.close();await telemetry.flush();await writeFile(join(root,'delivery-spans.json'),JSON.stringify(deliveries,null,2));await writeFile(join(root,'origin-requests.json'),JSON.stringify(originRequests));allowed.stop(true);blocked.stop(true);await telemetry.shutdown();process.exit(0);});
