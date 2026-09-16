import { expect, test } from "bun:test";
import { createLocalLearningService, createLocalLearningSetupHost } from "./local-learning.js";
import { DEFAULT_LOCAL_KNOWLEDGE_CONFIGURATION } from "@drawloom/local-knowledge-runtime";

test("local facade forwards the original cancellation and remaining budget", async () => {
  const calls: unknown[] = [];
  const result = { kind: "failure" as const, code: "cancelled" as const };
  const request = async (_: unknown, operation: unknown) => {
    calls.push(operation);
    return result;
  };
  const client = {
    ingest: request,
    search: request,
    evidence: request,
    export: request,
    close: async () => {},
    warmup: async () => ({ kind: "ready" as const }),
    status: async () => ({
      availability: "ready" as const,
      message: "ready",
      indexing: "unavailable" as const,
    }),
  };
  const learning = createLocalLearningService(client);
  const operation = { signal: new AbortController().signal, remainingMs: () => 123 };
  for (const method of ["ingest", "search", "evidence", "export"] as const)
    await learning[method]({} as never, operation);
  expect(calls).toEqual([operation, operation, operation, operation]);
  expect(await learning.status()).toEqual({
    availability: "ready",
    message: "ready",
    retrieval: "lexical",
  });
});

test("local download cancellation bypasses an active installer", async () => {
  let release!: () => void;
  const status: import("../src/lib/local-knowledge-setup-protocol.js").LocalLearningSetupStatus = {
    availability: "ready",
    message: "",
    indexing: "unavailable",
    configuration: {
      embeddingModel: "qwen3-embedding-0.6b-gguf",
      assessmentModel: "public",
      assessmentTimeoutMs: 1000,
      maxAutomaticStartsPerDay: 1,
      maxAutomaticMillisecondsPerDay: 1000,
    },
    models: [],
  };
  const setup = {
    status: async () => status,
    configure: async () => status,
    cleanupObsoleteRuntime: async () => status,
    download: async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return status;
    },
    cancelDownload: async () => {
      release();
      return status;
    },
  };
  const host = createLocalLearningSetupHost(setup);
  const install = host.command({
    action: "download",
    model: "qwen3-embedding-0.6b-gguf",
    consent: true,
  });
  while (!release) await Promise.resolve();
  await host.command({ action: "cancel_download", model: "qwen3-embedding-0.6b-gguf" });
  await install;
  expect(await host.command({ action: "status" })).toBe(status);
});
