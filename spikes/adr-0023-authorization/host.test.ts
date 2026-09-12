import { describe, expect, test } from 'bun:test';
import { cedarEngine, casbinEngine } from './engines.ts';
import { knowledgeHost, type Facts } from './host.ts';
import type { Labels } from './contract.ts';

function fixture() {
  let reads = 0;
  const labels: Labels = { tenant: 'local', active: true, sensitivity: 0, compartments: [], expires: 500, remoteAllowed: true };
  const restricted = { ...labels, sensitivity: 2, compartments: ['clinic'], remoteAllowed: false };
  const facts: Facts = { subjects: new Map([
    ['owner', { tenant: 'local', active: true, clearance: 2, compartments: ['clinic'] }],
    ['guest', { tenant: 'local', active: true, clearance: 0, compartments: [] }],
  ]), material: new Map([
    ['public', { labels, read: () => 'Public evidence' }],
    ['restricted', { labels: restricted, read: () => 'Synthetic restricted evidence' }],
    ['derived', { labels, sources: ['public', 'restricted'], read: () => { reads++; return 'Synthetic derived claim'; } }],
  ]) };
  const request = { subject: { type: 'user', id: 'owner' }, action: { name: 'read' }, resource: { type: 'knowledge', id: 'derived' }, context: { now: 100 } };
  return { facts, request, reads: () => reads };
}

for (const [name, create] of [['cedar', cedarEngine], ['casbin', casbinEngine]] as const) describe(`${name} host`, () => {
  test('derives restrictions from both sources; denial never reads the claim body', async () => {
    const f = fixture(); const host = knowledgeHost(await create(), f.facts);
    expect(await host('owner', f.request, 100)).toEqual({ decision: true, content: 'Synthetic derived claim' });
    expect(f.reads()).toBe(1);
    expect((await host('guest', { ...f.request, subject: { type: 'user', id: 'guest' } }, 100)).decision).toBe(false);
    expect(f.reads()).toBe(1);
  });
  test('identity substitution, forged properties and forged clock never grant access', async () => {
    const f = fixture(); const host = knowledgeHost(await create(), f.facts);
    expect((await host('guest', f.request, 100)).decision).toBe(false);
    const forged = { ...f.request, subject: { type: 'user', id: 'guest', properties: { clearance: 2, compartments: ['clinic'] } }, resource: { ...f.request.resource, properties: { sensitivity: 0, sources: [] } } };
    expect((await host('guest', forged, 100)).decision).toBe(false);
    expect((await host('owner', f.request, 600)).decision).toBe(false);
    expect(f.reads()).toBe(0);
  });
  test('revocation, source withdrawal and missing sources affect the next read', async () => {
    const f = fixture(); const host = knowledgeHost(await create(), f.facts);
    expect((await host('owner', f.request, 100)).decision).toBe(true);
    f.facts.subjects.get('owner')!.compartments = [];
    expect((await host('owner', f.request, 100)).decision).toBe(false);
    f.facts.subjects.get('owner')!.compartments = ['clinic'];
    f.facts.material.get('restricted')!.labels.active = false;
    expect((await host('owner', f.request, 100)).decision).toBe(false);
    f.facts.material.delete('restricted');
    expect((await host('owner', f.request, 100)).decision).toBe(false);
    expect(f.reads()).toBe(1);
  });
  test('Nightloom may derive locally without permission to send the same content to a remote model', async () => {
    const f = fixture(); const host = knowledgeHost(await create(), f.facts);
    expect((await host('owner', { ...f.request, action: { name: 'derive' } }, 100)).decision).toBe(true);
    expect((await host('owner', { ...f.request, action: { name: 'export_model' } }, 100)).decision).toBe(false);
    expect(f.reads()).toBe(1);
  });
  test('source cycles and engine failures do not expose content or retry', async () => {
    const f = fixture(); let calls = 0;
    const failed = knowledgeHost(async () => { calls++; throw new Error('offline'); }, f.facts);
    expect((await failed('owner', f.request, 100)).decision).toBe(false);
    expect(calls).toBe(1); expect(f.reads()).toBe(0);
    f.facts.material.get('restricted')!.sources = ['derived'];
    const host = knowledgeHost(await create(), f.facts);
    expect((await host('owner', f.request, 100)).decision).toBe(false);
    expect(f.reads()).toBe(0);
  });
  test('a changed entitlement during evaluation cannot reuse an earlier allow', async () => {
    const f = fixture(); const engine = await create();
    const host = knowledgeHost(async request => {
      const result = await engine(request);
      f.facts.subjects.get('owner')!.active = false;
      return result;
    }, f.facts);
    expect((await host('owner', f.request, 100)).decision).toBe(false);
    expect(f.reads()).toBe(0);
  });
});
