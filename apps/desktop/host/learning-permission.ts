import {
  LearningPreferencesSchema,
  type LearningFeature,
  type LearningPreferences,
  type LearningProcessingScope,
} from "@drawloom/knowledge/consent";
import type { createLearningConsentStore } from "./learning-consent.js";

/** Host lifetime authority. A lease binds an awaited eligibility check to admission. */
export function createLearningPermission(consent: ReturnType<typeof createLearningConsentStore>) {
  const automatic = new Map<LearningFeature, AbortController>();
  const manual = new Map<LearningFeature, AbortController>();
  const listeners = new Set<(feature: LearningFeature) => void>();
  const pending = new Map<LearningFeature, Set<symbol>>();
  let requested: Partial<LearningPreferences> = {};
  const failedDisables = new Set<LearningFeature>();
  const generation = (feature: LearningFeature, mode: "automatic" | "manual") => {
    const map = mode === "automatic" ? automatic : manual;
    let controller = map.get(feature);
    if (!controller) {
      controller = new AbortController();
      map.set(feature, controller);
    }
    return controller;
  };
  function invalidate(feature: LearningFeature, includeManual = false) {
    generation(feature, "automatic").abort();
    automatic.set(feature, new AbortController());
    if (includeManual) {
      generation(feature, "manual").abort();
      manual.set(feature, new AbortController());
    }
    for (const listener of listeners) listener(feature);
  }
  function suppress(feature: LearningFeature) {
    const token = Symbol();
    const tokens = pending.get(feature) ?? new Set<symbol>();
    pending.set(feature, tokens);
    tokens.add(token);
    invalidate(feature);
    return () => {
      tokens.delete(token);
    };
  }
  return {
    consent,
    invalidate,
    subscribe(listener: (feature: LearningFeature) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    suppress,
    async lease(feature: LearningFeature, mode: "automatic" | "manual" = "automatic") {
      const controller = generation(feature, mode);
      if (mode === "automatic" && (pending.get(feature)?.size || failedDisables.has(feature)))
        return undefined;
      const allowed = await (mode === "manual"
        ? consent.hasConsent(feature)
        : consent.permits(feature));
      if (
        !allowed ||
        controller.signal.aborted ||
        (mode === "automatic" && (pending.get(feature)?.size || failedDisables.has(feature)))
      )
        return undefined;
      if (mode === "automatic" && requested[feature] === undefined) requested[feature] = true;
      return { signal: controller.signal, remainingMs: () => Number.MAX_SAFE_INTEGER };
    },
    async preferences(value: LearningPreferences) {
      const next = LearningPreferencesSchema.parse(value);
      const features = Object.keys(next) as LearningFeature[];
      // Enabling cannot revoke an existing lease. Only a new disable changes
      // its admission authority; keep earlier queued disables until they settle.
      const disabling = features.filter(
        (feature) => !next[feature] && requested[feature] !== false,
      );
      requested = next;
      const releases = disabling.map((feature) => suppress(feature));
      try {
        const status = await consent.preferences(next);
        for (const feature of features) failedDisables.delete(feature);
        return status;
      } catch (error) {
        // A failed disable cannot silently resume work under the old disk value.
        for (const feature of features) if (!next[feature]) failedDisables.add(feature);
        throw error;
      } finally {
        for (const release of releases) release();
      }
    },
    async confirm(feature: LearningFeature, scope: LearningProcessingScope) {
      invalidate(feature, true);
      return consent.confirm(feature, scope);
    },
    close() {
      for (const controller of [...automatic.values(), ...manual.values()]) controller.abort();
      listeners.clear();
    },
  };
}
