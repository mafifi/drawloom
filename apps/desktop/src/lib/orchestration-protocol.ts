import { z } from 'zod';
import { MAX_TASK_ATTEMPTS, RunSnapshotSchema } from '@drawloom/orchestration';
import { OrchestrationReadinessSchema } from '@drawloom/desktop-host';

// Authenticated desktop presentation only. MCP Apps retains its standard tool route.
const id = z.string().min(1).max(1024);
const cursor = z.string().min(1).max(8192);
export const WorkflowOwnerSchema = z.strictObject({
  installationId: id, title: z.string().min(1).max(256), readiness: OrchestrationReadinessSchema,
});
export const WorkflowOwnersSchema = z.array(WorkflowOwnerSchema).max(256);
// Do not put task results, final output or raw failure text in shared run listings.
export const WorkflowRunSchema = RunSnapshotSchema.omit({ output: true, failure: true }).extend({
  runId: id, identity: id, workflow: z.string().min(1).max(256), version: z.string().min(1).max(128),
  steps: z.array(RunSnapshotSchema.shape.steps.element.omit({ result: true }).extend({ stepId: id, attempts: z.number().int().min(0).max(MAX_TASK_ATTEMPTS) })).max(100),
  pendingInputs: z.array(id).max(100), childRunIds: z.array(id).max(100), unresolvedEffects: z.array(id).max(200),
});
export const WorkflowPageSchema = z.strictObject({ runs: z.array(WorkflowRunSchema).max(100), cursor: cursor.optional() });
export const WorkflowStepsSchema = z.strictObject({ steps: WorkflowRunSchema.shape.steps, cursor: cursor.optional() });
export const WorkflowScopeSchema = z.strictObject({ projectId: id, installationId: id });
export const WorkflowReadSchema = WorkflowScopeSchema.extend({ runId: id.optional(), cursor: cursor.optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });
export const WorkflowCommandSchema = z.discriminatedUnion('action', [
  WorkflowScopeSchema.extend({ action: z.literal('cancel'), runId: id }),
  WorkflowScopeSchema.extend({ action: z.literal('respond'), runId: id, requestId: id, value: z.json() }),
]);
export type WorkflowOwner = z.infer<typeof WorkflowOwnerSchema>;
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;
export type WorkflowCommand = z.infer<typeof WorkflowCommandSchema>;
