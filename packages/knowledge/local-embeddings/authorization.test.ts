import { expect, test } from "bun:test";
import { createKnowledgeEmbeddings, embeddingConfiguration } from "./src/adapter.js";
import type { TrustedKnowledgeSubject } from "@drawloom/knowledge";

test("embedding inference receives parent cancellation and its remaining timeout", async () => {
  const model = "qwen3-embedding-0.6b-gguf";
  const subject = { type: "user", id: "owner", properties: {} } as TrustedKnowledgeSubject;
  const controller = new AbortController();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const provider = createKnowledgeEmbeddings({
    model,
    authorizer: { authorize: async () => ({ decision: true }) },
    worker: {
      embed: async (_input, options) => {
        entered();
        return new Promise((resolve, reject) => {
          release = () => resolve([]);
          options?.signal?.addEventListener("abort", () => reject(Error("cancelled")), {
            once: true,
          });
          if (options) expect(options.timeoutMs).toBeLessThanOrEqual(1000);
        });
      },
    },
  });
  const pending = provider.embed(
    subject,
    {
      configuration: embeddingConfiguration(model),
      role: "query",
      items: [{ id: "one", text: "synthetic secret" }],
    },
    { signal: controller.signal, remainingMs: () => 1000 },
  );
  await started;
  controller.abort();
  try {
    expect(
      await Promise.race([
        pending,
        new Promise((resolve) => setTimeout(() => resolve("still pending"), 25)),
      ]),
    ).toEqual({ kind: "failure", code: "cancelled" });
  } finally {
    release();
    await pending;
  }
});

test("embedding disclosure preserves failure, malformed, rejected and cancelled policy outcomes", async () => {
  const model = "qwen3-embedding-0.6b-gguf";
  const subject = { type: "user", id: "owner", properties: {} } as TrustedKnowledgeSubject;
  let calls = 0;
  for (const [value, expected] of [
    [{ decision: false }, { kind: "denied" }],
    [
      { kind: "failure", code: "unavailable" },
      { kind: "failure", code: "unavailable" },
    ],
    [{}, { kind: "failure", code: "malformed_result" }],
    ["throw", { kind: "failure", code: "rejected" }],
  ] as const) {
    const provider = createKnowledgeEmbeddings({
      model,
      authorizer: {
        authorize: async () => {
          if (value === "throw") throw Error("offline");
          return value as never;
        },
      },
      worker: {
        embed: async () => {
          calls++;
          return [];
        },
      },
    });
    expect(
      await provider.embed(subject, {
        configuration: embeddingConfiguration(model),
        role: "query",
        items: [{ id: "one", text: "secret" }],
      }),
    ).toEqual(expected);
  }
  expect(calls).toBe(0);
  const controller = new AbortController();
  const provider = createKnowledgeEmbeddings({
    model,
    authorizer: {
      authorize: async () => {
        controller.abort();
        return { decision: true };
      },
    },
    worker: {
      embed: async () => {
        calls++;
        return [];
      },
    },
  });
  expect(
    await provider.embed(
      subject,
      {
        configuration: embeddingConfiguration(model),
        role: "query",
        items: [{ id: "one", text: "secret" }],
      },
      { signal: controller.signal, remainingMs: () => 1000 },
    ),
  ).toEqual({ kind: "failure", code: "cancelled" });
  expect(calls).toBe(0);
});
