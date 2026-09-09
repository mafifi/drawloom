import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

// Explicit local compatibility check, separate from portable/public CI.
const root = await mkdtemp(join(tmpdir(), 'drawloom-installed-history-protocol-'));
try {
  const version = Bun.spawnSync(['codex', '--version'], { stdout: 'pipe', stderr: 'pipe' });
  if (version.exitCode !== 0) throw Error('Install Codex before running this optional protocol check.');
  const generated = Bun.spawnSync(['codex', 'app-server', 'generate-json-schema', '--experimental', '--out', root], { stdout: 'pipe', stderr: 'pipe' });
  if (generated.exitCode !== 0) throw Error('Installed Codex could not generate its protocol schema.');
  const object = z.object({ properties: z.record(z.string(), z.unknown()) });
  const document = async (name: string) => JSON.parse(await readFile(join(root, 'v2', name + '.json'), 'utf8')) as unknown;
  const schema = async (name: string) => object.parse(await document(name)).properties;
  const resume = await schema('ThreadResumeParams'), turns = await schema('ThreadTurnsListParams'), items = await schema('ThreadItemsListParams');
  if (!resume.excludeTurns || !turns.itemsView || !turns.cursor || !items.cursor || !items.limit || !items.turnId) throw Error('Installed Codex lacks required bounded history fields.');
  const response = await schema('ThreadTurnsListResponse');
  if (!response.nextCursor || !response.data) throw Error('Installed Codex history response differs from the supported shape.');
  const definitions = z.object({ definitions: z.record(z.string(), z.unknown()) });
  const turnsDefinitions = definitions.parse(await document('ThreadTurnsListResponse')).definitions;
  const turn = object.parse(turnsDefinitions.Turn).properties;
  if (!turn.completedAt || !turn.startedAt || !turn.durationMs || !turn.status) throw Error('Installed Codex lacks the inspected completion metadata.');
  const item = object.parse(definitions.parse(await document('ThreadItemsListResponse')).definitions.ThreadItemEntry).properties;
  if (!item.turnId || !item.item) throw Error('Installed Codex item correlation differs from the supported shape.');
  console.log(JSON.stringify({ version: version.stdout.toString().trim(), checked: ['thread/resume.excludeTurns', 'thread/turns/list.itemsView', 'thread/turns/list.cursor', 'thread/items/list.cursor', 'thread/items/list.limit', 'thread/items/list.turnId', 'thread/turns/list.nextCursor', 'Turn completion metadata', 'ThreadItemEntry turn/item correlation'], result: 'pass', liveProviderPerformance: false }));
} finally { await rm(root, { recursive: true, force: true }); }
