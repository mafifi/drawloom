# Harness and workbench capability survey

**Inspected 9 September 2026. Discovery evidence, not an architecture decision.**

The useful distinction is not feature count. **DeepSeek owns a harness runtime and its host. Open Design builds a rich product around native agent runtimes.** Drawloom should learn from both without absorbing either whole system.

## Read the maps

- [DeepSeek Harness — interactive architecture map](deepseek.html) · [capability inventory and source evidence](deepseek.md).
- [Open Design — interactive architecture map](open-design.html) · [capability inventory and source evidence](open-design.md).

The maps show the main ownership and data paths. They are not generated dependency hairballs, deployment diagrams or exhaustive interface listings. The linked inventories cover the wider capabilities, availability and limitations.

## What the refresh changed

Both reference repositories existed locally. They were clean and were fast-forwarded from their configured upstream branches before the survey was finalized.

| Reference | Previous checkout | Inspected checkout | New commits |
| --- | --- | --- | ---: |
| DeepSeek Harness, `master` | `4e84901e6471b79ec0338099867ebb4606d12bb5` | `b2e3b2a0125854567a4a5fcba75782e42fe84901` | 1,477 |
| Open Design, `main` | `9bb4a7d66d31a4bb7a678a93c6940d3677774e51` | `81044a03ca717f77a5bde38947903a8ef222da8c` | 63 |

These revisions identify the evidence, not dependency pins for Drawloom. This document makes no claim to follow subsequent upstream changes automatically.

Material corrections after updating:

- DeepSeek now has v3 session format migration and exclusive writer handles.
- Its live assistant frames are separate from durable settled messages/attempts.
- Its current Remote transport uses WebSocket multiplexing.
- Rich code-fence previews were reverted at the inspected HEAD; HTML file preview is a separate feature.
- Open Design now selects **Codex App Server by default**, not only Codex CLI exec.
- Open Design added immutable chat artifact evidence alongside mutable workspace files.
- Open Design's pipeline is wired to registry workers, but permissive default signals must not be mistaken for verified acceptance.

Each point is linked to implementation in the two inventories. Older observations of these repositories are not reliable substitutes for these sources.

## What we should take away

### 1. Our history concern is real, and well represented

DeepSeek has separate authoritative history, cached derived views and bounded client windows. It distinguishes durable cursor advancement from transient notifications, and repairs gaps before publishing a replacement window.

This supports the direction we discussed: **retain an efficient UI read model without taking ownership of Codex's transcript**. It does not call for a new memory system, nor importing DeepSeek's JSONL format or its entire event framework.

Open Design provides a complementary lesson: an app conversation, a physical execution and a native provider session are different identities. It preserves the native session where possible instead of always rebuilding provider context from its own conversation.

### 2. Artifact identity deserves as much care as conversation identity

The references make different product choices:

| Question | DeepSeek | Open Design |
| --- | --- | --- |
| What was delivered? | Durable declaration referencing an existing file. | Per-turn artifact evidence and mutable workspace identity. |
| Are historical bytes preserved? | `present` explicitly does not preserve file bytes. | Selected originals/covers are frozen according to media policy. |
| What does opening the card mean? | Open the current source file. | A historical cover may deliberately open today's latest file. |

Drawloom's video workbench must make selected candidate, current working material and historical evidence unambiguous. The exact retention policy belongs to the consumer; a file path alone cannot stand in for all three.

The subsequent discussion is recorded in
[ADR 0015](../../adr/0015-working-material-ownership-and-edit-approval.md):
use lightweight live paths for provider-owned working files; plugins own useful
output preservation and their editing model. Conversation media capture remains
under ADR 0014. This is not a universal artifact/revision framework, and richer
previews are optional. Native human/delegated review and the existing video
plugin's direct Save and agent edits are implemented. The [verification
record](../adr-0015-native-edit-review.md) includes live results and the separately
identified native-tool integration follow-up. The 2026-09-10
[empowerment principle](../../../ARCHITECTURE.md#application-to-native-tools-and-integrations)
reframes that investigation around user-authorised access and approval coverage,
not blanket exclusion. Tool inventory alone establishes neither access nor a bypass.

### 3. Rich interaction does not require copying a client kernel

DeepSeek exposes in-process browser contributions through Cordis. Open Design owns its editing/preview bridge within its product. Neither is evidence that Drawloom's chosen MCP Apps boundary is insufficient.

Keep standard MCP Apps. Prove selection, revision requests, large media inspection and stale-view invalidation with the private workbench. Ask for an explicit decision if a concrete interaction cannot cross that boundary. Do not infer approval for a larger host API from these diagrams.

### 4. A working integration is not complete provider parity

Open Design's Codex integration uses one App Server subprocess per turn and rejects all server-initiated requests. Its Claude integration is the CLI, not Claude Agent SDK. Its structured question forms do not mean it supports native approval or elicitation requests.

Drawloom should report actual supported operations and test them. It should not flatten these differences into an unconditional provider-neutral promise.

### 5. We can learn from the limitations too

Some valuable negative examples:

- DeepSeek's dynamic Host VM is explicitly not security containment.
- Background jobs being visible does not mean they survive a restart.
- A full-text search package exists but is disabled in the default composition.
- Open Design's unknown/unobserved pipeline atoms can inherit positive review signals.
- Export routes can require a desktop renderer and return unsupported elsewhere.

These are reasons to inspect wiring, authority and failure behavior—not reasons to reject either reference.

## Comparison with Drawloom

Drawloom's [current API](../foundation-api.md), [desktop boundary](../../design/desktop-host.md) and [accepted plugin decision](../../adr/0013-plugin-boundaries-and-host-integration.md) remain authoritative. A named architecture capability does not imply a finished implementation.

| Concern | Current Drawloom baseline | What this survey adds | Likely owner / next disposition |
| --- | --- | --- | --- |
| Agent execution | Provider-neutral session/operation contract, Codex adapter and conformance. | Explicit distinction between native session, physical execution, transient progress and durable outcomes. | Adapter/provider owns native behavior. Extend only against tested differences. |
| Conversation display | Shared history contract, local SQLite and paginated host implemented in ADR 0014; signal stream is not replay. | Checkpointed views, windowed reading and reconnect gap tests. | **Completed:** accepted [ADR 0014](../../adr/0014-persistent-paginated-conversation-history.md) and [implementation evidence](../conversation-history-evidence.md). No transcript ownership transfer. |
| Tools and approvals | Bound tool invocation, policy, typed execution knowledge and evidence; approval choices retain provider values. | Verify composition, cancellation uncertainty and unsupported provider interactions. | Existing tool/agent boundary; strengthen proof before adding abstractions. |
| Plugins and UI | Trusted startup composition, shared public shell and standard MCP Apps proof. | Lifetime ownership, readiness and explicit renderer support. | Keep ADR 0013. No in-process dynamic UI or alternative contract proposed. |
| Artifacts and review | Managed assets, candidate identity, explicit review and immutable revision targets. | Distinguish live file, historical evidence, preview and selected candidate. | Challenge with video replacement/revision scenarios; private review policy stays private. |
| Large media | Directory-backed projects, streaming/ranges and shared media origins implemented under ADR 0020. | Streaming file transport and provider-specific media admission are separate concerns. | **Completed:** [Accepted ADR 0020](../../adr/0020-directory-backed-projects-and-file-delivery.md) and [measured evidence](../../../knowledge/evidence/adr-0020-projects-file-delivery.md). Remote storage remains separate. |
| Context and memory | Compiled context and provider-owned conversation; no new memory substrate from this work. | Instructions, compaction, cross-session reference and long-term curation are distinct. | Native compaction stays provider-owned. Memory deserves its separate future decision. |
| Orchestration | Architecture capability partition; no supported engine selected. | Goals, children, process-local jobs, workflow VMs and experimental teams have different guarantees. | [Accepted ADR 0017](../../adr/0017-orchestration-interfaces.md) establishes the demonstrated typed boundary with a retained local Temporal proof; this does not adopt a production engine. |
| Spend and observability | Correlated tool evidence; private workbench requirements distinguish paid tools from native charges. | Attempt accounting and unknown usage are not money budgets; telemetry is separate again. | Prove approval-before-paid-submit and recovery without duplicates; do not promise unknown billing. |
| Security and host access | Authenticated local host, confined managed assets and bounded MCP Apps resource access. | Configured mode, policy decision, cooperative VM and OS enforcement differ. | Keep explicit authority; never equate trust configuration with isolation. |
| Publishing and scheduled work | Separate editorial publishing and private business boundaries. | Open Design joins routines/export/deploy to its ordinary run path. | Optional consumers, not prerequisites for Drawloom core. |

This is a **candidate sequence for discussion**, not a newly approved implementation plan:

1. Design and prove incremental conversation reading.
2. Test artifact identity and media-size behavior using the existing video consumer.
3. Add a provider interaction matrix with observed support and failure cases.
4. Revisit background operation recovery only where the video workflow requires it.
5. Leave teams, general workflows, marketplaces and broad remote-sync machinery unadopted.

The architecture boundary decision remains: provider runtime owns its agent loop and transcript; public Drawloom owns its reusable host; private workbench owns business workflow, skills and acceptance.

## Inventory: how large are the repositories?

Physical text lines from tracked files at the clean revisions above:

| Category | DeepSeek Harness | Open Design |
| --- | ---: | ---: |
| All classified text | 1,288,938 | 3,203,448 |
| Implementation, scripts and styles | 411,152 | 994,293 |
| Tests | 468,237 | 798,901 |
| Documentation | 255,735 | 166,941 |
| Design-reference catalogs | 0 | 926,702 |
| Fixtures and snapshots | 72,022 | 29,117 |
| Tracked files, including binary | 10,166 | 12,505 |
| Named package manifests | 297 | 30 |

Selected rows do not sum to the total; configuration, translations, lockfiles and other categories are in the inventories.

This is **not executable source LOC, capability count, or a maturity score**. The earlier 860K estimate may reflect an older checkout or different exclusions. Path heuristics cannot perfectly distinguish handwritten, embedded, minified or generated code. Tests include fixtures that are not separately marked. DeepSeek describes itself as a developer preview; substantial activity does not establish production stability.

Reproducible inventory script: [inventory.mjs](inventory.mjs). Exact outputs: [DeepSeek](deepseek-harness.inventory.json), [Open Design](open-design.inventory.json). The script uses only local Git and tracked file reads; it does not execute repository code or call providers.

## Method, evidence and remaining uncertainty

- Repository file/package inventory followed by three parallel, bounded source inspections: DeepSeek runtime/history; DeepSeek host/tools/UI; Open Design workbench/provider integration.
- Findings reconciled after upstream refresh. Main-pass spot checks covered composition, session cursor semantics, v3 migration, explicit deliverables, App Server behavior, immutable artifacts and permissive pipeline defaults.
- Representative test bodies were read to distinguish intended coverage from incidental implementation. **No upstream application, provider call, test suite or build was run.**
- Archify rendered the two authored maps; each component has a revision-bound source reference. Diagram source validation does not certify every behavioral claim in the inventories.
- The maps passed deterministic checks and browser containment checks. See [diagram evidence](diagram-evidence.md) for exact receipts and visual review.
- This is a broad architectural first pass, not a complete code audit, vulnerability assessment, benchmark or guarantee that every package has been inspected.
- Remote deployment, complete provider matrix, integration reliability, all plugin slots, all desktop export formats and cross-platform behavior remain unverified.
- Only public reference code informed these records. No private business code, prompts, data, assets or fixtures were copied. The private repository and production systems were not changed.

## Refresh before using a finding for a decision

### Subsequent implementation: discovery and returned resources

[ADR 0016](../../adr/0016-discoverable-contributions-and-resources.md) was accepted
on 10 September 2026. Registered contributions, native skills/mentions, standard
MCP resources and composer attachments are implemented in the public host, with
the existing private video plugin as the integration consumer. See the
[API and verification record](../discovery-and-resources.md) for actual native
review outcomes, cached-resource recovery, browser evidence and limitations.
This follow-up does not change the upstream inspection claims or revisions above.

### Subsequent experiment: operational observability

[ADR 0019](../../adr/0019-useful-observability.md) and its
[measurement record](../../../knowledge/evidence/adr-0019-observability.md) now
exercise standard OpenTelemetry in Drawloom. DeepSeek's recorded telemetry source
was rechecked at the same revision: feedback-authorised session capture remains
distinct from this content-excluding operational tracing. Native discovery is now
measured. The [discovery follow-up](../../../knowledge/evidence/discovery-latency-fix.md)
removes blocking presentation and isolates category invalidation; provider-internal
cold latency and native request cancellation are not claimed fixed. No new upstream
execution claim is made.

### Subsequent implementation: projects and large-file delivery

[ADR 0020](../../adr/0020-directory-backed-projects-and-file-delivery.md) was
accepted on 11 September 2026. Project bindings, streamed delivery and one shared
declared-media policy replace Drawloom's whole-buffer media baseline. Its evidence
separates public checks, private sample playback and untested remote providers.
This updates Drawloom's follow-up status, not the upstream inspection claims.

### Refresh procedure

1. Inspect checkout/remotes and local changes. Fetch the intended upstream and fast-forward only when safe; never reset local work to refresh evidence.
2. Record old/new SHA and bounded change summary. Recount if size is discussed.
3. Reinspect changed composition roots, relevant implementations and tests. Treat added, removed, disabled and reverted features separately.
4. Update affected claims and immutable source links together. Do not change only the revision label.
5. Revalidate source references and regenerate diagrams when their truth changes.
6. Run the smallest relevant proof before turning a source-inspected pattern into a Drawloom compatibility or performance claim.
7. Any new public boundary still needs the maintainer's explicit decision under the architecture principles.

## Local verification

- Frozen Bun install completed without dependency changes.
- Drawloom `bun run check:ci` passed: 225 Bun tests, zero failures; Node shared
  conformance also passed. The build reported a 503 kB client-chunk size warning;
  no application code was changed in this survey.
- Inventory outputs reproduced exactly from the two recorded checkouts.
- Source-link paths and line bounds checked against those checkouts; local report
  links resolved; diagram specification/artifact/browser receipt hashes matched.
- Both reference checkouts remained clean and aligned with their fetched upstream.

No automated monitoring, commits, publication or contract amendments were introduced by this survey.
