import assert from "node:assert/strict";
import test from "node:test";
import { scoreRetrieval, scoreRetrievalByCategory } from "./metrics.ts";

test("scoreRetrieval counts exact evidence, complete chains, and irrelevant abstention", () => {
  const report = scoreRetrieval({
    questions: [
      { id: "id", kind: "identifier", relevant: ["release-retry@r1"], requiredChain: [], abstain: false },
      { id: "chain", kind: "chain", relevant: ["claim@r1"], requiredChain: ["claim@r1", "source@r1"], abstain: false },
      { id: "none", kind: "irrelevant", relevant: [], requiredChain: [], abstain: true },
    ],
    retrieved: {
      id: ["release-retry@r1", "release-cache@r1"],
      chain: ["claim@r1", "source@r1"],
      none: [],
    },
  });

  assert.deepEqual(report, {
    relevantEvidence: { precision: 0.5, recall: 1 },
    exactIdentifierRecall: 1,
    chainCompleteness: 1,
    irrelevantAbstention: 1,
  });
});

test("scoreRetrieval does not credit a stale exact revision as relevant evidence", () => {
  const report = scoreRetrieval({
    questions: [{ id: "revision", kind: "contradiction", relevant: ["ferry-rule@r2"], requiredChain: ["ferry-rule@r1", "ferry-rule@r2"], abstain: false }],
    retrieved: { revision: ["ferry-rule@r1"] },
  });

  assert.deepEqual(report, {
    relevantEvidence: { precision: 0, recall: 0 },
    exactIdentifierRecall: 1,
    chainCompleteness: 0,
    irrelevantAbstention: 1,
  });
});

test("scoreRetrievalByCategory keeps each held-out question kind separately auditable", () => {
  const report = scoreRetrievalByCategory({
    questions: [
      { id: "semantic", kind: "semantic", relevant: ["policy@r1"], requiredChain: [], abstain: false },
      { id: "identifier", kind: "identifier", relevant: ["ticket@r1"], requiredChain: [], abstain: false },
      { id: "irrelevant", kind: "irrelevant", relevant: [], requiredChain: [], abstain: true },
    ],
    retrieved: {
      semantic: ["policy@r1"],
      identifier: [],
      irrelevant: ["policy@r1"],
    },
  });

  assert.deepEqual(report.semantic, {
    relevantEvidence: { precision: 1, recall: 1 },
    exactIdentifierRecall: 1,
    chainCompleteness: 1,
    irrelevantAbstention: 1,
  });
  assert.deepEqual(report.identifier, {
    relevantEvidence: { precision: 1, recall: 0 },
    exactIdentifierRecall: 0,
    chainCompleteness: 1,
    irrelevantAbstention: 1,
  });
  assert.deepEqual(report.irrelevant, {
    relevantEvidence: { precision: 0, recall: 1 },
    exactIdentifierRecall: 1,
    chainCompleteness: 1,
    irrelevantAbstention: 0,
  });
});
