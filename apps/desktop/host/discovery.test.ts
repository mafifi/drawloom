import { test, expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDesktopApplication as createDesktopApplication } from './test-project.fixture.js';

test('registered contributions are discoverable without executing a tool or disclosing instructions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-discovery-'));
  const app = await createDesktopApplication(root);
  try {
    const id = (await app.snapshot()).selectedId;
    const catalog = await app.discover(id);
    expect(catalog.entries.some(e => e.kind === 'plugin' && e.name === 'synthetic.text')).toBe(true);
    expect(catalog.entries.some(e => e.kind === 'tool' && e.name === 'text.word_count')).toBe(true);
    expect(catalog.entries.some(e => e.kind === 'skill')).toBe(true);
    expect(JSON.stringify(catalog)).not.toContain('instructions');
    expect((await app.snapshot()).activity).toEqual([]);
    expect((await app.historyPage(id)).entries).toEqual([]);
    await expect(app.command({ kind: 'send', conversationId: id, text: 'No forged selection', attachmentKeys: [], contextArtifactIds: [], selections: [{ id: 'forged', revision: 'forged' }] })).rejects.toThrow();
    expect((await app.historyPage(id)).entries).toEqual([]);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
