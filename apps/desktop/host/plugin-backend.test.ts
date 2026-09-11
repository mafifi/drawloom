import { test, expect } from 'bun:test';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBackendLoader } from './plugin-backend.js';
import type { PackageInventory } from '@drawloom/plugins';

test('one installation has a distinct fixed activation in each project', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-backend-project-'));
  const loader = createBackendLoader();
  try {
    await writeFile(join(root, 'backend.mjs'), `export default context => ({
      contributions: { skills: [{id:'where',title:context.project.id,description:context.project.directory,instructions:'test'}] }, dispose:async()=>{}
    });`);
    const inventory: PackageInventory = {root,name:'sample',skills:[],servers:[],diagnostics:[],extensions:{},drawloom:{version:1,backend:{entrypoint:'./backend.mjs'}}};
    const options = {installationId:'same',dataDirectory:join(root,'data'),configuration:{},capabilities:{},available:[],trusted:true};
    const a = await loader.activate(inventory,{...options,project:{id:'a',directory:join(root,'a')}});
    const b = await loader.activate(inventory,{...options,project:{id:'b',directory:join(root,'b')}});
    expect(a.status).toBe('ready'); expect(b.status).toBe('ready'); expect(b).not.toBe(a);
    if (a.status==='ready' && b.status==='ready') {
      expect(a.backend.contributions?.skills?.[0]?.title).toBe('a');
      expect(b.backend.contributions?.skills?.[0]?.title).toBe('b');
    }
    expect(await loader.activate(inventory,{...options,project:{id:'a',directory:join(root,'a')}})).toBe(a);
  } finally {await loader.close();await rm(root,{recursive:true,force:true});}
});

test('optional dependencies do not block activation and backend sees only declared availability', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-backend-optional-'));
  const loader = createBackendLoader();
  try {
    await writeFile(join(root, 'backend.mjs'), `export default context => ({
      contributions: { skills: context.dependencies.map(d => ({ id: d.id, title: d.available ? 'available' : 'missing', description: d.kind, instructions: 'test' })) },
      dispose: async () => {}
    });`);
    const inventory = { root, name: 'sample', skills: [], servers: [], diagnostics: [], extensions: {},
      drawloom: { version: 1, backend: { entrypoint: './backend.mjs' }, optional: [
        { kind: 'tool', id: 'package:media:media:inspect' }, { kind: 'skill', id: 'package:editor:skill:edit' },
      ] } };
    const result = await loader.activate(inventory as PackageInventory, { installationId: 'sample', dataDirectory: join(root, 'data'),
      configuration: {}, capabilities: {}, available: [{ kind: 'skill', id: 'package:editor:skill:edit' }, { kind: 'tool', id: 'not-declared' }], trusted: true });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.backend.contributions?.skills).toEqual([
      { id: 'package:media:media:inspect', title: 'missing', description: 'tool', instructions: 'test' },
      { id: 'package:editor:skill:edit', title: 'available', description: 'skill', instructions: 'test' },
    ]);
  } finally { await loader.close(); await rm(root, { recursive: true, force: true }); }
});

test('backend trust and dependencies are checked before module execution; cleanup is once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-backend-'));
  const marker = join(root, 'executions');
  try {
    await writeFile(join(root, 'backend.mjs'), `import {appendFile} from 'node:fs/promises';
      await appendFile(${JSON.stringify(marker)}, 'import;');
      export default async context => {
        await appendFile(${JSON.stringify(marker)}, Object.keys(context.capabilities).join(',') + ';');
        return { dispose: async () => appendFile(${JSON.stringify(marker)}, 'dispose;') };
      };`);
    const inventory: PackageInventory = { root, name: 'sample', skills: [], servers: [], diagnostics: [], extensions: {},
      drawloom: { version: 1, backend: { entrypoint: './backend.mjs' }, requires: [{ kind: 'capability', id: 'orchestration' }] } };
    const loader = createBackendLoader();
    const options = { installationId: 'sample-1', dataDirectory: join(root, 'data'), configuration: {}, capabilities: {}, available: [] };
    expect((await loader.activate(inventory, { ...options, trusted: false })).status).toBe('untrusted');
    expect((await loader.activate(inventory, { ...options, trusted: true })).status).toBe('unavailable');
    expect(await Bun.file(marker).exists()).toBe(false);
    inventory.drawloom!.requires = [];
    const active = await loader.activate(inventory, { ...options, trusted: true });
    expect(active.status).toBe('ready');
    expect(await loader.activate(inventory, { ...options, trusted: true })).toBe(active);
    expect(await Bun.file(marker).text()).toBe('import;;');
    await loader.close(); await loader.close();
    expect(await Bun.file(marker).text()).toBe('import;;dispose;');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('backend entrypoint cannot escape package via a symlink', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-backend-path-'));
  try {
    const dir = join(root, 'package'); await Bun.write(join(dir, 'placeholder'), '');
    await writeFile(join(root, 'outside.mjs'), 'throw Error("must not execute")');
    await symlink(join(root, 'outside.mjs'), join(dir, 'escape.mjs'));
    const loader = createBackendLoader();
    const inventory: PackageInventory = { root: dir, name: 'sample', skills: [], servers: [], diagnostics: [], extensions: {},
      drawloom: { version: 1, backend: { entrypoint: './escape.mjs' } } };
    const result = await loader.activate(inventory, { installationId: 'sample', dataDirectory: join(root, 'data'),
      configuration: {}, capabilities: {}, available: [], trusted: true });
    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.code).toBe('backend_path_unavailable');
    await loader.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('one synchronous dispose failure still awaits every backend cleanup exactly once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-backend-cleanup-'));
  const marker = join(root, 'cleanup');
  const loader = createBackendLoader();
  try {
    await writeFile(join(root, 'backend.mjs'), `import { appendFileSync } from 'node:fs';
      import { appendFile } from 'node:fs/promises';
      export default context => ({
        dispose() {
          if (context.installationId === 'first') {
            appendFileSync(${JSON.stringify(marker)}, 'first;');
            throw Error('Synchronous disposal failure');
          }
          return appendFile(${JSON.stringify(marker)}, 'second;');
        }
      });`);
    const inventory: PackageInventory = { root, name: 'sample', skills: [], servers: [], diagnostics: [], extensions: {},
      drawloom: { version: 1, backend: { entrypoint: './backend.mjs' } } };
    for (const installationId of ['first', 'second']) {
      const result = await loader.activate(inventory, { installationId, dataDirectory: join(root, installationId),
        configuration: {}, capabilities: {}, available: [], trusted: true });
      expect(result.status).toBe('ready');
    }
    const closing = loader.close();
    await expect(closing).rejects.toThrow();
    expect(await Bun.file(marker).text()).toBe('first;second;');
    expect(loader.close()).toBe(closing);
    await expect(loader.close()).rejects.toThrow('Plugin backend cleanup failed');
    expect(await Bun.file(marker).text()).toBe('first;second;');
  } finally { await loader.close().catch(() => {}); await rm(root, { recursive: true, force: true }); }
});
