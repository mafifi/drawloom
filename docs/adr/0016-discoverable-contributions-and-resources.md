# ADR 0016: Discoverable plugins, skills, tools and resources

- **Status:** Accepted
- **Date:** 2026-09-10
- **Decision owners:** Drawloom maintainers
- **Related:** ADRs 0008, 0012, 0013, 0014 and 0015

## Context

Before this decision, the registry contributed tools, skills and views, but
registration did not produce a complete user-facing catalogue. Skills were
selected by the workbench rather than the composer. Tool results contained typed
JSON and text, while artifacts followed a separate presentation path. Users need to discover and
use their existing capabilities without a Drawloom-only toolbox.

## Decision

Registered contributions are discoverable. Recognised tool-returned content
receives appropriate presentation. Discovery and selection never grant execution
permission. Public UI and contracts belong in Drawloom; proprietary contributions
and the proving video workflow stay in drawloom-workbenches.

### Discovery and selection

Keep origin-qualified identities, ownership, summaries, scope and honest
availability in existing plugin/agent boundaries. Discovery is optional for
providers and separate from execution, history and memory. Browser selections
reference validated catalogue identities; native paths and credentials stay in
the adapter. Do not infer authority from a listed tool or merge equal names from
different sources. Browse metadata without loading all instructions or executing
tools. Cache by relevant workspace/session; refresh explicitly or on upstream
invalidation and discard stale navigation responses.

Codex skills use native discovery and explicit skill inputs. App/plugin choices
use native mentions. Required workbench skills remain active; additional selected
Drawloom skills use the established trusted instruction path without duplicates.
Native plugin discovery is read-only, experimental and explicitly opt-in, off by
default. The maintainer approved that limitation: official documentation marks
plugin/list under development and unsuitable for production clients.

### Resources and attachments

Preserve standard MCP text, image, audio, resource-link and embedded-resource
content beside validated canonical tool output. Existing text renderers remain
compatible. Shared UI recognises standard content rather than guessing types from
arbitrary JSON. A returned skill document is reference material, not installed or
trusted executable instructions. Returned links need not appear in resources/list.

Use standard resource listing/reading where an existing connection supports it.
All reads remain source-bound and host-mediated: a URI is not filesystem or
network authority. Unsupported retrieval remains visible with an explanation.
Do not execute tools just to fill a picker or introduce new MCP Apps methods.

Use ADR 0014's asset capture and display history; neither duplicate authoritative
tool evidence nor refetch settled media on reopen. ADR 0015's live working files
remain live references, not automatic imports or accepted work. Model-readable
inputs are distinguished from files the UI can merely preview or tools can read.
Untrusted reference context is never promoted to developer instructions.

### UI and authority

Codex is the interaction reference. Compose the existing public shell using
ADR 0012's shared controls: searchable plugin/contribution details, skill and
integration/context pickers, removable draft chips, ordered attachment previews,
progress, retry and removal. Support keyboard use, drop/paste and both system
themes. Keep active MCP App context visible. App-only tools remain app-only.

Keep suggestions anchored to the composer without a modal drawer. Plugins and
Settings are dedicated main-content destinations. Artifact details are docked on
wide layouts and an explicit full-content view with Back on narrow layouts.

Installation, availability, draft selection, execution grants and business
acceptance remain distinct. Preserve native human/delegated review and independent
Drawloom grants. No install/uninstall, marketplace management, global configuration
writes, hot replacement, general manual tool console or alternate reviewer.

### Principles and reference comparison

[Architecture principles](../../ARCHITECTURE.md#decision-principles) govern this
decision: proportional efficiency (5), proven boundaries (6), safety (7), familiar
user control (8), and empowerment through platform integration (9).

- [Codex App Server](https://learn.chatgpt.com/docs/app-server): native discovery,
  skill input and mentions are the first integration path, not a custom protocol.
- [MCP tool results](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
  and [resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources):
  structured content and source-owned resolution, not guessed JSON attachments.
- DeepSeek's ui-skill, ui-attachment and read-only plugin inventory supply inspected
  examples of discovery and presentation. Do not import its Cordis client kernel.
- The operator worktree's composer combines skills, sources and files with native
  inputs. Its private source is reference only, not public fixture material.

This decision replaces the earlier blanket ambient-integration exclusion goal
in the adapter design with user-authorised native integration and explicit
availability/review coverage. It does not weaken invocation authority, permit
configuration changes, or claim every listed native tool is callable. ADR 0008's
canonical value remains authoritative; richer standard content extends its
presentation rather than replacing typed execution. Historical ADRs remain intact.

## Acceptance

Implementation details and measured observations live in the
[API and evidence reference](../reference/discovery-and-resources.md).

Accepted on 2026-09-10 after supported implementation, independent review and both
repositories' canonical checks passed. Public verification includes conformance,
duplicate-origin, unsupported-provider, stale-response, secure resource reads,
no-discovery-execution, cached-history and capture-recovery tests. Browser checks
passed in light/dark and desktop/narrow/mobile layouts, including keyboard
selection, attachments and a 4,301-entry synthetic catalogue.

The existing private video plugin demonstrated registered skills, attached
references, returned script/media resources and native human approval, denial and
delegated approval. Direct Save remained model-free and produced an unaccepted
draft. Restart retained resources, selection provenance and revisions. Automatic
denial/cancellation are deterministic evidence, not claimed live outcomes.
Experimental native plugin discovery remains off by default.

If this requires a departure from the agreed standards or provider boundaries,
stop with concrete evidence for a maintainer decision. No paid generation, model
downloads, production data or publication are part of this proof.
