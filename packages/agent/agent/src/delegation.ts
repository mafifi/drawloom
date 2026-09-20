import { z } from "zod";
import type { AgentResult } from "./index.js";
import { DelegationSnapshotSchema } from "@drawloom/conversation-history";

const id = z.string().min(1);

/** Presentation of native state, never an independently writable child store. */
export const AgentDelegationSchema = DelegationSnapshotSchema;
export type AgentDelegation = z.infer<typeof AgentDelegationSchema>;
export const AgentDelegationRefSchema = z.strictObject({ id, revision: id });
export type AgentDelegationRef = z.infer<typeof AgentDelegationRefSchema>;

/** No spawn, execute, steer or resume: these remain parent-mediated. */
export interface AgentDelegations {
  list(): Promise<AgentResult<readonly AgentDelegation[]>>;
  read(id: string): Promise<AgentResult<AgentDelegation>>;
  /** Accepted interruption is a request, not proof of termination. */
  interrupt(input: AgentDelegationRef): Promise<AgentResult<void>>;
}

export const AgentChildAdmissionSchema = z.strictObject({
  childId: id,
  parentId: id.nullable(),
  executionId: id,
  originatingOperationId: id.optional(),
});
export type AgentChildAdmission = z.infer<typeof AgentChildAdmissionSchema>;

export const AgentForkInputSchema = z.strictObject({
  requestId: id,
  sessionId: id,
});
export type AgentForkInput = z.infer<typeof AgentForkInputSchema>;
export const AgentForkReceiptSchema = z.strictObject({
  requestId: id,
  sessionId: id,
  state: z.enum(["pending", "unknown", "created"]),
});
export type AgentForkReceipt = z.infer<typeof AgentForkReceiptSchema>;
export interface AgentForks {
  /** Same request returns its receipt, never a second native fork. */
  create(input: AgentForkInput): Promise<AgentResult<AgentForkReceipt>>;
  /** Null confirms no durable submission exists. Implementations persist a
   * receipt before dispatch, including requests whose outcome is unknown. */
  read(requestId: string): Promise<AgentResult<AgentForkReceipt | null>>;
}
