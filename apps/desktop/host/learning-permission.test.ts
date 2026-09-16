import { expect, test } from "bun:test";
import type { JsonStore, JsonValue } from "@drawloom/host";
import { createLearningConsentStore, DEFAULT_LOCAL_LEARNING_SCOPE } from "./learning-consent.js";
import { createLearningPermission } from "./learning-permission.js";

function fixture() {
  const values = new Map<string, JsonValue>();
  const store: JsonStore = {
    get: async (key) => values.get(key),
    set: async (key, value) => {
      values.set(key, value);
    },
  };
  const consent = createLearningConsentStore({ store, declaration: DEFAULT_LOCAL_LEARNING_SCOPE });
  return { store, consent, permission: createLearningPermission(consent) };
}

test("identical and unrelated preference saves preserve enabled feature leases", async () => {
  const { permission } = fixture();
  const enabled = { captureOutcomes: true, automaticContext: true, automaticCuration: true };
  for (const feature of ["captureOutcomes", "automaticContext", "automaticCuration"] as const)
    await permission.confirm(feature, DEFAULT_LOCAL_LEARNING_SCOPE[feature]);
  await permission.preferences(enabled);
  const context = await permission.lease("automaticContext");
  const curation = await permission.lease("automaticCuration");
  const capture = await permission.lease("captureOutcomes");
  await permission.preferences(enabled);
  expect([context, curation, capture].map((lease) => lease!.signal.aborted)).toEqual([
    false,
    false,
    false,
  ]);
  const saving = permission.preferences({ ...enabled, captureOutcomes: false });
  expect(capture!.signal.aborted).toBe(true);
  expect(context!.signal.aborted).toBe(false);
  expect(curation!.signal.aborted).toBe(false);
  await saving;
});

test("failed disable persistence stays blocked until an ordered successful save", async () => {
  const { store, permission } = fixture();
  await permission.confirm("captureOutcomes", DEFAULT_LOCAL_LEARNING_SCOPE.captureOutcomes);
  const enabled = { captureOutcomes: true, automaticContext: false, automaticCuration: false };
  await permission.preferences(enabled);
  const lease = await permission.lease("captureOutcomes");
  const set = store.set;
  store.set = async () => {
    throw Error("disk unavailable");
  };
  await expect(permission.preferences({ ...enabled, captureOutcomes: false })).rejects.toThrow(
    "disk unavailable",
  );
  expect(lease!.signal.aborted).toBe(true);
  expect(await permission.lease("captureOutcomes")).toBeUndefined();
  store.set = set;
  await permission.preferences(enabled);
  expect(await permission.lease("captureOutcomes")).toBeDefined();
});

test("overlapping disable enable disable saves retain suppression until their ordered writes settle", async () => {
  const { store, permission } = fixture();
  const enabled = { captureOutcomes: true, automaticContext: false, automaticCuration: true };
  await permission.confirm("captureOutcomes", DEFAULT_LOCAL_LEARNING_SCOPE.captureOutcomes);
  await permission.confirm("automaticCuration", DEFAULT_LOCAL_LEARNING_SCOPE.automaticCuration);
  await permission.preferences(enabled);
  const capture = await permission.lease("captureOutcomes");
  const curation = await permission.lease("automaticCuration");
  let release!: () => void;
  const set = store.set;
  let writes = 0;
  store.set = async (key, value) => {
    if (++writes === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await set(key, value);
  };
  const first = permission.preferences({ ...enabled, captureOutcomes: false });
  const second = permission.preferences(enabled);
  const third = permission.preferences({ ...enabled, captureOutcomes: false });
  expect(capture!.signal.aborted).toBe(true);
  expect(curation!.signal.aborted).toBe(false);
  expect(await permission.lease("captureOutcomes")).toBeUndefined();
  while (!release) await Promise.resolve();
  release();
  await Promise.all([first, second, third]);
  expect(await permission.lease("captureOutcomes")).toBeUndefined();
  expect(curation!.signal.aborted).toBe(false);
  expect(writes).toBe(3);
});

test("capture lease is cancelled immediately on preference admission, before persistence", async () => {
  const { consent, permission } = fixture();
  await consent.confirm("captureOutcomes", DEFAULT_LOCAL_LEARNING_SCOPE.captureOutcomes);
  await permission.preferences({
    captureOutcomes: true,
    automaticContext: false,
    automaticCuration: false,
  });
  const lease = await permission.lease("captureOutcomes");
  expect(lease).toBeDefined();
  const pending = permission.preferences({
    captureOutcomes: false,
    automaticContext: false,
    automaticCuration: false,
  });
  expect(lease!.signal.aborted).toBe(true);
  await pending;
  expect(await permission.lease("captureOutcomes")).toBeUndefined();
});

test("manual curation consent does not enable automatic work", async () => {
  const { permission } = fixture();
  await permission.confirm("automaticCuration", DEFAULT_LOCAL_LEARNING_SCOPE.automaticCuration);
  expect(await permission.lease("automaticCuration")).toBeUndefined();
  expect(await permission.lease("automaticCuration", "manual")).toBeDefined();
});

test("an eligibility check that crosses revocation cannot issue a fresh lease", async () => {
  const { consent, permission } = fixture();
  await permission.confirm("captureOutcomes", DEFAULT_LOCAL_LEARNING_SCOPE.captureOutcomes);
  await permission.preferences({
    captureOutcomes: true,
    automaticContext: false,
    automaticCuration: false,
  });
  let release!: () => void;
  const permits = consent.permits;
  consent.permits = async (feature) => {
    const result = await permits(feature);
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return result;
  };
  const pending = permission.lease("captureOutcomes");
  while (!release) await Promise.resolve();
  await permission.preferences({
    captureOutcomes: false,
    automaticContext: false,
    automaticCuration: false,
  });
  release();
  expect(await pending).toBeUndefined();
});
