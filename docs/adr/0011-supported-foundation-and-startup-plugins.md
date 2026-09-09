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

Trusted application composition registers plugins once at startup. A plugin
declares identity, version, a Zod configuration schema, required public
capabilities or contributed identities, and contributes tools, skills and
declarative workbench data. Configuration is validated before contribution;
duplicate identities and missing requirements prevent startup. Registration
does not establish operation authority. Dependencies are closures selected by
composition, not a service locator. There is no discovery, hot replacement,
arbitrary UI execution, remote installation, or plugin permission engine.

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
Startup is intentionally synchronous in topology and cannot unload plugins.
Advanced context compilation, sandbox enforcement, durable observability,
provider availability and business workflows remain separate work.
