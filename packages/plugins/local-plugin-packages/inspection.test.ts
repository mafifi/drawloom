import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { packageInspectionConformance } from '@drawloom/plugins/conformance';
import { PLUGIN_SCHEMA, MCP_PACKAGE_SCHEMA } from '@drawloom/plugins';
import * as inspector from './src/index.ts';
export async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-package-test-'));
  return { root,
    async write(path: string, contents: string) { const target = join(root, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, contents); },
    async dispose() { await rm(root, { recursive: true, force: true }); },
  };
}
test('shared package inventory conformance', () => packageInspectionConformance(inspector, fixture));
test('resolved symlink escapes cannot supply components or supporting files', async () => {
  const local = await fixture(), outside = await fixture();
  try {
    await local.write('plugin.json', JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'local' }));
    await outside.write('SKILL.md', '---\nname: escaped\ndescription: Outside\n---\n');
    await local.write('skills/valid/SKILL.md', '---\nname: valid\ndescription: Valid\n---\n');
    await symlink(outside.root, join(local.root, 'skills/escaped'));
    await symlink(join(outside.root, 'SKILL.md'), join(local.root, 'skills/valid/secret.md'));
    await symlink(join(outside.root, 'SKILL.md'), join(local.root, 'mcp.json'));
    const inventory = await inspector.inspectPackage(local.root);
    expect(inventory.skills.map(s => s.name)).toEqual(['valid']);
    expect(inventory.diagnostics.map(d => d.component)).toContain('mcp');
    await expect(inspector.readSupportingFile(inventory, 'valid', 'secret.md')).rejects.toThrow();
    await expect(inspector.readSupportingFile(inventory, 'valid', '../../../plugin.json')).rejects.toThrow();
  } finally { await local.dispose(); await outside.dispose(); }
});
test('known extension failure and malformed fixed locations preserve siblings', async () => {
  const local = await fixture();
  try {
    await local.write('plugin.json', JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'local', extensions: { 'io.github.mafifi.drawloom': { version: 1, backend: { entrypoint: '../escape.js' } } } }));
    await local.write('skills', 'not a directory');
    await local.write('mcp.json', JSON.stringify({ $schema: MCP_PACKAGE_SCHEMA, mcpServers: { good: { type: 'streamable-http', url: 'https://example.com/mcp' }, bad: { type: 'streamable-http', url: 'http://example.com/mcp' } } }));
    const inventory = await inspector.inspectPackage(local.root);
    expect(inventory.drawloom).toBeUndefined();
    expect(inventory.servers.map(s => s.name)).toEqual(['good']);
    expect(inventory.diagnostics.map(d => d.component)).toEqual(expect.arrayContaining(['extension:io.github.mafifi.drawloom', 'skills', 'server:bad']));
  } finally { await local.dispose(); }
});
test('inspection recognizes extension metadata without importing backend or fetching schemas', async () => {
  const local = await fixture();
  let fetched = 0;
  const schemaHost = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch() { fetched++; return Response.json({}); } });
  try {
    await local.write('backend.mjs', 'throw new Error("Must not execute on inspection");');
    await local.write('plugin.json', JSON.stringify({ $schema: PLUGIN_SCHEMA, name: 'local', extensions: { 'io.github.mafifi.drawloom': { version: 1, backend: { entrypoint: 'backend.mjs' } } } }));
    await local.write('mcp.json', JSON.stringify({ $schema: schemaHost.url.href, mcpServers: {} }));
    const inventory = await inspector.inspectPackage(local.root);
    expect(inventory.drawloom?.backend?.entrypoint).toBe('backend.mjs');
    expect(inventory.diagnostics).toContainEqual({ component: 'mcp', code: 'invalid' });
    expect(fetched).toBe(0);
    await local.write('plugin.json', JSON.stringify({ $schema: schemaHost.url.href, name: 'local' }));
    await expect(inspector.inspectPackage(local.root)).rejects.toThrow();
    expect(fetched).toBe(0);
  } finally { schemaHost.stop(true); await local.dispose(); }
});
