import { expect, test } from "bun:test";
import { compileModule } from "svelte/compiler";
Bun.plugin({
  name: "knowledge-view-model-tests",
  setup(build) {
    build.onLoad({ filter: /knowledge-view-model\.svelte\.ts$/ }, async ({ path }) => ({
      contents: compileModule(
        new Bun.Transpiler({ loader: "ts" }).transformSync(await Bun.file(path).text()),
        { filename: path, generate: "client" },
      ).js.code,
      loader: "js",
    }));
  },
});
const { createKnowledgeViewModel } = await import("./knowledge-view-model.svelte.js");

test("a provider without installation fields saves preference without granting disclosure", async () => {
  const scope = {
    purpose: "inform-conversation",
    dataCategories: ["knowledge-records"],
    destinations: ["agent:example"],
    boundaries: ["provider-disclosure"],
  };
  let saved = {
    availability: "ready",
    retrieval: "lexical",
    message: "Ready",
    capture: { state: "idle", pendingObservations: 0, message: "" },
    consent: {
      revision: 1,
      features: {
        captureOutcomes: { preferred: false, state: "disabled", scope },
        automaticContext: { preferred: false, state: "disabled", scope },
        automaticCuration: { preferred: false, state: "disabled", scope },
      },
    },
  };
  const commands: unknown[] = [];
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      commands.push(command);
      if (command.action === "preferences")
        saved = {
          ...saved,
          consent: {
            ...saved.consent,
            features: {
              ...saved.consent.features,
              automaticContext: { preferred: true, state: "consent_required", scope },
            },
          },
        };
      if (command.action === "confirm")
        saved = {
          ...saved,
          consent: {
            ...saved.consent,
            features: {
              ...saved.consent.features,
              automaticContext: { preferred: true, state: "enabled", scope },
            },
          },
        };
      return saved;
    },
  });
  await vm.open();
  expect(vm.presentation.error).toBe("");
  vm.actions.setLearning("automaticContext", true);
  await vm.actions.saveLearning();
  expect(vm.presentation.status?.consent.features.automaticContext.state).toBe("consent_required");
  expect(commands.some((command) => (command as { action: string }).action === "confirm")).toBe(
    false,
  );
  expect(vm.presentation.consentRequests[0]?.scope).toEqual(scope);
  await vm.actions.confirmConsent("automaticContext", scope);
  expect(vm.presentation.status?.consent.features.automaticContext.state).toBe("enabled");
  expect(commands.at(-1)).toEqual({ action: "confirm", feature: "automaticContext", scope });
});

test("learning is off until explicitly saved; refresh preserves an unsaved choice", async () => {
  const commands: unknown[] = [];
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      commands.push(command);
      return command.action === "preferences" ? withPreferences(command.preferences) : status();
    },
  });
  await vm.open();
  expect(vm.presentation.learning).toEqual({
    captureOutcomes: false,
    automaticContext: false,
    automaticCuration: false,
    dirty: false,
  });
  vm.actions.setLearning("automaticContext", true);
  await vm.actions.refresh();
  expect(vm.presentation.learning.automaticContext).toBe(true);
  expect(commands).toEqual([{ action: "status" }, { action: "status" }]);
  await vm.actions.saveLearning();
  expect(vm.presentation.status?.consent.features.automaticContext.preferred).toBe(true);
  expect(vm.presentation.status?.consent.features.captureOutcomes.preferred).toBe(false);
  expect(vm.presentation.learning.dirty).toBe(false);
});

test("failed learning save retains draft and authoritative settings; pending save rejects duplicates", async () => {
  let rejectSave!: (cause: Error) => void;
  let saves = 0;
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      if (command.action === "status") return status();
      saves++;
      return new Promise((_resolve, reject) => {
        rejectSave = reject;
      });
    },
  });
  await vm.open();
  vm.actions.setLearning("captureOutcomes", true);
  const saving = vm.actions.saveLearning();
  await vm.actions.saveLearning();
  vm.actions.setLearning("automaticContext", true);
  rejectSave(Error("Could not save settings"));
  await saving;
  expect(saves).toBe(1);
  expect(vm.presentation.status?.consent.features.captureOutcomes.preferred).toBe(false);
  expect(vm.presentation.learning.captureOutcomes).toBe(true);
  expect(vm.presentation.learning.automaticContext).toBe(false);
  expect(vm.presentation.error).toBe("Could not save settings");
});

test("automatic curation requires a successful save, reloads durably and disables independently", async () => {
  let saved = status();
  let fail = true;
  let saves = 0;
  const send = async (command: import("./learning-protocol.js").LearningCommand) => {
    if (command.action === "preferences") {
      saves++;
      if (fail) throw Error("Save failed");
      saved = withPreferences(command.preferences);
    }
    return saved;
  };
  const vm = createKnowledgeViewModel({ send });
  await vm.open();
  vm.actions.setLearning("automaticCuration", true);
  expect(vm.presentation.status?.consent.features.automaticCuration.preferred).toBe(false);
  expect(saves).toBe(0);
  await vm.actions.saveLearning();
  expect(vm.presentation.status?.consent.features.automaticCuration.preferred).toBe(false);
  expect(vm.presentation.learning.automaticCuration).toBe(true);
  expect(vm.presentation.error).toBe("Save failed");
  fail = false;
  await vm.actions.saveLearning();
  expect(vm.presentation.status?.consent.features.automaticCuration.preferred).toBe(true);
  const reopened = createKnowledgeViewModel({ send });
  await reopened.open();
  expect(reopened.presentation.learning.automaticCuration).toBe(true);
  reopened.actions.setLearning("automaticCuration", false);
  await reopened.actions.saveLearning();
  expect(reopened.presentation.learning).toMatchObject({
    automaticCuration: false,
    captureOutcomes: false,
    automaticContext: false,
  });
});

const record = (id: string) => ({
  ref: { type: "source" as const, origin: "public", id, revision: "1" },
  body: id,
  status: "active" as const,
  confidence: {},
  provenance: { producer: { type: "test", id: "fixture" }, inputs: [] },
});
const page = (id: string) => ({
  kind: "ok",
  mode: "lexical",
  semantic: { status: "unavailable" },
  items: [{ record: record(id), relevance: 1 }],
  bytes: 100,
});

test("late search cannot replace a newer query and close discards pending pages", async () => {
  const responses: Array<(value: unknown) => void> = [];
  const vm = createKnowledgeViewModel({
    send: async () => new Promise((resolve) => responses.push(resolve)),
  });
  vm.actions.setQuery("earlier");
  const earlier = vm.actions.search();
  vm.actions.setQuery("newer");
  const newer = vm.actions.search();
  responses[1]!(page("newer"));
  await newer;
  responses[0]!(page("earlier"));
  await earlier;
  expect(vm.presentation.results.map((item) => item.record.ref.id)).toEqual(["newer"]);
  const late = vm.actions.search();
  vm.close();
  responses[2]!(page("late"));
  await late;
  expect(vm.presentation.results).toEqual([]);
});

test("evidence denial clears previous material and commands contain no browser subject", async () => {
  const commands: unknown[] = [];
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      commands.push(command);
      if (command.action === "evidence" && command.request.root.id === "first")
        return { kind: "ok", records: [record("first")], links: [], bytes: 100 };
      return { kind: "denied" };
    },
  });
  await vm.actions.inspect(record("first").ref);
  expect(vm.presentation.evidence?.records.length).toBe(1);
  await vm.actions.inspect(record("denied").ref);
  expect(vm.presentation.evidence).toBeUndefined();
  expect(vm.presentation.error).toContain("permission");
  expect(commands.every((value) => !JSON.stringify(value).includes("subject"))).toBe(true);
});

test("closing an evidence scope clears its error and selection before a replacement opens", async () => {
  const vm = createKnowledgeViewModel({ send: async () => ({ kind: "denied" }) });
  await vm.actions.inspect(record("denied").ref);
  expect(vm.presentation.error).toContain("permission");
  vm.close();
  expect(vm.presentation.error).toBe("");
  expect(vm.presentation.selected).toBeUndefined();
  expect(vm.presentation.evidencePending).toBe(false);
});

test("pending learning status remains visible until a confirmed recovery status replaces it", async () => {
  let pending = true;
  const vm = createKnowledgeViewModel({
    send: async () => ({
      ...status(),
      capture: pending
        ? {
            state: "pending",
            pendingObservations: 2,
            message: "Two observations are waiting for recovery.",
          }
        : { state: "idle", pendingObservations: 0, message: "" },
    }),
  });
  await vm.open();
  expect(vm.presentation.status?.capture).toEqual({
    state: "pending",
    pendingObservations: 2,
    message: "Two observations are waiting for recovery.",
  });
  pending = false;
  await vm.actions.refresh();
  expect(vm.presentation.status?.capture).toEqual({
    state: "idle",
    pendingObservations: 0,
    message: "",
  });
});

test("source and curation warnings survive unrelated actions and failed refresh until authoritative recovery", async () => {
  let failed = true,
    refuse = false;
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      if (command.action === "pause") return { kind: "ready" };
      if (refuse) throw Error("Could not refresh status");
      return {
        ...status(),
        source: {
          projectId: "p",
          enabled: true,
          state: failed ? "unavailable" : "ready",
          message: "Repository collection is unavailable.",
        },
        curation: {
          ...status().curation,
          state: failed ? "uncertain" : "idle",
          message: "The earlier assessment cannot be confirmed. No replacement will start.",
        },
      };
    },
  });
  await vm.open();
  expect(vm.presentation.recoveryNotices).toEqual([
    "Repository collection is unavailable.",
    "The earlier assessment cannot be confirmed. No replacement will start.",
  ]);
  await vm.actions.pause(true);
  expect(vm.presentation.recoveryNotices).toHaveLength(2);
  refuse = true;
  await vm.actions.refresh();
  expect(vm.presentation.recoveryNotices).toHaveLength(2);
  refuse = false;
  failed = false;
  await vm.actions.refresh();
  expect(vm.presentation.recoveryNotices).toEqual([]);
  expect(vm.presentation.error).toBe("");
});

const status = (paused = false) => ({
  availability: "ready",
  retrieval: "lexical",
  message: "Ready",
  consent: {
    revision: 1,
    features: Object.fromEntries(
      ["captureOutcomes", "automaticContext", "automaticCuration"].map((feature) => [
        feature,
        {
          preferred: false,
          state: "disabled",
          scope: {
            purpose: feature,
            dataCategories: ["knowledge"],
            destinations: ["device"],
            boundaries: ["local"],
          },
        },
      ]),
    ),
  },
  capture: { state: "idle", pendingObservations: 0, message: "" },
  curation: {
    paused,
    state: paused ? "paused" : "idle",
    active: false,
    pendingUpdates: 0,
    message: "Ready",
    automaticStartsToday: 0,
    automaticMillisecondsToday: 0,
  },
});
const withPreferences = (preferences: Record<string, boolean>) => {
  const value = status();
  for (const [feature, preferred] of Object.entries(preferences))
    value.consent.features[feature] = {
      ...value.consent.features[feature]!,
      preferred,
      state: preferred ? "consent_required" : "disabled",
    };
  return value;
};

test("source collection requires its own explicit action and does not submit filesystem authority", async () => {
  const commands: unknown[] = [];
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      commands.push(command);
      return status();
    },
  });
  await vm.open();
  await vm.actions.source(true);
  await vm.actions.source(false);
  expect(commands).toEqual([
    { action: "status" },
    { action: "source", enabled: true },
    { action: "source", enabled: false },
  ]);
  expect(vm.presentation.pendingAction).toBeUndefined();
});
test("source setup rejection stays actionable when models exist and never exposes raw provider errors", async () => {
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      if (command.action === "source") throw Error("secret path /private/source");
      return status();
    },
  });
  await vm.open();
  await vm.actions.source(true);
  expect(vm.presentation.error).toBe(
    "Collection could not start. Choose a project with an installed Git source, then connect it.",
  );
  expect(vm.presentation.status?.source).toBeUndefined();
  await vm.actions.refresh();
  expect(vm.presentation.error).toContain("Collection could not start");
});
test("authoritative first-source warning survives unrelated commands and deduplicates configured-source feedback", async () => {
  const warning = "Installed Git source is unavailable.";
  let sourceWarning: string | undefined = warning;
  let configured = false;
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      if (command.action === "pause") return { kind: "ready" };
      if (command.action === "source" && command.enabled) throw Error("private setup details");
      if (command.action === "source" && !command.enabled) sourceWarning = undefined;
      return {
        ...status(),
        ...(sourceWarning ? { sourceWarning } : {}),
        ...(configured
          ? { source: { projectId: "p", enabled: true, state: "unavailable", message: warning } }
          : {}),
      };
    },
  });
  await vm.open();
  await vm.actions.source(true);
  await vm.actions.pause(true);
  await vm.actions.refresh();
  expect(vm.presentation.error).toBe("");
  expect(vm.presentation.recoveryNotices).toEqual([warning]);
  vm.actions.setLearning("captureOutcomes", true);
  await vm.actions.saveLearning();
  expect(vm.presentation.recoveryNotices).toEqual([warning]);
  configured = true;
  await vm.actions.refresh();
  expect(vm.presentation.recoveryNotices).toEqual([warning]);
  configured = false;
  await vm.actions.source(false);
  expect(vm.presentation.recoveryNotices).toEqual([]);
});
test("first-source command failure stays visible until an unrelated command returns authoritative warning", async () => {
  let release!: (value: unknown) => void;
  let warned = false;
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      if (command.action === "source") throw Error("private failure");
      if (command.action === "pause")
        return new Promise((resolve) => {
          release = (value) => {
            warned = true;
            resolve(value);
          };
        });
      return {
        ...status(),
        ...(warned ? { sourceWarning: "Installed Git source is unavailable." } : {}),
      };
    },
  });
  await vm.open();
  await vm.actions.source(true);
  const pausing = vm.actions.pause(true);
  expect(vm.presentation.error).toContain("Collection could not start");
  release({ kind: "ready" });
  await pausing;
  expect(vm.presentation.error).toBe("");
  expect(vm.presentation.recoveryNotices).toEqual(["Installed Git source is unavailable."]);
});
test("a status read started before a pause cannot overwrite the pause response", async () => {
  let release!: (value: unknown) => void;
  let paused = false;
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      if (command.action === "pause") {
        paused = true;
        return { kind: "ready" };
      }
      if (paused) return status(true);
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  const reading = vm.open();
  await vm.actions.pause(true);
  release(status(false));
  await reading;
  expect(vm.presentation.status?.curation?.state).toBe("paused");
});

test("opening shared knowledge never invokes installation or curation", async () => {
  const commands: unknown[] = [];
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      commands.push(command);
      return status();
    },
  });
  await vm.open();
  expect(commands).toEqual([{ action: "status" }]);
});

test("manual curation asks for scope without enabling automatic curation or retrying", async () => {
  const commands: string[] = [];
  const vm = createKnowledgeViewModel({
    send: async (command) => {
      commands.push(command.action);
      return command.action === "run" ? { kind: "consent_required" } : status();
    },
  });
  await vm.open();
  await vm.actions.run(false);
  expect(vm.presentation.learning.automaticCuration).toBe(false);
  expect(vm.presentation.consentRequests.map((value) => value.feature)).toEqual([
    "automaticCuration",
  ]);
  expect(commands).toEqual(["status", "run", "status"]);
  const choice = vm.presentation.consentRequests[0]!;
  await vm.actions.confirmConsent(choice.feature, choice.scope);
  expect(commands).toEqual(["status", "run", "status", "confirm"]);
  expect(vm.presentation.learning.automaticCuration).toBe(false);
});

test("malformed service response gives a useful error rather than internal schema details", async () => {
  const vm = createKnowledgeViewModel({ send: async () => ({ internalSecret: "not a status" }) });
  await vm.open();
  expect(vm.presentation.error).toBe(
    "Knowledge returned an unexpected response. Refresh status and try again.",
  );
});
