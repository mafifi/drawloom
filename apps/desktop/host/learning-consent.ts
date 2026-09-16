import { JsonValueSchema, type JsonStore } from "@drawloom/host";
import {
  LearningConsentRecordSchema,
  LearningConsentStatusSchema,
  LearningFeatureSchema,
  LearningPreferencesSchema,
  LearningProcessingDeclarationSchema,
  LearningProcessingScopeSchema,
  type LearningConsentRecord,
  type LearningConsentStatus,
  type LearningFeature,
  type LearningPreferences,
  type LearningProcessingDeclaration,
  type LearningProcessingScope,
} from "@drawloom/knowledge/consent";

const KEY = "learning-consent";
const features = LearningFeatureSchema.options;
const scopeFields = ["dataCategories", "destinations", "boundaries"] as const;

/** The established default's processing, including its two Codex disclosure paths. */
export const DEFAULT_LOCAL_LEARNING_SCOPE: LearningProcessingDeclaration = {
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

function covers(approved: LearningProcessingScope, requested: LearningProcessingScope): boolean {
  return (
    approved.purpose === requested.purpose &&
    scopeFields.every((field) => requested[field].every((value) => approved[field].includes(value)))
  );
}

/** One desktop host owns this record. JsonStore must atomically replace each value. */
export function createLearningConsentStore(options: {
  store: JsonStore;
  declaration: LearningProcessingDeclaration;
  /** Trusted migration input, read from prior storage, never the replacement provider's preferences. */
  legacy?(): Promise<
    | {
        preferences: LearningPreferences;
        establishedScope?: LearningProcessingDeclaration;
      }
    | undefined
  >;
  now?(): string;
}) {
  // Parsing copies the declaration; later mutation cannot broaden an admitted scope.
  const declaration = LearningProcessingDeclarationSchema.parse(options.declaration);
  let tail: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(work: () => Promise<T>) => {
    const result = tail.then(work, work);
    tail = result.catch(() => undefined);
    return result;
  };
  const now = () => options.now?.() ?? new Date().toISOString();
  const save = async (record: LearningConsentRecord) => {
    const parsed = LearningConsentRecordSchema.parse(record);
    await options.store.set(KEY, JsonValueSchema.parse(parsed));
    return parsed;
  };
  async function load(): Promise<LearningConsentRecord> {
    const stored = await options.store.get(KEY);
    if (stored !== undefined) return LearningConsentRecordSchema.parse(stored);
    const legacy = await options.legacy?.();
    const recordedAt = now();
    const preferences = LearningPreferencesSchema.parse(
      legacy?.preferences ?? {
        captureOutcomes: false,
        automaticContext: false,
        automaticCuration: false,
      },
    );
    const priorScope =
      legacy?.establishedScope === undefined
        ? undefined
        : LearningProcessingDeclarationSchema.parse(legacy.establishedScope);
    const grants: LearningConsentRecord["grants"] = {};
    if (priorScope)
      for (const feature of features) {
        if (preferences[feature])
          grants[feature] = {
            scope: priorScope[feature],
            provenance: { kind: "migration", source: "local-learning-configuration", recordedAt },
          };
      }
    return save({
      version: 1,
      revision: 1,
      preferences,
      grants,
      origin: legacy
        ? {
            kind: "migration",
            source: "local-learning-configuration",
            scopeEstablished: !!priorScope,
            recordedAt,
          }
        : { kind: "new", recordedAt },
    });
  }
  function featureStatus(record: LearningConsentRecord, feature: LearningFeature) {
    const preferred = record.preferences[feature];
    const grant = record.grants[feature];
    return {
      preferred,
      state: !preferred
        ? "disabled"
        : grant && covers(grant.scope, declaration[feature])
          ? "enabled"
          : "consent_required",
      scope: declaration[feature],
    };
  }
  function status(record: LearningConsentRecord): LearningConsentStatus {
    return LearningConsentStatusSchema.parse({
      revision: record.revision,
      features: Object.fromEntries(
        features.map((feature) => [feature, featureStatus(record, feature)]),
      ),
    });
  }
  return {
    record: () => exclusive(load),
    status: () => exclusive(async () => status(await load())),
    /** Permission for a deliberate one-off operation. Automatic work must use permits,
     * which also requires the saved preference. This does not itself start any work. */
    hasConsent: (feature: LearningFeature) =>
      exclusive(async () => {
        const checked = LearningFeatureSchema.parse(feature);
        const grant = (await load()).grants[checked];
        return !!grant && covers(grant.scope, declaration[checked]);
      }),
    permits: (feature: LearningFeature) =>
      exclusive(
        async () =>
          featureStatus(await load(), LearningFeatureSchema.parse(feature)).state === "enabled",
      ),
    preferences(value: LearningPreferences) {
      const preferences = LearningPreferencesSchema.parse(value);
      return exclusive(async () => {
        const record = await load();
        return status(await save({ ...record, preferences, revision: record.revision + 1 }));
      });
    },
    /** Confirm only the scope the user was shown, never a browser-supplied grant. */
    confirm(rawFeature: LearningFeature, displayedScope: LearningProcessingScope) {
      return exclusive(async () => {
        const feature = LearningFeatureSchema.parse(rawFeature);
        const shown = LearningProcessingScopeSchema.parse(displayedScope);
        const current = declaration[feature];
        if (!covers(shown, current) || !covers(current, shown))
          throw Error("Learning processing scope changed; review it before confirming");
        const record = await load();
        return status(
          await save({
            ...record,
            revision: record.revision + 1,
            grants: {
              ...record.grants,
              [feature]: {
                scope: current,
                provenance: { kind: "confirmation", recordedAt: now() },
              },
            },
          }),
        );
      });
    },
  };
}
