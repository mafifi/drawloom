import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectPackage, activatePackage } from '@drawloom/local-plugin-packages';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { prepareGitPackage } from './git-package.js';
import { GitBatch } from './git-plugin/source.js';
import { SourceNotebook, SourceUpdate } from './sources.js';

test('installed standalone Git MCP package replays unacknowledged intake after restart without duplicate evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drawloom-git-package-'));
  const repository = join(root, 'repository'), directory = join(root, 'package'), data = join(root, 'data');
  try {
    await mkdir(repository); await mkdir(data);
    const git = (...args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Synthetic', '-c', 'user.email=synthetic@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: repository, stdio: 'pipe' });
    git('init', '-q'); await writeFile(join(repository, 'rule.ts'), 'export const days = 7;'); git('add', '.'); git('commit', '-qm', 'Initial');
    await prepareGitPackage(directory, repository, ['rule.ts']);
    const inventory = await inspectPackage(directory);
    expect(inventory.drawloom).toBeUndefined();
    expect(await Bun.file(join(data, 'git/git.json')).exists()).toBe(false);
    const book = new SourceNotebook(data);
    for (let attempt = 0; attempt < 2; attempt++) {
      const active = await activatePackage(inventory, { dataRoot: data, installationId: 'git', selectedServers: ['git'] });
      try {
        expect(active.statuses[0]!.status).toBe('connected');
        const client = active.servers.get('git')!.client;
        const batch = GitBatch.parse((await client.callTool({ name: 'git.changes', arguments: {} })).structuredContent);
        for (const update of batch.updates) await book.producer('git').update(SourceUpdate.parse(update));
        // First shutdown deliberately occurs after intake but before acknowledgement.
        if (attempt) await client.callTool({ name: 'git.acknowledge', arguments: { token: batch.token } });
      } finally { await active.close(); }
    }
    expect((await book.snapshot()).changes).toHaveLength(1);
    // Same built artifact through an ordinary MCP client, without Drawloom loading.
    const client = new Client({ name: 'generic-client', version: '1' });
    try {
      await client.connect(new StdioClientTransport({ command: 'bun', args: [join(directory, 'server.mjs')], cwd: directory, env: { PATH: process.env.PATH ?? '', PLUGIN_DATA: join(data, 'git'), GIT_SOURCE_REPOSITORY: repository, GIT_SOURCE_PATHS: '["rule.ts"]' } }));
      const batch = GitBatch.parse((await client.callTool({ name: 'git.changes', arguments: {} })).structuredContent);
      expect(batch.updates).toHaveLength(0);
      expect((await client.listTools()).tools.map(t => t.name)).toEqual(['git.changes', 'git.acknowledge']);
    } finally { await client.close(); }
  } finally { await rm(root, { recursive: true, force: true }); }
});
