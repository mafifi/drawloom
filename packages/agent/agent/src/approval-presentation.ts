import { z } from "zod";
import { AgentApprovalRequestSchema, type AgentResult } from "./index.js";

export const ApprovalPresentationRequestSchema = z.strictObject({
  conversationId: z.string().min(1),
  request: AgentApprovalRequestSchema,
});
export type ApprovalPresentationRequest = z.infer<typeof ApprovalPresentationRequestSchema>;
export const ApprovalSurfaceStateSchema = z.enum(["pending", "dismissed", "failed"]);
export type ApprovalSurfaceState = z.infer<typeof ApprovalSurfaceStateSchema>;
/** Actions are bound by the host to this request and this presentation lifetime.
 * A choice is a native option identity, never a new grant or business acceptance. */
export interface ApprovalPresentationActions {
  choose(optionId: string): Promise<AgentResult<void>>;
  dismiss(): void;
  failed(): void;
  stop(): Promise<AgentResult<void>>;
}
/** Completion acknowledges presentation only. No response leaves native approval pending.
 * Rejected presentation means failure; abort invalidates the surface and its actions. */
export interface ApprovalPresenter {
  present(
    request: ApprovalPresentationRequest,
    actions: ApprovalPresentationActions,
    options: { readonly signal: AbortSignal },
  ): void | Promise<void>;
}
