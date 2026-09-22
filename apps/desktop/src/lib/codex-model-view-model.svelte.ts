import { z } from "zod";
import { AgentModelSchema, type AgentModel } from "@drawloom/agent";
import { telemetryFetch } from "./telemetry.js";

const ModelsResponseSchema = z.object({ models: z.array(AgentModelSchema).max(1000) });

async function load(): Promise<unknown> {
  const response = await telemetryFetch("/api/models");
  if (!response.ok) throw Error("Models request failed");
  return response.json();
}

/**
 * Owns model availability for the Codex selector: the request, its schema, and
 * the loading and error states around it.
 *
 * This lived inside `CodexModelSelector.svelte`, which meant the view reached a
 * service and validated a response — and could not be tested without a DOM.
 * `check:ui-policy` could not see either, because it did not look inside
 * `.svelte` files for service access or schema validation.
 */
export function createCodexModelViewModel(options: { load?: () => Promise<unknown> } = {}) {
  const request = options.load ?? load;
  let models = $state<AgentModel[]>([]),
    loading = $state(false),
    error = $state("");
  /**
   * A response that arrives after another load started is discarded. The
   * selector reloads whenever it opens, so two requests can overlap and the
   * older one must not replace newer models.
   */
  let epoch = 0;

  return {
    get models() {
      return models;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    async refresh(): Promise<void> {
      const life = ++epoch;
      loading = true;
      error = "";
      try {
        const next = ModelsResponseSchema.parse(await request()).models;
        if (life === epoch) models = next;
      } catch {
        if (life === epoch) error = "Models unavailable. Check the Codex connection.";
      } finally {
        if (life === epoch) loading = false;
      }
    },
  };
}

export type CodexModelViewModel = ReturnType<typeof createCodexModelViewModel>;
