# ADR 0016 implementation

Status: completed on 2026-09-10. Implements the maintainer-approved plan.
[ADR 0016](../adr/0016-discoverable-contributions-and-resources.md) is accepted;
durable results and explicit limitations are in the
[API and implementation evidence](../reference/discovery-and-resources.md).
Delivered in the existing checkouts; publication is outside this plan.

## Global constraints

Public contracts/UI in Drawloom; private proof in drawloom-workbenches. Existing
checkouts, no new branches. Preserve current changes. Contract and failing tests
before runtime changes. Native plugin catalogue experimental opt-in, read-only,
off by default. No new permissions or MCP Apps extensions; escalate departures.

## Task 1: Discovery and native selections

Own packages/agent and packages/plugins. Add optional provider discovery and
origin-qualified catalogue summaries, selection identities and scope/status.
Browser must never submit native paths. Retain contribution ownership in startup
registry without exposing skill bodies. Implement Codex skills/list, app discovery,
native skill/mention input and experimental plugin/list; native paths remain in
adapter maps. Cache per session, invalidate on upstream change, paginate safely,
isolate category failures. Read-only discovery must never execute tools. Keep
required skill loading existing; additional private registry selection wired by
host in later task. Expose native discovered MCP tool inventory as unverified
unless provider reports stronger state. Reject unsupported/stale selections.
Synthetic/public conformance for supported and unsupported discovery. Validate
installed protocol and use realistic transport fixtures. Don't mutate global
config, disable ambient integrations, install plugins or add a new service.

## Task 2: Standard content and host resource projection

Own tools/local-tools and host resource integration. Preserve MCP-standard content
next to canonical output. Existing text renderers compatible, rich rendering
validated with failure evidence. Source-bound resources and cached display refs,
no arbitrary downloads/path access or implied skill installation. Wire MCP Apps
standard results/resources and exposed native results without custom bridge.

## Task 3: Public host and UI integration

Project catalogue to HTTP, browser and ViewModel; resolve selected identities on
send; preserve native review/grants. Compose plugin details, $/@ pickers, attachment
drop/paste/order/preview/errors/removal. Visible selected references and MCP context.
Use shared UI; validate model input support, not image-only casts. History and
source provenance persist through established storage; no raw envelopes or bytes.

## Task 4: Private proof and verification

Refresh public packages; use existing video recipe tools, skills and MCP App.
Return existing passage/media standard resources. Prove selection, attachment,
reviewed revision, direct Save, restart and independent grants. No product writes,
paid generation or private public fixtures. Both canonical gates and light/dark
browser proof. Acceptance required recorded evidence; the linked reference records
the completed gates, browser verification and live private-consumer walkthrough.
