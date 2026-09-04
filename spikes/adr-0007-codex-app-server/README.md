# ADR 0007 Codex app-server spike

This retained, non-production spike tests whether the accepted provider-neutral
agent-execution boundary is effective against Codex app-server. It implements a
minimal contract-shaped adapter solely to exercise the boundary; its code is not
a starting point for the production provider package.

Deterministic tests run in the canonical repository gate:

```sh
bun test spikes/adr-0007-codex-app-server
```

The live run requires a locally authenticated `codex` executable, makes model
calls, and is deliberately opt-in:

```sh
bun run spike:adr-0007
```

The command prints a redacted JSON result. It does not update checked-in
evidence automatically. Created Codex threads are persisted only long enough to
exercise resume and then archived in cleanup; temporary runtime artifacts are
also removed, and cleanup failure makes the run fail.

The separate [Desktop smoke checklist](desktop-smoke.md) uses the same MCP
boundary from the Codex Desktop application and includes the observed
single-input control. Authoritative conclusions belong in
[`knowledge/evidence/adr-0007-codex-app-server.md`](../../knowledge/evidence/adr-0007-codex-app-server.md).

## Scope

The deterministic adapter tests cover contract state, provider-acceptance
races, transport failure, ordered safe signals, interaction routing and
invalidation, bounded observations, and provider-ID isolation. The live runner
covers protocol detection, disabled native memory,
compiled context, steering, interruption, private resume, approval, concurrent
MCP input requests, provider-native delegation, and the previously retained
tool-authority probe.

No raw protocol trace or model transcript is retained.
