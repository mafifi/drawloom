import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EmbeddingBatchSchema, embeddingResultSchemaFor, type KnowledgeEmbeddings } from '@drawloom/knowledge';
import { runKnowledgeEvaluation } from '../../evaluations/knowledge/runner.ts';

const arg = (key: string) => { const i = process.argv.indexOf(key); if (i < 0 || !process.argv[i + 1]) throw Error(`Missing ${key}`); return process.argv[i + 1]!; };
const child = spawn(arg('--python'), [fileURLToPath(new URL('./worker.py', import.meta.url)), arg('--model')], {
  stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', TOKENIZERS_PARALLELISM: 'false' },
});
const lines = createInterface({ input: child.stdout });
const iterator = lines[Symbol.asyncIterator]();
async function response(): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    const line = await Promise.race([iterator.next(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { child.kill('SIGKILL'); reject(Error('MLX worker timed out')); }, 120_000);
    })]);
    if (line.done) throw Error(`MLX worker exited (${child.exitCode})`);
    return JSON.parse(line.value);
  } finally { clearTimeout(timer!); }
}
const configuration = {
  id: 'experiment:qwen3-0.6b-mlx-8bit', dimensions: 1024,
  fingerprint: createHash('sha256').update('407ad2329cd30702720aafe83f74a1ba30fdfbca/mlx-embeddings-0.1.0/mlx-0.32.2/last-token-normalized/unicode512').digest('hex'),
};
let inferenceRoundTripMs = { document: 0, query: 0 };
let indexedWorker: unknown;
try {
  const startup = z.object({ ready: z.record(z.string(), z.unknown()) }).parse(await response()).ready;
  const implementation: KnowledgeEmbeddings = {
    async embed(_subject, raw) {
      const batch = EmbeddingBatchSchema.parse(raw);
      if (batch.configuration.id !== configuration.id || batch.configuration.fingerprint !== configuration.fingerprint || batch.configuration.dimensions !== configuration.dimensions) return { kind: 'failure', code: 'invalid' };
      if (batch.role === 'query' && !indexedWorker) {
        child.stdin.write(JSON.stringify({ command: 'stats' }) + '\n');
        indexedWorker = z.object({ stats: z.record(z.string(), z.unknown()) }).parse(await response()).stats;
      }
      const started = performance.now();
      child.stdin.write(JSON.stringify({ role: batch.role, texts: batch.items.map(item => item.text) }) + '\n');
      const output = z.object({ vectors: z.array(z.array(z.number().finite()).length(1024)) }).parse(await response());
      inferenceRoundTripMs[batch.role] += performance.now() - started;
      for (const vector of output.vectors) {
        const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
        if (Math.abs(norm - 1) > 0.01) throw Error('Embedding normalization failed');
      }
      return embeddingResultSchemaFor(batch).parse({ kind: 'ok', configuration,
        items: batch.items.map((item, i) => ({ id: item.id, revision: item.revision, vector: output.vectors[i] })) });
    },
  };
  const report = await runKnowledgeEvaluation({ root: arg('--root'), size: Number(arg('--size')),
    embedding: { label: 'qwen3-embedding-0.6b-mlx-8bit', configuration, implementation } });
  child.stdin.write(JSON.stringify({ command: 'stats' }) + '\n');
  const worker = z.object({ stats: z.record(z.string(), z.unknown()) }).parse(await response()).stats;
  await writeFile(arg('--output'), JSON.stringify({ ...report, acceleration: { startup, indexedWorker, worker, inferenceRoundTripMs } }, null, 2));
  console.log(JSON.stringify({ kind: report.kind, hybrid: report.hybrid.kind, worker }));
} finally { child.stdin.end(); lines.close(); child.kill('SIGTERM'); }
