import { expect,test } from 'bun:test';
import { mkdtemp,mkdir,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createInstallationStore } from './plugin-installations.js';
import { createTestDesktopApplication } from './test-project.fixture.js';
import { serveDesktop } from './server.js';

test('a producer declaration and later media result are shared with another workbench and remote viewer',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-shared-media-'));
  const installs=await createInstallationStore(createNodeJsonStore(join(root,'state')));
  for(const id of ['producer','consumer']) {
    const pkg=join(root,id);await mkdir(pkg);
    const build=await Bun.build({entrypoints:[resolve(import.meta.dir,'shared-media.fixture.ts')],target:'bun',outdir:pkg,naming:'backend.mjs'});
    if(!build.success)throw Error('Fixture build failed');
    await writeFile(join(pkg,'plugin.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',name:id,extensions:{'io.github.mafifi.drawloom':{version:1,backend:{entrypoint:'./backend.mjs'},workbenches:[{id,title:id,openingTool:{server:'media',tool:'open'}}]}}}));
    const installation=await installs.add(pkg);
    await installs.configure(installation,{enabled:true,trustedBackend:true,servers:[],configuration:{id,...(id==='producer'?{origin:'https://initial.example'}:{}),url:'https://returned.example/video.mp4?signature=PRIVATE'}});
  }
  const app=await createTestDesktopApplication(root);
  const host=serveDesktop(app,resolve('apps/desktop/build'));
  try {
    const boot=await fetch(host.url,{redirect:'manual'});const cookie=boot.headers.get('set-cookie')!.split(';')[0]!;
    const initial=await app.command({kind:'create_conversation',workbenchId:'consumer',provider:'synthetic'});
    const consumer={conversationId:initial.selectedId,viewId:'consumer.view'};
    await app.viewSession({...consumer,action:'open'});
    expect((await app.viewPresentation(consumer)).resourceDomains).toContain('https://initial.example');
    const before=initial.mediaPolicy.revision;
    const producer=await app.command({kind:'create_conversation',workbenchId:'producer',provider:'synthetic'});
    await app.viewRequest({conversationId:producer.selectedId,viewId:'producer.view',request:{name:'result',arguments:{}}});
    const changed=await app.snapshot();expect(changed.mediaPolicy.revision).not.toBe(before);
    expect(JSON.stringify(changed.mediaPolicy)).not.toContain('signature');
    const entry=(await app.historyPage(producer.selectedId)).entries[0]!;
    const params=new URLSearchParams({conversationId:producer.selectedId,entryId:entry.id,resourceId:entry.resources![0]!.id});
    const path='/api/remote-media?'+params;
    expect((await fetch(host.origin+path)).status).toBe(401);
    const preview=await fetch(host.origin+path,{headers:{cookie}});
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-security-policy')).toContain('media-src https://returned.example');
    expect(preview.headers.get('content-security-policy')).toContain('https://initial.example');
    expect(preview.headers.get('content-security-policy')).toContain("connect-src 'none'");
    expect(await preview.text()).toContain('https://returned.example/video.mp4?signature=PRIVATE');
    params.set('conversationId',consumer.conversationId);
    expect((await fetch(host.origin+'/api/remote-media?'+params,{headers:{cookie}})).status).toBe(404);
    await app.command({kind:'select_conversation',conversationId:consumer.conversationId});
    await app.viewSession({...consumer,action:'open'});
    const shared=await fetch(host.origin+'/api/views/consumer.view?conversationId='+consumer.conversationId,{headers:{cookie}});
    const csp=shared.headers.get('content-security-policy')!;
    expect(csp).toContain('https://returned.example');
    expect(csp.split(';').find(p=>p.includes('script-src'))).not.toContain('https:');
    expect(csp.split(';').find(p=>p.includes('style-src'))).not.toContain('https://returned.example');
  }finally{await host.close();}
  const reopened=await createTestDesktopApplication(root);
  try{expect((await reopened.snapshot()).mediaPolicy.sources.map(s=>s.origin)).toEqual(['https://initial.example','https://returned.example']);}
  finally{await reopened.close();}
});
