# ADR 0023: retained local authorization experiment

Throwaway evidence, not a supported API or an accepted policy. No desktop,
plugin, memory-storage or agent-context contract changes here.

[ADR 0023](../../docs/adr/0023-knowledge-memory-authorization-boundaries.md) accepts
the authorization boundary, not this fixture's assignment or inheritance rules.
Those rules belong to selected implementations or organisations, not Drawloom core.

## Candidate boundary before implementation

Use the AuthZEN 1.0 single-evaluation information model: subject, action,
resource, optional context; a decision response contains a boolean. The local
host establishes the caller identity and loads current attributes. Model/browser
properties cannot override those facts. The two adapters accept the same typed
request and call real Cedar/WASM or Casbin locally. This is not a complete
AuthZEN server, certification or a new browser bridge.

NIST SP 800-162 describes ABAC, not a ready-made policy. This experiment supplies
an illustrative policy: a subject must be active, in the same tenant, have
sufficient sensitivity clearance and every required compartment. Evidence must
be active and unexpired. A separately checked model-export action requires
permission for remote processing. Projects are irrelevant to this decision.

The synthetic derived-claim case combines source restrictions conservatively:
maximum sensitivity, union of compartments, earliest expiry and all sources'
active/remote-processing requirements. Resolve these from current sources for
each check. This is an illustrative implementation policy, NOT a Drawloom core,
AuthZEN/NIST/Cedar rule and
NOT a universal information-flow solution. Declassification, deletion cascades,
mixed-tenant knowledge and cached disclosure require further decisions.

Test both engines using the same cases. Verify protected content is not read on
denial; demonstrate that forwarding untrusted attributes to either engine would
undermine the boundary. No model calls, personal data, hosted services or credentials.

Run: `bun test spikes/adr-0023-authorization/authorization.test.ts`
