import { AuthorizationResultSchema, type Authorizer, type AuthZenRequest } from "./index.js";

export interface AuthorizationConformanceFixture {
  authorizer: Authorizer;
  allow: AuthZenRequest;
  deny: AuthZenRequest;
  unavailable: AuthZenRequest;
  revoke(): void;
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Authorization conformance failed: ${message}`);
}
/** Synthetic fixtures prove this contract, never compatibility with an external policy engine. */
export async function authorizationConformance(
  fixture: AuthorizationConformanceFixture,
): Promise<void> {
  const options = { signal: new AbortController().signal, remainingMs: () => 2000 };
  for (const [request, decision] of [
    [fixture.allow, true],
    [fixture.deny, false],
  ] as const) {
    const result = AuthorizationResultSchema.parse(
      await fixture.authorizer.authorize(request, options),
    );
    check("decision" in result && result.decision === decision, "allow and deny stay distinct");
  }
  const unavailable = await fixture.authorizer.authorize(fixture.unavailable, options);
  check(
    "kind" in unavailable && unavailable.code === "unavailable",
    "unavailability is not denial",
  );
  const cancelled = new AbortController();
  cancelled.abort();
  const aborted = await fixture.authorizer.authorize(fixture.allow, {
    ...options,
    signal: cancelled.signal,
  });
  check("kind" in aborted && aborted.code === "cancelled", "pre-cancellation prevents decisions");
  const exhausted = await fixture.authorizer.authorize(fixture.allow, {
    ...options,
    remainingMs: () => 0,
  });
  check(
    "kind" in exhausted && exhausted.code === "budget_exhausted",
    "expired budget prevents decisions",
  );
  const invalid = await fixture.authorizer.authorize(
    { ...fixture.allow, action: { name: "" } },
    options,
  );
  check("kind" in invalid && invalid.code === "invalid_facts", "malformed facts fail closed");
  fixture.revoke();
  const revoked = await fixture.authorizer.authorize(fixture.allow, options);
  check(
    "decision" in revoked && !revoked.decision,
    "revocation is observed without cached permission",
  );
}
