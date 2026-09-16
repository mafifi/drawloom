import { z } from "zod";
import {
  AuthZenRequestSchema,
  AuthorizationResultSchema,
  type Authorizer,
  type AuthorizationEvaluationOptions,
} from "@drawloom/authorization";

/** Private supervised-worker messages. They confer no browser or plugin authority. */
export const KnowledgeWorkerOperationSchema = z.strictObject({
  lifetime: z.string().uuid(),
  operationId: z.string().uuid(),
  remainingMs: z.number().finite().positive().max(300_000),
  params: z.unknown(),
});
export const KnowledgeWorkerCancellationSchema = KnowledgeWorkerOperationSchema.pick({
  lifetime: true,
  operationId: true,
});
export const KnowledgeWorkerAuthorizationRequestSchema = z.strictObject({
  lifetime: z.string().uuid(),
  operationId: z.string().uuid(),
  decisionId: z.number().int().positive(),
  request: AuthZenRequestSchema,
});
export const KnowledgeWorkerAuthorizationResponseSchema = z.strictObject({
  lifetime: z.string().uuid(),
  operationId: z.string().uuid(),
  decisionId: z.number().int().positive(),
  result: AuthorizationResultSchema,
});
export type KnowledgeWorkerOperation = z.infer<typeof KnowledgeWorkerOperationSchema>;
/** Constructed by trusted host code, never deserialized from a worker request. */
export interface KnowledgeWorkerAdmission {
  readonly operationId: string;
  readonly method: string;
  readonly params: unknown;
  readonly background: boolean;
  readonly assessmentDestination: string;
}
export interface KnowledgeWorkerLease {
  readonly operation: AuthorizationEvaluationOptions;
  readonly authorizer: Authorizer;
  isCurrent(): boolean;
  dispose(): void;
}
export interface KnowledgeWorkerAuthority {
  admit(
    request: KnowledgeWorkerAdmission,
    operation: AuthorizationEvaluationOptions,
  ): KnowledgeWorkerLease;
  /** Trusted host state changed; abort admitted work without replacing its scheduler. */
  invalidate(): void;
}
