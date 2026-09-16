import type { JsonStore } from "@drawloom/host";
import type { LearningPreferences } from "@drawloom/knowledge/consent";
import {
  createLearningConsentStore,
  DEFAULT_LOCAL_LEARNING_SCOPE,
} from "../host/learning-consent.js";
import { createLearningPermission } from "../host/learning-permission.js";

/** Explicit test-user confirmation, not migration inferred from service status. */
export async function createConfirmedLearningPermission(
  store: JsonStore,
  preferences: LearningPreferences = {
    captureOutcomes: false,
    automaticContext: false,
    automaticCuration: false,
  },
) {
  const permission = createLearningPermission(
    createLearningConsentStore({ store, declaration: DEFAULT_LOCAL_LEARNING_SCOPE }),
  );
  for (const feature of ["captureOutcomes", "automaticContext", "automaticCuration"] as const)
    await permission.confirm(feature, DEFAULT_LOCAL_LEARNING_SCOPE[feature]);
  await permission.preferences(preferences);
  return permission;
}

export async function confirmApplicationLearning(
  app: { knowledgeCommand(raw: unknown): Promise<unknown> },
  preferences: LearningPreferences,
) {
  for (const feature of ["captureOutcomes", "automaticContext", "automaticCuration"] as const)
    await app.knowledgeCommand({
      action: "confirm",
      feature,
      scope: DEFAULT_LOCAL_LEARNING_SCOPE[feature],
    });
  await app.knowledgeCommand({ action: "preferences", preferences });
}
