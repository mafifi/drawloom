import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { learningConformance } from "@drawloom/knowledge/learning-conformance";
import { createAuthorizedKnowledgeFixture } from "./knowledge-authority-fixture.js";
import { createLocalLearningService } from "../host/local-learning.js";

/** Default application facade with the installed Node worker, never an in-memory replacement. */
export async function localLearningConformance(runtimeEntrypoint: string) {
  const root = await mkdtemp(join(tmpdir(), "drawloom-packed-local-learning-"));
  const service = createLocalLearningService(
    createAuthorizedKnowledgeFixture({ root, workingDirectory: root, runtimeEntrypoint }),
  );
  const contribution = {
    operation: "upsert" as const,
    expectedRevision: null,
    links: [],
    record: {
      ref: { type: "source" as const, origin: "packed-default", id: "note", revision: "1" },
      status: "active" as const,
      body: "Packed notebooks retained as evidence",
      confidence: {},
      provenance: { producer: { type: "test", id: "public" }, inputs: [] },
    },
  };
  try {
    await learningConformance({
      service,
      contribution,
      search: { query: "notebooks", mode: "lexical", limit: 5, maxBytes: 8192 },
      evidence: {
        root: contribution.record.ref,
        direction: "forward",
        maxDepth: 2,
        maxRecords: 8,
        maxLinks: 8,
        maxBytes: 8192,
      },
      export: { refs: [contribution.record.ref], format: "okf", maxBytes: 8192 },
    });
  } finally {
    try {
      await service.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
}
