# ADR 0011: Implement the foundation and trusted startup plugins

- **Status:** Proposed
- **Date:** 2026-09-08
- **Decision owners:** Drawloom maintainers

## Decision

Implement ADR 0007 and ADR 0008 as independent agent and tool contracts and
providers. Exact exports and command semantics live in the
[foundation API reference](../reference/foundation-api.md). Implementation is
authorised; this record remains Proposed until implementation review and
maintainer acceptance. No package has been publicly released.

The accepted plugin ownership, dependency, startup and UI integration decisions
are consolidated in [ADR 0013](0013-plugin-boundaries-and-host-integration.md).
This record retains the foundation implementation scope rather than defining a
second plugin model. The original implementation registered trusted tools,
skills and declarative workbenches at startup, without arbitrary UI execution.
The first bounded UI contribution is now an authorised, unreleased integration
under Accepted ADR 0013; this does not establish a supported release or accept
the broader foundation implementation in this ADR.

Text inspection and media inspection both need named workbenches with tools,
skills, and artifact/candidate/review presentation. The small shared data model
describes those relationships and text or asset references. It carries no
business approval rules, provider instructions, rendering code or artifact
promotion policy. A synthetic text composition verifies infrastructure without
private source or services; a media-shaped fixture challenges text assumptions.

Compiled context has a text projection and optional source references. Its
producer remains responsible for trust and provenance. Host contracts provide
JSON RPC transport, JSON persistence and asset byte access. Node implementations
are explicit providers; portable contracts use no host ambient APIs. Asset roots
and process command selection belong to trusted composition. Persistence
acknowledgement does not claim crash durability unless the host documents it.

Codex uses a composed, isolated app-server transport and an immutable MCP
projection. Its private thread/turn mapping attaches each MCP request to the
originating operation. Missing or revoked mappings fail closed. Native memory
and ambient integrations are disabled. Recorded synthetic protocol traffic is
the implementation test boundary; this change authorises no live provider spend.
Transport failure fails an active operation, preserving uncertainty; there is
no automatic operation retry or claim of lost-delta reconstruction.

## Consequences and verification

Each provider runs shared exported conformance. Root verification builds ESM
and declarations, type checks portable packages without host ambient types,
tests on Bun and Node, and enforces dependency direction. Private consumers
install locally packed public artifacts; public CI never accesses them.
Startup lifecycle and contribution validation follow Accepted ADR 0013.
Advanced context compilation, sandbox enforcement, durable observability,
provider availability and business workflows remain separate work.
