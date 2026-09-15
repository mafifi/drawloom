import type { EvaluationAssessmentProvider } from "@drawloom/evaluation";
import type { InstalledWorkflowRegistration } from "./plugin-packages.js";
import { createInstalledEvaluation } from "./evaluation-host.js";

type AssessmentFactoryOptions = {
  dataDirectory: string;
  scope: { installationId: string; projectId: string };
  workingDirectory: string;
  model?: string;
};

export function createEvaluationAssessmentResolver(options: {
  dataDirectory?: string;
  assessment?: EvaluationAssessmentProvider;
  model?: string;
  create: (options: AssessmentFactoryOptions) => Promise<EvaluationAssessmentProvider>;
}) {
  let shared: Promise<EvaluationAssessmentProvider> | undefined;
  return (installationId: string, projectId: string, workingDirectory: string) => {
    if (options.assessment) return Promise.resolve(options.assessment);
    const create = () =>
      options.create({
        dataDirectory: options.dataDirectory ?? "",
        scope: { installationId, projectId },
        workingDirectory,
        ...(options.model !== undefined ? { model: options.model } : {}),
      });
    // Explicit model selection keeps native session mappings scoped to each owner.
    return options.model !== undefined ? create() : (shared ??= create());
  };
}

export function createInstalledEvaluationPreparation(options: {
  dataDirectory: string;
  project: { id: string; directory: string };
  assessment: (
    installationId: string,
    projectId: string,
    workingDirectory: string,
  ) => Promise<EvaluationAssessmentProvider>;
}) {
  return async (
    installation: { id: string },
    _inventory: unknown,
    workflow: InstalledWorkflowRegistration | undefined,
  ) =>
    createInstalledEvaluation({
      dataDirectory: options.dataDirectory,
      scope: { installationId: installation.id, projectId: options.project.id },
      assessment: await options.assessment(
        installation.id,
        options.project.id,
        options.project.directory,
      ),
      ...(workflow ? { workflow } : {}),
    });
}
