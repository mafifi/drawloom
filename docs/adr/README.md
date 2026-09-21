# Architecture decision records

An architecture decision record (ADR) explains a decision that constrains future
implementation: what forced it, what we chose, what we rejected, what we
verified and what it costs.

Read an ADR when you need to know **why** the code is shaped the way it is.
[ARCHITECTURE.md](../../ARCHITECTURE.md) groups these decisions by capability
and is the better starting point if you do not yet know which one you need.

## Writing one

Start from [the template](0000-template.md). It defines the six sections every
record uses and explains the conventions, including how to record status and
supersession.

Files use four-digit sequence numbers and kebab-case titles:

```text
0001-repository-foundations.md
```

Statuses are `Proposed`, `Accepted`, `Deprecated` or `Superseded`. An accepted
ADR is not rewritten to reflect a later decision; a new ADR supersedes it and
links back. Editorial revision that preserves every claim is permitted and is
identified as such — see [`docs/AGENTS.md`](../AGENTS.md).

## The records

Newest first. A decision remains binding until an ADR supersedes it.

### Learning, context and access

- **[0028: Replace learning, context and decisions without replacing the desktop](0028-replaceable-learning-context-and-decisions.md)** —
  Accepted. Separates trusted provider setup from shared presentation, consent
  and enforcement, so a developer can replace an implementation and keep the
  ordinary desktop experience. The
  [verification record](../plans/0028-verification.md) lists executed checks and
  their limits.
- **[0027: Bring retained learning into everyday conversations](0027-complete-learning-journey.md)** —
  Accepted; context composition partially superseded by ADR 0028. Connects
  opt-in capture, curation and bounded recall, partially superseding ADR 0024's
  tools-only context choice.
- **[0026: Permissive dependencies and local GGUF embeddings](0026-permissive-dependencies-and-local-gguf-embeddings.md)** —
  Accepted. Records the dependency-licensing policy and the embedding
  replacement it required. Partially supersedes ADR 0024's runtime and
  installation choice, not its wider knowledge architecture.
- **[0024: Local knowledge, memory and evidence-based retrieval](0024-local-knowledge-memory-and-retrieval.md)** —
  Accepted; partially superseded by ADR 0026, ADR 0027 and ADR 0028. Local
  storage, hybrid retrieval and maintenance.
- **[0023: Keep knowledge and memory authorization replaceable](0023-knowledge-memory-authorization-boundaries.md)** —
  Accepted. Replaceable authorization and trusted attribute enforcement, using
  AuthZEN's decision shape. Classification and entitlement rules stay
  implementation-owned.
- **[0022: Explore knowledge, memory and context through a bounded experiment](0022-knowledge-memory-context-experiment.md)** —
  Accepted for the demonstrated capture, maintenance, source-update and
  fresh-agent retrieval boundaries. Establishes no supported data model,
  capability API or production memory.

### Evaluation and orchestration

- **[0025: Evaluation boundaries and a comparative proof](0025-evaluation-boundaries-and-comparative-proof.md)** —
  Accepted. Evaluation composes with orchestration for durable execution and
  uses local Braintrust and Autoevals assessment within steps.
- **[0021: Local Temporal orchestration](0021-local-temporal-orchestration.md)** —
  Accepted. Installed workflow entrypoint and local Temporal provider. Local
  recovery is verified; production-server guarantees are excluded.
- **[0017: Orchestration interfaces](0017-orchestration-interfaces.md)** —
  Accepted. Typed workflow, run and agent boundaries, demonstrated by a retained
  local Temporal proof.

### Plugins, projects and the desktop

- **[0033: Host an isolated native browser in the workspace panel](0033-isolated-native-browser-panel.md)** —
  Accepted. Tauri-owned browsing with separate storage and authority, native
  lifecycle acceptance and explicit fallback; no agent browser automation.

- **[0031: Integrate native goals and structured plans](0031-native-goals-and-structured-plans.md)** —
  Accepted. Provider-owned goals, correlated continuation and retained plan presentation.

- **[0030: Consistent UI composition and retained meaning](0030-consistent-ui-composition-and-history.md)** —
  Proposed; implementation authorised. Tightens the four-layer theme boundary
  and retains provenance for coherent live and historical conversation rendering.

- **[0029: Give plugins and workbenches their own Settings pages](0029-plugin-and-workbench-settings.md)** —
  Accepted. Retains MCP Apps while separating installation settings from project
  and conversation lifetimes.

- **[0020: Directory-backed projects and efficient file delivery](0020-directory-backed-projects-and-file-delivery.md)** —
  Accepted. Directory-backed projects, project-scoped activation and streamed
  file delivery. Remote storage and cross-machine synchronisation are excluded.
- **[0019: Useful observability through traces, logs and metrics](0019-useful-observability.md)** —
  Accepted. Opt-in instrumentation with measured overhead and content-free
  diagnostics.
- **[0018: Standard plugin loading and runtime extensions](0018-plugin-standards-and-runtime-extensions.md)** —
  Accepted. Standard package loading plus a bounded backend extension.
- **[0016: Discoverable plugins, skills, tools and resources](0016-discoverable-contributions-and-resources.md)** —
  Accepted. Registered contributions, native selections, attachments and
  standard tool resources.
- **[0015: Keep working material with its owner and approve AI tool invocations](0015-working-material-ownership-and-edit-approval.md)** —
  Accepted. Plugin-owned editing and preservation, with native
  invocation-scoped AI review;
  [evidence and limitations](../reference/adr-0015-native-edit-review.md)
  distinguish live from simulated checks.
- **[0014: Persistent, paginated conversation history](0014-persistent-paginated-conversation-history.md)** —
  Accepted. Display history stored separately from the agent's native
  transcript. Its
  [verification evidence](../reference/conversation-history-evidence.md) records
  the conformance, recovery, browser and measurement checks.
- **[0013: Define plugin contributions, dependencies and host integration](0013-plugin-boundaries-and-host-integration.md)** —
  Accepted. Tools, skills, workbenches and UI share one plugin ownership model.
- **[0012: Share UI components and guide their correct use](0012-shared-ui-components-and-guidance.md)** —
  Accepted. Shared controls and stateful feedback have one public owner.
- **[0011: Implement the foundation and trusted startup plugins](0011-supported-foundation-and-startup-plugins.md)** —
  **Proposed.** Implementation is authorised; acceptance awaits implementation
  review and maintainer approval. Use ADR 0018 for the accepted package-loading
  decision.

### Publishing

- **[0010: Automatically deploy approved journal content](0010-automatically-deploy-approved-journal-content.md)** —
  Accepted. Relevant pushes to `main` deploy the journal; drafts stay excluded.
- **[0009: Keep visual publishing sources in the repository](0009-repository-backed-visual-publishing.md)** —
  Accepted. ADR 0010 amends its manual-only trigger.

### Foundations

- **[0034: Run and ship Drawloom on Node](0034-node-toolchain.md)** —
  Accepted. Node is the runtime Drawloom ships, develops against and tests on:
  pnpm, Vitest, esbuild and Tauri, with the toolchain pinned exactly.
  Supersedes ADR 0003's Bun toolchain and `bun` runtime class.

- **[0008: Define tool execution and exposure](0008-tool-execution-and-exposure.md)** —
  Accepted. Invocation, grants and execution evidence.
- **[0007: Define provider-neutral agent execution](0007-provider-neutral-agent-execution.md)** —
  Accepted. The shared agent interface and the Codex integration, keeping native
  session management with Codex.
- **[0006: Adopt evidence-led architecture principles](0006-evidence-led-architecture-principles.md)** —
  Accepted. Records the original five principles behind
  [ARCHITECTURE.md](../../ARCHITECTURE.md).
- **[0005: Partition the agent platform into explicit capabilities](0005-partition-agent-platform-capabilities.md)** —
  Accepted. The historical capability map; not a list of implemented contracts.
- **[0004: Standardise capability contracts and conformance](0004-standardise-capability-contracts.md)** —
  Accepted. Behaviour before implementation, Zod validation at the edges, and
  one shared conformance suite per contract.
- **[0003: Adopt TypeScript, Bun, and portable packages](0003-typescript-bun-and-portable-packages.md)** —
  Accepted. TypeScript and ESM, explicit interfaces for host-specific code. Its
  Bun toolchain and `bun` runtime class are superseded by
  [ADR 0034](0034-node-toolchain.md); its TypeScript, ESM, portability,
  dependency-catalog and lockstep-release decisions stand.
- **[0002: License the public core under Apache-2.0](0002-open-core-licensing.md)** —
  Accepted. Proprietary products stay in separate repositories; contributions
  use the Developer Certificate of Origin.
- **[0001: Establish repository foundations](0001-repository-foundations.md)** —
  Accepted. One authoritative home for each kind of information.
