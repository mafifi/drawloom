# Authorization standards: ADR 0023 evidence

Inspected and exercised on 2026-09-12. This is a short local experiment, not a
complete AuthZEN implementation or a NIST certification. The boundary is now
accepted in [ADR 0023](../../adr/0023-knowledge-memory-authorization-boundaries.md);
the experimental profile is not adopted core policy.
[Results and measurements](../../../knowledge/evidence/adr-0023-authorization.md).

[Open the Archify boundary map](boundary.html). It illustrates the experiment's
responsibilities, not deployed services or a source-level map of the whole repos.

## What the standards supply

NIST [SP 800-162](https://csrc.nist.gov/pubs/sp/800/162/upd2/final) describes
attribute-based authorization and separates deciding from enforcing. It supplies
neither a universal classification taxonomy nor a ready-made Drawloom policy.

OpenID [AuthZEN Authorization API 1.0](https://openid.net/specs/authorization-api-1_0.html)
is Final, January 2026. Its subject, action, resource, context and decision
information model can decouple Drawloom from a local or enterprise policy engine.
Its normative HTTPS binding, batch/search APIs and discovery are not implemented
by this experiment. An in-process TypeScript adapter using the single-evaluation
shape is not a claim of full wire compatibility. Its context is authorization
conditions, not LLM context. Draft MCP, COAZ and obligations profiles in the
upstream repository are not treated as part of the final 1.0 standard.

The standard deliberately does not prescribe the decision engine, policy
language, identity provider or storage. Replacing an engine still requires a
policy mapping; equivalent request envelopes alone do not make policies portable.

## Source-pinned implementation paths

New clean checkouts were created under `/Users/afifim/Development`. No upstream
tests were run and no upstream application stack was installed. The experiments
use published dependencies pinned in Drawloom's root development catalog.

| Repository | Inspected revision | Tested package | Licence boundary |
| --- | --- | --- | --- |
| [AuthZEN](https://github.com/openid/authzen/tree/78a74024163701645979c8aa5aef93fd38f15046) | `78a74024163701645979c8aa5aef93fd38f15046` | None; published Final specification is authoritative | Specification's OpenID notices apply; do not assume a blanket Apache licence for the repository. |
| [Cedar](https://github.com/cedar-policy/cedar/tree/fdcbaed32bdb8c8d13e4eaf2b58db5555e9fb8c5) | `fdcbaed32bdb8c8d13e4eaf2b58db5555e9fb8c5`, `v4.12.0` | `@cedar-policy/cedar-wasm@4.12.0` | Apache-2.0; dependency notices remain separate. |
| [node-Casbin](https://github.com/apache/casbin-node-casbin/tree/aad42ce2be70908bbc76c5b89b505cf0655245e8) | `aad42ce2be70908bbc76c5b89b505cf0655245e8` | `casbin@5.43.0` | Apache-2.0; dependency notices remain separate. |

Cedar was initially cloned at `2f4019fd645cc8d4a4c0c1f8bd0280c77d754e28`
(development 4.13.0), then the new checkout was moved to the 4.12.0 release tag
to match the tested package. Casbin's published latest was 5.51.1; 5.43.0 was
deliberately selected to match the checked-out package version, not presented as
latest. Runtime packages were not rebuilt from these checkouts.

### AuthZEN: standard question, enforcement owned by the application

The [information model](https://github.com/openid/authzen/blob/78a74024163701645979c8aa5aef93fd38f15046/api/authorization-api-1_0.md#L133-L156)
and [request schema](https://github.com/openid/authzen/blob/78a74024163701645979c8aa5aef93fd38f15046/api/schemas/evaluation-request.schema.json)
describe the envelope. The reference Todo backend's
[authorization middleware](https://github.com/openid/authzen/blob/78a74024163701645979c8aa5aef93fd38f15046/interop/authzen-todo-backend/src/auth.ts#L133-L169)
builds a request from an authenticated subject, calls the decision endpoint and
controls continuation. This is source inspection, not a successful run of that
demo. The final standard's security section requires attention to trust in
attributes: a correctly formatted claim of clearance is not proof of clearance.

### Cedar: schema and policy evaluation inside the host

[WASM exports](https://github.com/cedar-policy/cedar/blob/fdcbaed32bdb8c8d13e4eaf2b58db5555e9fb8c5/cedar-wasm/src/lib.rs)
expose the Rust FFI to JavaScript/TypeScript. The
[authorization FFI](https://github.com/cedar-policy/cedar/blob/fdcbaed32bdb8c8d13e4eaf2b58db5555e9fb8c5/cedar-policy/src/ffi/is_authorized.rs#L58-L80)
parses the request, policies and entities and calls the authorizer; schema
validation is available separately. Policy validation and authorization have
structured errors. A successful API call is not necessarily an allow decision.

In the experiment: AuthZEN subject → Cedar principal; action name → Action
entity; resource → Knowledge entity; trusted properties → entity attributes.
Policy evaluation remains Cedar's responsibility. Read enforcement and lineage
remain the host's. Bun 1.2.23 and Node 24.20.0 loaded the documented `nodejs`
WASM entrypoint without Vite, a server or a new worker. Browser/Tauri packaging
was not tested. Cedar also provides stateful pre-parsed evaluation; this first
probe used the simpler stateless call, so its timing includes repeated parsing.

### Casbin: embedded matcher with application-defined attributes

[ABAC tests](https://github.com/apache/casbin-node-casbin/blob/aad42ce2be70908bbc76c5b89b505cf0655245e8/test/model.test.ts#L176-L203)
pass structured resources to a matcher;
[core enforcement](https://github.com/apache/casbin-node-casbin/blob/aad42ce2be70908bbc76c5b89b505cf0655245e8/src/coreEnforcer.ts)
evaluates requests against the loaded model. The fixture uses its normal enforcer
plus one small set-membership function. Our Zod profile checks input attributes;
this is not Cedar-style static policy validation. The model syntax and matcher
are Casbin-specific. It is not an AuthZEN server out of the box in this test.

## Candidate fit, not a selection

AuthZEN is a useful starting point for the replaceable decision boundary. Cedar
offers a policy language and schema validation; Casbin offers a straightforward
embedded TypeScript implementation and was faster in this tiny unoptimised probe.
Both enforce the illustrative cases. Speed alone does not select the engine.

The following are responsibilities that the integration must accommodate, not
classification rules for Drawloom core to assign. Implementations or organisations
supply policy; ADR 0024 must implement the enforcement points:

- Who establishes identity and attributes, including a background Nightloom run.
- Which labels are descriptive versus security-sensitive and who may change them.
- How restrictions propagate to claims; when independent public support permits
  a separately assessed, less restricted claim rather than relabelling one.
- How source deletion/revocation affects claims, indexes and cached outputs.
- How authorized search is performed before content, citations or counts leak.
- Whether and where a selected model may process evidence. The fixture's single
  `remoteAllowed` boolean is deliberately not a complete provider/region policy.

No project partition is added. The toy tenant and compartment fields illustrate
enterprise attributes without introducing enterprise services into local OSS.
Labels `0..2`, `clinic`, action names and lifecycle fields are synthetic profile
choices, not adopted defaults or NIST classifications.

The reference comparisons from ADR 0022 still apply: storing records in a bank,
group or directory is not authorization. This experiment does not alter existing
Drawloom tool grants, native approvals, MCP Apps or agent instructions.
