import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { knowledgeEmbeddingConformance } from "@drawloom/knowledge/conformance";
import type { KnowledgeAuthorizer, TrustedKnowledgeSubject } from "@drawloom/knowledge";
import { createSqliteKnowledge } from "@drawloom/sqlite-knowledge";
import {
  createKnowledgeEmbeddings,
  createModelSetup,
  embeddingConfiguration,
  KnownModelManifests,
  LlamaEmbeddingWorker,
  type EmbeddingWorker,
} from "@drawloom/local-embeddings";

const model = "qwen3-embedding-0.6b-gguf" as const;
const owner = { type: "user", id: "conformance-owner", properties: {} } as TrustedKnowledgeSubject;
const denied = {
  type: "user",
  id: "conformance-visitor",
  properties: {},
} as TrustedKnowledgeSubject;
const authorizer: KnowledgeAuthorizer = {
  authorize: async (request) => ({ decision: request.subject.id === owner.id }),
};

async function run(worker: Pick<EmbeddingWorker, "embed">) {
  const root = await mkdtemp(join(tmpdir(), "drawloom-embedding-conformance-"));
  const knowledge = createSqliteKnowledge({
    databasePath: join(root, "knowledge.sqlite"),
    authorizer,
    resolveResource: () => ({ type: "knowledge-store", id: "conformance", properties: {} }),
  });
  try {
    await knowledgeEmbeddingConformance({
      intake: knowledge.intake,
      embeddings: createKnowledgeEmbeddings({ model, authorizer, worker }),
      embeddingIndex: knowledge.embeddingIndex,
      configuration: embeddingConfiguration(model),
      authorizedSubject: owner,
      deniedSubject: denied,
    });
  } finally {
    await knowledge.close();
    await rm(root, { recursive: true, force: true });
  }
}

test("local embedding adapter and SQLite index run shared embedding conformance", async () => {
  // Only numerical inference is scripted; adapter authorization, ordering,
  // configuration validation and the persistent vector index are real.
  await run({
    embed: async (request) =>
      request.items.map((_, index) =>
        Array.from({ length: 1024 }, (__, dimension) => (dimension === index ? 1 : 0)),
      ),
  });
});

const modelRoot = process.env.DRAWLOOM_EMBEDDING_CONFORMANCE_ROOT;
test("installed GGUF worker runs shared embedding conformance on Apple Silicon", {
  skip: !modelRoot,
  timeout: 120_000,
}, async () => {
  assert.equal(process.platform, "darwin", "real GGUF acceptance is macOS only");
  assert.equal(process.arch, "arm64", "real GGUF acceptance is Apple Silicon only");
  const setup = createModelSetup({ root: modelRoot!, manifest: KnownModelManifests[model] });
  assert.ok(
    await setup.ready(),
    "existing pinned installation must verify; this test never downloads",
  );
  const worker = new LlamaEmbeddingWorker({ root: modelRoot!, model, ready: () => setup.ready() });
  try {
    await run(worker);
  } finally {
    await worker.close();
  }
});
