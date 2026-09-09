import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Selection only: never migrates, merges or creates an installation. */
export async function selectDataDirectory({ home, override }: { home: string; override?: string }): Promise<string> {
  if (override !== undefined) {
    if (!override.trim()) throw Error('DRAWLOOM_DATA_DIR must select a non-empty path.');
    return resolve(override);
  }
  const modern = resolve(home, '.drawloom');
  const legacy = resolve(home, 'Library/Application Support/Drawloom');
  async function exists(path: string) {
    try { await stat(path); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }
  const [hasModern, hasLegacy] = await Promise.all([exists(modern), exists(legacy)]);
  if (hasModern && hasLegacy) throw Error('Both Drawloom data locations exist. Select one with DRAWLOOM_DATA_DIR; no data was moved.');
  return hasLegacy ? legacy : modern;
}
