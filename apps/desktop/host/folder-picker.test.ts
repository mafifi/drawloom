import {test,expect} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createDesktopApplication} from './application.js';
import {serveDesktop} from './server.js';
test('folder chooser requires the authenticated command channel and is only a selection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'drawloom-chooser-'));const app=await createDesktopApplication(root);let calls=0;
 const host=serveDesktop(app,resolve('apps/desktop/build'),0,undefined,{pickDirectory:async()=>{calls++;return '/chosen/directory';}});
 try{
   expect((await fetch(host.origin+'/api/project-directory',{method:'POST',headers:{origin:host.origin,'Content-Type':'application/json'},body:'{}'})).status).toBe(401);
   expect(calls).toBe(0);const boot=await fetch(host.url,{redirect:'manual'});const cookie=boot.headers.get('set-cookie')!.split(';')[0]!;
   const r=await fetch(host.origin+'/api/project-directory',{method:'POST',headers:{cookie,origin:host.origin,'Content-Type':'application/json'},body:'{}'});
   expect(r.status).toBe(200);expect(await r.json()).toEqual({directory:'/chosen/directory'});expect(calls).toBe(1);expect((await app.snapshot()).projects).toEqual([]);
 }finally{await host.close();await rm(root,{recursive:true,force:true});}
});
