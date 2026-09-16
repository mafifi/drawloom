import { expect, test, spyOn } from "bun:test";
import { learningConformance } from "@drawloom/knowledge/learning-conformance";
import type { IntakeInput } from "@drawloom/knowledge";
import { createDeterministicLearningService } from "./src/learning.js";

const contribution: Extract<IntakeInput, { operation: "upsert" }> = {
  operation: "upsert",
  expectedRevision: null,
  links: [],
  record: {
    ref: { type: "source", origin: "public-example", id: "note", revision: "1" },
    status: "active",
    body: "Blue notebooks are available.",
    confidence: { value: "observed", source: "synthetic" },
    provenance: { producer: { type: "example", id: "fixture" }, inputs: [] },
  },
};
const subject = { type: "person", id: "example-reader", properties: {} };
test("bounded synthetic learning consumer passes shared application conformance without installer fields", async () => {
  const service = createDeterministicLearningService({
    subject,
    authorizer: {
      async authorize() {
        return { decision: true };
      },
    },
  });
  try {
    await learningConformance({
      service,
      contribution,
      search: { query: "notebooks", mode: "lexical", limit: 10, maxBytes: 8192 },
      evidence: {
        root: contribution.record.ref,
        direction: "forward",
        maxDepth: 2,
        maxRecords: 10,
        maxLinks: 10,
        maxBytes: 8192,
      },
      export: { refs: [contribution.record.ref], format: "okf", maxBytes: 8192 },
    });
    expect(service.capabilities).toEqual({});
    expect(await service.status()).toEqual({
      availability: "ready",
      message: "Synthetic example: data lasts only for this process.",
      retrieval: "lexical",
    });
  } finally {
    await service.close();
  }
  expect((await service.status()).availability).toBe("unavailable");
});
test("synthetic consumer preserves denial and failure before revealing stored data", async () => {
  let mode: "allow" | "deny" | "failure" = "allow";
  const service = createDeterministicLearningService({
    subject,
    authorizer: {
      async authorize() {
        return mode === "failure"
          ? { kind: "failure", code: "unavailable" }
          : { decision: mode === "allow" };
      },
    },
  });
  await service.ingest(contribution);
  const query = { query: "notebooks", mode: "lexical" as const, limit: 10, maxBytes: 8192 };
  mode = "deny";
  expect(await service.search(query)).toEqual({ kind: "denied" });
  expect(await service.ingest(contribution)).toEqual({ kind: "denied" });
  mode = "failure";
  expect(await service.search(query)).toEqual({ kind: "failure", code: "unavailable" });
  mode = "allow";
  expect(await service.search({ ...query, maxBytes: 1 })).toMatchObject({ kind: "failure" });
  const abort = new AbortController();
  abort.abort();
  expect(await service.search(query, { signal: abort.signal, remainingMs: () => 1000 })).toEqual({
    kind: "failure",
    code: "cancelled",
  });
  await service.close();
});
test("synthetic consumer rejects a late default decision", async () => {
  let now = 1000;
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  const service = createDeterministicLearningService({
    subject,
    authorizer: {
      async authorize() {
        now += 2100;
        return { decision: true };
      },
    },
  });
  try {
    expect(await service.ingest(contribution)).toEqual({
      kind: "failure",
      code: "budget_exhausted",
    });
  } finally {
    clock.mockRestore();
    await service.close();
  }
});
test("synthetic consumer cannot delete a newer record using an older reference", async () => {
  const service = createDeterministicLearningService({
    subject,
    authorizer: {
      async authorize() {
        return { decision: true };
      },
    },
  });
  try {
    await service.ingest(contribution);
    const next = structuredClone(contribution);
    next.expectedRevision = "1";
    next.record.ref.revision = "2";
    expect((await service.ingest(next)).kind).toBe("accepted");
    expect(
      await service.ingest({
        operation: "delete",
        ref: contribution.record.ref,
        expectedRevision: "2",
      }),
    ).toEqual({ kind: "conflict" });
    const found = await service.search({
      query: "notebooks",
      mode: "lexical",
      limit: 10,
      maxBytes: 8192,
    });
    expect(found.kind === "ok" && found.items[0]?.record.ref.revision).toBe("2");
  } finally {
    await service.close();
  }
});

test("synthetic consumer deletes every revision and incident link for a logical record", async () => {
  const service = createDeterministicLearningService({
    subject,
    authorizer: {
      async authorize() {
        return { decision: true };
      },
    },
  });
  const claim = structuredClone(contribution);
  claim.record = {
    ref: { type: "claim", origin: "public-example", id: "claim", revision: "1" },
    status: "active",
    freshness: "current",
    body: "The notebook inventory was observed.",
    confidence: { value: "observed", source: "synthetic" },
    provenance: { producer: { type: "example", id: "fixture" }, inputs: [] },
  };
  claim.links = [{ from: claim.record.ref, to: contribution.record.ref, relation: "support" }];
  try {
    expect((await service.ingest(contribution)).kind).toBe("accepted");
    expect((await service.ingest(claim)).kind).toBe("accepted");
    const next = structuredClone(contribution);
    next.expectedRevision = "1";
    next.record.ref.revision = "2";
    expect((await service.ingest(next)).kind).toBe("accepted");
    expect(
      await service.ingest({
        operation: "delete",
        ref: { ...next.record.ref, revision: "3" },
        expectedRevision: "2",
      }),
    ).toEqual({ kind: "accepted", revision: "3" });
    expect(
      await service.ingest({
        operation: "delete",
        ref: { ...next.record.ref, revision: "3" },
        expectedRevision: "2",
      }),
    ).toEqual({ kind: "duplicate", revision: "3" });
    const exported = await service.export({
      refs: [contribution.record.ref, next.record.ref, claim.record.ref],
      format: "okf",
      maxBytes: 8192,
    });
    expect(exported).toMatchObject({ kind: "ok", records: [claim.record], links: [] });
  } finally {
    await service.close();
  }
});

test("synthetic consumer includes normalized links in duplicate identity", async () => {
  const service = createDeterministicLearningService({
    subject,
    authorizer: {
      async authorize() {
        return { decision: true };
      },
    },
  });
  const target = structuredClone(contribution);
  target.record.ref.id = "target";
  const linked = structuredClone(contribution);
  linked.record.ref.id = "linked";
  linked.links = [{ from: linked.record.ref, to: target.record.ref, relation: "support" }];
  try {
    expect((await service.ingest(target)).kind).toBe("accepted");
    expect((await service.ingest(linked)).kind).toBe("accepted");
    expect(await service.ingest(structuredClone(linked))).toEqual({
      kind: "duplicate",
      revision: "1",
    });
    linked.links[0]!.relation = "history";
    expect(await service.ingest(linked)).toEqual({ kind: "conflict" });
  } finally {
    await service.close();
  }
});

test("synthetic consumer rejects invalid links atomically", async () => {
  const service = createDeterministicLearningService({
    subject,
    authorizer: {
      async authorize() {
        return { decision: true };
      },
    },
  });
  try {
    expect((await service.ingest(contribution)).kind).toBe("accepted");
    const wrongSource = structuredClone(contribution);
    wrongSource.record.ref.id = "wrong-source";
    wrongSource.links = [
      { from: contribution.record.ref, to: contribution.record.ref, relation: "support" },
    ];
    expect(await service.ingest(wrongSource)).toEqual({ kind: "conflict" });
    const dangling = structuredClone(contribution);
    dangling.record.ref.id = "dangling";
    dangling.links = [
      {
        from: dangling.record.ref,
        to: { ...contribution.record.ref, id: "missing" },
        relation: "support",
      },
    ];
    expect(await service.ingest(dangling)).toEqual({ kind: "conflict" });
    const exported = await service.export({
      refs: [wrongSource.record.ref, dangling.record.ref],
      format: "okf",
      maxBytes: 8192,
    });
    expect(exported).toMatchObject({ kind: "ok", records: [], links: [] });
  } finally {
    await service.close();
  }
});
