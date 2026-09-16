# ADR 0028: Replace learning, context and decisions without replacing the desktop

- **Status:** Accepted
- **Date:** 2026-09-16
- **Accepted:** 2026-09-16
- **Decision owners:** Drawloom maintainers
- **Implementation:** Implemented and verified ([results](../plans/0028-verification.md))

## Context

Developers should be able to replace a capability through trusted startup setup
without rebuilding Drawloom's screens or losing the checks around it. Before this
change, the desktop knowledge service exposed the local model installer, context
assembly lived in the application, and tools and knowledge used different decision APIs.
These are useful default implementations, but they should not define what every
replacement has to look like.

This decision extends [ADR 0023](0023-knowledge-memory-authorization-boundaries.md)
and partially supersedes the local composition choices in
[ADR 0024](0024-local-knowledge-memory-and-retrieval.md) and context composition in
[ADR 0027](0027-complete-learning-journey.md). Their accepted text and evidence
remain unchanged. SQLite authority, evidence relationships, independent access
checks, local inference and the supported learning journey remain the default.

## Decision

### Learning is one subsystem

Memory and knowledge share the existing records, intake, retrieval, assessment,
maintenance and embedding contracts. There is no second memory store. A learning
provider supplies required contribution, retrieval, availability and lifecycle
operations, with explicit curation and warmup capabilities when supported.
Every offered capability has complete operations and concrete result types.

Drawloom owns the shared search, evidence, export and learning-control screens.
They do not require a model name, download method or filesystem path. Installation
controls for the pinned Qwen model and llama.cpp belong to a separate local setup
interface. Provider-specific settings remain statically wired in the desktop;
this is not a downloadable view protocol or a mandatory MCP App.

The local composition owns Nightloom. Workbenches contribute and retrieve evidence;
they do not coordinate maintenance. A replacement need not reproduce Nightloom.
Providers are chosen by trusted code at startup. Replacement requires restart and
does not transfer stored data automatically. Existing databases, indexes, bindings
and installations are preserved.

### Remember what the user permitted

The host owns versioned consent records, separately from feature preferences.
Each grant records its purpose, data categories, destinations and processing
boundaries. A trusted declaration describes the selected implementation, but is
not itself permission. Actual operations must stay within the approved scope.
Equivalent or narrower processing retains consent; broader processing requires
confirmation while preserving the saved preference.

Existing booleans migrate atomically and idempotently using the known default's
actual behavior: local capture, storage and embeddings, plus Codex disclosure for
assessment and conversation references. This is not a local-only journey.
Migration records its provenance without inventing an original grant date.
Unestablished scope requires confirmation; it does not justify deleting data.
Disabling processing stops new activity, not past disclosures.

### Assemble context through an explicit interface

A session assembler handles admitted instructions, skills and host guidance.
A turn assembler handles the request, explicit selections, attachments and optional
knowledge. The narrower `ContextPreparer` remains independently replaceable.
The host retains source resolution, trusted bindings, authorization and disclosure
enforcement. Provider continuation and compaction remain provider-owned.

Keep the existing distinction between instructions and untrusted references, the
original user text, receipt rules and native-history reconstruction. Automatic
knowledge remains bounded to eight records and 12 KiB, with reference-only entries
for oversized records. The first preparation has five seconds; later preparations
have two. Nested work consumes one remaining-time budget, including queueing and
authorization. Expiry or failure discards the entire automatic selection;
cancellation remains distinct. Ordinary denial excludes a record, whereas inability
to decide is unavailability. Mandatory assembly failures prevent submission;
optional knowledge failures continue with an honest limitation.

### Separate deciding from enforcing

The [retained authorization research](../reference/authorization-survey/README.md)
distinguishes policy administration, trusted facts, decisions and enforcement.
Following that separation, organisations or trusted composition establish policy
and authoritative attributes. A portable asynchronous contract answers the access
question. Drawloom enforces the answer at each protected operation.

The contract uses the existing AuthZEN-shaped subject, action, resource and context
information, with cancellation and an evaluation budget. Allow, deny and inability
to decide are distinct; only allow permits progress. This is not full AuthZEN wire
compatibility or NIST certification. The default local behavior and a contrasting
deterministic implementation exercise the same conformance suite. No Cedar or other
production policy engine is introduced. Deterministic tests do not establish
compatibility with external engines; historical Cedar findings remain historical.

Consumers include tools, knowledge intake and reads, evidence expansion/export,
automatic context disclosure, assessment submission/reconciliation/cancellation,
and already-governed embedding disclosure. Trusted identity, operation ownership,
binding checks and validation stay with enforcement. Grants become inputs to the
default policy, not mandatory policy for every replacement.

Stopping an owned assessment is a separate permission from sending its evidence.
Cancellation checks `assess.cancel` and ownership without rereading or resending
the evidence. Revoking disclosure must not, by itself, prevent an authorised user
from stopping work already running. A failed cancellation decision remains a
failure; it must not be reported as ordinary denial or successful cancellation.

Host-owned authority generations invalidate pending decisions when relevant host
state changes. Check before and after awaited decisions and before acting. Tools
also retain a second full policy decision after recording start evidence: a
replacement may depend on time or facts that the host cannot version. If this
decision fails, times out or returns malformed data, execution is `not_started`,
with terminal evidence where possible. Denial must still precede unknown-tool
disclosure. No automatic decision retries or cache are introduced. Neither
generations nor reevaluation guarantees atomicity with external state.

Generation changes follow the authority that actually changed. Refreshing an
unchanged grant set does not invalidate concurrent work. Finishing one workflow
task expires that task's lease, not every other task in the same run. Explicit
run revocation still invalidates pending decisions for that run.

### Bound authorization work

A host-owned scheduler has separate FIFO pools: foreground permits 12 active and
24 waiting decisions; background permits four active and eight waiting decisions.
There is no borrowing. The host chooses the class so curation cannot occupy
foreground capacity. These are resource limits, not throughput claims.

Each decision gets at most two seconds and no more than the enclosing operation's
remaining time. Waiting consumes that budget. Admission and dispatch require at
least 50 ms remaining; this is a minimum useful budget, not a latency prediction.
Cancelled or expired queued work is removed promptly. Overflow, exhausted budgets
and unavailable implementations remain distinguishable failures. An evaluation
that ignores cancellation keeps its active slot until settlement, preventing
unbounded accumulation after timeouts.

Extend the private worker protocol with correlated worker-to-host authorization
requests, bound to admitted work and worker lifetime. Validate both directions;
reject unsolicited, duplicate or stale messages. Disconnect and shutdown settle
pending requests. Long assessment timeouts do not extend policy deadlines. No
network listener or worker-loaded policy modules are introduced.

### Replace approval presentation, not its authority

Reuse native agent approval requests and option identities. The host and adapter
remain authoritative; presentation only displays requests and forwards actions.
Pending response, dismissed surface and presentation failure are separate states.
A failed presentation can retry the same pending request without creating another
approval. No answer means no authorization; Stop remains available. Closing the
surface means neither approval nor decline.

There is no new presentation timeout and no assumed native timeout. Native
cancellation, completion, expiration or connection loss invalidates a request.
Stale, duplicate and cross-conversation responses are rejected. Native review,
MCP elicitation, ordinary input and business acceptance remain different things.

## Alternatives considered

**Cedar or another external policy engine as a supported implementation.**
Rejected for this delivery. The default local implementation and a contrasting
deterministic implementation exercise the same conformance suite; that proves
replaceability, not compatibility with external engines. Historical Cedar
findings remain historical.

**Automatic migration between learning providers.** Excluded. Replacement
requires an application restart and preserves existing data in place.

## Evidence

The [implementation plan](../plans/0028-replaceable-capabilities.md) tracks delivery.
Proof requires separately built public consumers, real desktop/worker paths,
shared conformance, consent migration and data preservation, races, mixed-load
scheduling, recovery and accessible presentation. Run final repository, dependency,
licence and UI gates, plus Temporal recovery. Report newly executed checks separately
from retained evidence and unrun model-backed acceptance.

## Consequences

Sandbox replacement, new operating-system support, remote policy services,
dynamically installed providers and automatic migration between learning providers
are excluded. No acceptance, commit, push or publication is implied by implementation.
