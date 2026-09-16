/** Real local archive delivery through production setup; no internet or publication. */
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";
import {
  KnownModelManifests,
  LlamaEmbeddingWorker,
  createModelSetup,
} from "@drawloom/local-embeddings";
import { createAuthorizedKnowledgeFixture as createManagedLocalKnowledgeClient } from "../../apps/desktop/tests/knowledge-authority-fixture.js";

if (process.env.DRAWLOOM_GGUF_EVALUATION !== "1") throw Error("Explicit opt-in required");
const [rootArg, archiveRootArg, weightsRootArg] = process.argv.slice(2);
if (!rootArg || !archiveRootArg || !weightsRootArg)
  throw Error("Usage: gguf-install.ts NEW_ROOT ARCHIVE_ROOT WEIGHTS_ROOT");
const root = resolve(rootArg),
  archiveRoot = resolve(archiveRootArg),
  weightsRoot = resolve(weightsRootArg);
await mkdir(root);
const modelRoot = join(root, "models");
const pin = JSON.parse(await readFile(join(archiveRoot, "runtime-manifest.json"), "utf8"));
const manifest = KnownModelManifests["qwen3-embedding-0.6b-gguf"];
const runtimeArtifact = {
  id: "llama.cpp-darwin-arm64" as const,
  revision: pin.revision,
  platform: "darwin" as const,
  arch: "arm64" as const,
  bytes: pin.bytes,
  sha256: pin.sha256,
  binarySha256: pin.binarySha256,
  url: "https://local-fixture.invalid/runtime.tar.gz",
  trusted: true as const,
};
let fetches = 0;
const options = {
  root: modelRoot,
  manifest,
  runtimeArtifact,
  fetch: async (input: string | URL | Request) => {
    fetches++;
    const url = String(input);
    const path =
      url === runtimeArtifact.url
        ? join(archiveRoot, `llama.cpp-darwin-arm64-${pin.revision}.tar.gz`)
        : url === manifest.artifacts[0]!.url
          ? join(weightsRoot, manifest.artifacts[0]!.path)
          : undefined;
    if (!path) throw Error("Unexpected outbound request refused");
    return new Response(
      Readable.toWeb(createReadStream(path)) as unknown as ReadableStream<Uint8Array>,
    );
  },
};
const setup = createModelSetup(options);
const states: unknown[] = [];
await setup.install({ consent: false });
assert.equal(fetches, 0);
await setup.install({
  consent: true,
  onProgress: (state) => {
    // Keep transition evidence bounded, not one record per network chunk.
    if (state.kind !== "downloading" || state.received === state.expected) states.push(state);
  },
});
const ready = await setup.ready();
assert.ok(ready, "installed runtime and official weights must verify");
const restarted = createModelSetup(options);
assert.ok(await restarted.ready(), "restart must recognise verified installation");
assert.equal(fetches, 2, "one archive and one model, with no network discovery");
const worker = new LlamaEmbeddingWorker({
  root: modelRoot,
  model: "qwen3-embedding-0.6b-gguf",
  ready: () => restarted.ready(),
});
try {
  const vectors = await worker.embed({
    role: "query",
    items: ["Opening hours", "Permission to edit"],
  });
  assert.equal(vectors.length, 2);
  for (const vector of vectors) {
    assert.equal(vector.length, 1024);
    assert.ok(vector.every(Number.isFinite));
  }
  await writeFile(
    join(root, "installation-proof.json"),
    JSON.stringify(
      {
        kind: "real_local_fixture_installation",
        pin,
        fetches,
        states,
        vectorCount: vectors.length,
        dimensions: 1024,
        limitation:
          "Trusted local file delivery, not public download or signed release distribution.",
      },
      null,
      2,
    ),
  );
} finally {
  await worker.close();
}

// Exercise the actual managed sidecar, not just worker.close(). Uses the same
// pinned archive as product composition; no test override enters its protocol.
const client = createManagedLocalKnowledgeClient({ root, workingDirectory: root });
let childPids: number[] = [];
try {
  const ref = {
    type: "source" as const,
    origin: "public-gguf-install-test",
    id: "hours",
    revision: "r1",
  };
  assert.equal(
    (
      await client.ingest({
        operation: "upsert",
        expectedRevision: null,
        record: {
          ref,
          body: "The invented library closes on Mondays.",
          status: "active",
          confidence: { basis: "public fixture" },
          provenance: { producer: { type: "test", id: "gguf" }, inputs: [] },
        },
        links: [],
      })
    ).kind,
    "accepted",
  );
  let indexed = false;
  for (let n = 0; n < 200; n++) {
    if ((await client.status()).indexing === "ready") {
      indexed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(indexed, "real host must finish indexing the installed model");
  const result = await client.search({
    query: "When is the library shut?",
    mode: "best_available",
    limit: 5,
    maxBytes: 8192,
  });
  assert.equal(result.kind, "ok");
  const executable = join(ready.runtimeDirectory, "bin", "llama-server");
  childPids = execFileSync("/bin/ps", ["-axo", "pid=,comm="], { encoding: "utf8" })
    .split("\n")
    .filter((line) => line.trim().replace(/^\d+\s+/, "") === executable)
    .map((line) => Number(line.trim().split(/\s/)[0]));
  assert.equal(childPids.length, 1, "one persistent installed server must be live before close");
} finally {
  await client.close();
}
for (const pid of childPids)
  assert.throws(
    () => process.kill(pid, 0),
    { code: "ESRCH" },
    "managed close must reap the server",
  );
await writeFile(
  join(root, "managed-shutdown-proof.json"),
  JSON.stringify(
    { indexed: true, childCountBeforeClose: childPids.length, childrenAliveAfterClose: 0 },
    null,
    2,
  ),
);
