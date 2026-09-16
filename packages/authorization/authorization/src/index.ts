import { z } from "zod";

const Id = z.string().trim().min(1).max(256);
export const AuthZenEntitySchema = z.strictObject({
  type: Id,
  id: Id,
  properties: z.record(z.string().min(1).max(128), z.json()),
});
export type AuthZenEntity = z.infer<typeof AuthZenEntitySchema>;
export const AuthZenRequestSchema = z
  .strictObject({
    subject: AuthZenEntitySchema,
    action: z.strictObject({ name: Id }),
    resource: AuthZenEntitySchema,
    context: z.record(z.string().min(1).max(128), z.json()).optional(),
  })
  .superRefine((value, context) => {
    if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 64 * 1024)
      context.addIssue({ code: "custom", message: "Authorization request is too large" });
  });
export type AuthZenRequest = z.infer<typeof AuthZenRequestSchema>;
export const AuthorizationDecisionSchema = z.strictObject({ decision: z.boolean() });
export const AuthorizationFailureCodeSchema = z.enum([
  "invalid_facts",
  "unavailable",
  "cancelled",
  "budget_exhausted",
  "overflow",
  "malformed_result",
  "rejected",
  "shutdown",
]);
export const AuthorizationResultSchema = z.union([
  AuthorizationDecisionSchema,
  z.strictObject({ kind: z.literal("failure"), code: AuthorizationFailureCodeSchema }),
]);
export type AuthorizationResult = z.infer<typeof AuthorizationResultSchema>;
export type AuthorizationFailureCode = z.infer<typeof AuthorizationFailureCodeSchema>;

/** Trusted host inputs, never request facts. Remaining time includes all nested work.
 * Nonfinite, negative, or throwing suppliers mean exhausted budget. */
export interface AuthorizationEvaluationOptions {
  readonly signal: AbortSignal;
  readonly remainingMs: () => number;
}
/** Only an affirmative validated decision permits progress. Hosts enforce and recheck authority. */
export interface Authorizer {
  authorize(
    request: AuthZenRequest,
    options: AuthorizationEvaluationOptions,
  ): Promise<AuthorizationResult>;
}
