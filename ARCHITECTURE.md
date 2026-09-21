# Architecture

## Decision principles

Drawloom is built on 10 design principles. They guide how we build the core,
choose dependencies and support developers building their own workbenches.

This document starts with those principles, then introduces the capabilities
they shape. The remaining sections explain the decisions that bring them
together and the safeguards that keep their responsibilities clear.

1. **Safety.** Make Drawloom safe and secure by default, protecting the user's
   work, data and control over actions. Design interfaces to support the access
   controls, review and audit requirements of enterprise and regulated
   environments, without assuming that an interface alone proves compliance.
2. **Familiarity.** Make the UI intuitive, easy to navigate and familiar to users
   of other AI tools. Work within their existing toolsets and preserve native
   permissions and review controls rather than displacing them.
3. **Vendor agnostic.** Avoid dependence on any single vendor or provider through
   clearly defined, replaceable components. Keep provider-specific features
   separate from shared interfaces; Codex is currently the only supported agent
   integration, not a permanent architectural requirement.
4. **Open standards.** Align with industry standards wherever possible to make
   Drawloom easier to adopt and integrate. Use established formats and protocols
   before introducing bespoke alternatives.
5. **Freedom of distribution and use.** Use permissively licensed dependencies,
   with reviewed MPL-2.0 components also allowed. Review the full dependency
   chain, downloaded runtimes and model weights, not just the packages listed
   directly in the project.
6. **Local offering.** Give solo developers a useful way to get started locally,
   without requiring hosted infrastructure for every capability. Explain costs,
   downloads and setup requirements before they commit to them.
7. **Don't over engineer.** Bespoke requirements and complexity cost engineering
   time, maintenance effort, runtime resources and ease of adoption. If another
   principle or a demonstrated need does not require the complexity, leave it out.
8. **Reuse.** Reuse existing libraries and Drawloom capabilities wherever they
   meet the need. Where reuse is not possible, learn from proven implementations
   before building our own.
9. **Resiliency & testing.** Use type safety, input validation and extensive
   testing to make changes reliable, including changes made by agents. Test
   interfaces across implementations and through end-to-end integration—not just
   unit tests—including failure and recovery, and measure the benefits behind
   decisions rather than assuming them.
10. **Clear responsibility.** Give each capability a clear purpose and define
    what it owns and may decide. Reuse other capabilities through their
    interfaces rather than duplicating their work or taking over their
    responsibilities.

Choose the simplest design that meets these principles. Before adding
complexity, ask: what problem have we observed, why does the simpler option fall
short, what does the change cost, and how will we test it? Saving code is not a
good trade if it removes necessary protection or makes the product hard to use.

[ADR 0006](docs/adr/0006-evidence-led-architecture-principles.md) records the
original five principles. The ten above are the maintainer's current grouping
and priorities; the sections below explain how to apply them without rewriting
the historical decision records.
[ADR 0026](docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)
records the dependency-licensing policy.

## Core capabilities

These are the same 10 capabilities introduced in the [README](README.md).
They put the principles into practice: each contributes part of what a
workbench needs. Each decision record (ADR) explains the choices, alternatives
and supporting tests in more detail.

- **Context:** Brings together instructions, skills and selected information for
  the agent, without treating those instructions as permission to act.
  [ADR 0007](docs/adr/0007-provider-neutral-agent-execution.md) explains how agents
  receive context, and [ADR 0016](docs/adr/0016-discoverable-contributions-and-resources.md)
  covers discovering skills and resources.
  [ADR 0027](docs/adr/0027-complete-learning-journey.md) adds bounded knowledge
  references to ordinary conversations, with explicit consent and access checks.
- **Tools:** Makes functions and MCP tools available to the agent, checking
  permission before execution and recording what happened.
  [ADR 0008](docs/adr/0008-tool-execution-and-exposure.md) defines invocation,
  grants and evidence; [ADR 0016](docs/adr/0016-discoverable-contributions-and-resources.md)
  explains discovery.
- **Memory:** Records and recalls past observations so experience can inform
  future work, using the same local storage and retrieval implementation as
  knowledge. [ADR 0022](docs/adr/0022-knowledge-memory-context-experiment.md)
  records the experiment behind this approach, and
  [ADR 0024](docs/adr/0024-local-knowledge-memory-and-retrieval.md) describes
  its implementation.
- **Knowledge:** Distils memory into learnings, using supporting and disputing
  evidence to build confidence; Drawloom automatically curates this knowledge.
  [ADR 0022](docs/adr/0022-knowledge-memory-context-experiment.md) describes the
  experiments behind the approach, while
  [ADR 0024](docs/adr/0024-local-knowledge-memory-and-retrieval.md) describes its
  implementation using SQLite for storage and Temporal to coordinate curation,
  with local semantic search updated in
  [ADR 0026](docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md).
  [ADR 0027](docs/adr/0027-complete-learning-journey.md) connects capture,
  curation and recall in the desktop, with separate opt-in controls.
- **Evaluation:** Assesses saved results or runs experiments to help you improve
  a workbench and compare models. [ADR 0025](docs/adr/0025-evaluation-boundaries-and-comparative-proof.md)
  defines cases, scorers, findings and feedback, reusing orchestration for
  scheduling and leaving domain judgement to plugins.
- **Orchestration:** Organises tasks and workflows, including agent work, with
  explicit retries and recovery after interruption.
  [ADR 0017](docs/adr/0017-orchestration-interfaces.md) defines the interfaces;
  [ADR 0021](docs/adr/0021-local-temporal-orchestration.md) supplies the local
  Temporal implementation.
- **Sandbox:** Uses the agent's execution environment and host access controls
  to limit where work can happen; Drawloom does not provide a separate general
  sandbox service. [ADR 0007](docs/adr/0007-provider-neutral-agent-execution.md)
  covers agent execution, and [ADR 0020](docs/adr/0020-directory-backed-projects-and-file-delivery.md)
  defines project and file access.
- **Observability:** Helps you follow activity and investigate problems through
  traces, logs and metrics. [ADR 0019](docs/adr/0019-useful-observability.md)
  uses OpenTelemetry rather than a new tracing API, with content-free diagnostics
  and an explicit choice to export them.
- **Agent integration:** Connects Drawloom to an agent so you can send messages,
  follow progress, provide input and handle approval requests.
  [ADR 0007](docs/adr/0007-provider-neutral-agent-execution.md) defines the shared
  interface and Codex integration, keeping native session management with Codex.
- **Policy and approval:** Controls what the agent may do and what information
  it may access, with human or supported delegated review.
  [ADR 0008](docs/adr/0008-tool-execution-and-exposure.md) covers tool grants,
  [ADR 0015](docs/adr/0015-working-material-ownership-and-edit-approval.md)
  covers AI edit approval, and [ADR 0023](docs/adr/0023-knowledge-memory-authorization-boundaries.md)
  covers knowledge and memory access.

These are capabilities, not ten independent services. Memory and knowledge share
one learning subsystem. Context has separate interfaces for assembling session
and turn input and for selecting knowledge references. Access decisions use a
shared asynchronous interface, while each protected operation still enforces
permission independently. Sandboxing relies on the execution environment.
Accepted [ADR 0028](docs/adr/0028-replaceable-learning-context-and-decisions.md)
records these replacement boundaries, including approval presentation without
transferring native approval authority. The
[replacement guide](docs/reference/replacing-capabilities.md) shows developer setup.

The original [ADR 0005](docs/adr/0005-partition-agent-platform-capabilities.md)
listed 11 possible responsibilities, including model inference. Drawloom does
not expose a general model-inference API: agent model calls belong to the agent
integration, while embeddings and assessments have narrower interfaces. That
historical map is not a list of 11 implemented contracts.

## How Drawloom fits together

The capabilities describe what Drawloom does. The decisions below explain how
we assemble and deliver them: first the components, then the workbench and
desktop experience, the user's working material, and finally licensing and
publishing.

### Building and replacing components

- **Repository organisation:** Keep one authoritative home for each kind of
  information, with local guidance for coding agents.
  [ADR 0001](docs/adr/0001-repository-foundations.md).
- **Language and toolchain:** Use TypeScript and ESM, and explicit interfaces
  for host-specific code. Public packages initially share a release version.
  pnpm manages dependencies, Node runs the application, Vitest runs tests,
  esbuild bundles JavaScript and Tauri packages the desktop application.
  [ADR 0003](docs/adr/0003-typescript-bun-and-portable-packages.md), whose
  toolchain and `bun` runtime class are superseded by
  [ADR 0034](docs/adr/0034-node-toolchain.md).
- **Interfaces and tests:** Define behaviour before its implementation, validate
  external data with Zod schemas, and run the same conformance tests against
  every implementation.
  [ADR 0004](docs/adr/0004-standardise-capability-contracts.md).
- **Startup registration:** The early proposal describes assembling the
  foundation and registering trusted plugins at startup; it remains Proposed.
  [ADR 0011](docs/adr/0011-supported-foundation-and-startup-plugins.md).
  Use ADR 0018 below for the accepted package-loading decision.

### Workbenches, plugins and the desktop

- **Shared UI:** Use shared shadcn-svelte components from `@drawloom/ui`,
  following [DESIGN.md](DESIGN.md). Views present information; ViewModels own
  application state and commands.
  [ADR 0012](docs/adr/0012-shared-ui-components-and-guidance.md).
- **Plugin responsibilities:** Plugins contribute tools, skills and UI while
  retaining their own business rules. MCP Apps is the approved way to connect
  plugin UI, not a custom browser protocol.
  [ADR 0013](docs/adr/0013-plugin-boundaries-and-host-integration.md).
- **Plugin packaging and loading:** Load standard plugin packages and explicitly
  trusted backend and workflow extensions. Drawloom-specific metadata uses
  `extensions["org.drawloom"]`, with packaged extension files in `org.drawloom/`.
  [ADR 0018](docs/adr/0018-plugin-standards-and-runtime-extensions.md) and the
  [package reference](docs/reference/plugin-packages.md).
- **Plugin and workbench settings:** Give each owner a page in Settings for
  shared configuration and setup. These MCP Apps work without an open project
  or conversation; saving preferences does not grant tool permission.
  [ADR 0029](docs/adr/0029-plugin-and-workbench-settings.md).

### Conversations, projects and working files

- **Conversation history:** Store paginated display records for browsing and
  offline access, separately from the agent's native transcript. Saving history
  does not automatically turn it into memory or send it back as model context.
  [ADR 0014](docs/adr/0014-persistent-paginated-conversation-history.md).
- **Working material:** Leave editing, saving and revisions with the component
  that owns the material. Approval for an AI edit is not acceptance of the
  finished work or permission to publish it.
  [ADR 0015](docs/adr/0015-working-material-ownership-and-edit-approval.md).
- **Projects and file access:** Bind conversations and workbench activity to
  their project, keeping installation and authentication global. Stream files
  from that project's directory without requiring an import.
  [ADR 0020](docs/adr/0020-directory-backed-projects-and-file-delivery.md).

### Licensing and publishing

- **Open-source core:** License the public core under Apache-2.0 and keep
  proprietary products in separate repositories. Contributions use the
  Developer Certificate of Origin.
  [ADR 0002](docs/adr/0002-open-core-licensing.md).
- **Dependency licences:** Review shipped and user-installed components,
  including transitive dependencies and model weights.
  [ADR 0026](docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)
  records the policy and the embedding replacement it required.
- **Journal sources:** Keep articles and their source media in the repository;
  the Astro journal is separate from the SvelteKit product UI.
  [ADR 0009](docs/adr/0009-repository-backed-visual-publishing.md).
- **Publication:** Deploy approved journal content automatically when relevant
  changes reach `main`, after CI succeeds. Drafts remain unpublished.
  [ADR 0010](docs/adr/0010-automatically-deploy-approved-journal-content.md);
  [publishing/EDITORIAL.md](publishing/EDITORIAL.md) explains editorial approval.

## Responsibilities and safeguards

Once these parts are connected, their responsibilities need to stay clear.
The decisions below apply the tenth principle to the places where capabilities
meet: what gets remembered, who may act, and who decides whether work is done.
Some ADRs appear again here because they explain both a feature and the
safeguard that governs its use.

- **History is not memory:** Codex manages its native conversation; Drawloom
  keeps a separate record for display. Saving that record does not automatically
  send it back to the model or turn it into knowledge.
  [ADR 0007](docs/adr/0007-provider-neutral-agent-execution.md) and
  [ADR 0014](docs/adr/0014-persistent-paginated-conversation-history.md).
- **Access follows the work:** File access belongs to the conversation's fixed
  project, not whichever project happens to be selected. Knowledge access uses
  trusted identity and the selected access policy; a reference to something
  does not grant permission to read it.
  [ADR 0020](docs/adr/0020-directory-backed-projects-and-file-delivery.md) and
  [ADR 0023](docs/adr/0023-knowledge-memory-authorization-boundaries.md).
- **Permission is not acceptance:** Tool grants and approval checks serve
  different purposes, and neither accepts the finished work or authorises
  publication. Plugins retain responsibility for validating and saving their
  own material.
  [ADR 0008](docs/adr/0008-tool-execution-and-exposure.md) and
  [ADR 0015](docs/adr/0015-working-material-ownership-and-edit-approval.md).
- **Evaluation advises; orchestration coordinates:** Evaluation assesses results
  and uses orchestration to schedule work. It does not add another scheduler,
  grant execution rights or make business approval decisions.
  [ADR 0017](docs/adr/0017-orchestration-interfaces.md) and
  [ADR 0025](docs/adr/0025-evaluation-boundaries-and-comparative-proof.md).
- **Uncertainty is not a retry instruction:** A failed or interrupted operation
  may already have changed something. Recovery must distinguish known failures
  from unknown effects before repeating work.
  [ADR 0017](docs/adr/0017-orchestration-interfaces.md).
- **Diagnostics are not the record of the work:** Traces and metrics help explain
  behaviour without collecting user content. They do not replace conversation
  history, tool execution records or permission checks.
  [ADR 0019](docs/adr/0019-useful-observability.md).
- **Workbenches extend the core, not the reverse:** The core provides reusable
  capabilities; workbenches supply their own business rules through public
  interfaces. Drawloom must remain usable and testable without any private
  workbench.
  [ADR 0002](docs/adr/0002-open-core-licensing.md) and
  [ADR 0013](docs/adr/0013-plugin-boundaries-and-host-integration.md).

### Application to native tools and integrations

Native tools retain their platform's permissions, sandbox and review controls;
Drawloom-exposed tools retain their independent grants and execution records.
Neither replaces the other. We integrate the user's tools rather than wrapping
or excluding them simply because Drawloom does not own them.
[ADR 0015](docs/adr/0015-working-material-ownership-and-edit-approval.md)
records the approval approach and its tested limits.

## Finding your way through the code

The [repository walkthrough](docs/reference/repository-audit/README.md) provides
a route through the code. The [foundation API reference](docs/reference/foundation-api.md)
and package types describe the interfaces; the
[desktop host guide](docs/design/desktop-host.md) explains how the application
connects them.

Where a capability has a contract package, its usual layout is:

```text
packages/<capability>/<capability>/     # interface, schemas and shared tests
packages/<capability>/<provider>/       # implementation
```

Contract packages do not depend on implementations. The application setup selects
providers, and consumers use their shared interfaces. This lets a developer
replace an implementation without rebuilding its consumers.

See [CONTRIBUTING.md](CONTRIBUTING.md) for changing interfaces, testing,
licence review and keeping public contributions independent of private products.
