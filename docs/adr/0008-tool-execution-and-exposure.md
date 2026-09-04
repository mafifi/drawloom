# ADR 0008: Define tool execution and exposure

- **Status:** Accepted
- **Date:** 2026-09-04
- **Decision owners:** Drawloom maintainers

## Context

[ADR 0005](0005-partition-agent-platform-capabilities.md) assigns tool
definitions, validation, invocation, results, and execution evidence to the
tool capability. [ADR 0007](0007-provider-neutral-agent-execution.md) establishes
how an agent consumes a tool exposure while policy and the gateway remain
authoritative for each invocation.

The next decision is the smallest useful tool contract that serves both a
Drawloom caller and an agent through a provider integration. A tool author
should be able to supply useful behaviour without implementing a protocol
server or an agent lifecycle.

The existing [tool-exposure evidence](../../knowledge/evidence/adr-0005-tool-exposure.md)
demonstrates one fixed MCP catalogue with changing authority across sequential
Codex operations and explicit invocation correlation. It does not establish a
general tool runtime, concurrent authority binding, or durable execution
guarantees. This ADR must distinguish that evidence from new proposals.

## Decision

The tool-authoring direction, result presentation, separation of definition
from installation, cancellation and retry behaviour, and evidence-failure
behaviour are agreed. The [working contract](../design/tool-execution-contract.md)
and [acceptance evidence](../../knowledge/evidence/adr-0008-tool-execution.md)
are complete for the scoped proof. Maintainer acceptance establishes these
architectural semantics; the retained proof does not establish a supported API.

### Preserve the established capability boundaries

- [ADR 0004](0004-standardise-capability-contracts.md) owns the TypeScript,
  Zod, schema-projection, trust-boundary, and shared-conformance standard.
- ADR 0005 owns the separation of tool execution, policy, sandbox enforcement,
  durable observability, and orchestration. Tools produce authoritative
  execution facts; observability owns their durable storage and projections.
- ADR 0007 owns immutable session exposure, invocation-time gateway authority,
  explicit correlation, and provider projection. Tool calls do not gain
  authority from model-supplied operation or grant identifiers.
- [ADR 0006](0006-evidence-led-architecture-principles.md) supplies the
  complexity test. Logical responsibilities need not become separate services,
  processes, or public interfaces.

### Author a tool as a typed definition and handler

A locally authored tool consists of an identity, a description, input and
output schemas, and a handler. The schemas determine the handler's input and
successful output types. The exact declaration helper and invocation context
belong in the working contract design.

For example, a `text.word_count` tool accepts `{ text: string }` and returns
`{ count: number }`. Its handler computes the count. Tool authors do not also
write MCP request parsing, permission checks, or provider event mapping.

The invocation path resolves the tool, validates external arguments, obtains
the applicable policy decision, and requires acknowledgement of the invocation
start record before running the handler. It validates successful output at the
tool boundary and hands off the outcome record before reporting success. Both
direct Drawloom calls and externally projected calls use this path. A public
direct invocation must not bypass authority or evidence by calling the handler
unchecked.

MCP is an exposure adapter over this behaviour. It translates definitions and
invocations into the external protocol without making MCP SDK types the tool
authoring contract. The first local implementation can run in one process and
require no hosted service. Hosting and sandbox requirements remain properties
of the concrete tool implementation and composition.

Input and output schemas follow ADR 0004's projection limits: external schema
descriptions must not claim semantics that their target format cannot express.
The example establishes no exact result-envelope, error, or cancellation API.

### Separate canonical results from presentation

The handler returns a canonical value governed by its output schema.
Programmatic consumers use that value directly. Model-facing content and UI
presentation derive from it without requiring callers to parse prose to recover
fields or identifiers.

The default model-facing presentation serializes the validated canonical JSON
value as text. Tool authors may provide a custom renderer deriving content
from that value. UI presentation remains separate. The exact projection API
belongs in the working design; this decision requires no UI card vocabulary or
presentation framework.

### Cancel cooperatively and leave retries to the caller

The executor supplies a cancellation signal that handlers observe or forward
to their dependencies. Cancellation and timeout request that work stop; they
do not prove that work has stopped or that a side effect was rolled back.
Host-enforced termination remains a sandbox responsibility.

The generic tool executor does not automatically retry an invocation. The
caller decides whether a retry is safe using the tool's semantics and the
known outcome. An invalid output, lost response, or failure to record the
outcome does not establish that execution had no effect.

### Require evidence acknowledgement and preserve execution uncertainty

Before dispatching a handler, the executor requires acknowledgement of its
invocation start record from the configured observability implementation. If
that acknowledgement fails, the handler does not run. The tools capability
produces the execution facts; observability owns their persistence mechanism
and acknowledgement guarantees.

After execution, failure to record the outcome is surfaced explicitly. It
must not be presented as proof that the handler failed, that its effects were
undone, or that retrying is safe. Preserve the known execution outcome
separately from the evidence failure, including uncertainty when completion is
unknown. Exact result fields and the evidence handoff belong in the working
design rather than a new logging framework in this ADR.

### Separate tool definition from installation

Composition supplies a tool's dependencies and registers its definition with
the invocation layer. A tool may consume another capability through its public
contract while its concrete provider remains selected by composition.

The definition does not require a plugin loader, dependency-injection
container, hot reload, or plugin-scoped disposal. A future installation model
can wrap the same tool-authoring model when a deployment needs it. Resource
cleanup still needs an owner in the concrete composition; omitting a plugin
framework does not remove that obligation.

### Keep invocation authority attached to its origin

Every invocation uses a trusted binding to its originating operation. The
binding is not selected by tool arguments or by whichever operation happens to
be active when the request arrives. A provider adapter resolves its private
origin metadata through a trusted composition; missing or closed authority
fails closed. It does not retarget a delayed call to a later operation.

The gateway rechecks authority after start-record acknowledgement, immediately
before dispatch. Revocation prevents later dispatch but cannot roll back an
already-running handler. The catalogue and exposure can remain stable while
authority changes. Exact origin metadata and transport trust are adapter-private;
the tool contract does not standardise Codex's fields or impose them on other
providers.

### Use DeepSeek Harness as a reference, not a framework requirement

The reference inspected is DeepSeek Harness commit
`4e84901e6471b79ec0338099867ebb4606d12bb5`. Its
[tool-authoring guide](https://github.com/deepseek-ai/deepseek-harness/blob/4e84901e6471b79ec0338099867ebb4606d12bb5/docs/cookbook/adding-a-tool.md)
and [typed helper](https://github.com/deepseek-ai/deepseek-harness/blob/4e84901e6471b79ec0338099867ebb4606d12bb5/packages/core/tools/src/schema.ts)
combine schemas and an executor, infer argument and result types, and separate
the canonical result from model-facing rendering. These are useful precedents
for the agreed authoring direction.

Its [Cordis plugin format](https://github.com/deepseek-ai/deepseek-harness/blob/4e84901e6471b79ec0338099867ebb4606d12bb5/docs/cordis-tutorial/01-first-plugin.md)
adds installation and lifecycle around tool definitions. For example, the
[web tool plugin](https://github.com/deepseek-ai/deepseek-harness/blob/4e84901e6471b79ec0338099867ebb4606d12bb5/packages/web/tool-web/src/index.ts)
declares injected services and registers tools over a replaceable web
capability. Drawloom retains that dependency separation without selecting
Cordis's mechanism. This is a source comparison, not evidence that Drawloom's
implementation conforms or integrates successfully.

### Design and verification outcome

The [working contract](../design/tool-execution-contract.md) defines the small
authoring surface, fixed catalogue, invocation context, results, cancellation,
rendering, and evidence handoff. The retained proof includes a factory-driven
conformance suite and a local gateway behind MCP. It requires no plugin loader,
generic remote-tool framework, distributed grant protocol, or new dependency.

The [evidence record](../../knowledge/evidence/adr-0008-tool-execution.md)
records passing conformance and direct Codex app-server integration. The live
run verifies canonical word count, explicit correlation, stable exposure,
denial of a real delayed A request after B is accepted, and controlled replay
and malformed-authority cases. Deterministic tests separately cover overlapping
execution, evidence failures, cancellation after effects, and no retries.

No further architectural preference or scoped proof is awaiting resolution.
The Codex mapping uses version-specific metadata over composition-owned stdio;
it is not a general MCP authentication mechanism. Other providers, remote
transport authentication, and stronger observability durability need their own
implementation evidence when claimed.

## Implementation and acceptance

Architectural semantics live here; exact candidate interfaces and schemas live
in the linked working design and retained
[`spike`](../../spikes/adr-0008-tool-execution/). The proof implements a small
local tool gateway and an MCP exposure exercised through Codex. It has no
supported package API. Product package layout and dependency seams will be
planned against this design in a subsequent implementation task. Retained
spikes remain evidence and cannot be imported by supported packages.

Acceptance requires a concrete contract design, conformance for the claimed
behaviour, and integration evidence for the chosen exposure and authority
binding. Reuse existing evidence where it applies; add focused tests for the
gaps rather than repeating unrelated agent-lifecycle scenarios.
Those gates are evidenced, and the maintainers accepted this ADR on 2026-09-04.

## Consequences

- Tool behaviour can serve direct and agent-mediated callers through one
  validation and execution path.
- Tool authors retain inferred input and output types without implementing
  transport machinery for each tool.
- Canonical results support programmatic callers and presentation without
  duplicating the tool's execution logic.
- Protocol adapters add translation work, but that cost serves the existing
  provider-replacement boundary.
- Output validation detects a contract failure after execution; it cannot undo
  side effects or justify an automatic retry.
- Observability availability becomes a prerequisite for handler dispatch.
  Outcome-recording failures remain distinguishable from execution failures.
- Callers own retry decisions; cancellation cannot promise rollback or hard
  termination of an in-process handler.
- A supported implementation must preserve the proven authority and evidence
  semantics and run the same conformance suite. The retained proof is not a
  production runtime or a commitment to its file-based test fixtures.

## Alternatives considered

### Adopt DeepSeek Harness's full Cordis plugin model

Cordis provides configurable installation, service injection, scoped
registration, and disposal. Those features solve application composition and
plugin lifecycle needs beyond defining and invoking a tool. Adopting them here
would make a platform-wide runtime choice before Drawloom has demonstrated a
need for dynamic plugin installation or replacement. Explicit composition
preserves the present dependency boundary with fewer concepts. Plugin lifecycle
can receive its own decision when required.

### Adopt DeepSeek Harness's tool schema DSL

Its custom schema language supplies inference and JSON Schema projection, but
Drawloom already standardises those responsibilities on Zod 4 in ADR 0004.
Adding a second authoring schema system would duplicate validation and type
machinery without a demonstrated benefit. Reuse the authoring pattern with
Drawloom's existing schema standard.

### Return only rendered tool content

This is convenient for a model-only caller, but forces programmatic callers to
recover data from presentation text. A canonical typed value with separate
presentation serves both callers without re-executing the tool. The working
design uses default JSON text with an optional renderer; DeepSeek's richer UI
and execution hooks are not adopted wholesale.

### Retry failures automatically in the generic executor

A generic retry policy cannot infer whether a tool already changed external
state. Leaving retries to the caller avoids repeating effects after timeouts,
invalid output, or evidence failures without requiring every tool to implement
a distributed idempotency protocol.

### Treat execution evidence as best-effort logging

Continuing after the start record cannot be acknowledged allows an action
without an acknowledged execution record. The agreed behaviour instead blocks
dispatch. A failure to record the outcome after dispatch is reported honestly;
it cannot retroactively prevent or undo execution.

### Use MCP as the internal tool contract

This would reuse protocol structures directly, but would require internal
callers and local tool authors to depend on transport concepts. MCP remains the
first external projection; it need not define internal authoring.

### Use bare functions without a tool definition

This is sufficient for ordinary application functions, but lacks the schemas
and descriptions needed for external invocation and agent discovery. A small
definition adds those concrete capabilities while preserving a simple handler.

### Build a plugin and remote-worker framework first

Discovery, installation, worker scheduling, and distributed retries may become
useful. The present evidence does not require them to establish tool execution
and exposure. They should not be prerequisites for the first local tool.
