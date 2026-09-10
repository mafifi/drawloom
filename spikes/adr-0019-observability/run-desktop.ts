import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Existing desktop, disposable public state. Never select a user's normal data directory.
process.env.DRAWLOOM_DATA_DIR = await mkdtemp(join(tmpdir(), 'drawloom-otel-desktop-'));
await import('../../apps/desktop/host/main.ts');
