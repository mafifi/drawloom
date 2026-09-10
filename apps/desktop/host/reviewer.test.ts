import { expect, test, spyOn } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeJsonStore } from '@drawloom/node-host';
import { createDesktopApplication } from './application.js';
import { ConversationSchema } from '../src/lib/protocol.js';
import * as composition from './composition.js';
import * as synthetic from '@drawloom/synthetic-agent';

test('legacy conversations default to human review without changing identity or provider', () => {
  expect(ConversationSchema.parse({ id: 'old', title: 'Existing', workbenchId: 'text', provider: 'codex' })).toMatchObject({ id: 'old', provider: 'codex', reviewer: 'human' });
});
test('native MCP configuration reviews every mutating or unclassified invocation', () => {
  const config = composition.mcpReviewConfiguration({ id: 'exposure', tools: [
    { name: 'text.read', description: '', inputSchema: {}, outputSchema: {}, annotations: { readOnlyHint: true } },
    { name: 'text.edit', description: '', inputSchema: {}, outputSchema: {}, annotations: { readOnlyHint: false } },
    { name: 'text.unknown', description: '', inputSchema: {}, outputSchema: {} },
  ] });
  expect(config).toEqual({ default_tools_approval_mode: 'prompt', tools: { 'text.read': { approval_mode: 'approve' }, 'text.edit': { approval_mode: 'prompt' }, 'text.unknown': { approval_mode: 'prompt' } } });
});
test('conversation review mode persists separately and unsupported delegated selection does not change it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-reviewer-'));
  const store = createNodeJsonStore(join(root, 'state'));
  await store.set('project', { version: 1, selectedId: 'local', assets: [], conversations: [
    { id: 'local', title: 'Synthetic', workbenchId: 'text', provider: 'synthetic' },
    { id: 'native', title: 'Codex', workbenchId: 'text', provider: 'codex', reviewer: 'delegated' },
  ] });
  let app = await createDesktopApplication(root);
  try {
    await expect(app.command({ kind: 'set_reviewer', conversationId: 'local', reviewer: 'delegated' })).rejects.toThrow('review');
    expect((await app.snapshot()).conversations.find(c => c.id === 'local')?.reviewer).toBe('human');
    await app.command({ kind: 'set_reviewer', conversationId: 'local', reviewer: 'human' });
    await app.close(); app = await createDesktopApplication(root);
    const saved = await app.snapshot();
    expect(saved.conversations.map(c => c.reviewer)).toEqual(['human', 'delegated']);
    expect(saved.controls.reviewerModes).toEqual(['human']);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('accepted execution locks reviewer selection before delayed started delivery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-reviewer-start-'));
  let deliver!: () => void, finish!: () => void;
  const delivery = new Promise<void>(resolve => { deliver = resolve; });
  const completion = new Promise<void>(resolve => { finish = resolve; });
  const original = synthetic.createSyntheticDriver;
  // Keep the real synthetic session; delay its public signal boundary like a
  // host pump awaiting previous-turn history ingestion. Commands remain sequential.
  const replacement = spyOn(synthetic, 'createSyntheticDriver').mockImplementation(respond => {
    const driver = original(async (text, context) => { await completion; return respond(text, context); });
    const open = driver.openSession.bind(driver);
    driver.openSession = async input => {
      const result = await open(input);
      if (result.status === 'ok') {
        const signals = result.value.signals.bind(result.value);
        result.value.signals = () => ({ async *[Symbol.asyncIterator]() {
          for await (const signal of signals()) { await delivery; yield signal; }
        } });
      }
      return result;
    };
    return driver;
  });
  let app: Awaited<ReturnType<typeof createDesktopApplication>> | undefined;
  try {
    app = await createDesktopApplication(root);
    const conversationId = (await app.snapshot()).selectedId;
    const accepted = await app.command({ kind: 'send', conversationId, text: 'Independent synthetic fixture', attachmentKeys: [], contextArtifactIds: [] });
    expect(accepted.activeOperation).toBeTruthy();
    await expect(app.command({ kind: 'set_reviewer', conversationId, reviewer: 'human' })).rejects.toThrow('idle');
    deliver(); finish();
    for (let attempt = 0; attempt < 100 && (await app.snapshot()).activeOperation; attempt++) await new Promise(resolve => setTimeout(resolve, 5));
    expect((await app.snapshot()).activeOperation).toBeUndefined();
    await app.command({ kind: 'set_reviewer', conversationId, reviewer: 'human' });
  } finally { deliver(); finish(); await app?.close(); replacement.mockRestore(); await rm(root, { recursive: true, force: true }); }
});

test('rejected execute releases the startup lock for reviewer correction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-reviewer-rejected-'));
  const store = createNodeJsonStore(join(root, 'state'));
  await store.set('project', { version: 1, selectedId: 'local', assets: [], conversations: [
    { id: 'local', title: 'Synthetic', workbenchId: 'text', provider: 'synthetic', reviewer: 'delegated' },
  ] });
  const app = await createDesktopApplication(root);
  try {
    await expect(app.command({ kind: 'send', conversationId: 'local', text: 'Rejected mode', attachmentKeys: [], contextArtifactIds: [] })).rejects.toThrow('provider rejected');
    expect((await app.snapshot()).activeOperation).toBeUndefined();
    await app.command({ kind: 'set_reviewer', conversationId: 'local', reviewer: 'human' });
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
