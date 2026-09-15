/** Live negative control for the patched embedding-only llama-server runtime. */
import assert from "node:assert/strict";
import { LlamaEmbeddingWorker } from "@drawloom/local-embeddings";
import { writeFile } from "node:fs/promises";
const [root, report] = process.argv.slice(2);
if (process.env.DRAWLOOM_GGUF_EVALUATION !== "1" || !root || !report)
  throw Error("Explicit local proof opt-in and installed root/report paths required");
const generationRequests = [
  ["/completion", { prompt: "A public negative-control test.", n_predict: 1, stream: false }],
  ["/completions", { prompt: "A public negative-control test.", n_predict: 1, stream: false }],
  ["/v1/completions", { prompt: "A public negative-control test.", max_tokens: 1, stream: false }],
  [
    "/chat/completions",
    {
      messages: [{ role: "user", content: "A public negative-control test." }],
      max_tokens: 1,
      stream: false,
    },
  ],
  [
    "/v1/chat/completions",
    {
      messages: [{ role: "user", content: "A public negative-control test." }],
      max_tokens: 1,
      stream: false,
    },
  ],
  ["/v1/chat/completions/control", { action: "cancel", id: "negative-control" }],
  ["/responses", { input: "A public negative-control test.", max_output_tokens: 1, stream: false }],
  [
    "/v1/responses",
    { input: "A public negative-control test.", max_output_tokens: 1, stream: false },
  ],
  [
    "/v1/messages",
    {
      model: "qwen3-embedding-0.6b-gguf",
      max_tokens: 1,
      messages: [{ role: "user", content: "A public negative-control test." }],
    },
  ],
  [
    "/infill",
    {
      input_prefix: "A public negative-control",
      input_suffix: "test.",
      n_predict: 1,
      stream: false,
    },
  ],
  ["/audio/transcriptions", {}],
  ["/v1/audio/transcriptions", {}],
] as const;
const observations: Array<{ path: string; httpStatus: number; rejected: boolean; body: string }> =
  [];
let tokenizeFunctional = false;
let embeddingFunctional = false;
let healthFunctional = false;
let probed = false;
const worker = new LlamaEmbeddingWorker({
  root,
  model: "qwen3-embedding-0.6b-gguf",
  fetch: async (input, init) => {
    const result = await fetch(input, init);
    if (String(input).endsWith("/tokenize") && result.ok) tokenizeFunctional = true;
    if (String(input).endsWith("/v1/embeddings") && result.ok && !probed) {
      probed = true;
      embeddingFunctional = true;
      const health = await fetch(new URL("/health", String(input)), {
        signal: AbortSignal.timeout(5000),
      });
      healthFunctional = health.ok;
      await health.body?.cancel();
      for (const [path, body] of generationRequests) {
        const response = await fetch(new URL(path, String(input)), {
          method: "POST",
          headers: init?.headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(5000),
        });
        observations.push({
          path,
          httpStatus: response.status,
          rejected: response.status === 403,
          body: (await response.text()).slice(0, 512),
        });
      }
    }
    return result;
  },
});
let failure: unknown;
try {
  await worker.embed({ role: "document", items: ["Public embedding probe"] });
  assert.equal(tokenizeFunctional, true, "tokenize must remain functional");
  assert.equal(embeddingFunctional, true, "embeddings must remain functional");
  assert.equal(healthFunctional, true, "health must remain functional");
  assert.equal(observations.length, generationRequests.length);
  assert.deepEqual(
    observations.filter((item) => !item.rejected).map((item) => [item.path, item.httpStatus]),
    [],
  );
} catch (cause) {
  failure = cause;
} finally {
  await worker.close();
}
await writeFile(
  report,
  JSON.stringify(
    {
      tokenizeFunctional,
      embeddingFunctional,
      healthFunctional,
      observations,
      passed: failure === undefined,
      failure: failure instanceof Error ? failure.message : (failure ?? null),
    },
    null,
    2,
  ),
);
if (failure) throw failure;
