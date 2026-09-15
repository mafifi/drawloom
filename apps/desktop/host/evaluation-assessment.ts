import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import type { EvaluationScope, EvaluationAssessmentProvider } from "@drawloom/evaluation";
import { EvaluationScopeSchema } from "@drawloom/evaluation";
import { createCodexDriver, type CodexDriverOptions } from "@drawloom/codex-agent";
import { codexCommand, createNodeJsonStore, createStdioTransport } from "@drawloom/node-host";
import { observedRpc } from "./telemetry.js";

const modelSchema = z
  .string()
  .min(1)
  .max(256)
  .refine((value) => value.trim() === value && !/[\r\n\t]/.test(value));

/** Host configuration only; never accepts a model from an MCP App request. */
export function evaluationCodexCommand(rawModel: string) {
  const model = modelSchema.parse(rawModel);
  const command = codexCommand();
  return { ...command, args: [...command.args, "-c", `model=${JSON.stringify(model)}`] };
}

export async function createDesktopAssessment(options: {
  dataDirectory: string;
  scope: EvaluationScope;
  workingDirectory: string;
  model?: string;
  connect?: CodexDriverOptions["connect"];
}): Promise<EvaluationAssessmentProvider> {
  const scope = EvaluationScopeSchema.parse(options.scope);
  const command = options.model === undefined ? undefined : evaluationCodexCommand(options.model);
  const { createBraintrustAssessmentProvider, createAgentRubricScorer } = await import(
    "@drawloom/braintrust-assessment"
  );
  if (!command) return createBraintrustAssessmentProvider();
  // Session mappings are distinct even when installed consumers reuse request IDs.
  const owner = createHash("sha256")
    .update(JSON.stringify([scope.installationId, scope.projectId]))
    .digest("hex");
  const driver = createCodexDriver({
    workingDirectory: options.workingDirectory,
    store: createNodeJsonStore(join(options.dataDirectory, "evaluation-agents", owner)),
    archiveOnClose: true,
    connect:
      options.connect ??
      (async () =>
        observedRpc(createStdioTransport({ ...command, cwd: options.workingDirectory }))),
  });
  return createBraintrustAssessmentProvider({
    scorers: [createAgentRubricScorer({ driver, configuredModel: options.model! })],
  });
}
