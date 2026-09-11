import type { Orchestrator, RunSnapshot } from '@drawloom/orchestration';
import { WorkflowCommandSchema, WorkflowPageSchema, WorkflowReadSchema, WorkflowRunSchema, WorkflowStepsSchema } from '../src/lib/orchestration-protocol.js';

/** Only host-authored, content-free messages may pass the browser boundary. */
export class WorkflowControlError extends Error {}

function projectRun(run: RunSnapshot) {
  const { output: _output, failure: _failure, ...summary } = run;
  return WorkflowRunSchema.parse({ ...summary, steps: run.steps.map(({ result: _result, ...step }) => step) });
}

/** Internal desktop reads: owner resolution remains the host's responsibility. */
export function createOrchestrationPresentation(resolve: (scope: { projectId: string; installationId: string }) => Promise<Orchestrator>) {
  return {
    async list(raw: unknown) {
      const input = WorkflowReadSchema.parse(raw);
      const provider = await resolve(input);
      const page = await provider.list({ limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) });
      return WorkflowPageSchema.parse({ ...page, runs: page.runs.map(projectRun) });
    },
    async steps(raw: unknown) {
      const input = WorkflowReadSchema.parse(raw);
      if (!input.runId) throw Error('Select a workflow run');
      const provider = await resolve(input);
      const page = await provider.getSteps(input.runId, { limit: input.limit, ...(input.cursor ? { cursor: input.cursor } : {}) });
      return WorkflowStepsSchema.parse({ ...page, steps: page.steps.map(({ result: _result, ...step }) => step) });
    },
    async command(raw: unknown) {
      const input = WorkflowCommandSchema.parse(raw);
      const provider = await resolve(input);
      try {
        if (input.action === 'cancel') await provider.cancel(input.runId);
        else await provider.respond(input.runId, input.requestId, input.value);
      } catch {
        throw new WorkflowControlError(input.action === 'cancel'
          ? 'Cancellation could not be confirmed. Refresh the run before trying again; effects may still be in progress.'
          : 'Input response could not be confirmed. Refresh the run, check the requested JSON, and submit only if the input is still pending.');
      }
      const run = await provider.get(input.runId).catch(() => { throw new WorkflowControlError('The command was accepted, but updated run details are unavailable. Refresh to check its state.'); });
      if (run.runId !== input.runId) throw Error('Mismatched workflow response');
      return projectRun(run);
    },
  };
}
