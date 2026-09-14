import {test,expect,spyOn} from 'bun:test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createNodeJsonStore} from '@drawloom/node-host';
import {createTestDesktopApplication} from './test-project.fixture.js';
import * as catalogue from './models.js';

test('model selection persists without creating or retargeting conversations; unsupported choices leave it unchanged',async()=>{
  const root=await mkdtemp(join(tmpdir(),'drawloom-model-selection-'));
  const discovery=spyOn(catalogue,'desktopModels').mockResolvedValue([{id:'small',title:'Small',efforts:['low']}]);
  await createNodeJsonStore(join(root,'state')).set('project',{version:1,selectedId:'native',assets:[],conversations:[
    {id:'native',title:'Existing',workbenchId:'text',provider:'codex'},
    {id:'local',title:'Synthetic',workbenchId:'text',provider:'synthetic'},
  ]});
  let app=await createTestDesktopApplication(root);
  try {
    const before=(await app.snapshot()).conversations;
    await app.command({kind:'set_model',conversationId:'native',selection:{model:'small',effort:'low'}});
    await expect(app.command({kind:'set_model',conversationId:'native',selection:{model:'small',effort:'high'}})).rejects.toThrow();
    await expect(app.command({kind:'set_model',conversationId:'local',selection:{model:'small'}})).rejects.toThrow();
    await app.close();app=await createTestDesktopApplication(root);
    const after=(await app.snapshot()).conversations;
    expect(after.map(c=>c.id)).toEqual(before.map(c=>c.id));
    expect(after.find(c=>c.id==='native')).toMatchObject({title:'Existing',provider:'codex',modelSelection:{model:'small',effort:'low'}});
    await app.command({kind:'set_model',conversationId:'native'});
    expect((await app.snapshot()).conversations.find(c=>c.id==='native')?.modelSelection).toBeUndefined();
  }finally{await app.close();discovery.mockRestore();await rm(root,{recursive:true,force:true});}
});
