import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createMediaPolicy } from './media-policy.js';

test('a plugin media result declares one shared origin, survives restart and never stores signed URLs', async () => {
  const store = createNodeJsonStore(await mkdtemp(join(tmpdir(), 'drawloom-media-policy-')));
  let policy = await createMediaPolicy(store);
  const empty = policy.snapshot().revision;
  await policy.capture('package:motion', [{type:'resource_link',name:'Candidate',uri:'https://media.example/video.mp4?signature=PRIVATE',mimeType:'video/mp4'}]);
  const snapshot = policy.snapshot();
  expect(snapshot.sources).toEqual([{origin:'https://media.example',sources:['package:motion']}]);
  expect(snapshot.revision).not.toBe(empty);
  expect(policy.allows('https://media.example/other.mp4?signature=NEW')).toBe(true);
  expect(policy.allows('https://media.example.attacker.test/video')).toBe(false);
  expect(JSON.stringify(await store.get('media-policy'))).not.toContain('PRIVATE');
  await policy.capture('package:motion', [{type:'resource_link',name:'New candidate',uri:'https://media.example/other.mp4',mimeType:'video/mp4'}]);
  expect(policy.snapshot().revision).toBe(snapshot.revision);
  await policy.declare('workbench:reader',['https://media.example']);
  expect(policy.snapshot().revision).toBe(snapshot.revision);
  policy = await createMediaPolicy(store);
  expect(policy.snapshot().sources[0]!.sources).toEqual(['package:motion','workbench:reader']);
});

test('only explicit media declarations register sources; invalid URLs and prose do not', async () => {
  const policy = await createMediaPolicy(createNodeJsonStore(await mkdtemp(join(tmpdir(),'drawloom-media-validation-'))));
  await policy.capture('package:editor',[
    {type:'text',text:'https://prose.example/a.png'},
    {type:'resource_link',name:'HTML',uri:'https://active.example/a.html',mimeType:'text/html'},
    {type:'resource_link',name:'Credentials',uri:'https://user:secret@credentials.example/a.png',mimeType:'image/png'},
    {type:'resource_link',name:'Unsupported',uri:'javascript:alert(1)',mimeType:'image/png'},
  ]);
  expect(policy.snapshot().sources).toEqual([]);
  await expect(policy.declare('plugin',['https://media.example/path'])).rejects.toThrow();
  await expect(policy.declare('plugin',['https://*.example'])).rejects.toThrow();
  await policy.capture('package:music',[{type:'resource',resource:{uri:'https://music.example/a.wav',mimeType:'audio/wav',text:''}}]);
  expect(policy.snapshot().sources).toEqual([{origin:'https://music.example',sources:['package:music']}]);
});

test('concurrent declarations retain both sources and failed persistence does not publish permission', async () => {
  const store=createNodeJsonStore(await mkdtemp(join(tmpdir(),'drawloom-media-concurrent-')));
  const policy=await createMediaPolicy(store);
  await Promise.all([policy.declare('one',['https://one.example']),policy.declare('two',['https://two.example'])]);
  expect(policy.snapshot().sources.map(s=>s.origin)).toEqual(['https://one.example','https://two.example']);
  const failed=await createMediaPolicy({get:async()=>undefined,set:async()=>{throw Error('disk unavailable');}});
  await expect(failed.declare('one',['https://one.example'])).rejects.toThrow('disk unavailable');
  expect(failed.allows('https://one.example/a.mp4')).toBe(false);
});

test('cumulative declarations do not hit the bounded single-delivery limit',async()=>{
  const store=createNodeJsonStore(await mkdtemp(join(tmpdir(),'drawloom-media-growth-')));
  const policy=await createMediaPolicy(store);
  await policy.declare('batch',Array.from({length:256},(_,i)=>`https://media-${i}.example`));
  await policy.capture('later',[{type:'resource_link',name:'Later',uri:'https://later.example/a.png',mimeType:'image/png'}]);
  for(let i=0;i<129;i++)await policy.declare('owner-'+i,['https://later.example']);
  expect(policy.snapshot().sources).toHaveLength(257);
  expect((await createMediaPolicy(store)).allows('https://later.example/a.png')).toBe(true);
});
