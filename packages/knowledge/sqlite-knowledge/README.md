# `@drawloom/sqlite-knowledge`

Node.js 24 SQLite provider for the portable `@drawloom/knowledge`
contracts. Read this if you are running the local knowledge store, or
working on the provider itself. It uses `node:sqlite` and the pinned
`sqlite-vec` extension, so it is not a Bun host implementation.

The provider requires a trusted `resolveResource` function and a contract
authorizer. Resource attributes are resolved from stored record
references, not from caller input, so a request cannot claim its way into
access it does not have. The database file is owner-readable only, uses
WAL mode, and refuses unknown or newer schema versions before applying
mutable pragmas — an unrecognised schema should fail loudly rather than
run against assumptions that no longer hold.

## Operational limits

- **Requests are capped.** Public request limits are validated by the
  portable schemas: at most 100 work units or index updates per request.
- **Bounded scans return `too_large`, not partial results.** Retrieval
  search, expansion, and evidence traversal use bounded internal scans.
  Under highly selective authorization a caller may receive `too_large`
  and should narrow the request rather than infer filtered records from
  what came back.
- **Evidence cursors are replayable.** Consuming a continuation clones its
  durable traversal state before work begins, so replaying a cursor does
  not disturb the original traversal.
- **Index work is configuration-scoped.** It stays durable until
  acknowledged, and replays verbatim for the same subject and
  configuration.
- **Embedding activation is atomic.** It applies only staged deltas in one
  SQLite transaction. Queries include only active, current records, so a
  superseded vector cannot be returned while a replacement generation is
  pending.

## Testing

Run the Node-specific verification from this package with:

```sh
bun run test:node
```

See [knowledge](../knowledge/README.md) for the contracts this package
implements, and
[RETRIEVAL.md](../local-knowledge-runtime/RETRIEVAL.md) for how this
store's lexical and semantic admission interact.
