import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { KnownModelManifests, KnownLlamaRuntime, LlamaEmbeddingWorker, createKnowledgeEmbeddings, createModelSetup, embeddingConfiguration } from '@drawloom/local-embeddings';
const source = readFileSync(new URL('relevance-calibration.json', import.meta.url), 'utf8');
const fixture = JSON.parse(source);
if (process.env.DRAWLOOM_GGUF_EVALUATION !== '1' || !process.env.DRAWLOOM_MODELS_ROOT || !process.argv[2]) throw Error('Opt in with DRAWLOOM_GGUF_EVALUATION=1, DRAWLOOM_MODELS_ROOT and an output path; no downloads');
const root = process.env.DRAWLOOM_MODELS_ROOT;
const model = 'qwen3-embedding-0.6b-gguf';
const configuration = embeddingConfiguration(model);
if (!await createModelSetup({ root, manifest: KnownModelManifests[model] }).ready()) throw Error('Existing model not ready; no install allowed');
const worker = new LlamaEmbeddingWorker({ root, model });
const embeddings = createKnowledgeEmbeddings({ model, worker, authorizer: { authorize: async () => ({ decision: true }) } });
const subject = { type: 'evaluation', id: 'independent-public-calibration', properties: {} };
const documents = [...fixture.pairs, ...fixture.extraNegativeDocuments];
async function encode(role, values) {
  const result = await embeddings.embed(subject, { configuration, role, items: values.map(item => ({ id: item.id, text: role === 'query' ? item.query : item.document })) });
  if (result.kind !== 'ok') throw Error(`Embedding ${role} failed: ${result.kind}`);
  return result.items;
}
try {
  // All independent documents are shorter than the product's 512-code-point
  // passage boundary; query formatting/pooling/normalization belongs to provider.
  const queries = await encode('query', fixture.pairs), passages = await encode('document', documents);
  const pairs = queries.flatMap(query => passages.map(document => ({ queryId: query.id, documentId: document.id, expectedRelevant: query.id === document.id,
    cosine: query.vector.reduce((sum, v, i) => sum + v * document.vector[i], 0) / (Math.hypot(...query.vector) * Math.hypot(...document.vector)) })));
  const positiveMin = Math.min(...pairs.filter(p => p.expectedRelevant).map(p => p.cosine));
  const negativeMax = Math.max(...pairs.filter(p => !p.expectedRelevant).map(p => p.cosine));
  const midpoint = Math.ceil(((positiveMin + negativeMax) / 2) * 100) / 100;
  const selected = negativeMax < positiveMin && midpoint <= positiveMin ? midpoint : null;
  const report = { fixtureSha256: createHash('sha256').update(source).digest('hex'), model: KnownModelManifests[model], runtime: KnownLlamaRuntime, configuration,
    preprocessing: 'Product role=query/document formatting, last-token pooling and L2 normalization; one passage per document, <=512 Unicode code points.',
    pairs, positiveMin, negativeMax, selected, candidate05: { rejectedPositives: pairs.filter(p => p.expectedRelevant && p.cosine < 0.5), admittedNegatives: pairs.filter(p => !p.expectedRelevant && p.cosine >= 0.5) } };
  writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ positiveMin, negativeMax, selected, candidate05: report.candidate05, pairs: pairs.length }, null, 2));
} finally { await worker.close(); }
