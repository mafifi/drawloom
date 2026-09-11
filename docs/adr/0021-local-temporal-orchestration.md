# ADR 0021: Local Temporal orchestration

- **Status:** Accepted
- **Date:** 2026-09-11
- **Decision owners:** Drawloom maintainers
- **Related:** ADRs 0017–0020, 0007–0008, 0012–0016

## Context

ADR 0017 accepted a portable orchestration interface but retained its Temporal
implementation as evidence only. Installed workbenches now need an actual local
provider. Reusing Temporal avoids building another durable workflow engine.

## Decision

Adopt a Node-hosted Temporal provider behind @drawloom/orchestration. Bun remains
the repository toolchain. Run the locally installed Temporal development server
with persistent SQLite, loopback endpoints and no default Temporal web UI. Store
state under the selected Drawloom data directory, not inside project files.

The maintainer explicitly accepts this local-v1 deployment despite Temporal's
development-only support status. SQLite persistence does not establish production
service guarantees or high availability. Do not silently install/upgrade global
tools or expose the service remotely.

Quit stops local dispatch, flushes receipts and shuts down owned processes with
bounded waits. Reopen restores trusted handlers and saved work. Navigation does
not cancel runs. Cancellation is an explicit action, not rollback. Timers use
wall-clock time; ambiguous in-flight effects remain uncertain until reconciled.
Completed results are reused; retries remain bounded, explicit per step and never
override grants, native approvals or uncertainty protections.

## Plugin boundary amendment

Extend ADR 0018's namespaced metadata with an optional prebuilt workflow entrypoint.
It exports portable workflow/task definitions. The existing trusted backend returns
matching task handlers. The host compiles deterministic coordination separately
from backend startup and I/O. This is a Drawloom packaging addition, not part of
Agent Plugins or MCP. Standard-only plugins are unaffected. MCP Apps remains the
UI boundary; no browser capability or protocol is introduced.

Backend orchestration is scoped to installation and project. Bind runs to exact
workflow bundles; unfinished runs block replacing/removing the relevant package.
Changed on-disk code blocks recovery rather than replaying against a new bundle.
No side-by-side version management or workflow-history migration is added.

## Principles and references

Apply proportional efficiency, accessible local operation, replaceable boundaries,
safe defaults and familiar user control from [ARCHITECTURE.md](../../ARCHITECTURE.md).
Preserve the accepted [ADR 0017 reference comparison](0017-orchestration-interfaces.md):
Temporal supplies durable coordination, DeepSeek informed typed workflow/job seams,
and the existing Codex adapter retains agent authority. DeepSeek's in-process
composition and OpenAI/Rosalind's UI entrypoints do not establish this new workflow
packaging field; it is the maintainer-approved addition for deterministic loading.

[Temporal deployment guidance](https://docs.temporal.io/self-hosted-guide/deployment)
and [embedded-server limitations](https://docs.temporal.io/self-hosted-guide/embedded-server)
distinguish development SQLite from supported production service deployments.

## Delivery and acceptance

The [implementation plan](../plans/0021-local-temporal.md) defines public synthetic
conformance, installed package checks and private deterministic-media acceptance.
The private consumer renders three scene branches, waits for review and assembles
a draft master through existing media tools. No LLM, paid generation or publication
is part of this implementation. Existing downloaded private files remain private.

Acceptance requires actual service/worker/host recovery, isolated ownership,
controlled retry/cancellation, useful UI and both repositories' canonical checks.
Implementation results and remaining limitations are recorded in the
[evidence record](../../knowledge/evidence/adr-0021-local-temporal.md), including
the distinction between paused dispatch and uncertain interrupted effects.
The maintainer accepted this decision on 2026-09-11 after reviewing the implementation
and evidence, including actual parallel media processing. This supersedes ADR 0017's
proof-only backend disposition; its authority and retry semantics remain in force.
Enterprise implementations are a later delivery. Acceptance does not establish
production-server guarantees or transparent recovery of uncertain external effects.

## Approved implementation amendment: concurrent MCP calls

The actual media acceptance run found that Drawloom serializes requests on each
MCP connection to bind form elicitation to its originating invocation. The pinned
SDK's stdio transport does not transmit a parent request identity for that form.
The media server itself supports concurrent rendering, but the host queue prevents
it. The connection-policy amendment below removes that bottleneck without
changing the media executor or its authority.

The maintainer approved parallel work with the following connection policy. A host-owned, per-installation list
of servers with elicitation disabled. Such connections advertise no elicitation,
install no form handler and may execute concurrent standard requests. Other
connections retain current serialized consent handling. Names must match selected
servers; changes apply after restart and preserve update guards. This is not a
permission grant, a package naming heuristic or automatic retry permission.

The host field is `elicitationDisabledServers`, defaulting to an empty list.
Only explicitly named, selected servers use concurrent requests. They omit the
elicitation capability entirely and reject unexpected form requests; disabling
forms never approves their contents. Reconnection applies the same saved policy.

The amendment is implemented. Renewed installed-workbench verification observed
three actual FFmpeg processes concurrently before the scene-review wait.
No new correlation metadata,
browser protocol, duplicate media executor or weakened consent route was added.
