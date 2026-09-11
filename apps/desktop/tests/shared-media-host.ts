// Opt-in, public synthetic installed-package browser check. No providers.
import { mkdtemp,mkdir,writeFile,realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createInstallationStore } from '../host/plugin-installations.js';
import { createDesktopApplication } from '../host/application.js';
import { serveDesktop } from '../host/server.js';
const root=await realpath(await mkdtemp(join(tmpdir(),'drawloom-shared-browser-')));
const requests:{origin:string;path:string;referer:string|null}[]=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=','base64');
let redirectOrigin='';
const media=(id:string)=>Bun.serve({hostname:'127.0.0.1',port:0,fetch(r){const path=new URL(r.url).pathname;requests.push({origin:id,path,referer:r.headers.get('referer')});if(path==='/redirect.png')return Response.redirect(redirectOrigin+'/image.png');if(path==='/expired.png')return new Response('Expired signed URL',{status:403,headers:{'Content-Type':'text/plain'}});return new Response(path==='/script.js'?'window.remoteScriptRan=true':png,{headers:{'Content-Type':path==='/script.js'?'text/javascript':'image/png'}});}});
const initial=media('initial'),returned=media('returned'),blocked=media('blocked');
redirectOrigin=initial.url.origin;
const data=join(root,'data'),work=join(root,'project');await mkdir(work);
const installs=await createInstallationStore(createNodeJsonStore(join(data,'state')));
for(const id of ['producer','consumer']){
  const pkg=join(root,id);await mkdir(pkg);
  for(const [entry,target,name] of [['shared-media-backend.fixture.ts','bun','backend.mjs'],['shared-media-app.fixture.ts','browser','app.js']] as const){
    const build=await Bun.build({entrypoints:[resolve(import.meta.dir,entry)],target,outdir:pkg,naming:name});if(!build.success)throw Error(String(build.logs));
  }
  await writeFile(join(pkg,'plugin.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',name:id,extensions:{'io.github.mafifi.drawloom':{version:1,backend:{entrypoint:'./backend.mjs'},workbenches:[{id,title:id,openingTool:{server:'media',tool:'open'}}]}}}));
  const installation=await installs.add(pkg);
  await installs.configure(installation,{enabled:true,trustedBackend:true,servers:[],configuration:{id,initial:initial.url.origin,returned:returned.url.origin,blocked:blocked.url.origin}});
}
const app=await createDesktopApplication(data);
await app.command({kind:'add_project',directory:work,name:'Shared media project'});
const state=await app.command({kind:'create_conversation',workbenchId:'consumer',provider:'synthetic'});
const host=serveDesktop(app,resolve('apps/desktop/build'));
const meta={root,url:host.url,origin:host.origin,conversationId:state.selectedId,pid:process.pid};
await writeFile(join(root,'browser.json'),JSON.stringify(meta));console.log(JSON.stringify(meta));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,async()=>{await host.close();await writeFile(join(root,'origin-requests.json'),JSON.stringify(requests,null,2));for(const server of [initial,returned,blocked])server.stop(true);process.exit(0);});
