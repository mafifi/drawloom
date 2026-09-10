# Discovery latency fix

Status: completed and verified. Follows the maintainer's acceptance of ADR 0019.
Durable conclusions and actual measurements are in the
[follow-up evidence](../../knowledge/evidence/discovery-latency-fix.md).

The measured cause and baseline are in the [observability evidence](../../knowledge/evidence/adr-0019-observability.md).
Native `app/list` takes about 15 seconds cold. Drawloom must not make local
contributions, skills or MCP status wait behind it or discard its eventual result.

1. Extend existing discovery metadata with loading status and opaque continuation;
   make ready categories observable without waiting for unrelated native requests.
2. Run native categories independently; coalesce refresh, retain successful cached
   pages, and fetch the next app page only on request. Preserve selection revisions,
   source binding, grant checks and explicit invalidation.
3. Present local entries immediately. Poll only incomplete discovery, ignoring late
   responses after navigation. Keep search limited to loaded entries visibly.
4. Prove slow-category isolation, pagination, cursor safety, refresh coalescing,
   browser behaviour and live read-only Codex timings. Run the public canonical gate.

No provider-internal optimisation, model calls, permission changes, new capability,
browser bridge, dependency or private implementation is part of this fix. Native
wire requests use the same installed protocol; discovery remains metadata only.
