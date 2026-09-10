import { test, expect } from 'bun:test';
import { createResourceContent } from './resource-content.js';

test('one result cannot multiply the inline capture allowance across content blocks', async () => {
  let writes = 0, bytesStored = 0;
  const collector = createResourceContent({ assets: {
    put: async (bytes, mediaType) => { writes++; bytesStored += bytes.length; return {key:`asset-${writes}`,size:bytes.length,mediaType}; },
    read: async () => new Uint8Array(),
  }, existing:async()=>undefined,save:async()=>{},knownAsset:()=>undefined });
  const result = await collector.capture({ id:'large',source:'public',content:Array.from({length:3},(_,i)=>({
    type:'resource',resource:{uri:`doc://${i}`,mimeType:'text/plain',text:'x'.repeat(8*1024*1024)},
  })) });
  expect(bytesStored).toBe(16*1024*1024);
  expect(writes).toBe(2);
  expect(result.resources?.map(r=>r.status)).toEqual(['ready','ready','unavailable']);
});

test('capture storage failure is explicit and never advertises a saved result', async () => {
  let saved = false;
  const collector = createResourceContent({ assets: { put: async () => { throw Error('Disk full'); }, read: async () => new Uint8Array() },
    existing: async () => undefined, save: async () => { saved = true; }, knownAsset: () => undefined });
  await expect(collector.capture({ id: 'failed', source: 'test', content: [{ type: 'resource', resource: { uri: 'doc://a', text: 'hello', mimeType: 'text/plain' } }] })).rejects.toThrow('Disk full');
  expect(saved).toBe(false);
});

test('provider-owned opaque receipts make returned links readable without revealing their native mapping', async () => {
  const collector = createResourceContent({assets:{put:async()=>{throw Error('No download');},read:async()=>new Uint8Array()},existing:async()=>undefined,save:async()=>{},knownAsset:()=>undefined});
  const entry = await collector.capture({id:'receipt',source:'codex:docs',content:[{type:'resource_link',uri:'doc://returned',name:'Returned'}],resourceSelections:{'doc://returned':{id:'opaque-id',revision:'opaque-revision'}}});
  expect(entry.resources?.[0]).toMatchObject({status:'readable',retrieval:{id:'opaque-id',revision:'opaque-revision'}});
});

test('standard resources retain provenance and capture inline bytes once, without resolving links', async () => {
  let writes = 0;
  const captured = new Map<string, unknown>();
  const collector = createResourceContent({
    assets: { put: async (bytes, mediaType) => { writes++; return { key: `key-${writes}`, size: bytes.length, mediaType }; }, read: async () => new Uint8Array() },
    existing: async id => captured.get(id) as never,
    save: async entry => { captured.set(entry.id, entry); },
    knownAsset: () => undefined,
  });
  const input = { id: 'call-1', source: 'plugin:example', operationId: 'op', content: [
    { type: 'resource', resource: { uri: 'document://a', mimeType: 'text/plain', text: 'A source' } },
    { type: 'resource_link', uri: 'https://example.com/private', name: 'Remote file' },
  ] };
  const result = await collector.capture(input);
  expect(result.resources?.[0]).toMatchObject({ source: 'plugin:example', asset: { mediaType: 'text/plain' } });
  expect(result.resources?.[1]).toMatchObject({ title: 'Remote file', status: 'unavailable' });
  expect(writes).toBe(1);
  await collector.capture(input);
  expect(writes).toBe(1);
});

test('arbitrary structured output is not a file or skill; invalid links never become readable', async () => {
  const collector = createResourceContent({ assets: { put: async () => { throw Error('must not capture'); }, read: async () => new Uint8Array() },
    existing: async () => undefined, save: async () => {}, knownAsset: () => undefined });
  const entry = await collector.capture({ id: 'call', source: 'x', content: [{ type: 'text', text: '{"skill":"trusted","file":"/etc/passwd"}' },
    { type: 'resource_link', uri: 'file:///etc/passwd', name: 'Private file' }] });
  expect(entry.resources).toHaveLength(1);
  expect(entry.resources?.[0]?.status).toBe('unavailable');
  expect(entry.assets).toEqual([]);
});
