import { describe, expect, test } from "bun:test";
import { InspectionViewModel } from "./inspection-view-model.ts";
import type { InspectionOpenResult, InspectionSaveResult } from "../inspection-contract.ts";

const result = (id: string) => ({
  evaluation: { id, experimentId: "e", caseId: id, caseRevision: "1", targetId: "existing-output", targetRevision: "1", trial: 1, status: "scored" as const, output: {}, findings: [{ scorerId: "s", scorerRevision: "1", score: 1 }], durationMs: 0, usage: {}, evidence: [] },
  question: { id, text: `Question ${id}`, category: "semantic" as const },
  provenance: { classification: "retained-current-retrieval" as const, mode: "lexical", method: "retained retrieval", corpusVersion: "v", corpusSha256: "a".repeat(64), sourceId: "source" },
  details: { kind: "retrieval" as const, retrieved: [] },
  comparison: {},
});
const opened: InspectionOpenResult = {
  document: { schemaVersion: 1, title: "Inspection", description: "Read saved results.", corpus: { version: "v", sha256: "a".repeat(64), records: 10_000 }, sources: [{ id: "source", path: "source.json", sha256: "b".repeat(64), bytes: 1, classification: "retained-current-retrieval", label: "Source", limitations: [] }], execution: { adapter: "braintrust", mode: "assess-existing", targetCalls: 0, modelCalls: 0 }, results: [result("one"), result("two")], comparisons: [], feedback: [], limitations: [] },
  feedback: [],
};

describe("InspectionViewModel", () => {
  test("keeps selection visible and drafts bound to exact results", async () => {
    const pending: Array<(value: InspectionSaveResult) => void> = [];
    const vm = new InspectionViewModel({ open: async () => opened, save: async () => new Promise(resolve => pending.push(resolve)) });
    await vm.load();
    vm.actions.editAttribution("Reviewer one"); vm.actions.editCorrection("Useful for one");
    vm.actions.selectResult("two"); vm.actions.editAttribution("Reviewer two");
    vm.actions.selectResult("one");
    expect(vm.presentation.selected?.evaluation.id).toBe("one");
    expect(vm.presentation.draft).toMatchObject({ attribution: "Reviewer one", correction: "Useful for one" });

    const saving = vm.actions.saveFeedback();
    expect(vm.presentation.selected?.evaluation.id).toBe("one");
    expect(vm.presentation.saveState).toBe("pending");
    vm.actions.selectResult("two");
    pending.shift()?.({ feedback: { resultId: "one", attribution: "Reviewer one", rating: "uncertain", correction: "Useful for one", sequence: 1, savedAt: "2026-09-13T00:00:00.000Z" } });
    await saving;
    expect(vm.presentation.selected?.evaluation.id).toBe("two");
    expect(vm.presentation.draft.attribution).toBe("Reviewer two");
  });

  test("ignores late load and save responses and preserves drafts on failure", async () => {
    let loadResolve!: (value: InspectionOpenResult) => void;
    const loads = [new Promise<InspectionOpenResult>(resolve => { loadResolve = resolve; }), Promise.resolve(opened)];
    const vm = new InspectionViewModel({ open: () => loads.shift()!, save: async () => { throw Error("Save unavailable"); } });
    const first = vm.load(); const second = vm.load(); await second; loadResolve(opened); await first;
    vm.actions.editAttribution("Unverified operator label"); vm.actions.editCorrection("Keep this draft");
    await vm.actions.saveFeedback();
    expect(vm.presentation.saveState).toBe("failed");
    expect(vm.presentation.error).toContain("Save unavailable");
    expect(vm.presentation.draft.correction).toBe("Keep this draft");
  });

  test("rejects blank attribution before calling the server", async () => {
    let saves = 0;
    const vm = new InspectionViewModel({ open: async () => opened, save: async () => { saves += 1; throw Error("unexpected"); } });
    await vm.load(); await vm.actions.saveFeedback();
    expect(saves).toBe(0);
    expect(vm.presentation.saveState).toBe("invalid");
    expect(vm.presentation.error).toContain("attribution");
  });

  test("does not reload during a pending save or save during a reload", async () => {
    let opens = 0; let saves = 0;
    let saveResolve!: (value: InspectionSaveResult) => void;
    let reloadResolve!: (value: InspectionOpenResult) => void;
    const vm = new InspectionViewModel({
      open: async () => {
        opens += 1;
        if (opens === 1) return opened;
        return new Promise(resolve => { reloadResolve = resolve; });
      },
      save: async () => { saves += 1; return new Promise(resolve => { saveResolve = resolve; }); },
    });
    await vm.load(); vm.actions.editAttribution("Operator");
    const saving = vm.actions.saveFeedback();
    const blockedReload = vm.actions.retry();
    await Promise.resolve();
    expect(opens).toBe(1);
    saveResolve({ feedback: { resultId: "one", attribution: "Operator", rating: "uncertain", sequence: 1, savedAt: "2026-09-13T00:00:00.000Z" } });
    await saving; await blockedReload;
    expect(vm.presentation.saveState).toBe("saved");

    const reloading = vm.actions.retry();
    await vm.actions.saveFeedback();
    expect(saves).toBe(1);
    reloadResolve(opened); await reloading;
  });

  test("keeps a reload failure visible beside the previously selected result", async () => {
    let calls = 0;
    const vm = new InspectionViewModel({ open: async () => { if (++calls === 1) return opened; throw Error("Reload unavailable"); }, save: async () => { throw Error("unused"); } });
    await vm.load(); await vm.actions.retry();
    expect(vm.presentation.phase).toBe("error");
    expect(vm.presentation.selected?.evaluation.id).toBe("one");
    expect(vm.presentation.loadError).toContain("Reload unavailable");
  });

  test("keeps save and reload failures in their separate presentation channels", async () => {
    let opens = 0;
    const vm = new InspectionViewModel({
      open: async () => { if (++opens === 1) return opened; throw Error("Reload unavailable"); },
      save: async () => { throw Error("Save unavailable"); },
    });
    await vm.load(); vm.actions.editAttribution("Operator"); await vm.actions.saveFeedback(); await vm.actions.retry();
    expect(vm.presentation.error).toContain("Save unavailable");
    expect(vm.presentation.loadError).toContain("Reload unavailable");
  });

  test("projects selected comparisons, feedback and injected copy for the View", async () => {
    const baseline = result("two");
    const selected = { ...result("one"), comparison: { baselineResultId: "two" } };
    const related = { ...baseline, question: selected.question };
    const feedback = { resultId: "one", attribution: "Operator", rating: "correct" as const, sequence: 1, savedAt: "2026-09-13T00:00:00.000Z" };
    const fixture: InspectionOpenResult = {
      document: { ...opened.document, results: [selected, related] },
      feedback: [feedback],
    };
    const vm = new InspectionViewModel(
      { open: async () => fixture, save: async () => { throw Error("unused"); } },
      { findingsUnavailable: "Custom unavailable", savedFeedback: "Custom saved notes" },
    );
    await vm.load();
    expect(vm.presentation.copy).toMatchObject({ findingsUnavailable: "Custom unavailable", savedFeedback: "Custom saved notes" });
    expect(vm.presentation.baseline?.evaluation.id).toBe("two");
    expect(vm.presentation.comparisonResults.map(candidate => candidate.evaluation.id)).toEqual(["two"]);
    expect(vm.presentation.selectedFeedback).toEqual([feedback]);
  });
});
