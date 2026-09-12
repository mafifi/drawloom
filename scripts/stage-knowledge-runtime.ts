import { join, resolve } from 'node:path';
import { stageTemporalRuntime } from './stage-temporal-runtime.js';

/** Stage the managed Node composition and portable workflow package with the
 * same frozen-install and containment proof used by the Temporal runtime. */
export function stageKnowledgeRuntime(options: { repositoryRoot: string; destination: string }) {
  return stageTemporalRuntime({ ...options, destinationName: 'knowledge', packageDirectories: [
    join(options.repositoryRoot, 'packages/knowledge/local-knowledge-runtime'),
    join(options.repositoryRoot, 'packages/knowledge/nightloom'),
  ] });
}

if (import.meta.main) {
  const repositoryRoot = resolve(import.meta.dir, '..');
  const result = await stageKnowledgeRuntime({ repositoryRoot, destination: join(repositoryRoot, 'apps/desktop/src-tauri/binaries/knowledge') });
  console.log(`Staged ${result.packages} installed Node knowledge runtime packages`);
}
