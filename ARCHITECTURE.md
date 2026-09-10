# Architecture

## Current state

Drawloom contains its repository constitution and the first implemented
foundation packages (version 0.0.0, not released; implementation review pending).
The [foundation API reference](docs/reference/foundation-api.md) is the current
export and integration authority. [ADR 0011](docs/adr/0011-supported-foundation-and-startup-plugins.md)
records the proposed startup registration and host seams. Its decision
principles are established by
[ADR 0006](docs/adr/0006-evidence-led-architecture-principles.md), and its
platform capability partition by
[ADR 0005](docs/adr/0005-partition-agent-platform-capabilities.md). The first
concrete capability, provider-neutral agent execution, is accepted in
[ADR 0007](docs/adr/0007-provider-neutral-agent-execution.md).
Tool execution and exposure are accepted in
[ADR 0008](docs/adr/0008-tool-execution-and-exposure.md), supported by retained
conformance and Codex MCP integration evidence. The first local gateway and
Codex adapter now run exported conformance against synthetic transport; a new
live model-backed compatibility claim is not made by this implementation.

The public `apps/desktop` composition now provides a SvelteKit View/ViewModel UI,
an authenticated same-origin loopback Bun host and a minimal Tauri macOS shell.
The supported `@drawloom/desktop-host` startup factory passes public persistence
and managed-asset contracts to explicitly selected trusted plugins. Workbench
operator commands are a separate trusted channel from model tools. Codex owns
native transcript history, compaction and execution continuity. Drawloom stores
its own paginated display records under observability, with atomic ingestion
checkpoints and cached offline reads ([ADR 0014](docs/adr/0014-persistent-paginated-conversation-history.md)).
These records are never automatically supplied as model
context or treated as memory.
See the [desktop host boundary](docs/design/desktop-host.md) for exact authority,
project, asset and startup boundaries. No private plugin is needed for public CI.

The public `@drawloom/ui` package owns shadcn-svelte controls and shared neutral
theme tokens with a blue action accent, following
[ADR 0012](docs/adr/0012-shared-ui-components-and-guidance.md).
Application Views compose those controls; ViewModels retain state
and commands. The package has no provider or business dependencies. Text editing,
settings and media review consume the same primitives without introducing a new
platform capability. See its [consumer contract](packages/ui/ui/README.md).
The UI policy gate rejects native control reimplementations and direct primitive
imports outside that boundary. Semantic layout, native media playback and
sandboxed document viewers remain valid; the journal stays independent.

[ADR 0013](docs/adr/0013-plugin-boundaries-and-host-integration.md) accepts
plugin contributions, dependencies, startup and UI hosting into one ownership
decision. The private WIP video plugin proves integration in the public host;
Rosalind and DeepSeek Harness provide comparison evidence. MCP Apps is the
approved starting UI connection model, rather than in-process client modules.
The runtime uses upstream MCP Apps with a compiled Svelte resource. Read/inspect,
selection context and an explicit current-conversation revision request are
verified, including a live Codex text reply without changing private project
state. The earlier custom-protocol slice is historical evidence only. General
placement, richer editing/authority and performance remain follow-up work, not
implied acceptance. Changed boundaries require explicit approval and a future ADR.

[ADR 0015](docs/adr/0015-working-material-ownership-and-edit-approval.md) is
Accepted for working-material ownership and AI edit approval. It records
lightweight provider workspace files, plugin-owned editing and
preservation, optional previews and provider-native human/delegated review. It adds no universal
revision or undo model and does not weaken ADR 0014's captured-media guarantees.
The existing desktop and private video plugin implement this boundary; the
[verification record](docs/reference/adr-0015-native-edit-review.md) distinguishes
live results, deterministic tests and remaining integration questions.

Public editorial publishing is established separately through Accepted
[ADR 0009](docs/adr/0009-repository-backed-visual-publishing.md). Its Astro and
Remotion spike consumes piece-owned `publishing/` sources without introducing
supported product dependencies or changing the SvelteKit product UI default.
The maintained journal is implemented locally in `publishing/site/`, independently
of that spike. Piece-owned Markdown and Remotion sources feed draft-aware static
builds; [publishing/DESIGN.md](publishing/DESIGN.md) owns the visual system and
[publishing/EDITORIAL.md](publishing/EDITORIAL.md) owns the writing voice.
The author authorised journal publication on 2026-09-05. The main-only
Pages workflow checks the repository, renders the approved article animation,
and builds the journal. Only entries explicitly marked for publication and
their referenced media are emitted; the synthetic example stays a local draft.
Selected screenshots live with their piece as source assets. Rendered video,
posters and site output remain unversioned. The old placeholder is retained as
an optional fallback, not the normal deployment artifact.
Changes to publishing sources or their build inputs on `main` trigger deployment
automatically; manual dispatch remains available. Setting `draft: false` and a
publication date is the editorial release gate. See
[ADR 0010](docs/adr/0010-automatically-deploy-approved-journal-content.md), which
amends ADR 0009's manual-only deployment rule.

## Architectural intent

Drawloom provides the infrastructure around a model that makes an AI workload
controlled, portable, inspectable, and reproducible.

Its architectural metaphor is a programmable loom: durable constraints and
run-specific inputs are composed into a traceable execution. The metaphor may
guide product language and visual identity, but public APIs use direct technical
names.

## Decision principles

**Complexity must earn its place.** Choose the simplest design that satisfies
present, evidenced needs. Extra abstraction, state, lifecycle, indirection,
validation, or generalisation must justify its engineering, cognitive, runtime,
and operational cost. Simplicity means the least complex implementation that
meets the required standard, not lowering that standard to reduce implementation
effort. Account for the cost of missing protections and user controls too.

1. **Useful type safety.** Use precise types and runtime validation for concrete
   invalid states and trust boundaries, not for theoretical completeness.
2. **Evidence-led multi-provider support.** Express the smallest portable
   semantics demonstrated by real providers and consumers; keep differences
   optional or adapter-private until evidence supports promotion.
3. **Clean, replaceable boundaries.** Separate real ownership, authority,
   lifecycle, trust, and change axes without assuming each boundary needs a
   service, process, package, or interface.
4. **An accessible free or local path.** Provide clear defaults and a useful
   free-tier or local route where the capability permits it; expose cost and
   operational prerequisites instead of hiding them.
5. **Proportional efficiency.** Treat implementation effort, comprehension,
   runtime resources, maintenance, and provider spend as finite. Reuse safe
   provider-native behaviour, generalise after evidence, and optimise after
   measurement.
6. **Proven boundaries before invention.** Start from established standards and
   inspected reference implementations. Exercise them with the real consumer
   until a concrete requirement demonstrates a limit; do not design extensions
   around anticipated limitations. Where the selected references differ, obtain
   an explicit maintainer choice. Departures from their boundaries require
   explicit maintainer approval before implementation, even when they seem small
   or use generic names. An approved choice is not permission for adjacent drift.
7. **Safe and secure by default.** Protect users' work, data and resources through
   conservative defaults, explicit authority and inspectable actions. Prefer
   reversible changes where practical. Delegated approval must remain within the
   user's granted authority; uncertainty must not silently become permission or
   trigger repeated effects. Distinguish enforced protections from cooperative
   behaviour, and state limitations honestly.
8. **Market readiness and familiar user control.** Treat established expectations
   from successful AI tools as evidence of essential product requirements, not
   merely optional polish. Users should be able to understand, direct, interrupt
   and review work without learning Drawloom's internal architecture. Assess
   omissions by their cost to trust, usability and adoption, not only the
   engineering effort saved. Match useful behaviours, not necessarily competitors'
   implementations or entire feature sets.
9. **Empower users through platform integration.** Workbenches should bring the
   user's configured, authorised tools and integrations together, not limit them
   to a Drawloom-only toolbox. Preserve useful native capabilities and familiar
   approval controls. Restrictions must follow concrete safety needs, user or
   organisation policy, or demonstrated integration limits—not tool ownership
   or implementation convenience. Make authority and limitations understandable;
   access to a tool is not approval to use it for every action.

Before adding material complexity, ask what present need or observed difference
requires it, why the simpler option fails a principle, whether the choice can
remain private or reversible, what it costs, and how evidence will verify it.
Also ask:

- Does the simpler option leave users exposed to avoidable harm or loss of control?
- Would its limitations make Drawloom materially harder to trust or adopt than
  tools users already know?
- Does it unnecessarily remove useful tools or user choice when existing platform
  permissions and review could preserve the required safety boundary?

If two designs satisfy the principles, prefer the simpler one. ADR 0006 records
the original five principles and decision test; principle 6 is the maintainer's
2026-09-09 addition, applied to plugin integration in ADR 0013. Principles 7 and 8
were added with maintainer approval during the subsequent editable-artifact
discussion. Principle 9 was added with maintainer approval on 2026-09-10 to guide
native-tool integration. The accepted historical ADR is not rewritten.

### Application to native tools and integrations

Drawloom should integrate the tools users have chosen, with clear approval and
execution controls. Native tools retain their platform's permissions, sandbox,
review and evidence ownership. Drawloom-exposed tools retain their independent
gateway grants and execution evidence. Do not wrap every native tool solely to
route it through Drawloom, or disable it solely because it is outside that gateway.
Consistent user control does not require identical enforcement mechanisms.

This principle does not automatically enable integrations, grant permissions,
expand sandbox access or bypass organisation policy. Verify which tools are
actually callable, which authority and review settings govern them, and whether
their actions and outcomes can be presented accurately. An inventory entry alone
proves neither access nor an approval bypass. Unsupported review modes or gaps
must be disclosed and brought back for a decision, not silently downgraded or
covered by an invented reviewer.

The next investigation is therefore approval coverage and tight integration,
not blanket ambient-tool exclusion. Earlier adapter isolation assumptions remain
historical evidence; this maintainer direction guides their reconsideration.
Runtime configuration and contract changes still require evidence and explicit
boundary decisions. No runtime change is implied by recording this principle.

### Application to editable-artifact approvals

Principles 7 and 8 require support for both human and delegated approval of
AI-initiated edits when policy requires review. This is a required user-control
boundary, not optional polish to omit solely because it adds implementation cost.
Both modes review the specific invocation and its unchanged arguments. Delegated
approval is an assessment within granted authority, not an unconditional allow
switch; approval must not silently transfer to different work. Plugins own
domain validation and stale-edit handling. Drawloom requires neither a revision
scheme nor a preview, and direct editing inside a plugin UI is outside the AI
approval flow without bypassing existing host access controls.

Codex's [auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review) is the
selected native integration for separating review from execution authority.
Drawloom selects a supported human/delegated mode and presents native requests
and safe review outcomes; it does not add its own reviewer or pending-review
service to the tool gateway. Native approval never replaces Drawloom tool grants
or execution evidence. Unsupported native review must be reported, not bypassed
or silently replaced. Approval to
edit does not itself accept finished content, grant paid generation or authorise
publication. These remain distinct decisions. This requirement does not expand
sandbox access or approve a general sandbox redesign. The implemented native
review path and its conformance are recorded in
[ADR 0015](docs/adr/0015-working-material-ownership-and-edit-approval.md).
Its linked evidence separates live proof, simulated outcomes and the native-tool
integration follow-up above; review proved for Drawloom tools is not proof of
review coverage for every native integration.

### Reference-led changes and approval

For plugin boundaries, OpenAI/Codex's Rosalind and DeepSeek Harness are the
selected references. Distinguish observed application use, documented protocol
possibilities and unverified assumptions. A first-party extension's existence
does not prove that our consumer needs it, or that it is publicly supported.

Use MCP Apps as the starting UI connection model and persist with the actual
private video workbench as the proving consumer. Do not switch to in-process
client modules, invent a replacement bridge, or add host extensions merely to
avoid working through the standard. A defect or missing feature in Drawloom's
implementation is not, by itself, a limitation of MCP Apps.

When a real interaction cannot be supported, stop before implementing a different
boundary. Bring the maintainer the concrete example, attempts with the standard,
the reference equivalents and differences, the smallest alternative, and the
authority/lifecycle/maintenance implications. Record the explicit decision and
its scope in the applicable ADR, then amend the contract and rerun the consumer
proof. Until approval, retain the chosen approach and do not quietly substitute
a new abstraction. [ADR 0013](docs/adr/0013-plugin-boundaries-and-host-integration.md)
tracks plugin-specific comparisons, pending choices and approved exceptions.

## Architectural layers

The target system separates these concerns:

1. **Contracts** define stable capability boundaries and conformance behaviour.
2. **Implementations** provide models, memory, knowledge, tools, sandboxes, and
   other capabilities behind those contracts.
3. **Runtime** compiles execution context and orchestrates controlled work.
4. **Composition** selects concrete providers for a deployment or distribution.
5. **Observability and evaluation** make runs inspectable and testable.
6. **Policy and governance** constrain execution and preserve an audit trail.

These are logical boundaries. They do not imply separate processes or services.

## Dependency rules

For a capability named `<capability>`:

```text
packages/<capability>/<capability>/          # contract and conformance suite
packages/<capability>/<provider-name>/       # implementation
```

- A contract package must not import an implementation package.
- An implementation package depends on and implements its contract.
- A consumer imports the contract, never a concrete provider.
- A composition root is the only place that selects concrete providers.
- Every provider runs the contract's shared conformance suite.
- Boundary data is parsed into contract-owned domain types.

ADR 0005 identifies the initial logical capabilities. Their exact contracts
and packages are established incrementally by focused ADRs rather than
pre-created as empty packages.

## Planned repository topology

```text
.
├── .agents/skills/     # repository-specific Agent Skills
├── docs/
│   ├── adr/            # durable architecture decisions
│   ├── design/         # detailed contract and adapter working designs
│   ├── plans/          # bounded implementation plans
│   ├── reference/      # current technical reference
│   └── security/       # threat models and security design
├── knowledge/          # OKF-profiled evidence and provenance
├── packages/           # contracts, providers, runtime, and composition
├── spikes/             # retained non-production architecture evidence
└── scripts/            # repository automation and structural checks
```

Spike code is not a product layer. It remains outside workspace package globs
and cannot be imported by production or repository automation; the architecture
check enforces that one-way isolation. Durable conclusions belong in indexed
knowledge records and ADRs rather than in spike implementation details.

## Foundation non-goals

- Building the user interface before the runtime contracts are understood.
- Mirroring the structure of a consuming monorepo.
- Introducing microservices or multiple implementation languages prematurely.
- Treating one provider implementation as the architecture.
- Creating generic `utils`, `shared`, or `tools` dumping grounds.

## Naming vocabulary

The product name is Drawloom. `Draft`, `weave`, `pattern`, and `thread` may be
used where they make the product easier to understand, but they do not replace
precise domain terms such as contract, provider, policy, sandbox, or trace.

## Standards

- Progressive `AGENTS.md` files provide local operating guidance.
- Agent Skills use the `SKILL.md` convention under `.agents/skills/`.
- Knowledge records follow OKF 0.2 plus the Drawloom profile.
- ADRs record durable architectural decisions.
- MCP and JSON Schema are preferred at external tool boundaries.
- `SECURITY.md` defines repository-wide security policy; deeper security design
  belongs under `docs/security/`.

## Implementation baseline

- TypeScript and ESM are the product implementation and publication baseline.
- Bun is the canonical repository toolchain and owns the workspace lockfile.
- The root Bun catalog is the only external dependency version authority;
  workspaces use catalog references for external packages and workspace
  references for internal packages.
- Portable packages support Bun and the declared Node.js range. Cloudflare
  compatibility is verified only for packages and compositions that claim it.
- Host-specific APIs remain behind contracts and are selected in composition
  roots.
- Capability behaviour is expressed through TypeScript interfaces. Zod 4
  schemas validate trust-boundary data and own its inferred TypeScript types.
- Each contract package ships one provider-neutral conformance suite that every
  implementation runs.
- Public packages release in lockstep until a later ADR changes the release
  model.
- SvelteKit is the default UI framework. Tauri may own a minimal Rust desktop
  shell, but core product contracts and capabilities remain TypeScript.

See [ADR 0003](docs/adr/0003-typescript-bun-and-portable-packages.md) for the
toolchain, portability, dependency, and release decisions, and
[ADR 0004](docs/adr/0004-standardise-capability-contracts.md) for the contract,
runtime-schema, and conformance standard. See
[ADR 0005](docs/adr/0005-partition-agent-platform-capabilities.md) for the
capability and ownership map,
[ADR 0006](docs/adr/0006-evidence-led-architecture-principles.md) for the
decision principles, and
[ADR 0007](docs/adr/0007-provider-neutral-agent-execution.md) for the accepted
agent-execution capability. See
[ADR 0008](docs/adr/0008-tool-execution-and-exposure.md) for accepted tool
execution and exposure semantics.

Drawloom deliberately has no `CONTEXT.md`. Context that changes agent behaviour
belongs in `AGENTS.md`; architectural intent, principles, non-goals, and the
current system map belong here; the visual design system belongs in
`DESIGN.md`; provenance-bearing facts belong in `knowledge/`.

## Public and commercial boundary

The public repository is the Apache-2.0-licensed core. Proprietary enterprise
products may implement and compose its public contracts from separate,
separately licensed repositories. Public Drawloom packages must never import or
require proprietary packages.

The open core owns runtime fundamentals, contracts, conformance suites, and
basic security, evaluation, observability, and self-hosting capabilities.
Commercial differentiation belongs primarily in organisational governance,
fleet operation, compliance, enterprise integrations, hosted services, and
support.

### Repository responsibilities

- `drawloom` owns public contracts, runtime fundamentals, reusable providers,
  public conformance suites and independently useful synthetic examples.
- `drawloom-workbenches` is a separately hosted private repository for
  proprietary plugins, workbench compositions, consumer integration tests and
  future enterprise extensions. It is not a private fork of the public core.
- Existing business applications, backends and workflows remain in their
  owning product repository. Creating the private sibling does not authorise
  their migration or copying into either Drawloom repository.

Private consumers depend on public contracts; public builds and tests must run
without private checkouts, package access, credentials or services. Private
implementations run the public conformance suites and add private scenario
tests. Contract correctness must not become provable only in a private repo.

Everything committed here is public source, including tests, spikes and apps.
`private: true` in a package manifest prevents package publication; it does not
make source confidential. Public application workspaces are open-source
reference compositions, not proprietary product hosting locations.

### Admission test for shared functionality

Before introducing a public abstraction, record in its ADR or change rationale:

1. The infrastructure problem, without depending on private product meaning.
2. Why existing contracts, tools or skills cannot solve it adequately.
3. A contrasting consumer scenario that challenges the proposed assumptions.
4. What remains product-owned and the smallest public conformance evidence.

A second implemented consumer is not an absolute prerequisite; an evidenced
infrastructure need can justify work. But one product's workflow must not become
a platform requirement. Neutral names do not make a domain-specific design
neutral. Business approval rules, recipes, patient records and story canon stay
with their owners; a generic memory or orchestration capability does not acquire
that authority. Product plugins use public capabilities and contribute tools or
skills, not proprietary service contracts smuggled into the core.

### Enforcement and limits

The existing dependency-policy and architecture gates reject known private
package names (including manifest aliases) and analysed source imports that
resolve outside the checkout. `scripts/public-boundary-policy.json` owns the
known-private package pattern. New private package namespaces require an update
there. Dependency-version exceptions cannot waive the publication boundary.

These are structural checks, not an information-flow or confidentiality proof.
Computed imports, runtime file/network reads, unsupported source formats,
unknown private dependencies and copied content still require review. Before
cross-repository work, agents state the destination and publication status.
Private source, prompts, fixtures, data or assets require explicit publication
approval before copying into this repository. Sanitise conclusions and use
synthetic fixtures; removing names alone is not sufficient. Already approved
journal material remains governed by its editorial publication rules, not by a
global ban on mentioning products.
