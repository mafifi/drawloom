import { join } from "node:path";
import type { JsonStore } from "@drawloom/host";
import { createNodeJsonStore } from "@drawloom/node-host";
import { LocalKnowledgeConfigurationSchema } from "@drawloom/local-knowledge-runtime";
import {
  LearningPreferencesSchema,
  type LearningProcessingDeclaration,
} from "@drawloom/knowledge/consent";
import { createLearningConsentStore, DEFAULT_LOCAL_LEARNING_SCOPE } from "./learning-consent.js";

export function createDesktopLearningConsent(options: {
  root: string;
  store: JsonStore;
  declaration: LearningProcessingDeclaration;
}) {
  return createLearningConsentStore({
    store: options.store,
    declaration: options.declaration,
    async legacy() {
      const raw = await createNodeJsonStore(join(options.root, "knowledge", "state")).get(
        "configuration",
      );
      if (raw === undefined) return undefined;
      // Recognise the two established local formats without rewriting the legacy file.
      const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
      const known = LocalKnowledgeConfigurationSchema.safeParse({
        ...value,
        ...(value.embeddingModel === "qwen3-embedding-0.6b-mlx"
          ? { embeddingModel: "qwen3-embedding-0.6b-gguf" }
          : {}),
      });
      const preferences = LearningPreferencesSchema.parse({
        captureOutcomes: value.captureOutcomes ?? false,
        automaticContext: value.automaticContext ?? false,
        automaticCuration: value.automaticCuration ?? false,
      });
      return {
        preferences,
        ...(known.success ? { establishedScope: DEFAULT_LOCAL_LEARNING_SCOPE } : {}),
      };
    },
  });
}
