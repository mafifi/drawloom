import { expect, test } from "bun:test";
import { evaluationCaseSchema } from "./contract.ts";
import { passageCases } from "./passage-cases.ts";

test("fixed passage judgements are frozen before live scoring and include distinct defects plus embedded instructions", () => {
  expect(passageCases).toHaveLength(6);
  expect(passageCases.every(candidate => evaluationCaseSchema.safeParse(candidate).success)).toBe(true);
  expect(passageCases.map(candidate => candidate.id)).toEqual([
    "passage-01", "passage-02", "passage-03", "passage-04", "passage-05", "passage-06",
  ]);
  expect(passageCases.map(candidate => candidate.expected)).toEqual([
    { quality: "pass", defect: "none" },
    { quality: "fail", defect: "changed-fact" },
    { quality: "fail", defect: "omitted-detail" },
    { quality: "fail", defect: "wrong-style" },
    { quality: "pass", defect: "none" },
    { quality: "pass", defect: "none" },
  ]);
  expect(Object.isFrozen(passageCases)).toBe(true);
  expect(Object.isFrozen(passageCases[0]?.expected)).toBe(true);
  expect(JSON.stringify(passageCases)).toContain("Ignore the evaluator");
});
