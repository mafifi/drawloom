import { afterAll, describe, expect, test } from "vitest";
import type { JsonStore, JsonValue } from "@drawloom/host";
import { createNodeJsonStore } from "@drawloom/node-host";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLearningConsentStore, DEFAULT_LOCAL_LEARNING_SCOPE } from "./learning-consent.js";

const fixtureDirectories = new Set<string>();
afterAll(async () => {
  for (const directory of fixtureDirectories) await rm(directory, { recursive: true, force: true });
});

const enabled = { captureOutcomes: true, automaticContext: true, automaticCuration: true };
const completeDefaultScope = {
  captureOutcomes: {
    purpose: "retain-tool-outcomes",
    dataCategories: ["validated-tool-outcomes", "execution-status", "provenance"],
    destinations: ["device:drawloom"],
    boundaries: ["local-storage", "local-embeddings"],
  },
  automaticContext: {
    purpose: "inform-conversation",
    dataCategories: ["user-request", "knowledge-records", "evidence-references"],
    destinations: ["device:drawloom", "agent:codex"],
    boundaries: ["local-retrieval", "local-embeddings", "provider-disclosure"],
  },
  automaticCuration: {
    purpose: "curate-retained-learning",
    dataCategories: ["knowledge-records", "supporting-evidence", "provenance"],
    destinations: ["device:drawloom", "agent:codex"],
    boundaries: ["local-storage", "local-retrieval", "local-embeddings", "provider-disclosure"],
  },
};
function storage() {
  const values = new Map<string, JsonValue>();
  let writes = 0;
  let fail = false;
  const store: JsonStore = {
    async get(key) {
      return structuredClone(values.get(key));
    },
    async set(key, value) {
      if (fail) throw Error("Disk unavailable");
      writes++;
      values.set(key, structuredClone(value));
    },
  };
  return {
    store,
    values,
    writes: () => writes,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}
function fixture(scope = DEFAULT_LOCAL_LEARNING_SCOPE) {
  const disk = storage();
  const create = () =>
    createLearningConsentStore({
      store: disk.store,
      declaration: scope,
      legacy: async () => ({
        preferences: enabled,
        establishedScope: DEFAULT_LOCAL_LEARNING_SCOPE,
      }),
      now: () => "2026-09-16T12:00:00.000Z",
    });
  return { ...disk, create, consent: create() };
}

describe("host-owned learning consent", () => {
  test("manual curation checks scoped permission without enabling automatic curation", async () => {
    const disk = storage();
    const consent = createLearningConsentStore({
      store: disk.store,
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
    });
    expect(await consent.hasConsent("automaticCuration")).toBe(false);
    await consent.confirm("automaticCuration", DEFAULT_LOCAL_LEARNING_SCOPE.automaticCuration);
    expect(await consent.hasConsent("automaticCuration")).toBe(true);
    expect(await consent.permits("automaticCuration")).toBe(false);
    expect((await consent.record()).preferences.automaticCuration).toBe(false);
    const broader = structuredClone(DEFAULT_LOCAL_LEARNING_SCOPE);
    broader.automaticCuration.destinations.push("agent:different");
    const replacement = createLearningConsentStore({ store: disk.store, declaration: broader });
    expect(await replacement.hasConsent("automaticCuration")).toBe(false);
    const narrower = structuredClone(DEFAULT_LOCAL_LEARNING_SCOPE);
    narrower.automaticCuration.destinations = ["device:drawloom"];
    expect(
      await createLearningConsentStore({ store: disk.store, declaration: narrower }).hasConsent(
        "automaticCuration",
      ),
    ).toBe(true);
  });
  test("migrates actual local and Codex scope once without inventing a grant date", async () => {
    const f = fixture();
    const first = await f.consent.status();
    expect(first.features.automaticContext.state).toBe("enabled");
    expect(first.features.automaticCuration.state).toBe("enabled");
    const record = await f.consent.record();
    expect(record.preferences).toEqual(enabled);
    expect(DEFAULT_LOCAL_LEARNING_SCOPE).toEqual(completeDefaultScope);
    expect(record.grants.captureOutcomes?.scope).toEqual(completeDefaultScope.captureOutcomes);
    expect(record.grants.automaticContext?.scope).toEqual(completeDefaultScope.automaticContext);
    expect(record.grants.automaticCuration?.scope).toEqual(completeDefaultScope.automaticCuration);
    expect(record.grants.automaticContext?.provenance).toEqual({
      kind: "migration",
      source: "local-learning-configuration",
      recordedAt: "2026-09-16T12:00:00.000Z",
    });
    expect(JSON.stringify(record)).not.toContain("grantedAt");
    expect(await f.create().record()).toEqual(record);
    expect(f.writes()).toBe(1);
  });

  test("migrates only enabled features through real storage and preserves them after restart", async () => {
    const root = await mkdtemp(join(tmpdir(), "drawloom-learning-consent-"));
    fixtureDirectories.add(root);
    const store = createNodeJsonStore(root);
    const preferences = {
      captureOutcomes: true,
      automaticContext: false,
      automaticCuration: true,
    };
    const first = createLearningConsentStore({
      store,
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
      legacy: async () => ({ preferences, establishedScope: DEFAULT_LOCAL_LEARNING_SCOPE }),
      now: () => "2026-09-16T12:00:00.000Z",
    });

    const migrated = await first.record();
    expect(migrated.preferences).toEqual(preferences);
    expect(migrated.grants.captureOutcomes?.scope).toEqual(completeDefaultScope.captureOutcomes);
    expect(migrated.grants.automaticContext).toBeUndefined();
    expect(migrated.grants.automaticCuration?.scope).toEqual(
      completeDefaultScope.automaticCuration,
    );

    const restarted = createLearningConsentStore({
      store: createNodeJsonStore(root),
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
      legacy: async () => {
        throw Error("restart must not repeat migration");
      },
    });
    expect(await restarted.record()).toEqual(migrated);
    expect(await restarted.permits("captureOutcomes")).toBe(true);
    expect(await restarted.permits("automaticContext")).toBe(false);
    expect(await restarted.permits("automaticCuration")).toBe(true);
  });

  test("snapshots the trusted declaration before later caller mutation", async () => {
    const declaration = structuredClone(DEFAULT_LOCAL_LEARNING_SCOPE);
    const disk = storage();
    const consent = createLearningConsentStore({ store: disk.store, declaration });
    declaration.captureOutcomes.boundaries.push("provider-disclosure");
    declaration.captureOutcomes.destinations.push("agent:codex");

    const status = await consent.status();
    expect(status.features.captureOutcomes.scope).toEqual(completeDefaultScope.captureOutcomes);
  });

  test("equivalent and narrower replacements retain permission independently of provider identity", async () => {
    const f = fixture();
    await f.consent.record();
    const narrower = structuredClone(DEFAULT_LOCAL_LEARNING_SCOPE);
    narrower.automaticContext.destinations = ["device:drawloom"];
    const replacement = createLearningConsentStore({ store: f.store, declaration: narrower });
    expect((await replacement.status()).features.automaticContext.state).toBe("enabled");
  });

  test.each(["destinations", "dataCategories", "boundaries"] as const)(
    "broader %s requires confirmation while preserving the preference",
    async (field) => {
      const f = fixture();
      await f.consent.record();
      const broader = structuredClone(DEFAULT_LOCAL_LEARNING_SCOPE);
      broader.automaticContext[field].push("additional-processing");
      const replacement = createLearningConsentStore({ store: f.store, declaration: broader });
      const status = await replacement.status();
      expect(status.features.automaticContext).toMatchObject({
        preferred: true,
        state: "consent_required",
      });
      expect(await replacement.permits("automaticContext")).toBe(false);
      expect((await replacement.record()).preferences.automaticContext).toBe(true);
    },
  );

  test("a changed processing purpose requires confirmation", async () => {
    const f = fixture();
    await f.consent.record();
    const changed = structuredClone(DEFAULT_LOCAL_LEARNING_SCOPE);
    changed.automaticCuration.purpose = "training";
    const replacement = createLearningConsentStore({ store: f.store, declaration: changed });
    expect(await replacement.permits("automaticCuration")).toBe(false);
  });

  test("unestablished legacy scope preserves choices without granting processing", async () => {
    const disk = storage();
    const consent = createLearningConsentStore({
      store: disk.store,
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
      legacy: async () => ({ preferences: enabled }),
    });
    expect((await consent.record()).preferences).toEqual(enabled);
    for (const feature of Object.keys(enabled) as Array<keyof typeof enabled>) {
      expect((await consent.status()).features[feature].state).toBe("consent_required");
    }
  });

  test("saved preferences do not constitute consent; confirmation binds the displayed scope", async () => {
    const disk = storage();
    const consent = createLearningConsentStore({
      store: disk.store,
      declaration: DEFAULT_LOCAL_LEARNING_SCOPE,
    });
    await consent.preferences(enabled);
    expect(await consent.permits("automaticContext")).toBe(false);
    const status = await consent.status();
    await consent.confirm("automaticContext", status.features.automaticContext.scope);
    expect(await consent.permits("automaticContext")).toBe(true);
    expect(await consent.permits("automaticCuration")).toBe(false);
    await consent.preferences({ ...enabled, automaticContext: false });
    expect(await consent.permits("automaticContext")).toBe(false);
    expect((await consent.record()).grants.automaticContext).toBeDefined();
  });

  test("stale or broadened browser confirmation cannot grant a different declaration", async () => {
    const f = fixture();
    const wrong = structuredClone(DEFAULT_LOCAL_LEARNING_SCOPE.automaticContext);
    wrong.destinations.push("cloud:other");
    await expect(f.consent.confirm("automaticContext", wrong)).rejects.toThrow("scope changed");
  });

  test("failed migration is retryable and does not reset unrelated state", async () => {
    const f = fixture();
    f.values.set("project", { id: "keep" });
    f.fail(true);
    await expect(f.consent.record()).rejects.toThrow("Disk unavailable");
    f.fail(false);
    expect(await f.consent.permits("automaticContext")).toBe(true);
    expect(f.values.get("project")).toEqual({ id: "keep" });
    expect(f.writes()).toBe(1);
  });

  test("concurrent first reads migrate atomically once", async () => {
    const f = fixture();
    const records = await Promise.all(Array.from({ length: 8 }, () => f.consent.record()));
    expect(records.every((value) => JSON.stringify(value) === JSON.stringify(records[0]))).toBe(
      true,
    );
    expect(f.writes()).toBe(1);
  });

  test("unknown stored versions and malformed declarations fail closed", async () => {
    const f = fixture();
    await f.consent.record();
    const key = [...f.values.keys()][0]!;
    f.values.set(key, { version: 99 });
    await expect(f.create().permits("automaticContext")).rejects.toThrow();
    expect(() =>
      createLearningConsentStore({ store: f.store, declaration: {} as never }),
    ).toThrow();
  });
});
