import { z } from "zod";
import type { AgentResult } from "./index.js";
import { PlanSnapshotSchema } from "@drawloom/conversation-history";
import type { AgentChildAdmission } from "./delegation.js";

export const AgentGoalSnapshotSchema = z.strictObject({
  /** Opaque snapshot token; stale-view protection, not a cross-writer lock. */
  revision: z.string().min(1),
  objective: z.string().min(1),
  status: z.enum(["active", "paused", "blocked", "usage_limited", "budget_limited", "complete"]),
  timeUsedSeconds: z.number().int().nonnegative().optional(),
  tokensUsed: z.number().int().nonnegative().optional(),
  tokenBudget: z.number().int().nonnegative().optional(),
});
export type AgentGoalSnapshot = z.infer<typeof AgentGoalSnapshotSchema>;
export const AgentGoalRefSchema = z.strictObject({ revision: z.string().min(1) });
export type AgentGoalRef = z.infer<typeof AgentGoalRefSchema>;
export interface AgentGoals {
  read(): Promise<AgentResult<AgentGoalSnapshot | null>>;
  create(objective: string): Promise<AgentResult<AgentGoalSnapshot>>;
  edit(input: AgentGoalRef & { objective: string }): Promise<AgentResult<AgentGoalSnapshot>>;
  pause(input: AgentGoalRef): Promise<AgentResult<AgentGoalSnapshot>>;
  resume(input: AgentGoalRef): Promise<AgentResult<AgentGoalSnapshot>>;
  clear(input: AgentGoalRef): Promise<AgentResult<null>>;
}
export const AgentPlanSnapshotSchema = PlanSnapshotSchema;
export type AgentPlanSnapshot = z.infer<typeof AgentPlanSnapshotSchema>;

export interface AgentSessionOpenOptions {
  /** Establish exact child-operation ownership before publishing tool authority.
   * Absence denies admission; never substitutes the parent's binding. */
  admitChild?(input: AgentChildAdmission): Promise<AgentResult<{ operationId: string }>>;
  /** Host establishes a new operation before adapter publishes tool correlation.
   * Does not prevent native effects already started by the provider. Absence
   * denies adoption; never borrow the previous operation's authority. */
  admitContinuation?(): Promise<AgentResult<{ operationId: string }>>;
}
