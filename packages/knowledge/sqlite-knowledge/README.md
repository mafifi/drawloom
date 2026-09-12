# `@drawloom/sqlite-knowledge`

Node.js 24 SQLite provider for the portable `@drawloom/knowledge` contracts. It
uses `node:sqlite` and the pinned `sqlite-vec` extension; it is not a Bun host
implementation.

The provider requires a trusted `resolveResource` function and a contract
authorizer. Resource attributes are resolved from stored record references, not
from caller input. The database file is owner-readable only, uses WAL mode, and
refuses unknown or newer schema versions before applying mutable pragmas.

## Operational limits

- Public request limits are validated by the portable schemas (at most 100 work
  units or index updates per request).
- Retrieval search, expansion, and evidence traversal use bounded internal
  scans. Under highly selective authorization a caller may receive `too_large`
  and should narrow the request rather than infer filtered records.
- Evidence cursors are replayable: consuming a continuation clones its durable
  traversal state before work begins.
- Index work is configuration-scoped, durable until acknowledged, and replayed
  verbatim for the same subject and configuration.
- Embedding activation applies only staged deltas in one SQLite transaction.
  Queries include only active, current records, so superseded vectors cannot be
  returned while a replacement generation is pending.

Run the Node-specific verification from this package with:

```sh
bun run test:node
```
