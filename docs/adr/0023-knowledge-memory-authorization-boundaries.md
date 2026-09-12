# ADR 0023: Keep knowledge and memory authorization replaceable

- **Status:** Accepted
- **Date:** 2026-09-12
- **Accepted:** 2026-09-12
- **Decision owners:** Drawloom maintainers

## Context

[ADR 0022](0022-knowledge-memory-context-experiment.md) establishes cooperation
between knowledge, memory and context. Knowledge and memory must work across
projects and workbenches, not become isolated project stores. Enterprise
implementations must be able to share them across users while enforcing their
own privacy, security and information-lifecycle rules.

Cross-project availability does not mean unrestricted disclosure. Neither a
project binding nor access to a tool proves permission to read its knowledge.
Context remains specific to the current work, with the existing harness
instructions and provider behaviour. This decision does not introduce a new
context manager or replace AGENTS.md.

NIST [SP 800-162](https://csrc.nist.gov/pubs/sp/800/162/upd2/final) provides ABAC
guidance using subject, object, action and environmental attributes. It does
not prescribe an executable policy or a universal classification vocabulary.
Our objective is to support that model through replaceable interfaces, not to
implement enterprise governance in the local OSS product or claim certification.

## Decision

### 1. Separate enforcement from policy and attribute assignment

Drawloom owns the access-enforcement boundary. The selected implementation or
organisation owns identity establishment, authoritative attributes, classification,
entitlements and policy. Drawloom must carry and validate the required information
without becoming the authority that assigns clearance, labels or membership.

| Drawloom boundary | Implementation or organisation responsibility |
| --- | --- |
| Bind operations to a verified caller | Establish identity and organisational membership |
| Resolve authoritative resource attributes | Assign and maintain classifications, ownership and labels |
| Ask for an authorization decision | Evaluate policy and entitlements |
| Enforce the decision before disclosure | Supply sharing, derivation and lifecycle rules |
| Treat unavailable or invalid authorization safely | Provide policy administration and recovery |

An agent, browser or arbitrary plugin cannot grant itself permission by supplying
favourable attributes. Attribute authority must be explicitly established by the
trusted composition, not inferred from an object's shape or package installation.
Trusted backend execution remains process-level trust; these interfaces do not
sandbox malicious code already executing with host privileges.

### 2. Use an established decision shape, not a Drawloom policy language

Use the [AuthZEN Authorization API 1.0](https://openid.net/specs/authorization-api-1_0.html)
single-evaluation information model as the starting decision boundary: subject,
action, resource, optional authorization context and a decision. Authorization
context means conditions of access, not the model's conversation context.

Keep policy evaluation replaceable and provider selection at composition roots.
An in-process OSS implementation need not deploy an HTTP service merely to use
this shape. A future remote implementation must meet the applicable protocol and
security requirements before claiming wire compatibility. A shared request shape
does not make policies portable between engines.

Cedar and Casbin are demonstrated engine candidates. Neither is selected as a
mandatory supported runtime by this ADR. Cedar remains a leading local candidate;
the small comparative timing test is insufficient to decide the implementation.
No new capability object, plugin protocol or enterprise service registry is added.

### 3. Protect retrieval and derived knowledge without prescribing its policy

The future knowledge/memory implementation must enforce authorization before
returning protected content, evidence or derived disclosures. Search, citations,
counts, caches, background maintenance and model disclosure cannot become paths
around that boundary. Permission to read locally is not automatically permission
to send material to a model or another destination.

Preserve enough authoritative provenance and policy information for the selected
implementation to decide access to derived knowledge. Drawloom does not define
a universal classification merge, restriction inheritance or declassification
algorithm. An implementation may supply those rules; core must not silently
discard them or relabel a claim as public because its supporting sources are hidden.

Revocation and lifecycle changes must be representable and enforceable. Exact
query integration, invalidation and storage mechanics belong to implementation
work. Revocation cannot erase content already disclosed. Confidence and fabric
tightness are knowledge-quality concepts, not clearance or authorization.

Background Nightloom work also acts under an established identity and authority.
Automatic knowledge maintenance remains automatic; authorization is not a new
human approval gate. Existing tool grants, provider-native review and execution
evidence remain independent and unchanged.

### 4. Keep the OSS experience local and simple

The OSS implementation is for a sole local user. It needs a simple explicit
local-owner implementation behind these boundaries, not an enterprise directory,
classification UI, policy administration product or mandatory organisational
configuration. Unknown identity or missing required authorization facts must not
silently become permission. The exact local profile is implementation work.

Enterprise implementations may provide shared identity, entitlements, policies
and infrastructure through the same boundaries, without requiring project-local
knowledge or a private fork of the core. Such implementations and organisational
policy remain outside this public repository under the existing public/private
admission rules.

## Evidence and alternatives

The [source-pinned comparison](../reference/authorization-survey/README.md) and
[retained experiment](../../spikes/adr-0023-authorization/README.md) exercise real
Cedar/WASM and Casbin engines behind the same candidate decision shape. The
[evidence record](../../knowledge/evidence/adr-0023-authorization.md) records
36 focused passing tests, Node evaluation checks, measurements and limitations.

The cases include cross-project access, revoked authority, forged caller labels,
expired or withdrawn sources, restricted derived claims and separate local-read
and remote-model decisions. The experiment's host fixture includes illustrative
attribute resolution and conservative restriction inheritance. These demonstrate
that policy can affect disclosure; they are **not accepted core assignment rules**.
The Archify map describes that fixture, not required production services.

We reject inventing a proprietary authorization language, embedding enterprise
classification rules into core, and using project boundaries as a substitute for
authorization. We also reject assuming that an engine alone guarantees privacy.
AuthZEN supplies a reference decision boundary; Cedar and Casbin supply evaluators.
Neither supplies our end-to-end knowledge integration automatically. ADR 0022's
reference comparisons remain relevant; banks, groups and directories are storage
organisation, not proof of access control.

## Consequences and follow-up

This applies architecture principles 3–7: replaceability, a useful local path,
proportional effort, proven standards and secure defaults. It accepts the boundary
and demonstrated feasibility, not production enforcement or final package types.
The executable experiment remains in `spikes/`; supported code cannot import it.
It proves neither full AuthZEN conformance nor NIST compliance.

ADR 0024 will address the broader OSS knowledge/memory implementation: supported
contracts and conformance, local storage, capture, retrieval, maintenance and
integration of this enforcement boundary. It must exercise trusted attribute
resolution, authorized retrieval, derivation policy and lifecycle handling without
turning the synthetic profile into mandatory enterprise semantics. Performance,
cache invalidation, deletion and destination-specific policy remain explicit
engineering work, not capabilities claimed by this acceptance.
