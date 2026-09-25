---
step: 4
title: Decisions
question: What we chose and why
summary: Every design choice in Drawloom has a written record of the problem, the options, the choice, the evidence and the cost.
draft: false
---

Research only helps if it ends in a choice someone can check. This step lists
every decision that shapes Drawloom, what was chosen, and where to read the full
reasoning. If you want to know why the code looks the way it does, start here.

## What a decision record is

When a choice will constrain future work, we write it down in a short document
called a decision record. Developers know the format as an architecture decision
record, or ADR.

Each record follows the same six-part shape. It names the problem and what made
a decision necessary. It states the decision plainly enough that a later change
can be checked against it. It lists the other options and says which were
actually tried and which were only considered, because an untried option is a
judgement, not a result. It says what was verified, and what was not. And it
says what the choice costs: what becomes easier, what becomes harder and what is
deliberately left unsupported.

We keep records even after they stop being the whole truth. An accepted record
is not rewritten to match a later choice. A new record replaces it, fully or in
part, and links back. That way the old reasoning stays visible, including the
reasons that later proved wrong or incomplete.

A record's status tells you where it stands:

- **Proposed**: written down and open for review. Some proposed records have
  permission to build, but are not yet accepted.
- **Accepted**: in force.
- **Superseded** or **partially superseded**: a later record has replaced some
  or all of it.

The [architecture overview](https://github.com/mafifi/drawloom/blob/main/ARCHITECTURE.md)
groups these decisions by capability and is a good starting point if you do not
know which record you need.

## All 34 decisions

Grouped by theme, oldest first within each group.

### Foundations and tools

- **[ADR 0001: Repository foundations](https://github.com/mafifi/drawloom/blob/main/docs/adr/0001-repository-foundations.md)**, Accepted; partially superseded by ADR 0006. Give each kind of information one authoritative home, so facts are linked rather than copied and drift apart.
- **[ADR 0002: Apache-2.0 for the public core](https://github.com/mafifi/drawloom/blob/main/docs/adr/0002-open-core-licensing.md)**, Accepted. License the public core under Apache-2.0 and keep any paid products in separate repositories that depend on it, never the other way round.
- **[ADR 0003: TypeScript, Bun and portable packages](https://github.com/mafifi/drawloom/blob/main/docs/adr/0003-typescript-bun-and-portable-packages.md)**, Accepted; toolchain and `bun` runtime class superseded by ADR 0034. Write Drawloom in strict TypeScript and keep shared packages free of anything tied to one host.
- **[ADR 0006: Evidence-led principles](https://github.com/mafifi/drawloom/blob/main/docs/adr/0006-evidence-led-architecture-principles.md)**, Accepted. Choose the simplest design that meets present, evidenced needs, and make every extra layer of complexity earn its place.
- **[ADR 0026: Permissive dependencies and local embeddings](https://github.com/mafifi/drawloom/blob/main/docs/adr/0026-permissive-dependencies-and-local-gguf-embeddings.md)**, Accepted. Ship only permissively licensed components (or reviewed MPL-2.0), and switch local search to llama.cpp because the earlier options brought in GPL code.
- **[ADR 0034: Run and ship on Node](https://github.com/mafifi/drawloom/blob/main/docs/adr/0034-node-toolchain.md)**, Accepted. Move from Bun to Node, pnpm and Vitest, because Bun's bundled runtime carried LGPL code that ADR 0026 excludes.

### How the parts fit together

- **[ADR 0004: Capability contracts and conformance](https://github.com/mafifi/drawloom/blob/main/docs/adr/0004-standardise-capability-contracts.md)**, Accepted. Define each capability's behaviour first, check data at the edges, and run one shared test suite against every implementation.
- **[ADR 0005: Separate capabilities](https://github.com/mafifi/drawloom/blob/main/docs/adr/0005-partition-agent-platform-capabilities.md)**, Accepted. Split the platform into capabilities with clear owners so that no single provider absorbs memory, tools, policy and the rest.
- **[ADR 0007: Provider-neutral agent execution](https://github.com/mafifi/drawloom/blob/main/docs/adr/0007-provider-neutral-agent-execution.md)**, Accepted. Put one shared interface in front of the agent, with Codex behind it keeping its own conversation and session management.
- **[ADR 0008: Tool execution and exposure](https://github.com/mafifi/drawloom/blob/main/docs/adr/0008-tool-execution-and-exposure.md)**, Accepted. Tools are typed definitions with checked input and output, run under explicit grants and leave a record of what they did.

### Plugins and extensions

- **[ADR 0011: Foundation and startup plugins](https://github.com/mafifi/drawloom/blob/main/docs/adr/0011-supported-foundation-and-startup-plugins.md)**, Proposed. Build the agent and tool contracts as real packages and load trusted plugins at startup; building is authorised, acceptance awaits review.
- **[ADR 0013: Plugin contributions and host integration](https://github.com/mafifi/drawloom/blob/main/docs/adr/0013-plugin-boundaries-and-host-integration.md)**, Accepted. A plugin is a package of tools, skills, workbenches and interface pieces, and installing one never grants permission by itself.
- **[ADR 0016: Discoverable plugins, skills and tools](https://github.com/mafifi/drawloom/blob/main/docs/adr/0016-discoverable-contributions-and-resources.md)**, Accepted. Let people browse and pick what is installed, without letting a listing or a selection grant the right to run anything.
- **[ADR 0018: Standard plugin loading](https://github.com/mafifi/drawloom/blob/main/docs/adr/0018-plugin-standards-and-runtime-extensions.md)**, Accepted. Load plugins in the published Agent Plugins format, show their interfaces through the MCP Apps standard, and add only a small trusted extension for workbenches.
- **[ADR 0029: Settings pages for plugins and workbenches](https://github.com/mafifi/drawloom/blob/main/docs/adr/0029-plugin-and-workbench-settings.md)**, Accepted. Give each installed plugin its own Settings page, kept apart from projects and conversations.

### Working with the agent and your files

- **[ADR 0014: Persistent conversation history](https://github.com/mafifi/drawloom/blob/main/docs/adr/0014-persistent-paginated-conversation-history.md)**, Accepted. Keep a readable, paged copy of each conversation for display, separate from the agent's own transcript and never replayed to the model.
- **[ADR 0015: Working material and approving AI actions](https://github.com/mafifi/drawloom/blob/main/docs/adr/0015-working-material-ownership-and-edit-approval.md)**, Accepted. Leave files with whoever owns them, and route each AI action through the agent's own approval controls instead of a new universal undo system.
- **[ADR 0020: Directory-backed projects](https://github.com/mafifi/drawloom/blob/main/docs/adr/0020-directory-backed-projects-and-file-delivery.md)**, Accepted. Tie every conversation permanently to one project folder, and stream large files instead of copying them.
- **[ADR 0031: Native goals and plans](https://github.com/mafifi/drawloom/blob/main/docs/adr/0031-native-goals-and-structured-plans.md)**, Accepted. Show the agent's own goals and step-by-step plans, and require fresh permission before a turn the agent starts on its own can use Drawloom tools.
- **[ADR 0032: Native delegation and forks](https://github.com/mafifi/drawloom/blob/main/docs/adr/0032-native-delegation-and-conversation-forks.md)**, Proposed. Show helper agents and conversation copies, giving each its own permission check rather than borrowing the parent's.

### Knowledge, memory and context

- **[ADR 0022: A bounded knowledge and memory experiment](https://github.com/mafifi/drawloom/blob/main/docs/adr/0022-knowledge-memory-context-experiment.md)**, Accepted for the demonstrated boundaries. Accept who owns capture, upkeep and retrieval as shown in a small experiment, without fixing any data format or supported interface.
- **[ADR 0023: Replaceable access control](https://github.com/mafifi/drawloom/blob/main/docs/adr/0023-knowledge-memory-authorization-boundaries.md)**, Accepted. Drawloom enforces access decisions, while the organisation keeps identity, labels and policy.
- **[ADR 0024: Local knowledge, memory and retrieval](https://github.com/mafifi/drawloom/blob/main/docs/adr/0024-local-knowledge-memory-and-retrieval.md)**, Accepted; partially superseded by ADR 0026, ADR 0027 and ADR 0028. Store knowledge locally with its evidence, and search it by both words and meaning.
- **[ADR 0027: Learning in everyday conversations](https://github.com/mafifi/drawloom/blob/main/docs/adr/0027-complete-learning-journey.md)**, Accepted; context composition partially superseded by ADR 0028. Bring a small, capped set of relevant knowledge into ordinary conversations, with the user's consent.
- **[ADR 0028: Replaceable learning and decisions](https://github.com/mafifi/drawloom/blob/main/docs/adr/0028-replaceable-learning-context-and-decisions.md)**, Accepted. Let a developer swap the learning or access-decision implementation and keep the same desktop screens.

### Coordinating and checking work

- **[ADR 0017: Orchestration interfaces](https://github.com/mafifi/drawloom/blob/main/docs/adr/0017-orchestration-interfaces.md)**, Accepted; amended by ADR 0021. Write multi-step workflows as ordinary TypeScript that can survive restarts, without a new workflow language.
- **[ADR 0019: Useful observability](https://github.com/mafifi/drawloom/blob/main/docs/adr/0019-useful-observability.md)**, Accepted. Use the OpenTelemetry standard for opt-in diagnostics that record timings and counts, never conversation content.
- **[ADR 0021: Local Temporal orchestration](https://github.com/mafifi/drawloom/blob/main/docs/adr/0021-local-temporal-orchestration.md)**, Accepted. Run long jobs on a local Temporal server so they recover after a restart, knowingly using its development setup.
- **[ADR 0025: Evaluation boundaries](https://github.com/mafifi/drawloom/blob/main/docs/adr/0025-evaluation-boundaries-and-comparative-proof.md)**, Accepted. Evaluation owns test cases and findings, orchestration owns scheduling, and scoring runs locally with Braintrust and Autoevals.

### The app and its interface

- **[ADR 0012: Shared UI components](https://github.com/mafifi/drawloom/blob/main/docs/adr/0012-shared-ui-components-and-guidance.md)**, Accepted. Build every screen from one shared set of accessible controls, and show a loading state only on the action that is actually running.
- **[ADR 0030: Consistent interface composition](https://github.com/mafifi/drawloom/blob/main/docs/adr/0030-consistent-ui-composition-and-history.md)**, Proposed. Make the layered theme the only source of colours and spacing, and draw live and past conversations the same way.
- **[ADR 0033: Isolated built-in browser](https://github.com/mafifi/drawloom/blob/main/docs/adr/0033-isolated-native-browser-panel.md)**, Accepted. Add a browser panel with its own separate storage and no access to the app's authority, and no agent control of it.

### Publishing

- **[ADR 0009: Publishing sources in the repository](https://github.com/mafifi/drawloom/blob/main/docs/adr/0009-repository-backed-visual-publishing.md)**, Accepted; amended by ADR 0010. Keep articles, animations and their sources in the repository and publish them as a static site on GitHub Pages.
- **[ADR 0010: Automatic journal deployment](https://github.com/mafifi/drawloom/blob/main/docs/adr/0010-automatically-deploy-approved-journal-content.md)**, Accepted. Deploy the journal when approved content changes on the main branch; drafts stay private.

## Three decisions up close

### Keeping responsibilities apart (ADR 0005)

**The problem.** An AI agent touches many concerns at once: memory, tools,
permissions, logs, scheduling. The first integration with a real agent could
easily swallow all of them into one oversized interface.

**What was considered.** One contract for the whole platform would have meant
less wiring at first. Letting the first provider set the boundaries would have
been fastest. Both would have tied every part to one implementation, making
replacement possible in name only. Creating a package for every capability up
front was also rejected, because it would imply decisions nobody had made yet.

**What was chosen.** A map of separate capabilities, each with a clear owner and
a clear list of what it does not own. Policy decides whether an action is
allowed; tools carry it out; the sandbox enforces limits.

**What it cost.** More explicit assembly, because no part may reach into its
neighbour. The map has also aged: it listed 11 possible responsibilities,
including model inference, and today's
[architecture overview](https://github.com/mafifi/drawloom/blob/main/ARCHITECTURE.md)
says plainly that it is historical, not a list of implemented contracts.

### Leaving Bun for Node (ADR 0034)

**The problem.** Drawloom's desktop host was built as a single file with Bun's
runtime inside it. Bun itself is MIT-licensed, but the pinned release also
bundles WebKit's JavaScript engine and a small compiler under the LGPL. Drawloom
had already decided, in ADR 0026, not to ship LGPL code. The existing licence
check had missed this because it looked at packages, not at a runtime compiled
into the app.

**What was considered.** Meeting the LGPL's terms was priced properly. It would
mean publishing the exact sources and proving that anyone could rebuild them.
The investigation found that the build steps in upstream's own licence file
failed against the pinned code, so Drawloom would have to write and maintain its
own recipe for every release. It stopped before a successful rebuild. Shipping
Bun as a separate file was rejected because the policy covers what Drawloom
distributes, not how it is linked. Shipping Node but testing on Bun failed on
evidence: moving two packages to Node's built-in SQLite broke 47 tests.

**What was chosen.** Node everywhere: in development, in tests and in the app,
pinned to one exact version, with pnpm, Vitest, esbuild, Vite and Tauri. No
compatibility layer for either runtime.

**What it cost.** The app is now a bundle plus a Node runtime rather than one
file, and that runtime needed its own licence check. Every contributor changed
tools. Signing and packaging are checked by hand before a release, because no
automated build produces the Mac app. The record also keeps a process error in
view: a signed build was invalidated when files inside it were edited after
signing. The same licence policy had already cost something once: ADR 0026
dropped a Mac embeddings option that passed its test, because its standard
installation pulled in GPL-licensed libraries.

### Accepting a development server on purpose (ADR 0021)

**The problem.** Drawloom had an accepted interface for long-running workflows
(ADR 0017) but only a proof behind it. Installed workbenches needed jobs that
survive quitting and reopening the app.

**What was considered.** Building a durable workflow engine was set aside:
reusing Temporal, an existing engine, avoided that work. Temporal's own guidance
separates its lightweight development server from supported production
deployments.

**What was chosen.** Run Temporal's local development server with its data on
the user's machine, reachable only from that machine, with no web dashboard. The
maintainer explicitly accepted this despite its development-only status.

**What it cost.** No production-server guarantees and no high availability.
Cancelling a job stops it but does not undo it. If the app stops mid-action, an
external effect may be left uncertain, and it stays marked as uncertain until
someone checks. Enterprise implementations are left for later.

## Go deeper

- [All decision records, with a one-line index](https://github.com/mafifi/drawloom/blob/main/docs/adr/README.md)
- [The decision record template and its conventions](https://github.com/mafifi/drawloom/blob/main/docs/adr/0000-template.md)
- [Architecture overview: principles, capabilities and how they fit](https://github.com/mafifi/drawloom/blob/main/ARCHITECTURE.md)
- [Documentation rules, including how records are revised and superseded](https://github.com/mafifi/drawloom/blob/main/docs/AGENTS.md)
- [Evidence for the local Temporal decision](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0021-local-temporal.md)
- [The notarised release record behind ADR 0034](https://github.com/mafifi/drawloom/blob/main/knowledge/evidence/adr-0034-notarised-release.md)
