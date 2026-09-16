import {
  AuthZenRequestSchema,
  AuthorizationResultSchema,
  type Authorizer,
  type AuthZenRequest,
  type AuthorizationEvaluationOptions,
  type AuthorizationResult,
} from "@drawloom/authorization";
export type LocalAuthorizationPolicy = (
  request: AuthZenRequest,
  options: AuthorizationEvaluationOptions,
) => AuthorizationResult | Promise<AuthorizationResult>;
/** Trusted composition supplies local identity/grant rules. No caller-selected rules,
 * remote engine, universal classification policy, retries, or decision cache.
 * Compose behind the scheduler to bound a noncooperative asynchronous rule. */
export function createLocalAuthorizer(policy: LocalAuthorizationPolicy): Authorizer {
  return {
    async authorize(request, options) {
      const stopped = (): AuthorizationResult | undefined => {
        if (options.signal.aborted) return { kind: "failure", code: "cancelled" };
        try {
          const ms = options.remainingMs();
          if (Number.isFinite(ms) && ms > 0) return;
        } catch {}
        return { kind: "failure", code: "budget_exhausted" };
      };
      const before = stopped();
      if (before) return before;
      let facts: AuthZenRequest;
      try {
        facts = structuredClone(AuthZenRequestSchema.parse(request));
      } catch {
        return { kind: "failure", code: "invalid_facts" };
      }
      let result: unknown;
      try {
        result = await policy(facts, options);
      } catch {
        return stopped() ?? { kind: "failure", code: "rejected" };
      }
      const after = stopped();
      if (after) return after;
      let validated: AuthorizationResult;
      try {
        const parsed = AuthorizationResultSchema.safeParse(result);
        validated = parsed.success ? parsed.data : { kind: "failure", code: "malformed_result" };
      } catch {
        validated = { kind: "failure", code: "malformed_result" };
      }
      return stopped() ?? validated;
    },
  };
}
