import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectPackage, readSkillFile } from './loader.ts';

const schema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const mcpSchema = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
async function fixture(run: (root: string) => Promise<void>, manifest: object = { $schema: schema, name: 'plain' }) {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-plugin-test-'));
  try {
    await writeFile(join(root, 'plugin.json'), JSON.stringify(manifest));
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('standard metadata does not require a Drawloom version or factory', async () => {
  await fixture(async root => {
    const p = await inspectPackage(root);
    expect(p.name).toBe('plain'); expect(p.version).toBeUndefined();
    expect(p.skills).toEqual([]); expect(p.servers).toEqual([]);
  });
  await fixture(async root => expect((await inspectPackage(root)).version).toBe('spring edition'),
    { $schema: schema, name: 'plain', version: 'spring edition' });
});
test('standard non-fatal fields do not reject the package or acquire semantics', async () => {
  await fixture(async root => {
    const p = await inspectPackage(root);
    expect(p.name).toBe('plain'); expect(p.extensions).toEqual({});
    expect(p.diagnostics).toEqual([
      { component: 'manifest', code: 'ignored-field:execute' },
      { component: 'manifest', code: 'ignored-extensions' },
    ]);
  }, { $schema: schema, name: 'plain', execute: './untrusted.mjs', extensions: 'bad' });
});
test('unsupported schema and invalid required metadata reject before discovery', async () => {
  for (const manifest of [{ $schema: 'https://invalid.example/schema', name: 'plain' },
    { $schema: schema, name: 'Bad Name' }, { $schema: schema, name: 'plain', version: 4 }]) {
    await fixture(async root => { await expect(inspectPackage(root)).rejects.toThrow(); }, manifest);
  }
});
test('unknown client extensions are retained without executing or validating their contents', async () => {
  await fixture(async root => {
    const p = await inspectPackage(root);
    expect(p.extensions).toEqual({ 'org.example.other': { entry: './does-not-exist.mjs' } });
    expect(p.diagnostics).toEqual([]);
  }, { $schema: schema, name: 'plain', extensions: { 'org.example.other': { entry: './does-not-exist.mjs' } } });
});
test('skills retain supporting resources; invalid and nested skills do not hide valid siblings', async () => {
  await fixture(async root => {
    await mkdir(join(root, 'skills', 'outline', 'references'), { recursive: true });
    await writeFile(join(root, 'skills', 'outline', 'SKILL.md'), '---\nname: outline\ndescription: Write an outline\n---\nRead references/style.md.');
    await writeFile(join(root, 'skills', 'outline', 'references', 'style.md'), 'Use short sentences.');
    await mkdir(join(root, 'skills', 'outline', 'references', 'nested'), { recursive: true });
    await writeFile(join(root, 'skills', 'outline', 'references', 'nested', 'SKILL.md'), '---\nname: nested\ndescription: Not an immediate child skill\n---\nDo not discover this.');
    await mkdir(join(root, 'skills', 'bad'), { recursive: true });
    await writeFile(join(root, 'skills', 'bad', 'SKILL.md'), 'Not a skill');
    const p = await inspectPackage(root);
    expect(p.skills.map(s => s.name)).toEqual(['outline']);
    expect(JSON.stringify(p.skills)).not.toContain('Read references');
    expect(await readSkillFile(root, 'skills/outline/references/style.md')).toBe('Use short sentences.');
    expect(p.diagnostics).toContainEqual({ component: 'skill:bad', code: 'invalid' });
  });
});
test('invalid MCP entries and component locations leave valid siblings available', async () => {
  await fixture(async root => {
    await writeFile(join(root, 'skills'), 'wrong kind');
    await writeFile(join(root, 'mcp.json'), JSON.stringify({ $schema: mcpSchema, mcpServers: {
      good: { type: 'stdio', command: 'node' }, bad: { type: 'stdio', command: 'node', secret: 'not allowed' },
      shell: { type: 'stdio', command: 'node -e evil' }, escape: { type: 'stdio', command: '../outside' },
    } }));
    const p = await inspectPackage(root);
    expect(p.servers.map(s => s.name)).toEqual(['good']);
    expect(p.diagnostics.map(d => d.component).sort()).toEqual(['server:bad', 'server:escape', 'server:shell', 'skills']);
  });
});
test('resolved paths cannot escape through symlinks or parent traversal', async () => {
  await fixture(async root => {
    await symlink(tmpdir(), join(root, 'outside'));
    await expect(readSkillFile(root, '../outside')).rejects.toThrow();
    await expect(readSkillFile(root, 'outside/example')).rejects.toThrow();
    await symlink(tmpdir(), join(root, 'skills'));
    expect((await inspectPackage(root)).diagnostics).toContainEqual({ component: 'skills', code: 'invalid' });
  });
});
