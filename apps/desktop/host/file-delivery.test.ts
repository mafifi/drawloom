import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,rm,symlink,open,readdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createDesktopApplication} from './application.js';
import {serveDesktop} from './server.js';
test('a stalled upload cannot block navigation and cancellation leaves no registered partial asset',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-upload-cancel-'));await mkdir(join(root,'working'));
  const app=await createDesktopApplication(join(root,'data'));const project=await app.command({kind:'add_project',directory:join(root,'working')});
  const state=await app.command({kind:'create_conversation',workbenchId:'text',provider:'synthetic'});
  const host=serveDesktop(app,resolve('apps/desktop/build'));
  const controller=new AbortController();
  await mkdir(join(root,'data','assets'),{recursive:true});
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const body=new ReadableStream<Uint8Array>({async start(stream){stream.enqueue(new Uint8Array(65536));await gate;try{stream.close();}catch{}}});
  try{
    const boot=await fetch(host.url,{redirect:'manual'});const cookie=boot.headers.get('set-cookie')!.split(';')[0]!;
    const upload=fetch(host.origin+'/api/import?'+new URLSearchParams({conversationId:state.selectedId,name:'cancel.mp4',mediaType:'video/mp4'}),{method:'POST',headers:{cookie,origin:host.origin,'Content-Type':'application/octet-stream'},body,signal:controller.signal}).catch(()=>undefined);
    for(let i=0;i<100 && !(await readdir(join(root,'data','assets'))).some(name=>name.startsWith('.drawloom-'));i++)await Bun.sleep(5);
    const navigation=await fetch(host.origin+'/api/command',{method:'POST',headers:{cookie,origin:host.origin,'Content-Type':'application/json'},body:JSON.stringify({kind:'select_project',projectId:project.selectedProjectId}),signal:AbortSignal.timeout(1000)});
    expect(navigation.status).toBe(200);
    controller.abort();release();await upload;
    for(let i=0;i<100 && (await readdir(join(root,'data','assets'))).length;i++)await Bun.sleep(5);
    expect(await readdir(join(root,'data','assets'))).toEqual([]);
    expect((await app.snapshot()).operator.artifacts).toHaveLength(0);
  }finally{controller.abort();release();await host.close();await rm(root,{recursive:true,force:true});}
});
test('authenticated working files stream ranges without importing, and reject directory escapes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-delivery-'));
  const working=join(root,'working');await mkdir(working);await writeFile(join(root,'outside.txt'),'private');
  await symlink(join(root,'outside.txt'),join(working,'escape.txt'));
  const file=await open(join(working,'large.mp4'),'w');await file.truncate(32*1024*1024);await file.write(new Uint8Array([1,2,3,4]),0,4,100);await file.close();
  const app=await createDesktopApplication(join(root,'data'));await app.command({kind:'add_project',directory:working});
  const state=await app.command({kind:'create_conversation',workbenchId:'text',provider:'synthetic'});
  const host=serveDesktop(app,resolve('apps/desktop/build'));
  try{
    const boot=await fetch(host.url,{redirect:'manual'});const cookie=boot.headers.get('set-cookie')!.split(';')[0]!;
    const url=host.origin+'/api/files?'+new URLSearchParams({conversationId:state.selectedId,path:'large.mp4'});
    expect((await fetch(url)).status).toBe(401);
    const r=await fetch(url,{headers:{cookie,range:'bytes=100-103'}});
    expect(r.status).toBe(206);expect(r.headers.get('content-range')).toBe('bytes 100-103/33554432');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1,2,3,4]));expect(r.headers.get('cache-control')).toBe('no-store');
    expect((await app.snapshot()).operator.artifacts).toHaveLength(0);
    for(const path of ['../outside.txt',join(root,'outside.txt'),'escape.txt']){
      const denied=await fetch(host.origin+'/api/files?'+new URLSearchParams({conversationId:state.selectedId,path}),{headers:{cookie}});
      expect(denied.status).toBe(400);
    }
    const head=await fetch(url,{method:'HEAD',headers:{cookie}});expect(head.headers.get('content-length')).toBe('33554432');expect(await head.text()).toBe('');
  }finally{await host.close();await rm(root,{recursive:true,force:true});}
});
test('17 MiB browser media imports stream, preserve identity and serve a suffix range',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-upload-'));await mkdir(join(root,'working'));
  const app=await createDesktopApplication(join(root,'data'));await app.command({kind:'add_project',directory:join(root,'working')});
  const state=await app.command({kind:'create_conversation',workbenchId:'text',provider:'synthetic'});
  const host=serveDesktop(app,resolve('apps/desktop/build'));
  try{
    const boot=await fetch(host.url,{redirect:'manual'});const cookie=boot.headers.get('set-cookie')!.split(';')[0]!;
    const chunk=new Uint8Array(1024*1024).fill(4);const body=new Blob(Array.from({length:17},()=>chunk));
    const r=await fetch(host.origin+'/api/import?'+new URLSearchParams({conversationId:state.selectedId,name:'large.mp4',mediaType:'video/mp4'}),{
      method:'POST',headers:{cookie,origin:host.origin,'Content-Type':'application/octet-stream'},body});
    const asset=await r.json() as {key:string;size:number};expect({status:r.status,asset}).toMatchObject({status:200,asset:{size:17*1024*1024}});
    const tail=await fetch(host.origin+'/api/assets/'+asset.key,{headers:{cookie,range:'bytes=-5'}});
    expect(tail.status).toBe(206);expect(new Uint8Array(await tail.arrayBuffer())).toEqual(new Uint8Array(5).fill(4));
  }finally{await host.close();await rm(root,{recursive:true,force:true});}
});
