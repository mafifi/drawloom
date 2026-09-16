import {
  AuthZenRequestSchema,
  type Authorizer,
  type AuthZenRequest,
  type AuthorizationResult,
} from "@drawloom/authorization";
export interface DeterministicAuthorizer extends Authorizer {
  revoke(subjectId: string): void;
  setAvailable(available: boolean): void;
}
/** Deliberately synthetic policy: a subject's projects must include the resource's
 * project; read is the only admitted action. These attributes are NOT core rules.
 * context.unavailable provides a deterministic per-request failure scenario. */
export function createDeterministicAuthorizer({
  delayMs = 0,
}: {
  delayMs?: number;
} = {}): DeterministicAuthorizer {
  if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 60000)
    throw Error("Invalid policy delay");
  const revoked = new Set<string>();
  let available = true;
  return {
    revoke(subjectId) {
      revoked.add(subjectId);
    },
    setAvailable(value) {
      available = value;
    },
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
      if (delayMs > 0)
        await new Promise<void>((resolve) => {
          const finish = () => {
            clearTimeout(timer);
            options.signal.removeEventListener("abort", finish);
            resolve();
          };
          const timer = setTimeout(finish, delayMs);
          options.signal.addEventListener("abort", finish, { once: true });
          if (options.signal.aborted) finish();
        });
      const after = stopped();
      if (after) return after;
      if (!available || facts.context?.unavailable === true)
        return { kind: "failure", code: "unavailable" };
      const projects = facts.subject.properties.projects;
      const project = facts.resource.properties.project;
      return {
        decision:
          !revoked.has(facts.subject.id) &&
          facts.action.name === "read" &&
          typeof project === "string" &&
          Array.isArray(projects) &&
          projects.includes(project),
      };
    },
  };
}
